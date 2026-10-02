import {Router} from 'express';
import {User,Student,Ulma,Course,Class,Enrollment,Reservation,Audit} from './models.js';
import {protect,roles} from './auth.js';
import {profile,scope,findClass,enrollmentPopulate,list} from './access.js';
import {fail,id,text,choice,same,pageParams,safeUrl,integer} from './core.js';
import {avatarBytes,languages} from './profile-core.js';
import {DAY_NAMES,MINUTE,DAY,normalizeAvailability,timeZone,calendarDate,dayBoundary,addDays,zonedParts} from './timetable-core.js';
import {getBookingConfig,availableTeacher,slotDirectory,requestEnrollment,previewEnrollment,changeEnrollment,expirePending,createLesson,withBookingTransaction,actorLocks} from './booking-service.js';
import {limiter} from './rate-limit.js';
const router=Router();
const escapeRegex=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
export const publicTeacher=t=>({_id:t._id,user:{_id:t.user._id,name:t.user.name,country:t.user.country||'',city:t.user.city||'',timezone:t.user.timezone||'',languages:t.user.languages||[],gender:t.user.gender||'unspecified',photoVersion:t.user.photoVersion||0,profileImage:t.user.profileImage},bio:t.bio||'',experience:t.experience||0,expertise:t.expertise||[],courses:t.courses||[],qualifications:t.qualifications||[],availability:t.availability||[],rating:t.rating||{average:0,totalReviews:0}});
router.get('/booking/config',async(req,res)=>res.json(await getBookingConfig()));
router.get('/teachers',async(req,res)=>{
  const usersQ={role:'ulma',isActive:true,isVerified:true};
  if(req.query.country)usersQ.country=text(req.query.country,'Country',1,80);
  if(req.query.language)usersQ.languages={$regex:`^${escapeRegex(text(req.query.language,'Language',1,40))}$`,$options:'i'};
  if(req.query.gender)usersQ.gender=choice(req.query.gender,['male','female','unspecified']);
  const active=await User.find(usersQ).select('_id'),q={isApproved:true,user:{$in:active.map(u=>u._id)}},conditions=[];
  if(req.query.course){const course=id(req.query.course);conditions.push({$or:[{courses:course},{courses:{$size:0}},{courses:{$exists:false}}]});}
  if(req.query.q){const term=escapeRegex(text(req.query.q,'Search',1,100)),names=await User.find({...usersQ,name:{$regex:term,$options:'i'}}).distinct('_id');conditions.push({$or:[{user:{$in:names}},{expertise:{$regex:term,$options:'i'}},{bio:{$regex:term,$options:'i'}}]});}
  if(conditions.length)q.$and=conditions;
  const result=await list(Ulma,q,req.query,[{path:'user',select:'name country city timezone languages gender photoVersion profileImage'},{path:'courses',select:'name level'}]);
  result.items=result.items.map(publicTeacher);res.json(result);
});
router.get('/teachers/:id',async(req,res)=>{const t=await availableTeacher(req.params.id);await t.populate('courses','name level');res.json(publicTeacher(t));});
const directoryLimit=limiter('slots',{windowMs:60000,limit:40,standardHeaders:'draft-8',legacyHeaders:false,message:{message:'Please wait before refreshing the timetable again.'}});
router.get('/teachers/:id/slots',directoryLimit,async(req,res)=>{
  const course=req.query.course?await Course.findOne({_id:id(req.query.course),isActive:true}):null;if(req.query.course&&!course)fail(404,'Course not found.');
  const teacher=await availableTeacher(req.params.id,{course:course?._id}),student=req.user?.role==='student'?await profile(req.user):null;
  let excludeEnrollment;
  if(req.query.replaceEnrollment){if(!student)fail(403,'Sign in as the student.');const e=await Enrollment.findOne({_id:id(req.query.replaceEnrollment),student:student._id,ulma:teacher._id,course:course?._id,status:{$in:['pending','expired']}});if(!e)fail(404,'Request not found.');excludeEnrollment=e._id;}
  const d=await slotDirectory(teacher,{course,student,from:req.query.from,zone:req.query.timezone||req.user?.timezone||teacher.user.timezone,days:req.query.days||7,excludeEnrollment});
  res.json({...d,teacher:publicTeacher(teacher)});
});
router.get('/profiles/:id/photo',async(req,res)=>{
  const u=await User.findById(id(req.params.id)).select('+photoData');
  if(!u?.photoData||!u.isActive)fail(404,'Photo not found.');
  const visible=same(req.user,u)||req.user?.role==='admin'||(u.role==='ulma'&&u.isVerified&&await Ulma.exists({user:u._id,isApproved:true}));
  if(!visible)fail(404,'Photo not found.');
  res.set({'Content-Type':'image/jpeg','Content-Disposition':'inline; filename="profile.jpg"','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox",'Cache-Control':'private, max-age=300'});res.send(u.photoData);
});
// Authentication is scoped to this router’s private endpoints. Do not intercept
// public Quran, Hadith, course or homepage routes mounted by academy.js afterwards.
router.use(['/auth/photo','/teacher-profile','/enrollments','/classes'],protect);
router.post('/auth/photo',limiter('photo',{windowMs:60000,limit:10,standardHeaders:'draft-8',legacyHeaders:false}),async(req,res)=>{
  if(req.body.remove===true){await User.updateOne({_id:req.user._id},{$unset:{photoData:1},$set:{profileImage:'default.jpg'},$inc:{photoVersion:1}});return res.json({message:'Photo removed.',photoVersion:0,profileImage:'default.jpg'});}
  const bytes=avatarBytes(req.body.image);const u=await User.findByIdAndUpdate(req.user._id,{$set:{photoData:bytes,profileImage:'uploaded'},$inc:{photoVersion:1}},{new:true});res.json({message:'Profile photo saved.',photoVersion:u.photoVersion,profileImage:'uploaded'});
});
router.get('/teacher-profile',roles('ulma'),async(req,res)=>{const p=await profile(req.user);res.json(p);});
router.patch('/teacher-profile',roles('ulma'),async(req,res)=>{
  const p=await profile(req.user);
  const d=await withBookingTransaction([`teacher:${p._id}`],async session=>{
    const t=await Ulma.findById(p._id).session(session);
    if(req.body.bio!==undefined)t.bio=text(req.body.bio,'Bio',0,3000);
    if(req.body.experience!==undefined)t.experience=integer(req.body.experience,'Experience',0,80);
    if(req.body.expertise!==undefined)t.expertise=languages(req.body.expertise,false);
    if(req.body.availability!==undefined)t.availability=normalizeAvailability(req.body.availability);
    if(req.body.courses!==undefined){
      if(!Array.isArray(req.body.courses)||req.body.courses.length>100)fail(400,'Choose at most 100 courses.');
      const ids=[...new Set(req.body.courses.map(id))];if(await Course.countDocuments({_id:{$in:ids},isActive:true}).session(session)!==ids.length)fail(400,'Choose existing active courses.');t.courses=ids;
    }
    if(req.body.qualifications!==undefined){
      if(!Array.isArray(req.body.qualifications)||req.body.qualifications.length>12)fail(400,'Use at most 12 qualifications.');
      t.qualifications=req.body.qualifications.map(q=>({degree:text(q.degree,'Qualification',1,120),institution:text(q.institution||'','Institution',0,160),year:q.year?integer(q.year,'Qualification year',1950,new Date().getUTCFullYear()):undefined}));
    }
    await t.save({session});await Audit.create([{actor:req.user._id,action:'teacher.profile.update',record:String(t._id)}],{session});return t;
  });
  res.json({...d.toObject(),message:'Teaching profile saved. Existing booked lessons were not moved or cancelled.'});
});
router.get('/enrollments',async(req,res)=>{await expirePending();const q=await scope(req.user);if(req.query.status)q.status=choice(req.query.status,['pending','approved','active','paused','expired','cancelled','completed','rejected']);res.json(await list(Enrollment,q,req.query,enrollmentPopulate));});
router.post('/enrollments/preview',roles('student'),directoryLimit,async(req,res)=>res.json(await previewEnrollment(req.user,req.body)));
router.post('/enrollments',roles('student'),async(req,res)=>{const e=await requestEnrollment(req.user,req.body);res.status(201).json({...e.toObject(),message:'Your slots are held pending admin approval. No fee was charged.'});});
router.patch('/enrollments/:id',async(req,res)=>{
  const status=choice(req.body.status,['approved','active','paused','completed','cancelled','rejected']);
  const r=await changeEnrollment(req.user,req.params.id,status),io=req.app.get('io');
  if(['cancelled','completed','paused','rejected'].includes(status)){const ids=await Class.find({enrollment:r.enrollment._id,status:{$in:['cancelled','paused']},utcEnd:{$gt:new Date()}}).distinct('_id');for(const c of ids){io?.to(`class:${c}`).emit('class:status',{status:status==='paused'?'paused':'cancelled'});io?.in(`class:${c}`).socketsLeave(`class:${c}`);}}
  res.json(r);
});
function classActions(c,user,config){
  const now=Date.now(),within=now>=+new Date(c.utcStart)-config.joinEarlyMinutes*MINUTE&&now<+new Date(c.utcEnd);
  return {...c,canStart:['admin','ulma'].includes(user.role)&&c.status==='scheduled'&&within,canJoin:user.role!=='admin'&&c.status==='ongoing'&&within,joinOpensAt:new Date(+new Date(c.utcStart)-config.joinEarlyMinutes*MINUTE)};
}
router.get('/classes',async(req,res)=>{
  const q=await scope(req.user),bucket=choice(req.query.bucket||'all',['all','upcoming','live','history','cancelled']);let sort={utcStart:-1};
  if(bucket==='upcoming'){q.status={$in:['scheduled','ongoing','paused']};q.utcEnd={$gt:new Date()};sort={utcStart:1};}
  if(bucket==='live'){q.status='ongoing';q.utcEnd={$gt:new Date()};sort={utcStart:1};}
  if(bucket==='history')q.$or=[{utcEnd:{$lte:new Date()}},{status:'completed'}];
  if(bucket==='cancelled')q.status='cancelled';
  if(req.query.from||req.query.to){const zone=timeZone(req.user.timezone||'UTC');q.utcStart={};if(req.query.from)q.utcStart.$gte=dayBoundary(calendarDate(req.query.from),zone);if(req.query.to)q.utcStart.$lt=dayBoundary(addDays(calendarDate(req.query.to),1),zone);}
  const result=await list(Class,q,req.query,enrollmentPopulate,sort),config=await getBookingConfig();result.items=result.items.map(c=>classActions(c,req.user,config));res.json({...result,booking:config,serverNow:new Date()});
});
router.get('/classes/:id',async(req,res)=>{const c=await findClass(req.user,req.params.id);await c.populate(enrollmentPopulate);res.json(classActions(c.toObject(),req.user,await getBookingConfig()));});
router.post('/classes',roles('admin','ulma'),async(req,res)=>res.status(201).json(await createLesson(req.user,req.body)));
router.post('/classes/:id/join',roles('student','ulma'),async(req,res)=>{
  const c=await findClass(req.user,req.params.id),config=await getBookingConfig();
  if(!classActions(c.toObject(),req.user,config).canJoin)fail(409,'The teacher must start this lesson during its scheduled time before you can join.');
  const e=await Enrollment.findById(c.enrollment);if(!e||!['approved','active'].includes(e.status))fail(403,'The enrollment is not active.');
  res.json(c.meetingLink?{kind:'external',url:safeUrl(c.meetingLink)}:{kind:'internal',url:`/class/${c._id}`});
});
router.patch('/classes/:id',roles('admin','ulma'),async(req,res)=>{
  const initial=await findClass(req.user,req.params.id);
  const c=await withBookingTransaction(actorLocks(initial.ulma,initial.student),async session=>{
    const lesson=await Class.findById(initial._id).session(session),config=await getBookingConfig(session);
    if(req.body.topic!==undefined)lesson.topic=text(req.body.topic,'Topic',2,160);
    if(req.body.notes!==undefined)lesson.notes=text(req.body.notes,'Notes',0,2000);
    if(req.body.meetingLink!==undefined)lesson.meetingLink=safeUrl(req.body.meetingLink);
    if(req.body.status!==undefined){
      const status=choice(req.body.status,['ongoing','completed','cancelled']),transitions={scheduled:['ongoing','cancelled'],ongoing:['completed','cancelled'],paused:['cancelled'],completed:[],cancelled:[]};
      if(status!==lesson.status){
        if(!transitions[lesson.status]?.includes(status))fail(409,'This lesson cannot change to that status.');
        if(status==='ongoing'){
          if(!classActions(lesson.toObject(),req.user,config).canStart)fail(409,`Start this lesson within ${config.joinEarlyMinutes} minutes before its scheduled start and before its end.`);
          const e=await Enrollment.findById(lesson.enrollment).session(session);if(!e||!['approved','active'].includes(e.status))fail(409,'The enrollment is not active.');
        }
        lesson.status=status;
        if(['cancelled','completed'].includes(status))await Reservation.deleteMany({classId:lesson._id},{session});
      }
    }
    await lesson.save({session});await Audit.create([{actor:req.user._id,action:'class.update',record:String(lesson._id)}],{session});return lesson;
  });
  const io=req.app.get('io');io?.to(`class:${c._id}`).emit('class:status',{status:c.status});if(['completed','cancelled','paused'].includes(c.status))io?.in(`class:${c._id}`).socketsLeave(`class:${c._id}`);res.json(c);
});
export default router;
