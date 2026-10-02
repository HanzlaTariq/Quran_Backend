/** Read-only audit. Does not guess time zones, rewrite timetables, change fees or delete data. */
import mongoose from 'mongoose';
import {Enrollment,Class,Ulma,User} from '../src/models.js';
import {timeZone} from '../src/timetable-core.js';
if(!process.env.MONGODB_URI)throw new Error('MONGODB_URI is required.');
try{
 await mongoose.connect(process.env.MONGODB_URI,{serverSelectionTimeoutMS:10000});
 const active=await Enrollment.find({status:{$in:['pending','approved','active','paused']}}).select('_id student ulma status bookingVersion schedule').lean();
 const pending=active.filter(e=>e.status==='pending'&&(!e.bookingVersion||!e.schedule?.slots?.length)),legacy=active.filter(e=>e.status!=='pending'&&e.bookingVersion!==1);
 const profiles=await Ulma.find().populate({path:'user',select:'timezone isVerified'}).lean();
 const teacherIssues=profiles.filter(p=>{if(!p.user?.isVerified||!p.availability?.some(w=>w.isActive!==false))return true;try{timeZone(p.user.timezone);return false;}catch{return true;}});
 const missingEnrollmentClasses=await Class.countDocuments({status:{$in:['scheduled','ongoing','paused']},$or:[{enrollment:{$exists:false}},{enrollment:null}]}),badTime=await Class.countDocuments({status:{$in:['scheduled','ongoing','paused']},$or:[{utcStart:{$exists:false}},{utcEnd:{$exists:false}}]});
 const hello=await mongoose.connection.db.admin().command({hello:1});
 console.log(JSON.stringify({readOnly:true,transactionCapable:!!(hello.setName||hello.msg==='isdbgrid'),olderPendingRequestsNeedingSlotSelection:pending.map(e=>String(e._id)),olderActiveEnrollmentsNeedingReview:legacy.map(e=>({enrollment:String(e._id),teacher:String(e.ulma),student:String(e.student),status:e.status})),teacherProfilesNeedingEmailVerificationOrAvailability:teacherIssues.map(t=>String(t._id)),classesWithoutEnrollmentReference:missingEnrollmentClasses,classesMissingUtcTimes:badTime},null,2));
 console.log('\nNothing was changed. Follow the legacy-data section of docs/BOOKING_UPDATE.md. Do not drop your database or regenerate CHAT_KEY.');
}catch(e){console.error('Schedule audit failed:',e.code||e.name);process.exitCode=1;}finally{await mongoose.disconnect();}
