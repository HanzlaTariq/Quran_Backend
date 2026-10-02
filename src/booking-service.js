import mongoose from 'mongoose';
import {User,Student,Ulma,Course,Enrollment,Class,Fee,Conversation,Notice,Audit,Config,Reservation,BookingMutex} from './models.js';
import {fail,id,text,integer,date,same,safeUrl} from './core.js';
import {DAY_NAMES,DAY,MINUTE,bookingSettings,timeZone,calendarDate,zonedParts,addDays,addMonths,weekday,minutes,clock,localInstant,dayBoundary,withinAvailability,buildOccurrences,slotOccurrence,firstConflict,overlaps,invoicePlan} from './timetable-core.js';

const connectionChecks=new WeakMap();
export async function checkBookingDatabase(){
  const db=mongoose.connection.db;if(!db)fail(503,'Database is not connected.');
  if(!connectionChecks.has(db)){
    const promise=(async()=>{
      const hello=await db.admin().command({hello:1});
      if(!hello.setName&&hello.msg!=='isdbgrid')fail(503,'Safe booking needs MongoDB Atlas or a replica set. Standalone MongoDB cannot atomically approve schedules and invoices.');
      for(const M of [BookingMutex,Reservation,Enrollment,Class,Fee,Conversation,Notice,Audit])await M.init();
      return true;
    })().catch(e=>{connectionChecks.delete(db);throw e;});connectionChecks.set(db,promise);
  }
  return connectionChecks.get(db);
}
/** Locks are ordinary documents updated INSIDE the transaction. Contending writers
 * get a Mongo write conflict and retry from a fresh snapshot. No expiring process-local
 * lock can let two Vercel instances approve the same overlapping time interval.
 */
export async function withBookingTransaction(keys,work){
  await checkBookingDatabase();const sorted=[...new Set(keys)].sort();
  for(const key of sorted){try{await BookingMutex.updateOne({_id:key},{$setOnInsert:{revision:0}},{upsert:true});}catch(e){if(e.code!==11000)throw e;}}
  return mongoose.connection.transaction(async session=>{
    for(const key of sorted)await BookingMutex.updateOne({_id:key},{$inc:{revision:1}},{session});
    return work(session);
  },{readConcern:{level:'snapshot'},writeConcern:{w:'majority'},readPreference:'primary'});
}
export const actorLocks=(teacher,student)=>[`teacher:${teacher}`,`student:${student}`];
export async function getBookingConfig(session){return bookingSettings(await Config.findOne({key:'main'}).session(session||null).lean()||{});}
export async function expirePending(){
  await Enrollment.updateMany({bookingVersion:1,status:'pending',holdExpiresAt:{$lte:new Date()}},{$set:{status:'expired'},$unset:{activeRequestKey:1}});
  // TTL deletion is asynchronous; queries always filter expiry independently.
}
export async function availableTeacher(record,{session,course}={}){
  const teacher=await Ulma.findOne({_id:id(String(record)),isApproved:true}).session(session||null).populate({path:'user',select:'name email country city timezone languages gender profileImage photoVersion isActive isVerified'});
  if(!teacher?.user?.isActive||!teacher.user.isVerified)fail(404,'This teacher is not available.');
  if(!teacher.user.timezone)fail(409,'The teacher must save a time zone before accepting bookings.');timeZone(teacher.user.timezone);
  if(course&&teacher.courses?.length&&!teacher.courses.some(c=>same(c,course)))fail(409,'This teacher does not offer the selected course.');
  return teacher;
}
export async function busyIntervals(teacher,student,from,until,{session,excludeEnrollment,excludeClass,allowLegacyEnrollment}={}){
  const actor={$or:[{ulma:teacher._id},...(student?[{student:student._id}]:[])]},range={utcStart:{$lt:until},utcEnd:{$gt:from}};
  const reserved={...actor,...range,$and:[{$or:[{status:'confirmed'},{status:'pending',expiresAt:{$gt:new Date()}}]}]};
  if(excludeEnrollment)reserved.enrollment={$ne:excludeEnrollment};if(excludeClass)reserved.classId={$ne:excludeClass};
  const holds=await Reservation.find(reserved).session(session||null).lean();
  const q={...actor,...range,status:{$in:['scheduled','ongoing','paused']}};
  if(excludeEnrollment)q.enrollment={$ne:excludeEnrollment};if(excludeClass)q._id={$ne:excludeClass};
  const lessons=await Class.find(q).session(session||null).select('utcStart utcEnd ulma student enrollment status').lean();
  const output=[...holds.map(h=>({...h,label:h.status==='pending'?'held':'booked'})),...lessons.map(c=>({...c,label:'booked'}))];
  // Older releases mixed fixed UTC and local weekday schedules. Do not guess their
  // remaining recurrence or advertise their future time as free. Keep dated classes
  // usable, but require an administrator to review/rebook legacy active enrollments.
  const legacyQ={...actor,bookingVersion:{$ne:1},status:{$in:['approved','active','paused']}};
  if(excludeEnrollment)legacyQ._id={$ne:excludeEnrollment};
  const legacy=await Enrollment.find(legacyQ).session(session||null).select('_id ulma student endDate').lean();
  for(const old of legacy){if(allowLegacyEnrollment&&same(old._id,allowLegacyEnrollment))continue;
    if(old.endDate&&+new Date(old.endDate)<=+from)continue;
    output.push({utcStart:from,utcEnd:until,ulma:old.ulma,student:old.student,label:'unavailable',legacyReview:true});
  }
  // Leaves may hide a new booking but never silently cancel an existing paid lesson.
  for(const leave of teacher.leaveSchedule||[])if(leave.from&&leave.to&&+new Date(leave.to)>+from&&+new Date(leave.from)<+until)output.push({utcStart:leave.from,utcEnd:leave.to,label:'unavailable',ulma:teacher._id});
  return output;
}
function selectionPlan(teacher,course,selected,config,studentZone,now=Date.now()){
  if(!Array.isArray(selected)||selected.length<1||selected.length>7)fail(400,'Choose one to seven weekly slots.');
  const chosen=selected.map(v=>{
    const start=date(typeof v==='string'?v:v?.utcStart);
    if(start.getUTCSeconds()||start.getUTCMilliseconds())fail(400,'Invalid slot start time.');
    if(+start<now+config.bookingLeadHours*60*MINUTE)fail(409,'A selected lesson is too close or has already passed. Refresh the slots.');
    if(+start>now+config.bookingWindowDays*DAY)fail(400,'The selected start is outside the advance booking window.');
    const wall=zonedParts(start,teacher.user.timezone);
    if(!withinAvailability(teacher.availability||[],wall.date,wall.time,config.slotMinutes))fail(409,'The teacher changed availability or the lesson length changed. Refresh and choose a current slot.');
    const slot=slotOccurrence(wall.date,wall.time,config.slotMinutes,teacher.user.timezone);
    if(slot.skipped||+slot.utcStart!==+start)fail(400,'This local time is ambiguous or unavailable. Choose a different slot.');
    return {day:DAY_NAMES[weekday(wall.date)],startTime:wall.time,date:wall.date,utcStart:start};
  }).sort((a,b)=>+a.utcStart-+b.utcStart);
  if(chosen.at(-1).date>=addDays(chosen[0].date,7))fail(400,'Choose all weekly slots from one seven-day starting window.');
  const schedule={timeZone:teacher.user.timezone,studentTimeZone:studentZone,firstDate:chosen[0].date,untilDate:addMonths(chosen[0].date,course.duration),slotMinutes:config.slotMinutes,slots:chosen.map(({day,startTime})=>({day,startTime}))};
  const plan=buildOccurrences(schedule);if(!plan.items.length)fail(400,'No valid lessons were found. Choose another slot.');
  schedule.firstOccurrences=chosen.map(c=>({utcStart:c.utcStart,utcEnd:new Date(+c.utcStart+config.slotMinutes*MINUTE),day:c.day,startTime:c.startTime}));
  schedule.skipped=plan.skipped;schedule.utcStart=plan.items[0].utcStart;schedule.utcEnd=plan.items[0].utcEnd;
  return {schedule,...plan};
}
function conflictError(conflict,zone){
  if(conflict.busy.legacyReview)fail(409,'An older active enrollment has a timetable that needs administrator review before new recurring bookings can be safely added. Ask the administrator to run schedule:audit and review/rebook that enrollment.');
  const at=zonedParts(conflict.item.utcStart,zone);
  fail(409,`A selected weekly slot conflicts on ${at.date} at ${at.time} (${zone}). Choose another slot. No enrollment or fee was created.`);
}
export async function requestEnrollment(user,body){
  const student=await Student.findOne({user:user._id});if(!student)fail(409,'Student profile is missing.');
  const teacherId=id(body.ulma),courseId=id(body.course),replaceId=body.replaceEnrollment?id(body.replaceEnrollment):null;
  if(!user.timezone)fail(400,'Save your time zone in Settings before booking.');
  return withBookingTransaction(actorLocks(teacherId,student._id),async session=>{
    const teacher=await availableTeacher(teacherId,{session,course:courseId}),course=await Course.findOne({_id:courseId,isActive:true}).session(session);
    if(!course)fail(404,'The course is not available.');
    const config=await getBookingConfig(session),plan=selectionPlan(teacher,course,body.slots,config,timeZone(user.timezone));
    let replaced;
    if(replaceId){
      replaced=await Enrollment.findOne({_id:replaceId,student:student._id,ulma:teacherId,course:courseId,status:{$in:['pending','expired']}}).session(session);
      if(!replaced)fail(409,'Only your pending/expired request for this course and teacher can be replaced.');
    }
    const activeQ={student:student._id,ulma:teacherId,course:courseId,status:{$in:['pending','approved','active','paused']},$or:[{status:{$ne:'pending'}},{holdExpiresAt:{$exists:false}},{holdExpiresAt:{$gt:new Date()}}]};if(replaced)activeQ._id={$ne:replaced._id};
    if(await Enrollment.exists(activeQ).session(session))fail(409,'You already have a current enrollment or request for this course and teacher.');
    const busy=await busyIntervals(teacher,student,plan.items[0].utcStart,plan.items.at(-1).utcEnd,{session,excludeEnrollment:replaced?._id});
    const conflict=firstConflict(plan.items,busy);if(conflict)conflictError(conflict,user.timezone);
    if(replaced){replaced.status='cancelled';replaced.activeRequestKey=undefined;await replaced.save({session});await Reservation.deleteMany({enrollment:replaced._id},{session});}
    // Expired requests cannot keep the historical unique active-request key reserved.
    await Enrollment.updateMany({student:student._id,ulma:teacherId,course:courseId,status:'pending',holdExpiresAt:{$lte:new Date()}},{$set:{status:'expired'},$unset:{activeRequestKey:1}},{session});
    const holdExpiresAt=new Date(Math.min(Date.now()+config.holdHours*60*MINUTE,+plan.items[0].utcStart));
    const [e]=await Enrollment.create([{student:student._id,ulma:teacherId,course:courseId,status:'pending',bookingVersion:1,schedule:plan.schedule,courseDuration:course.duration,monthlyFee:course.monthlyFee,currency:course.currency||'PKR',holdExpiresAt,activeRequestKey:`${student._id}:${courseId}:${teacherId}`,notes:text(body.notes||'','Notes',0,1000)}],{session});
    await Reservation.insertMany(plan.items.map(item=>({enrollment:e._id,student:student._id,ulma:teacherId,utcStart:item.utcStart,utcEnd:item.utcEnd,status:'pending',expiresAt:holdExpiresAt,occurrenceKey:`${e._id}:${item.utcStart.toISOString()}`})),{session});
    const admins=await User.find({role:'admin',isActive:true}).select('_id').session(session);
    if(admins.length)await Notice.insertMany(admins.map(a=>({user:a._id,title:'New scheduled enrollment request',body:`${user.name} requested ${course.name} with ${teacher.user.name}. Review before ${holdExpiresAt.toISOString()}.`,href:'/enrollments'})),{session});
    await Audit.create([{actor:user._id,action:'enrollment.request.slots',record:String(e._id)}],{session});
    return e;
  });
}
export async function changeEnrollment(user,record,status){
  const initial=await Enrollment.findById(id(record));if(!initial)fail(404,'Enrollment not found.');
  const student=await Student.findById(initial.student);if(!student)fail(409,'Student profile is missing.');
  if(user.role!=='admin'&&(user.role!=='student'||!same(student.user,user._id)||status!=='cancelled'))fail(403,'Only an administrator can approve or manage this enrollment.');
  return withBookingTransaction(actorLocks(initial.ulma,initial.student),async session=>{
    const e=await Enrollment.findById(initial._id).session(session);
    const transitions={pending:['approved','rejected','cancelled'],approved:['active','paused','completed','cancelled'],active:['paused','completed','cancelled'],paused:['active','completed','cancelled'],expired:['cancelled'],completed:[],cancelled:[],rejected:[]};
    if(['approved','active'].includes(status)&&['approved','active'].includes(e.status)&&e.generatedAt)return {enrollment:e,message:'Already approved. Existing classes and invoices were kept.',classesCreated:0,invoicesCreated:0};
    if(!(transitions[e.status]||[]).includes(status))fail(409,`Cannot change ${e.status} enrollment to ${status}.`);
    let classesCreated=0,invoicesCreated=0;
    if(status==='approved'){
      if(e.bookingVersion!==1||!e.schedule?.slots?.length)fail(409,'This older request has no selected slots. Ask the student to choose slots using “Choose slots / request again”.');
      if(!e.holdExpiresAt||+e.holdExpiresAt<=Date.now())fail(409,'This slot hold expired. Ask the student to send a new request.');
      const teacher=await availableTeacher(e.ulma,{session,course:e.course}),course=await Course.findOne({_id:e.course,isActive:true}).session(session);
      if(!course)fail(409,'The course is no longer active.');
      const learner=await User.findById(student.user).session(session);if(!learner?.isActive||!learner.isVerified)fail(409,'The student account is not active and verified.');
      if(teacher.user.timezone!==e.schedule.timeZone)fail(409,'Teacher time zone changed. A new slot request is required.');
      const plan=buildOccurrences(e.schedule);
      if(plan.items.some(c=>+c.utcStart<=Date.now()))fail(409,'The first requested lesson has passed. Ask the student to choose a future starting week.');
      for(const item of plan.items)if(!withinAvailability(teacher.availability||[],item.teacherDate,item.startTime,e.schedule.slotMinutes))fail(409,'Teacher availability changed. Ask the student to choose slots again.');
      const busy=await busyIntervals(teacher,student,plan.items[0].utcStart,plan.items.at(-1).utcEnd,{session,excludeEnrollment:e._id});const conflict=firstConflict(plan.items,busy);if(conflict)conflictError(conflict,e.schedule.timeZone);
      const currentHolds=await Reservation.countDocuments({enrollment:e._id,status:'pending',expiresAt:{$gt:new Date()}}).session(session);
      if(currentHolds!==plan.items.length)fail(409,'Some reserved slots expired or are missing. A new request is required.');
      const lessons=plan.items.map((item,i)=>({enrollment:e._id,student:e.student,ulma:e.ulma,course:e.course,date:item.utcStart,utcStart:item.utcStart,utcEnd:item.utcEnd,topic:`${course.name} · Lesson ${i+1}`,status:'scheduled',occurrenceKey:`${e._id}:${item.utcStart.toISOString()}`,teacherTimeZone:e.schedule.timeZone,slotMinutes:e.schedule.slotMinutes,autoGenerated:true}));
      const created=await Class.insertMany(lessons,{session});classesCreated=created.length;
      await Reservation.bulkWrite(created.map(c=>({updateOne:{filter:{occurrenceKey:c.occurrenceKey},update:{$set:{status:'confirmed',classId:c._id},$unset:{expiresAt:1}}}})),{session});
      const config=await getBookingConfig(session),periods=invoicePlan(e.schedule,e.courseDuration);
      const invoices=periods.map(p=>({student:e.student,ulma:e.ulma,enrollment:e._id,monthlyFee:e.monthlyFee,amount:e.monthlyFee,currency:e.currency||'PKR',...p,paymentDeadline:new Date(+p.dueDate+config.feeGraceDays*DAY),description:`${course.name} · ${p.billingPeriod} to ${zonedParts(p.billingEnd,e.schedule.timeZone).date}`,createdBy:user._id,autoGenerated:true,invoiceKey:`${e._id}:${p.billingPeriod}`}));
      // save/create run invoice validation hooks (including number/deadline generation).
      for(const f of invoices)await Fee.create([f],{session});invoicesCreated=invoices.length;
      await Conversation.findOneAndUpdate({studentId:student.user,ulmaId:teacher.user._id,courseId:e.course},{$setOnInsert:{studentId:student.user,ulmaId:teacher.user._id,courseId:e.course}},{upsert:true,new:true,session});
      e.generatedAt=new Date();e.startDate=plan.items[0].utcStart;e.endDate=plan.items.at(-1).utcEnd;e.classesCount=classesCreated;e.invoiceCount=invoicesCreated;e.holdExpiresAt=undefined;
    }
    if(status==='paused')await Class.updateMany({enrollment:e._id,status:{$in:['scheduled','ongoing']},utcEnd:{$gt:new Date()}},{$set:{status:'paused'}},{session});
    if(e.status==='paused'&&status==='active')await Class.updateMany({enrollment:e._id,status:'paused',utcStart:{$gt:new Date()}},{$set:{status:'scheduled'}},{session});
    if(['cancelled','rejected','completed'].includes(status)){
      e.activeRequestKey=undefined;e.holdExpiresAt=undefined;
      await Class.updateMany({enrollment:e._id,status:{$in:['scheduled','ongoing','paused']},utcEnd:{$gt:new Date()}},{$set:{status:'cancelled'}},{session});
      await Reservation.deleteMany({enrollment:e._id,utcEnd:{$gt:new Date()}},{session});
      // Paid/history records are never deleted or marked refunded.
      if(status==='cancelled'||status==='rejected')await Fee.updateMany({enrollment:e._id,autoGenerated:true,status:{$in:['pending','overdue']},billingStart:{$gt:new Date()}},{$set:{status:'cancelled'}},{session});
    }
    e.status=status;e.processedBy=user._id;e.processedAt=new Date();await e.save({session});
    const t=await Ulma.findById(e.ulma).session(session);
    await Notice.insertMany([student.user,t?.user].filter(Boolean).map(target=>({user:target,title:status==='approved'?'Enrollment approved — timetable ready':'Enrollment updated',body:status==='approved'?`${classesCreated} lessons have been scheduled. ${invoicesCreated} monthly tuition invoices were created; no payment was charged.`:`Your enrollment is now ${status}.`,href:'/enrollments'})),{session});
    await Audit.create([{actor:user._id,action:`enrollment.${status}`,record:String(e._id)}],{session});
    return {enrollment:e,classesCreated,invoicesCreated,message:status==='approved'?`Approved: ${classesCreated} lessons and ${invoicesCreated} monthly invoices created.`:`Enrollment ${status}.`};
  });
}

export async function slotDirectory(teacher,{course,student,from,zone,days=7,excludeEnrollment}={}){
  const config=await getBookingConfig(),viewerZone=timeZone(zone||teacher.user.timezone),first=calendarDate(from||zonedParts(Date.now(),viewerZone).date),count=integer(days,'Days',1,7);
  const start=dayBoundary(first,viewerZone),end=dayBoundary(addDays(first,count),viewerZone);
  if(+end<Date.now()-DAY||+start>Date.now()+(config.bookingWindowDays+7)*DAY)fail(400,'Choose a week within the booking window.');
  const firstTeacher=zonedParts(start,teacher.user.timezone).date,lastTeacher=zonedParts(end,teacher.user.timezone).date;
  const until=course?dayBoundary(addDays(addMonths(lastTeacher,course.duration),1),teacher.user.timezone):end;
  const busy=await busyIntervals(teacher,student,start,until,{excludeEnrollment}),slots=[],seen=new Set();
  for(let d=firstTeacher;d<=lastTeacher;d=addDays(d,1)){
    for(const window of (teacher.availability||[]).filter(s=>s.isActive!==false&&s.day===DAY_NAMES[weekday(d)])){
      for(let m=minutes(window.startTime);m+config.slotMinutes<=minutes(window.endTime,true);m+=config.slotMinutes){
        const item=slotOccurrence(d,clock(m),config.slotMinutes,teacher.user.timezone);if(item.skipped||+item.utcStart<+start||+item.utcStart>=+end)continue;
        const key=item.utcStart.toISOString();if(seen.has(key))continue;seen.add(key);
        let status='available',reason='',conflictDate=null;
        if(+item.utcStart<Date.now()+config.bookingLeadHours*60*MINUTE){status='unavailable';reason='Outside the minimum notice period';}
        else if(+item.utcStart>Date.now()+config.bookingWindowDays*DAY){status='unavailable';reason='Outside the advance booking window';}
        else {
          const immediate=firstConflict([item],busy);
          const recurrence=course&&busy.length?buildOccurrences({firstDate:d,untilDate:addMonths(d,course.duration),timeZone:teacher.user.timezone,slotMinutes:config.slotMinutes,slots:[{day:item.day,startTime:item.startTime}]}).items:[item];
          const conflict=immediate||firstConflict(recurrence,busy);
          if(conflict){status=conflict.busy.label||'booked';conflictDate=zonedParts(conflict.item.utcStart,viewerZone).date;reason=conflict.busy.legacyReview?'An older timetable needs administrator review':status==='held'?'Held for another enrollment request':status==='unavailable'?'Teacher unavailable':'Booked';if(!immediate)reason+=` on a recurring date (${conflictDate})`;}
        }
        slots.push({...item,key,status,reason,conflictDate});
      }
    }
  }
  // Retain visibility of already-booked lessons if a teacher later edits availability.
  for(const b of busy){if(!same(b.ulma,teacher._id)||b.label==='unavailable'||+new Date(b.utcStart)<+start||+new Date(b.utcStart)>=+end)continue;const key=new Date(b.utcStart).toISOString();if(seen.has(key))continue;seen.add(key);const p=zonedParts(b.utcStart,teacher.user.timezone);slots.push({key,utcStart:b.utcStart,utcEnd:b.utcEnd,teacherDate:p.date,day:DAY_NAMES[weekday(p.date)],startTime:p.time,status:b.label,reason:b.label==='held'?'Held for an enrollment request':'Booked'});}
  return {legacyReview:busy.some(b=>b.legacyReview),slots:slots.sort((a,b)=>+new Date(a.utcStart)-+new Date(b.utcStart)),timezone:viewerZone,teacherTimezone:teacher.user.timezone,from:first,until:addDays(first,count),booking:config,course:course?{_id:course._id,name:course.name,duration:course.duration,monthlyFee:course.monthlyFee,currency:course.currency}:null,recurrencePolicy:'Weekly in the teacher’s time zone. Your local date/time can change when either country changes its clocks. Ambiguous or nonexistent lesson times are skipped and listed for review.'};
}

export async function createLesson(user,body){
  if(user.role!=='ulma')fail(403,'Only the assigned teacher can schedule a lesson.');
  if(body.meetingLink)fail(400,'External meeting links are not supported. Live classes open inside the academy.');
  const e=await Enrollment.findById(id(body.enrollment));if(!e)fail(404,'Enrollment not found.');
  const p=await Ulma.findOne({user:user._id});if(!same(p?._id,e.ulma))fail(403,'This is not your enrollment.');
  return withBookingTransaction(actorLocks(e.ulma,e.student),async session=>{
    const current=await Enrollment.findById(e._id).session(session);if(!['approved','active'].includes(current.status))fail(409,'Choose an active or approved enrollment.');
    const teacher=await availableTeacher(e.ulma,{session}),student=await Student.findById(e.student).session(session),config=await getBookingConfig(session);
    const zone=user.timezone||teacher.user.timezone;
    const start=body.localDate?localInstant(calendarDate(body.localDate),text(body.startTime,'Start time',5,5),timeZone(zone)):date(body.utcStart);
    const end=body.localDate?new Date(+start+config.slotMinutes*MINUTE):date(body.utcEnd);
    if(+end-+start!==config.slotMinutes*MINUTE)fail(400,`New lessons must be ${config.slotMinutes} minutes, as set by the administrator.`);
    if(+start<Date.now()-MINUTE)fail(400,'Choose a future lesson time.');
    const busy=await busyIntervals(teacher,student,start,end,{session,allowLegacyEnrollment:e._id}),conflict=firstConflict([{utcStart:start,utcEnd:end}],busy);if(conflict)conflictError(conflict,zone);
    const [lesson]=await Class.create([{enrollment:e._id,student:e.student,ulma:e.ulma,course:e.course,date:start,utcStart:start,utcEnd:end,topic:text(body.topic,'Topic',2,160),notes:text(body.notes||'','Lesson description',0,2000),teacherTimeZone:teacher.user.timezone,slotMinutes:config.slotMinutes,status:'scheduled'}],{session});
    await Reservation.create([{classId:lesson._id,enrollment:e._id,student:e.student,ulma:e.ulma,utcStart:start,utcEnd:end,status:'confirmed',occurrenceKey:`manual:${lesson._id}`}],{session});
    await Notice.insertMany([student.user,teacher.user._id].map(target=>({user:target,title:'A lesson was scheduled',body:lesson.topic,href:'/classes'})),{session});
    await Audit.create([{actor:user._id,action:'class.create',record:String(lesson._id)}],{session});return lesson;
  });
}

export async function previewEnrollment(user,body){
  const student=await Student.findOne({user:user._id}),teacher=await availableTeacher(body.ulma,{course:id(body.course)}),course=await Course.findOne({_id:id(body.course),isActive:true});
  if(!student||!course)fail(404,'Student or course not found.');
  const config=await getBookingConfig(),plan=selectionPlan(teacher,course,body.slots,config,timeZone(user.timezone));
  let excludeEnrollment;
  if(body.replaceEnrollment){const e=await Enrollment.findOne({_id:id(body.replaceEnrollment),student:student._id,ulma:teacher._id,course:course._id,status:{$in:['pending','expired']}});if(!e)fail(404,'The request cannot be replaced.');excludeEnrollment=e._id;}
  const busy=await busyIntervals(teacher,student,plan.items[0].utcStart,plan.items.at(-1).utcEnd,{excludeEnrollment});const conflict=firstConflict(plan.items,busy);if(conflict)conflictError(conflict,user.timezone);
  return {schedule:plan.schedule,classes:plan.items.slice(0,14),classCount:plan.items.length,skipped:plan.skipped,monthlyFee:course.monthlyFee,currency:course.currency||'PKR',months:course.duration,invoices:invoicePlan(plan.schedule,course.duration),holdHours:config.holdHours,message:'This preview does not reserve a slot. Submit the request to hold these times for admin approval.'};
}
