import nodemailer from 'nodemailer';
import {fail} from './core.js';
/** Legacy EMAIL_* names remain usable, while SMTP_* take precedence. */
export function mailConfig(){return {
  host:process.env.SMTP_HOST||process.env.EMAIL_HOST,
  port:Number(process.env.SMTP_PORT||process.env.EMAIL_PORT)||587,
  user:process.env.SMTP_USER||process.env.EMAIL_USER,
  pass:process.env.SMTP_PASS||process.env.EMAIL_PASSWORD,
  from:process.env.SMTP_FROM||process.env.EMAIL_FROM
};}
export function mailReady(){const c=mailConfig();return !!(c.host&&c.from&&((c.user&&c.pass)||(process.env.NODE_ENV==='test'&&['127.0.0.1','localhost'].includes(c.host))));}
export function mailTransport(){
  if(!mailReady())fail(503,'Email delivery is not configured. Ask the administrator to set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and SMTP_FROM.');
  const c=mailConfig(),testLocal=process.env.NODE_ENV==='test'&&['127.0.0.1','localhost'].includes(c.host);
  return nodemailer.createTransport({host:c.host,port:c.port,secure:c.port===465,requireTLS:!testLocal,auth:c.user?{user:c.user,pass:c.pass}:undefined,connectionTimeout:15000,greetingTimeout:15000,socketTimeout:20000});
}
export async function sendMail(to,subject,body){
  const transport=mailTransport();
  try{const result=await transport.sendMail({from:mailConfig().from,to,subject,text:body});if(result.rejected?.length)fail(503,'The email provider did not accept this address. Check the address and contact the administrator.');}
  catch(error){
    // Do not print SMTP credentials, message contents, OTPs or full provider responses.
    console.error('Email delivery failed:',String(error.code||error.name||'SMTP_ERROR'));
    fail(503,'Email could not be sent. Check your address and ask the administrator to verify SMTP settings. If you just registered, use Sign in to request another code.');
  } finally {transport.close?.();}
}
