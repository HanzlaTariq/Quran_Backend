import {Router} from 'express';
import {User,Student,Ulma,Course,Class,Enrollment,Fee,Attendance,Assignment,Conversation,Notice,Audit,Config,Reservation} from './models.js';
import {protect,roles,publicUser,revoke} from './auth.js';
import {fail,id,text,integer,money,choice,date,same,safeUrl,pageParams,csvCell} from './core.js';
import * as library from './library.js';
import {bookingSettings} from './timetable-core.js';
import {mailReady} from './email.js';
import {dailyReady} from './daily.js';
import {classroomActions} from './classroom-core.js';
import {classPopulate,retryVideoClosure,emitClassChange} from './classroom-service.js';
import {getBookingConfig} from './booking-service.js';
import {profile,scope,enrollmentPopulate,findEnrollment,findClass,notify,log,list} from './access.js';
export {profile,scope,enrollmentPopulate,findEnrollment,findClass,notify} from './access.js';
const router=Router();
router.get('/public',async(req,res)=>{
  const config=await Config.findOne({key:'main'}).lean();
  const [courses,teachers]=await Promise.all([Course.countDocuments({isActive:true}),Ulma.countDocuments({isApproved:true,user:{$in:await User.find({role:'ulma',isActive:true,isVerified:true}).distinct('_id')}})]);
  res.json({academyName:config?.academyName||'Noor Academy',announcement:config?.announcement||'',contactEmail:config?.contactEmail||'',registrationOpen:config?.registrationOpen??true,courses,teachers,library:await library.libraryStatus()});
});
router.get('/library/status',async(req,res)=>res.json(await library.libraryStatus()));
router.get('/quran/surahs',async(req,res)=>res.json({items:await library.surahs()}));
router.get('/quran/search',async(req,res)=>res.json(await library.searchQuran(req.query)));
router.get('/quran/daily',async(req,res)=>res.json(await library.daily()));
router.get('/quran/surahs/:number',async(req,res)=>res.json(await library.surah(req.params.number)));
router.get('/hadith/books',async(req,res)=>res.json({items:await library.hadithBooks()}));
router.get('/hadith',async(req,res)=>res.json(await library.hadiths(req.query)));
router.get('/courses',async(req,res)=>{
  const q=req.user?.role==='admin'?{}:{isActive:true};
  if(req.query.q){const term=text(req.query.q,'Search',1,100).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');q.$or=[{name:{$regex:term,$options:'i'}},{description:{$regex:term,$options:'i'}}];}
  res.json(await list(Course,q,req.query));
});
router.use(protect);
router.use((req,res,next)=>{res.set('Cache-Control','no-store');next();});
router.get('/dashboard',async(req,res)=>{
  const sc=await scope(req.user),admin=req.user.role==='admin';
  const [enrollments,classes,fees,assignments,attendance,unread]=await Promise.all([
    Enrollment.find(sc).populate(enrollmentPopulate).sort({createdAt:-1}).limit(6).lean(),
    admin?[]:Class.find({...sc,status:{$in:['scheduled','ongoing']},utcEnd:{$gte:new Date()}}).populate(classPopulate).sort({utcStart:1}).limit(4).lean(),
    Fee.find(sc).select('amount status currency').lean(),admin?0:Assignment.countDocuments({...sc,status:{$in:['pending','late']}}),admin?[]:Attendance.find(sc).select('status').lean(),Notice.countDocuments({user:req.user._id,read:false})
  ]);
  const counts={enrollments:await Enrollment.countDocuments({...sc,status:{$in:['active','approved']}}),classes:await Class.countDocuments({...sc,status:'completed'}),assignments,unread,pendingFees:fees.filter(x=>['pending','overdue','submitted'].includes(x.status)).reduce((a,x)=>a+x.amount,0),paidFees:fees.filter(x=>x.status==='paid').reduce((a,x)=>a+x.amount,0),attendance:attendance.length?Math.round(attendance.filter(x=>x.status!=='absent').length/attendance.length*100):null,readingDays:(req.user.readingDays||[]).length};
  if(req.user.role==='admin'){counts.users=await User.countDocuments();counts.teachers=await Ulma.countDocuments({isApproved:true});counts.pendingEnrollments=await Enrollment.countDocuments({status:'pending'});counts.courses=await Course.countDocuments({isActive:true});}
  counts.feeTotals={};for(const f of fees){const k=f.currency||'PKR';counts.feeTotals[k]??={paid:0,pending:0};if(f.status==='paid')counts.feeTotals[k].paid+=f.amount;if(['pending','overdue','submitted'].includes(f.status))counts.feeTotals[k].pending+=f.amount;}
  const config=await getBookingConfig();
  res.json({counts,enrollments,classes:classes.map(c=>classroomActions(c,req.user,config))});
});
router.post('/courses',roles('admin'),async(req,res)=>{
  const c=await Course.create({name:text(req.body.name,'Course name',2,100),description:text(req.body.description,'Description',10,4000),duration:integer(req.body.duration,'Duration in months',1,120),monthlyFee:money(req.body.monthlyFee),currency:choice(req.body.currency||'PKR',['PKR','USD','GBP','EUR','AED','SAR','CAD','AUD'],'Currency'),level:text(req.body.level||'All levels','Level',2,60),createdBy:req.user._id});
  await log(req,'course.create',c._id);res.status(201).json(c);
});
router.patch('/courses/:id',roles('admin'),async(req,res)=>{
  const c=await Course.findById(id(req.params.id));if(!c)fail(404,'Course not found.');
  if(req.body.name!==undefined)c.name=text(req.body.name,'Course name',2,100);
  if(req.body.description!==undefined)c.description=text(req.body.description,'Description',10,4000);
  if(req.body.monthlyFee!==undefined)c.monthlyFee=money(req.body.monthlyFee);
  if(req.body.currency!==undefined)c.currency=choice(req.body.currency,['PKR','USD','GBP','EUR','AED','SAR','CAD','AUD'],'Currency');
  if(req.body.duration!==undefined)c.duration=integer(req.body.duration,'Duration',1,120);
  if(req.body.level!==undefined)c.level=text(req.body.level,'Level',2,60);
  if(typeof req.body.isActive==='boolean')c.isActive=req.body.isActive;
  await c.save();await log(req,'course.update',c._id);res.json(c);
});
router.get('/attendance',roles('student','ulma'),async(req,res)=>res.json(await list(Attendance,await scope(req.user),req.query,[...enrollmentPopulate,{path:'classId',select:'topic utcStart utcEnd'}],{date:-1})));
router.post('/attendance',roles('ulma'),async(req,res)=>{
  const c=await findClass(req.user,req.body.classId);
  if(!['ongoing','completed'].includes(c.status))fail(409,'Start the class before recording attendance.');
  const e=c.enrollment?await Enrollment.findById(c.enrollment):null;if(!e)fail(404,'Class enrollment not found.');
  // Attendance is a teacher assertion, NOT an inferred iframe load or Daily prejoin.
  const a=await Attendance.findOneAndUpdate({classId:c._id},{$set:{classId:c._id,enrollment:e._id,date:c.utcStart,student:e.student,ulma:e.ulma,status:choice(req.body.status,['present','absent','late'],'Attendance'),remarks:text(req.body.remarks||'','Remarks',0,1000),markedBy:req.user._id,markedAt:new Date()}},{upsert:true,new:true,runValidators:true});
  await Class.updateOne({_id:c._id},{$set:{attendance:a._id}});await log(req,'attendance.mark',a._id);res.json(a);
});
router.get('/assignments',roles('student','ulma'),async(req,res)=>res.json(await list(Assignment,await scope(req.user),req.query,enrollmentPopulate,{dueDate:1})));
router.post('/assignments',roles('ulma'),async(req,res)=>{
  const e=await findEnrollment(req.user,req.body.enrollment);if(!['active','approved'].includes(e.status))fail(409,'Enrollment is not active.');
  let lesson;
  if(req.body.classId){lesson=await findClass(req.user,req.body.classId);if(!same(lesson.enrollment,e._id))fail(400,'The assignment class belongs to another enrollment.');}
  const a=await Assignment.create({enrollment:e._id,class:lesson?._id,student:e.student,ulma:e.ulma,title:text(req.body.title,'Title',2,160),description:text(req.body.description,'Instructions',5,4000),dueDate:date(req.body.dueDate),type:choice(req.body.type||'recitation',['recitation','memorization','understanding','test'])});
  const s=await Student.findById(e.student);await notify(s.user,'New assignment',a.title,'/assignments',req.app.get('io'));res.status(201).json(a);
});
router.patch('/assignments/:id',roles('student','ulma'),async(req,res)=>{
  const a=await Assignment.findOne({_id:id(req.params.id),...await scope(req.user)});if(!a)fail(404,'Assignment not found.');
  if(req.user.role==='student'){
    if(['graded','completed'].includes(a.status))fail(409,'This assignment has already been graded.');
    a.submission={text:text(req.body.text,'Submission',1,10000),audioUrl:safeUrl(req.body.audioUrl),submittedAt:new Date()};a.status='submitted';
  }else{
    if(a.status!=='submitted')fail(409,'The student has not submitted this assignment yet.');
    a.grade={score:integer(req.body.score,'Score',0,100),maxScore:100,feedback:text(req.body.feedback||'','Feedback',0,4000),gradedAt:new Date()};a.status='graded';
  }
  await a.save();res.json(a);
});
router.get('/fees',roles('student','admin'),async(req,res)=>{
  const config=await Config.findOne({key:'main'}).lean();res.json({...await list(Fee,await scope(req.user),req.query,enrollmentPopulate),paymentInstructions:config?.paymentInstructions||''});
});
router.post('/fees',roles('admin'),async(req,res)=>{
  const e=await findEnrollment(req.user,req.body.enrollment);if(!['approved','active','paused'].includes(e.status))fail(409,'Choose an approved enrollment.');
  const f=await Fee.create({student:e.student,ulma:e.ulma,enrollment:e._id,amount:money(req.body.amount),monthlyFee:e.monthlyFee,currency:e.currency||'PKR',dueDate:date(req.body.dueDate),description:text(req.body.description||'Tuition fee','Description',2,200),createdBy:req.user._id});
  const s=await Student.findById(e.student);await notify(s.user,'New fee invoice',f.invoiceNumber,'/fees',req.app.get('io'));await log(req,'invoice.create',f._id);res.status(201).json(f);
});
router.patch('/fees/:id',roles('student','admin'),async(req,res)=>{
  const f=await Fee.findOne({_id:id(req.params.id),...await scope(req.user)});if(!f)fail(404,'Invoice not found.');
  if(req.user.role==='student'){
    if(!['pending','overdue'].includes(f.status))fail(409,'This invoice cannot accept a new payment claim.');
    f.transactionId=text(req.body.transactionId,'Payment reference',3,150);f.paymentMethod=choice(req.body.paymentMethod,['bank','easypaisa','jazzcash','cash','other']);f.status='submitted';
  }else{
    const status=choice(req.body.status,['paid','pending','cancelled']);
    if(f.status==='paid'||f.status==='cancelled')fail(409,'Finalized invoices cannot be changed. Create an adjustment separately.');
    f.status=status;if(status==='paid')f.paymentDate=new Date();if(req.body.notes!==undefined)f.notes=text(req.body.notes,'Notes',0,1000);
  }
  await f.save();await log(req,req.user.role==='admin'?'invoice.review':'invoice.claim',f._id);res.json(f);
});
router.get('/students',roles('admin','ulma'),async(req,res)=>{
  const ids=req.user.role==='admin'?await Student.distinct('_id'):await Enrollment.find({...await scope(req.user),status:{$in:['active','approved','paused']}}).distinct('student');
  const result=await list(Student,{_id:{$in:ids}},req.query,{path:'user',select:'name email country languages'});
  result.items=result.items.map(p=>({_id:p._id,user:p.user,level:p.level,currentLevel:p.currentLevel,learningGoals:p.learningGoals,createdAt:p.createdAt}));res.json(result);
});
router.get('/reports',async(req,res)=>{
  const sc=await scope(req.user);const month=text(req.query.month||new Date().toISOString().slice(0,7),'Month',7,7);
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))fail(400,'Use YYYY-MM.');
  const start=new Date(`${month}-01T00:00:00Z`),end=new Date(start);end.setUTCMonth(end.getUTCMonth()+1);
  const [classes,attendance,assignments]=await Promise.all([Class.find({...sc,utcStart:{$gte:start,$lt:end}}).populate(enrollmentPopulate).lean(),Attendance.find({...sc,date:{$gte:start,$lt:end}}).lean(),Assignment.find({...sc,'grade.gradedAt':{$gte:start,$lt:end}}).lean()]);
  const graded=assignments.filter(a=>a.grade?.maxScore>0);
  const result={month,classes,attendance,totalClasses:classes.length,completedClasses:classes.filter(c=>c.status==='completed').length,attendanceRate:attendance.length?Math.round(attendance.filter(a=>a.status!=='absent').length/attendance.length*100):null,averageScore:graded.length?Math.round(graded.reduce((sum,a)=>sum+a.grade.score/a.grade.maxScore*100,0)/graded.length):null};
  if(req.user.role==='admin'){
    const aggregate={month,totalClasses:result.totalClasses,completedClasses:result.completedClasses,attendanceRate:result.attendanceRate,averageScore:result.averageScore,classes:[],attendance:[],aggregateOnly:true};
    if(req.query.format==='csv'){
      const lines=[['Month','Total lessons','Completed lessons','Attendance percent','Average score'],[month,aggregate.totalClasses,aggregate.completedClasses,aggregate.attendanceRate??'',aggregate.averageScore??'']];
      res.set('Content-Type','text/csv; charset=utf-8');res.set('Content-Disposition',`attachment; filename="academy-summary-${month}.csv"`);return res.send('\uFEFF'+lines.map(r=>r.map(csvCell).join(',')).join('\r\n'));
    }
    return res.json(aggregate);
  }
  result.classes=classes.map(({liveRoom,operationLock,meetingLink,recordingUrl,sharedNotes,teachingResource,...c})=>c);
  if(req.query.format==='csv'){
    const lines=[['Topic','Start (UTC)','Status','Student','Teacher'],...classes.map(c=>[c.topic,c.utcStart.toISOString(),c.status,c.student?.user?.name||'',c.ulma?.user?.name||''])];
    res.set('Content-Type','text/csv; charset=utf-8');res.set('Content-Disposition',`attachment; filename="noor-report-${month}.csv"`);return res.send('\uFEFF'+lines.map(r=>r.map(csvCell).join(',')).join('\r\n'));
  }
  res.json(result);
});
router.get('/notifications',async(req,res)=>res.json(await list(Notice,{user:req.user._id},req.query)));
router.patch('/notifications/read',async(req,res)=>{await Notice.updateMany({user:req.user._id,read:false},{$set:{read:true}});res.json({message:'Notifications marked as read.'});});
router.post('/reading',async(req,res)=>{
  const surah=await library.surah(req.body.surah),ayah=integer(req.body.ayah,'Ayah',1,surah.ayahs.length);
  const today=new Date().toISOString().slice(0,10);
  await User.updateOne({_id:req.user._id},{$set:{reading:{surah:surah.number,ayah}},$addToSet:{readingDays:today}});
  res.json({reading:{surah:surah.number,ayah}});
});
router.post('/bookmarks',async(req,res)=>{
  const ref=text(req.body.ref,'Bookmark reference',3,100);
  if(/^quran:[1-9]\d{0,2}:[1-9]\d{0,2}$/.test(ref)){const [,s,a]=ref.split(':');const q=await library.surah(s);integer(a,'Ayah',1,q.ayahs.length);}
  else if(!/^hadith:(bukhari|muslim|nawawi):(eng|ara|urd):\d+(\.\d+)?$/.test(ref))fail(400,'Invalid bookmark reference.');
  const remove=req.body.remove===true;
  if(!remove && req.user.bookmarks.length>=1000)fail(400,'Bookmark limit reached (1,000).');
  const u=await User.findByIdAndUpdate(req.user._id,remove?{$pull:{bookmarks:ref}}:{$addToSet:{bookmarks:ref}},{new:true});res.json({bookmarks:u.bookmarks});
});
router.get('/users',roles('admin'),async(req,res)=>{
  const q={};if(req.query.role)q.role=choice(req.query.role,['student','ulma','admin']);
  if(req.query.q){const term=text(req.query.q,'Search',1,100).replace(/[.*+?^${}()|[\]\\]/g,'\\$&');q.$or=[{name:{$regex:term,$options:'i'}},{email:{$regex:term,$options:'i'}}];}
  const result=await list(User,q,req.query);const teachers=await Ulma.find({user:{$in:result.items.map(u=>u._id)}}).lean();
  result.items=result.items.map(u=>({_id:u._id,name:u.name,email:u.email,role:u.role,isActive:u.isActive,createdAt:u.createdAt,isVerified:u.isVerified,timezone:u.timezone,country:u.country,approved:u.role==='ulma'?(teachers.find(t=>same(t.user,u._id))?.isApproved||false):true}));res.json(result);
});
router.patch('/users/:id',roles('admin'),async(req,res)=>{
  const u=await User.findById(id(req.params.id));if(!u)fail(404,'User not found.');if(same(u,req.user))fail(400,'You cannot disable or modify your own admin access here.');
  if(u.role==='admin')fail(403,'Administrative accounts must be managed through the server administrator.');
  if(typeof req.body.isActive==='boolean'){u.isActive=req.body.isActive;await u.save();if(!u.isActive)await revoke(u._id,req.app.get('io'));}
  if(u.role==='ulma'&&typeof req.body.approved==='boolean'){if(req.body.approved&&!u.isVerified)fail(409,'The teacher must verify their email with OTP before approval.');await Ulma.updateOne({user:u._id},{$set:{isApproved:req.body.approved}},{upsert:true});if(!req.body.approved)await revoke(u._id,req.app.get('io'));}
  let warning=null;
  if(!u.isActive||req.body.approved===false){
    const p=u.role==='ulma'?await Ulma.findOne({user:u._id}):await Student.findOne({user:u._id});
    if(p){
      const lessons=await Class.find({[u.role==='ulma'?'ulma':'student']:p._id,status:'ongoing'});
      for(const c of lessons){
        await Class.updateOne({_id:c._id},{$set:{status:'cancelled',endedAt:new Date(),'liveRoom.closePending':!!c.liveRoom?.readyAt}});
        await Reservation.deleteMany({classId:c._id});
        c.status='cancelled';await emitClassChange(req.app.get('io'),c).catch(()=>{});
        const result=await retryVideoClosure(c);if(!result.closed)warning='Access revoked. A video room needs closure retry; its scheduled expiry still applies.';
      }
    }
  }
  await log(req,'user.access',u._id);res.json({user:publicUser(u),warning});
});
router.get('/config',roles('admin'),async(req,res)=>{const c=await Config.findOne({key:'main'}).lean()||{academyName:'Noor Academy',registrationOpen:true,announcement:'',paymentInstructions:'',contactEmail:''};res.json({...c,booking:bookingSettings(c),emailConfigured:mailReady(),videoConfigured:dailyReady(),videoProvider:'daily'});});
router.patch('/config',roles('admin'),async(req,res)=>{
  const value={academyName:text(req.body.academyName,'Academy name',2,80),announcement:text(req.body.announcement||'','Announcement',0,2000),paymentInstructions:text(req.body.paymentInstructions||'','Payment instructions',0,3000),contactEmail:text(req.body.contactEmail||'','Contact email',0,254),registrationOpen:req.body.registrationOpen!==false};
  if(req.body.booking!==undefined)value.booking=bookingSettings(req.body.booking);
  const config=await Config.findOneAndUpdate({key:'main'},{$set:value},{upsert:true,new:true,runValidators:true});await log(req,'settings.update',config._id);res.json(config);
});
router.get('/audit',roles('admin'),async(req,res)=>res.json(await list(Audit,{},req.query,{path:'actor',select:'name role'})));
export default router;
