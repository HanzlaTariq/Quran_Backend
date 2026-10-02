import {Router} from 'express';
import {limiter} from './rate-limit.js';
import {beginOtp,resendOtp,consumeOtp} from './otp.js';
import {sendMail,mailReady} from './email.js';
import {profileFields,languages} from './profile-core.js';
import {integer} from './core.js';
import {User,Student,Ulma,Session,Reset,Audit,Config,OtpChallenge,Enrollment,Notice} from './models.js';
import {fail,token,hash,sign,equal,text,email,password,choice,same} from './core.js';
function existingPassword(value) { if(typeof value!=='string'||!value.length||Buffer.byteLength(value)>72)fail(401,'Invalid email or password.'); return value; }
export const sessionCookie='noor_session';
const options=()=>({httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/'});
export const origins=()=>String(process.env.ALLOWED_ORIGINS || 'http://localhost:5173').split(',').map(x=>x.trim()).filter(Boolean);
export async function sessionFrom(raw) {
  if(typeof raw!=='string'||!/^[a-f0-9]{64}$/.test(raw))return null;
  const s=await Session.findOne({tokenHash:hash(raw),expiresAt:{$gt:new Date()}}).populate('user');
  if(!s?.user || !s.user.isActive || !s.user.isVerified || !s.otpVerifiedAt)return null;
  if(s.user.role==='ulma' && !await Ulma.exists({user:s.user._id,isApproved:true}))return null;
  return s;
}
export async function attachSession(req,res,next) {try{req.session=await sessionFrom(req.cookies[sessionCookie]);req.user=req.session?.user;next();}catch(e){next(e);}}
export function protect(req,res,next) {if(!req.user)return next(Object.assign(new Error('Please sign in to continue.'),{status:401}));next();}
export const roles=(...allowed)=>(req,res,next)=>{if(!allowed.includes(req.user?.role))return next(Object.assign(new Error('You do not have access to this action.'),{status:403}));next();};
export function csrf(req,res,next) {
  if(['GET','HEAD','OPTIONS'].includes(req.method))return next();
  if(req.headers.origin && !origins().includes(req.headers.origin))return next(Object.assign(new Error('This origin is not allowed.'),{status:403}));
  const header=req.headers['x-csrf-token'];
  let expected=req.session?.csrf;
  if(!expected){
    const cookie=req.cookies.noor_csrf || '';const [nonce,mac]=cookie.split('.');
    if(nonce && mac && equal(mac,sign(nonce,process.env.SESSION_SECRET)))expected=cookie;
  }
  if(!expected || !equal(expected,header))return next(Object.assign(new Error('Security token expired. Refresh the page and try again.'),{status:403}));
  next();
}
export const publicUser = u=>({
  _id:u._id,name:u.name,email:u.email,role:u.role,phone:u.phone,country:u.country,timezone:u.timezone||'Asia/Karachi',
  city:u.city||'',gender:u.gender||'unspecified',age:u.age??null,photoVersion:u.photoVersion||0,profileImage:u.profileImage,languages:u.languages||[],isActive:u.isActive,isVerified:u.isVerified,bookmarks:u.bookmarks||[],reading:u.reading||{surah:1,ayah:1},readingDays:u.readingDays||[],theme:u.theme||'light',translation:u.translation||'en',createdAt:u.createdAt
});
async function issue(res,user) {
  const raw=token(),csrf=token(),hours=Math.min(72,Math.max(1,Number(process.env.SESSION_HOURS)||12));
  await Session.create({tokenHash:hash(raw),user:user._id,csrf,otpVerifiedAt:new Date(),expiresAt:new Date(Date.now()+hours*3600000)});
  res.cookie(sessionCookie,raw,{...options(),maxAge:hours*3600000});res.clearCookie('noor_csrf',options());
  return {user:publicUser(user),csrf};
}
async function ensureProfile(user) {
  if(user.role==='student')await Student.updateOne({user:user._id},{$setOnInsert:{user:user._id,gender:user.gender||'unspecified',age:user.age??null}},{upsert:true});
  if(user.role==='ulma')await Ulma.updateOne({user:user._id},{$setOnInsert:{user:user._id,isApproved:false}},{upsert:true});
}
export async function revoke(user,io) {await Session.deleteMany({user});await OtpChallenge.deleteMany({user});io?.in(`user:${user}`).disconnectSockets(true);}
const auth=Router();
const loginLimit=limiter('login',{windowMs:15*60*1000,limit:20,standardHeaders:'draft-8',legacyHeaders:false,message:{message:'Too many sign-in attempts. Try again in 15 minutes.'}});
const resetLimit=limiter('reset',{windowMs:60*60*1000,limit:5,standardHeaders:'draft-8',legacyHeaders:false,message:{message:'Too many reset requests. Try again later.'}});
auth.get('/csrf',(req,res)=>{
  res.set('Cache-Control','no-store');
  if(req.session)return res.json({csrf:req.session.csrf});
  const nonce=token(),value=`${nonce}.${sign(nonce,process.env.SESSION_SECRET)}`;
  res.cookie('noor_csrf',value,{...options(),maxAge:3600000});res.json({csrf:value});
});
auth.get('/me',(req,res)=>{res.set('Cache-Control','no-store');res.json({user:req.user?publicUser(req.user):null,csrf:req.session?.csrf||null});});
auth.post('/register',loginLimit,async(req,res)=>{
  const config=await Config.findOne({key:'main'});if(config?.registrationOpen===false)fail(403,'Registration is currently closed. Contact the academy.');
  const mail=email(req.body.email),pass=password(req.body.password),role=choice(req.body.role||'student',['student','ulma'],'Account type');
  const fields=profileFields(req.body,{required:true});
  if(!mailReady())fail(503,'Email verification must be configured before registration. Ask the administrator to configure SMTP.');
  if(await User.exists({email:mail}))fail(409,'Unable to register this email. Try signing in or resetting your password.');
  let teaching;
  if(role==='ulma')teaching={bio:text(req.body.bio||'','Biography',0,3000),experience:integer(req.body.experience||0,'Experience',0,80),expertise:languages(req.body.expertise||[],false)};
  const user=await User.create({...fields,email:mail,password:pass,role,isVerified:false});
  try{await ensureProfile(user);if(teaching)await Ulma.updateOne({user:user._id},{$set:teaching});}catch(e){await User.deleteOne({_id:user._id});throw e;}
  // Registration never creates a login session before mailbox verification.
  res.status(201).json(await beginOtp(user,'register'));
});
auth.post('/login',loginLimit,async(req,res)=>{
  const mail=email(req.body.email),pass=existingPassword(req.body.password),user=await User.findOne({email:mail}).select('+password');
  if(!user || !await user.matchPassword(pass))fail(401,'Invalid email or password.');
  if(!user.isActive)fail(403,'Your account is disabled. Contact the administrator.');
  await ensureProfile(user);
  if(user.isVerified&&user.role==='ulma'&&!await Ulma.exists({user:user._id,isApproved:true}))fail(403,'Your email is verified. Your teacher application is awaiting administrator approval.');
  res.json(await beginOtp(user,user.isVerified?'login':'register'));
});
const otpLimit=limiter('otp-verify',{windowMs:15*60000,limit:40,standardHeaders:'draft-8',legacyHeaders:false,message:{message:'Too many verification attempts. Wait 15 minutes.'}});
auth.post('/otp/resend',loginLimit,async(req,res)=>res.json(await resendOtp(req.body.challenge)));
auth.post('/otp/verify',otpLimit,async(req,res)=>{
  const challenge=await consumeOtp(req.body.challenge,req.body.code),user=await User.findById(challenge.user);
  if(!user?.isActive)fail(403,'This account is unavailable.');
  const firstVerification=!user.isVerified;user.isVerified=true;user.verifiedAt=user.verifiedAt||new Date();await user.save();await ensureProfile(user);
  if(user.role==='ulma'&&!await Ulma.exists({user:user._id,isApproved:true})){
    if(firstVerification){const admins=await User.find({role:'admin',isActive:true}).select('_id');if(admins.length)await Notice.insertMany(admins.map(a=>({user:a._id,title:'Verified teacher application',body:`${user.name} verified their email and is awaiting your review.`,href:'/users?role=ulma'})));}
    return res.json({user:null,verified:true,requiresApproval:true,message:'Email verified. Your teacher application is awaiting administrator approval. You can sign in after approval.'});
  }
  if(req.session)await Session.deleteOne({_id:req.session._id});
  user.lastLogin=new Date();await user.save();await Audit.create({actor:user._id,action:'auth.login.otp'});
  res.json({...await issue(res,user),verified:true});
});
auth.post('/logout',async(req,res)=>{
  if(req.session){await Session.deleteOne({_id:req.session._id});const sockets=await req.app.get('io')?.in(`user:${req.user._id}`).fetchSockets();for(const s of sockets||[])if(s.data.sessionId===String(req.session._id))s.disconnect(true);}
  res.clearCookie(sessionCookie,options());res.clearCookie('noor_csrf',options());res.json({message:'Signed out.'});
});
auth.patch('/profile',protect,async(req,res)=>{
  const user=req.user,patch=profileFields(req.body);
  const save=async session=>{
    if(user.role==='ulma'&&patch.timezone&&patch.timezone!==user.timezone){
      const p=await Ulma.findOne({user:user._id}).session(session||null);
      if(p&&await Enrollment.exists({ulma:p._id,status:{$in:['pending','approved','active','paused']},$or:[{holdExpiresAt:{$exists:false}},{holdExpiresAt:{$gt:new Date()}},{status:{$ne:'pending'}}]}).session(session||null))fail(409,'A teacher with current bookings cannot change the schedule time zone. Keep the existing zone or ask the administrator to cancel/rebook the affected enrollments first.');
    }
    Object.assign(user,patch);
    if(req.body.translation!==undefined)user.translation=choice(req.body.translation,['en','ur','none']);
    if(req.body.theme!==undefined)user.theme=choice(req.body.theme,['light','dark']);
    await user.save({session});
    if(user.role==='student')await Student.updateOne({user:user._id},{$set:{gender:user.gender,age:user.age}},{session});
  };
  if(user.role==='ulma'&&patch.timezone&&patch.timezone!==user.timezone){
    const p=await Ulma.findOne({user:user._id});const {withBookingTransaction}=await import('./booking-service.js');
    await withBookingTransaction([`teacher:${p._id}`],save);
  }else await save(undefined);
  res.json({user:publicUser(user),message:'Profile saved. Existing lessons keep their booked UTC times.'});
});
auth.post('/password',protect,loginLimit,async(req,res)=>{
  const user=await User.findById(req.user._id).select('+password');
  if(!await user.matchPassword(existingPassword(req.body.currentPassword)))fail(400,'Current password is incorrect.');
  user.password=password(req.body.newPassword);await user.save();await revoke(user._id,req.app.get('io'));res.clearCookie(sessionCookie,options());
  res.json({message:'Password changed. All devices have been signed out.'});
});
auth.post('/forgot-password',resetLimit,async(req,res)=>{
  const mail=email(req.body.email);
  if(!mailReady())fail(503,'Password-reset email is not configured. Contact your academy administrator.');
  const user=await User.findOne({email:mail,isActive:true});
  if(user){
    const raw=token();await Reset.deleteMany({user:user._id});await Reset.create({user:user._id,tokenHash:hash(raw),expiresAt:new Date(Date.now()+30*60000)});
    try{await sendMail(user.email,'Reset your Noor Academy password',`Open this link within 30 minutes to reset your password:\n${process.env.PUBLIC_URL}/reset-password?token=${raw}\n\nIf you did not request this, ignore this email.`);}
    catch{await Reset.deleteMany({user:user._id});console.error('Password-reset email delivery failed. Check SMTP configuration.');}
  }
  res.json({message:'If an active account exists, a reset email has been requested. Check your inbox and spam folder.'});
});
auth.post('/reset-password',loginLimit,async(req,res)=>{
  const raw=text(req.body.token,'Reset token',64,64),pass=password(req.body.password);
  const reset=await Reset.findOneAndDelete({tokenHash:hash(raw),expiresAt:{$gt:new Date()}});if(!reset)fail(400,'This reset link is invalid or has expired.');
  const user=await User.findById(reset.user).select('+password');if(!user||!user.isActive)fail(400,'This reset link is invalid.');
  user.password=pass;await user.save();await revoke(user._id,req.app.get('io'));res.clearCookie(sessionCookie,options());res.json({message:'Password reset. Sign in with your new password.'});
});
export default auth;
