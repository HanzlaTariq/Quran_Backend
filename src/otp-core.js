import {randomInt} from 'node:crypto';
import {sign,equal,fail} from './core.js';
export const OTP_RULES=Object.freeze({digits:6,ttlMs:10*60000,absoluteMs:30*60000,cooldownMs:60000,maxAttempts:5,maxSends:5});
export const newOtp=()=>String(randomInt(0,1000000)).padStart(6,'0');
export const otpHash=(ticketHash,purpose,code,secret)=>sign(`noor-otp-v1:${ticketHash}:${purpose}:${code}`,secret);
export const matchesOtp=(record,code,secret)=>typeof code==='string'&&/^\d{6}$/.test(code)&&equal(record.codeHash,otpHash(record.ticketHash,record.purpose,code,secret));
export function validateTicket(ticket){if(typeof ticket!=='string'||!/^[a-f0-9]{64}$/.test(ticket))fail(400,'Verification session is invalid. Sign in again to request a new code.');return ticket;}
