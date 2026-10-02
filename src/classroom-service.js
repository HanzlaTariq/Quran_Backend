import {randomBytes} from 'node:crypto';
import {Class,Enrollment,Ulma,Student,Audit,Reservation} from './models.js';
import {profile,findClass,enrollmentPopulate,notify} from './access.js';
import {fail,same} from './core.js';
import {getBookingConfig,withBookingTransaction,actorLocks} from './booking-service.js';
import {classroomActions,assertParticipantRole,assertTeacherRole,roomNameFor} from './classroom-core.js';
import {dailyClient} from './daily.js';
export const classPopulate=[...enrollmentPopulate,{path:'enrollment',select:'status'}];

export async function participantLesson(user,id,{joining=false}={}) {
  assertParticipantRole(user);
  const lesson=await findClass(user,String(id));await lesson.populate(classPopulate);
  if (joining) {
    const actions=classroomActions(lesson.toObject(),user,await getBookingConfig());
    if (!actions.canJoin) fail(409,'The assigned teacher must start this lesson during its scheduled time before you can join.');
    // An account approval change must not grant new tokens to its learning partner.
    const [teacher,student]=await Promise.all([
      Ulma.findById(lesson.ulma._id).populate('user','isActive isVerified'),
      Student.findById(lesson.student._id).populate('user','isActive isVerified'),
    ]);
    if (!teacher?.isApproved || !teacher.user?.isActive || !teacher.user?.isVerified || !student?.user?.isActive || !student.user?.isVerified) fail(403,'A participant account is no longer active or approved.');
  }
  return lesson;
}
export async function emitClassChange(io,lesson) {
  const [t,s]=await Promise.all([Ulma.findById(lesson.ulma?._id||lesson.ulma).select('user'),Student.findById(lesson.student?._id||lesson.student).select('user')]);
  for (const user of [t?.user,s?.user].filter(Boolean)) io?.to(`user:${user}`).emit('classes:changed',{classId:String(lesson._id),status:lesson.status});
  io?.to(`class:${lesson._id}`).emit('class:status',{classId:String(lesson._id),status:lesson.status});
  return [t?.user,s?.user].filter(Boolean);
}
export async function startLesson(req,record) {
  assertTeacherRole(req.user);
  const initial=await participantLesson(req.user,record),config=await getBookingConfig();
  if (initial.status==='ongoing') {
    if (classroomActions(initial.toObject(),req.user,config).canJoin) return initial;
    fail(409,'This lesson is already closed or is outside its scheduled time.');
  }
  if (!classroomActions(initial.toObject(),req.user,config).canStart) fail(409,`Start this lesson within ${config.joinEarlyMinutes} minutes before its start and before its scheduled end. The enrollment must be active.`);
  const key=randomBytes(16).toString('hex');
  const locked=await Class.findOneAndUpdate({_id:initial._id,status:'scheduled',$or:[{'operationLock.until':{$exists:false}},{'operationLock.until':{$lte:new Date()}}]},{$set:{operationLock:{key,until:new Date(Date.now()+90000)}}},{new:true});
  if (!locked) fail(409,'A class start is already being processed. Refresh in a moment.');
  try {
    const room=await dailyClient().ensureRoom(locked);
    const lesson=await withBookingTransaction(actorLocks(locked.ulma,locked.student),async session=>{
      const c=await Class.findOne({_id:locked._id,'operationLock.key':key}).session(session);
      if (!c) fail(409,'This start request expired. Refresh and retry.');
      const enrollment=await Enrollment.findById(c.enrollment).session(session);
      if (!enrollment || !classroomActions({...c.toObject(),enrollment},req.user,config).canStart) fail(409,'The class or enrollment changed while the room was prepared. Refresh and retry.');
      c.roomId=room.name;c.liveRoom={...room,readyAt:new Date(),closePending:false};
      c.status='ongoing';c.startedAt=new Date();c.startedBy=req.user._id;c.operationLock=undefined;
      await c.save({session});await Audit.create([{actor:req.user._id,action:'class.start',record:String(c._id)}],{session});return c;
    });
    const targets=await emitClassChange(req.app.get('io'),lesson).catch(()=>[]);
    // The saved live state is authoritative; a notification failure must not undo the class.
    for (const user of targets.filter(u=>!same(u,req.user._id))) {
      await notify(user,'Your class is live',lesson.topic,`/class/${lesson._id}`,req.app.get('io')).catch(()=>{});
    }
    return lesson;
  } finally { await Class.updateOne({_id:initial._id,'operationLock.key':key},{$unset:{operationLock:1}}).catch(()=>{}); }
}
export async function retryVideoClosure(lesson) {
  if (!lesson.liveRoom?.readyAt || lesson.liveRoom?.closedAt) return {closed:true};
  const [t,s]=await Promise.all([Ulma.findById(lesson.ulma?._id||lesson.ulma).select('user'),Student.findById(lesson.student?._id||lesson.student).select('user')]);
  try {
    await dailyClient().closeRoom(lesson,[t?.user,s?.user].filter(Boolean));
    await Class.updateOne({_id:lesson._id},{$set:{'liveRoom.closePending':false,'liveRoom.closedAt':new Date()}});
    return {closed:true};
  } catch(e) {
    await Class.updateOne({_id:lesson._id},{$set:{'liveRoom.closePending':true}});
    return {closed:false,warning:e.message};
  }
}
export async function endLesson(req,record,status='completed') {
  assertTeacherRole(req.user);
  const initial=await participantLesson(req.user,record);
  const lesson=await withBookingTransaction(actorLocks(initial.ulma._id,initial.student._id),async session=>{
    const c=await Class.findById(initial._id).session(session);
    if (c.status!==status) {
      const valid=status==='completed'?['ongoing']:['scheduled','ongoing','paused'];
      if (!valid.includes(c.status)) fail(409,'This lesson cannot change to that status.');
      c.status=status;c.endedAt=new Date();c.operationLock=undefined;
      if (c.liveRoom?.readyAt)c.liveRoom.closePending=true;
      await c.save({session});await Reservation.deleteMany({classId:c._id},{session});
      await Audit.create([{actor:req.user._id,action:`class.${status}`,record:String(c._id)}],{session});
    }
    return c;
  });
  await emitClassChange(req.app.get('io'),lesson).catch(()=>{});
  const result=await retryVideoClosure(lesson);
  return {lesson,warning:result.warning||null};
}
