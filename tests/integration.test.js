/** Optional REAL HTTP + Mongo replica-set + local SMTP suite.
 * Never runs against the normal app database. No OTP bypass is added to production.
 * Setup and limitations: START_HERE_CLASSROOM.md. Not executed in the offline build environment.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {localSmtp} from './helpers/local-smtp.js';
import {localInstant,zonedParts,addDays,DAY_NAMES,weekday} from '../src/timetable-core.js';
const enabled=process.env.RUN_INTEGRATION==='1';
const liveDaily=process.env.RUN_DAILY_INTEGRATION==='1';
test('real OTP, concurrent reservations, approvals, timetable, invoices and chat',{skip:!enabled,timeout:180000},async t=>{
 assert.equal(process.env.NODE_ENV,'test','Use NODE_ENV=test only in .env.testing.');
 const mongo=process.env.MONGODB_URI||'';let db='';try{db=new URL(mongo).pathname.slice(1);}catch{}
 assert.match(db,/_test$/,'Refusing to use a database whose name does not end in _test.');
 const base=process.env.TEST_BASE_URL||'http://127.0.0.1:5001';assert.match(base,/^http:\/\/(127\.0\.0\.1|localhost):\d+$/);
 assert.equal(process.env.SMTP_HOST,'127.0.0.1','Test SMTP must be loopback; do not use real credentials.');
 assert.ok(!process.env.SMTP_USER&&!process.env.EMAIL_USER,'Remove mail credentials from .env.testing.');
 if(liveDaily)assert.ok(process.env.DAILY_API_KEY?.trim(),'RUN_DAILY_INTEGRATION needs a dedicated test Daily API key on both test server and test process.');
 else assert.ok(!process.env.DAILY_API_KEY?.trim(),'Default integration test intentionally requires DAILY_API_KEY to be empty.');
 const smtp=await localSmtp(Number(process.env.SMTP_PORT)||2526),mongoose=(await import('mongoose')).default,M=await import('../src/models.js');
 const run='noor-test-'+randomBytes(7).toString('hex'),pass='Integration-'+randomBytes(16).toString('hex'),users=[],courseIds=[];
 let oldConfig,changedConfig=false;
 const origin=(process.env.ALLOWED_ORIGINS||'http://localhost:5173').split(',')[0];
 function client(){return{cookies:new Map(),csrf:null,async request(path,{method='GET',body,withoutCsrf=false}={}){
  if(method!=='GET'&&!this.csrf&&!withoutCsrf)await this.request('/auth/csrf');
  const headers={Accept:'application/json','Content-Type':'application/json',Origin:origin,Cookie:[...this.cookies].map(([k,v])=>`${k}=${v}`).join('; ')};
  if(method!=='GET'&&!withoutCsrf)headers['X-CSRF-Token']=this.csrf;
  const response=await fetch(base+'/api'+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(25000)});
  for(const cookie of response.headers.getSetCookie()){const pair=cookie.split(';')[0],at=pair.indexOf('=');this.cookies.set(pair.slice(0,at),pair.slice(at+1));}
  const data=await response.json();if(data.csrf)this.csrf=data.csrf;return{status:response.status,data};
 }};}
 const post=(c,p,body)=>c.request(p,{method:'POST',body}),patch=(c,p,body)=>c.request(p,{method:'PATCH',body});
 const expect=(r,status)=>assert.equal(r.status,status,JSON.stringify(r.data));
 const admin=client(),a=client(),b=client(),teacher=client(),anon=client();
 async function verify(c,response,email){expect(response,response.status===201?201:200);assert.equal(response.data.requiresOtp,true);return post(c,'/auth/otp/verify',{challenge:response.data.challenge,code:smtp.latestCode(email)});}
 try{
  await mongoose.connect(mongo);const hello=await mongoose.connection.db.admin().command({hello:1});assert.ok(hello.setName||hello.msg==='isdbgrid','Replica set / Atlas is required.');
  await Promise.all([M.User.init(),M.OtpChallenge.init(),M.Session.init(),M.Enrollment.init(),M.Class.init(),M.Reservation.init(),M.Fee.init()]);
  expect(await anon.request('/health'),200);
  const owner=await M.User.create({name:'Integration Administrator',email:run+'-admin@example.test',password:pass,role:'admin',timezone:'Asia/Karachi',isActive:true,isVerified:false});users.push(owner._id);
  expect(await verify(admin,await post(admin,'/auth/login',{email:owner.email,password:pass}),owner.email),200);
  oldConfig=await M.Config.findOne({key:'main'}).lean();
  expect(await patch(admin,'/config',{academyName:'Integration-only Academy',registrationOpen:true,booking:{slotMinutes:30,bookingLeadHours:2,holdHours:24,bookingWindowDays:60,joinEarlyMinutes:10,feeGraceDays:5}}),200);changedConfig=true;
  await t.test('unauthenticated and CSRF-less requests are rejected',async()=>{expect(await anon.request('/enrollments'),401);expect(await anon.request('/auth/register',{method:'POST',body:{},withoutCsrf:true}),403);});
  await t.test('registration cannot choose the administrator role',async()=>expect(await post(anon,'/auth/register',{email:run+'-x@example.test',password:pass,role:'admin'}),400));
  async function register(c,suffix,role){const email=run+'-'+suffix+'@example.test';const response=await post(c,'/auth/register',{name:'Integration '+suffix,email,password:pass,role,country:role==='ulma'?'Pakistan':'United States',city:role==='ulma'?'Lahore':'New York',timezone:role==='ulma'?'Asia/Karachi':'America/New_York',languages:['English','Urdu'],gender:'unspecified',experience:2});expect(response,201);const u=await M.User.findOne({email});assert.ok(u);users.push(u._id);return {u,response};}
  const ra=await register(a,'student-a','student'),rb=await register(b,'student-b','student'),rt=await register(teacher,'teacher','ulma');
  await t.test('registration alone does not create a verified user or login session',async()=>{assert.equal(ra.u.isVerified,false);assert.equal((await a.request('/auth/me')).data.user,null);assert.equal(await M.Session.countDocuments({user:ra.u._id}),0);const ch=await M.OtpChallenge.findOne({user:ra.u._id});assert.match(ch.codeHash,/^[a-f0-9]{64}$/);assert.notEqual(ch.codeHash,smtp.latestCode(ra.u.email));});
  await t.test('wrong OTP fails; correct OTP works once only',async()=>{const code=smtp.latestCode(ra.u.email),wrong=code==='000000'?'111111':'000000';expect(await post(a,'/auth/otp/verify',{challenge:ra.response.data.challenge,code:wrong}),400);expect(await verify(a,ra.response,ra.u.email),200);expect(await post(a,'/auth/otp/verify',{challenge:ra.response.data.challenge,code}),400);});
  expect(await verify(b,rb.response,rb.u.email),200);
  await t.test('verified teacher still needs administrator approval',async()=>{const r=await verify(teacher,rt.response,rt.u.email);expect(r,200);assert.equal(r.data.requiresApproval,true);assert.equal(r.data.user,null);expect(await post(teacher,'/auth/login',{email:rt.u.email,password:pass}),403);});
  expect(await patch(admin,`/users/${rt.u._id}`,{approved:true}),200);
  // Test-only clock advancement on an isolated fixture avoids sleeping for the resend cooldown.
  await M.OtpChallenge.updateOne({user:rt.u._id},{$set:{lastSentAt:new Date(Date.now()-61000)}});
  expect(await verify(teacher,await post(teacher,'/auth/login',{email:rt.u.email,password:pass}),rt.u.email),200);
  await t.test('role protections remain active after OTP',async()=>{expect(await a.request('/users'),403);expect(await post(a,'/courses',{name:'Forbidden'}),403);expect(await patch(a,'/config',{booking:{slotMinutes:60}}),403);});
  const cr=await post(admin,'/courses',{name:run+' course',description:'Isolated integration fixture, not a real published course.',duration:2,monthlyFee:1250,currency:'PKR',level:'Beginner'});expect(cr,201);const course=cr.data;courseIds.push(course._id);
  const tp=await M.Ulma.findOne({user:rt.u._id});
  expect(await patch(teacher,'/teacher-profile',{bio:'An integration-only teaching profile.',experience:2,expertise:['Tajweed'],courses:[course._id],availability:DAY_NAMES.map(day=>({day,startTime:'09:00',endTime:'12:00',isActive:true}))}),200);
  const first=addDays(zonedParts(Date.now(),'Asia/Karachi').date,2),start=localInstant(first,'09:00','Asia/Karachi').toISOString();
  const request={course:course._id,ulma:String(tp._id),slots:[start],monthlyFee:0,currency:'USD'};
  let winner,loser,en,winnerUser;
  await t.test('two concurrent students cannot reserve the same teacher time',async()=>{const results=await Promise.all([post(a,'/enrollments',request),post(b,'/enrollments',request)]);assert.deepEqual(results.map(r=>r.status).sort(),[201,409],JSON.stringify(results));const ai=results[0].status===201;winner=ai?a:b;loser=ai?b:a;winnerUser=ai?ra.u:rb.u;en=results[ai?0:1].data;assert.equal(en.monthlyFee,1250);assert.equal(en.currency,'PKR');assert.equal(await M.Fee.countDocuments({enrollment:en._id}),0);});
  await t.test('held status is visible without another student identity',async()=>{const response=await loser.request(`/teachers/${tp._id}/slots?course=${course._id}&from=${first}&timezone=Asia%2FKarachi`);expect(response,200);const slot=response.data.slots.find(s=>s.utcStart===start);assert.equal(slot.status,'held');assert.equal(slot.student,undefined);});
  let count,completedManual=0;
  await t.test('admin cannot read or write teaching resources',async()=>{
   for(const path of ['/classes','/assignments','/attendance']){expect(await admin.request(path),403);expect(await post(admin,path,{}),403);}
   expect(await post(winner,'/assignments',{}),403);expect(await post(winner,'/attendance',{}),403);
  });
  await t.test('concurrent approval is idempotent and creates timetable plus monthly invoices once',async()=>{const results=await Promise.all([patch(admin,`/enrollments/${en._id}`,{status:'approved'}),patch(admin,`/enrollments/${en._id}`,{status:'approved'})]);for(const r of results)expect(r,200);const e=await M.Enrollment.findById(en._id);count=e.classesCount;assert.ok(count>=8);assert.equal(await M.Class.countDocuments({enrollment:en._id}),count);assert.equal(await M.Fee.countDocuments({enrollment:en._id}),2);assert.equal(await M.Reservation.countDocuments({enrollment:en._id,status:'confirmed'}),count);});
  await t.test('student and teacher see the same UTC timetable with corresponding zones',async()=>{const student=(await winner.request('/classes?limit=100')).data.items,teach=(await teacher.request('/classes?limit=100')).data.items;assert.equal(student.length,count);assert.equal(teach.length,count);assert.equal(student[0].utcStart,teach[0].utcStart);assert.equal(student[0].student.user.timezone,'America/New_York');assert.equal(student[0].ulma.user.timezone,'Asia/Karachi');expect(await loser.request(`/classes/${student[0]._id}`),404);expect(await post(winner,`/classes/${student[0]._id}/join`,{}),409);});
  await t.test('booked slots and teacher time-zone lock survive approval',async()=>{const response=await loser.request(`/teachers/${tp._id}/slots?course=${course._id}&from=${first}&timezone=Asia%2FKarachi`);expect(response,200);assert.equal(response.data.slots.find(s=>s.utcStart===start).status,'booked');expect(await patch(teacher,'/auth/profile',{timezone:'Europe/London'}),409);});
  await t.test('class start gates joining and admin has no teaching override',async()=>{
   const start=new Date(Math.ceil((Date.now()+3*60000)/60000)*60000),end=new Date(+start+30*60000);
   const r=await post(teacher,'/classes',{enrollment:en._id,topic:'Integration manual lesson',utcStart:start.toISOString(),utcEnd:end.toISOString()});expect(r,201);
   const path=`/classes/${r.data._id}`;
   const details=await winner.request(path);expect(details,200);assert.equal(details.data.canJoin,false);assert.match(details.data.roomId,/^quran-class-[a-f0-9]{24}$/);
   assert.equal(details.data.liveRoom,undefined);assert.equal(details.data.meetingLink,undefined);
   expect(await post(teacher,'/classes',{enrollment:en._id,topic:'Overlapping lesson',utcStart:start.toISOString(),utcEnd:end.toISOString()}),409);
   expect(await post(winner,path+'/join',{}),409);expect(await post(winner,path+'/start',{}),403);
   expect(await post(loser,path+'/join',{}),404);expect(await post(admin,path+'/join',{}),403);expect(await post(admin,path+'/start',{}),403);
   expect(await patch(teacher,path,{meetingLink:'https://example.com/meeting'}),400);
   if(liveDaily){
    // Opt-in external-service contract test; no real camera/media stream is created here.
    expect(await post(teacher,path+'/start',{}),200);
    const joined=await post(winner,path+'/join',{});expect(joined,200);assert.equal(joined.data.kind,'embedded');assert.equal(joined.data.provider,'daily');assert.ok(joined.data.token.length>20);
    expect(await post(loser,path+'/join',{}),404);
    const shared=await patch(teacher,path+'/resource',{resource:{kind:'notes'},sharedNotes:'Integration lesson notes',version:0});expect(shared,200);assert.equal(shared.data.resourceVersion,1);
    expect(await patch(winner,path+'/resource',{resource:{kind:'notes'},version:1}),403);
    expect(await patch(teacher,path+'/resource',{resource:{kind:'notes'},version:0}),409);
    const ended=await post(teacher,path+'/end',{});expect(ended,200);assert.equal(ended.data.warning,null);completedManual=1;
    expect(await post(winner,path+'/join',{}),409);
    expect(await post(teacher,'/attendance',{classId:r.data._id,status:'present',remarks:'Explicit test fixture marking, not a verified media join.'}),200);
    expect(await winner.request('/attendance'),200);
   }else{
    expect(await post(teacher,path+'/start',{}),503);
    expect(await patch(teacher,path,{status:'ongoing'}),503); // No legacy status bypass.
    const still=await winner.request(path);expect(still,200);assert.equal(still.data.status,'scheduled');assert.equal(still.data.canJoin,false);
    expect(await patch(teacher,path,{status:'cancelled'}),200);
   }
  });
  await t.test('approval creates a private, encrypted conversation',async()=>{const conversations=(await winner.request('/chat/conversations')).data.items,conv=conversations.find(c=>String(c.courseId?._id)===course._id);assert.ok(conv);const r=await post(winner,`/chat/${conv._id}/messages`,{message:'Integration private message',clientId:run+'-message'});expect(r,201);const stored=await M.Message.findById(r.data._id);assert.match(stored.message,/^enc:v1:/);assert.equal(String(stored.senderId),String(winnerUser._id));expect(await loser.request(`/chat/${conv._id}/messages`),404);});
  await t.test('cancellation releases only this enrollment and preserves paid/history records',async()=>{expect(await patch(admin,`/enrollments/${en._id}`,{status:'cancelled'}),200);assert.equal(await M.Reservation.countDocuments({enrollment:en._id,utcEnd:{$gt:new Date()}}),0);assert.equal(await M.Fee.countDocuments({enrollment:en._id,status:'cancelled'}),2);assert.equal(await M.Class.countDocuments({enrollment:en._id,status:'completed'}),completedManual);expect(await post(loser,'/enrollments',request),201);});
 }finally{
  if(mongoose.connection.readyState===1){
   const students=await M.Student.find({user:{$in:users}}).distinct('_id'),teachers=await M.Ulma.find({user:{$in:users}}).distinct('_id');
   const es=await M.Enrollment.find({$or:[{student:{$in:students}},{ulma:{$in:teachers}}]}).distinct('_id');
   for(const Model of [M.Attendance,M.Assignment,M.Class,M.Fee,M.Reservation])await Model.deleteMany({enrollment:{$in:es}});
   await M.Enrollment.deleteMany({_id:{$in:es}});await M.Message.deleteMany({senderId:{$in:users}});await M.Conversation.deleteMany({$or:[{studentId:{$in:users}},{ulmaId:{$in:users}}]});
   await M.Notice.deleteMany({user:{$in:users}});await M.Audit.deleteMany({actor:{$in:users}});await M.Session.deleteMany({user:{$in:users}});await M.OtpChallenge.deleteMany({user:{$in:users}});
   await M.BookingMutex.deleteMany({_id:{$in:[...students.map(s=>'student:'+s),...teachers.map(s=>'teacher:'+s)]}});
   await M.Student.deleteMany({user:{$in:users}});await M.Ulma.deleteMany({user:{$in:users}});await M.User.deleteMany({_id:{$in:users}});await M.Course.deleteMany({_id:{$in:courseIds}});
   if(changedConfig){if(oldConfig)await M.Config.replaceOne({key:'main'},oldConfig);else await M.Config.deleteOne({key:'main'});}
   await mongoose.disconnect();
  }
  await smtp.close();
 }
});
