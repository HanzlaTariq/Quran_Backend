import mongoose from 'mongoose';
import {OtpChallenge} from './models.js';
import {MongoLimitStore} from './rate-limit-store.js';
import {fail,hash,token} from './core.js';
import {OTP_RULES,newOtp,otpHash,matchesOtp,validateTicket} from './otp-core.js';
import {sendMail,mailReady} from './email.js';
async function budget(user){
  const store=new MongoLimitStore('otp-mail-account',async()=>mongoose.connection.db.collection('academy_rate_limits'));
  store.init({windowMs:60*60000});const r=await store.increment(String(user));
  if(r.totalHits>8)fail(429,'Too many verification emails for this account. Try again in one hour.');
}
const challengeView=(raw,d)=>({user:null,requiresOtp:true,challenge:raw,expiresAt:d.expiresAt,resendAt:new Date(+d.lastSentAt+OTP_RULES.cooldownMs),message:'A six-digit code has been sent. Check your inbox and spam folder.'});
export async function beginOtp(user,purpose){
  if(!mailReady())fail(503,'Email verification is required, but SMTP is not configured. Contact the administrator.');
  await OtpChallenge.init();
  await budget(user._id);
  const now=new Date(),raw=token(),ticketHash=hash(raw),code=newOtp();let record;
  try{
    record=await OtpChallenge.findOneAndUpdate({user:user._id,$or:[{lastSentAt:{$lte:new Date(+now-OTP_RULES.cooldownMs)}},{lastSentAt:{$exists:false}}]},{$set:{ticketHash,codeHash:otpHash(ticketHash,purpose,code,process.env.SESSION_SECRET),purpose,attempts:0,sends:1,lastSentAt:now,expiresAt:new Date(+now+OTP_RULES.ttlMs),absoluteExpiresAt:new Date(+now+OTP_RULES.absoluteMs)},$unset:{consumedAt:1}},{upsert:true,new:true,runValidators:true});
  }catch(e){if(e.code===11000)fail(429,'A code was sent recently. Use that code or wait 60 seconds before trying again.');throw e;}
  try{await sendMail(user.email,'Your Noor Academy verification code',`Your verification code is: ${code}\n\nThis code expires in 10 minutes and can be used only once. Do not share it.\n\nIf you did not request this, ignore this message. No sign-in is completed without this code.`);}
  catch(e){await OtpChallenge.deleteOne({_id:record._id,ticketHash});throw e;}
  return challengeView(raw,record);
}
export async function resendOtp(raw){
  validateTicket(raw);const now=new Date(),old=await OtpChallenge.findOne({ticketHash:hash(raw),consumedAt:{$exists:false},absoluteExpiresAt:{$gt:now}}).populate('user');
  if(!old?.user?.isActive)fail(400,'This verification session expired. Sign in again.');
  if(old.sends>=OTP_RULES.maxSends)fail(429,'Resend limit reached. Start a new sign-in after the cooldown.');
  if(+old.lastSentAt+OTP_RULES.cooldownMs>+now)fail(429,'Wait 60 seconds between verification emails.');
  await budget(old.user._id);const code=newOtp(),codeHash=otpHash(old.ticketHash,old.purpose,code,process.env.SESSION_SECRET);
  const record=await OtpChallenge.findOneAndUpdate({_id:old._id,ticketHash:old.ticketHash,lastSentAt:old.lastSentAt,consumedAt:{$exists:false},sends:{$lt:OTP_RULES.maxSends}},{$set:{codeHash,attempts:0,lastSentAt:now,expiresAt:new Date(Math.min(+now+OTP_RULES.ttlMs,+old.absoluteExpiresAt))},$inc:{sends:1}},{new:true});
  if(!record)fail(409,'A newer code was already requested. Use the most recent email.');
  try{await sendMail(old.user.email,'Your new Noor Academy verification code',`Your new code is: ${code}\n\nUse only this latest code. It expires in 10 minutes or when your verification session expires. Never share it.`);}
  catch(e){await OtpChallenge.deleteOne({_id:record._id,codeHash});throw e;}
  return challengeView(raw,record);
}
export async function consumeOtp(raw,code){
  validateTicket(raw);if(typeof code!=='string'||!/^\d{6}$/.test(code))fail(400,'Enter the six digits from your email.');
  const now=new Date();
  // Count every candidate atomically, including concurrent guesses on separate instances.
  const r=await OtpChallenge.findOneAndUpdate({ticketHash:hash(raw),expiresAt:{$gt:now},absoluteExpiresAt:{$gt:now},consumedAt:{$exists:false},attempts:{$lt:OTP_RULES.maxAttempts}},{$inc:{attempts:1}},{new:true});
  if(!r)fail(400,'Code expired, already used, or attempt limit reached. Request a new code.');
  if(!matchesOtp(r,code,process.env.SESSION_SECRET))fail(400,`Incorrect code. ${Math.max(0,OTP_RULES.maxAttempts-r.attempts)} attempts remaining.`);
  // Single-use compare-and-set. A concurrent correct request cannot issue a second session.
  const consumed=await OtpChallenge.findOneAndUpdate({_id:r._id,ticketHash:r.ticketHash,codeHash:r.codeHash,consumedAt:{$exists:false},expiresAt:{$gt:new Date()}},{$set:{consumedAt:new Date()}},{new:true});
  if(!consumed)fail(400,'This code was already used or replaced. Request a new code.');
  return consumed;
}
