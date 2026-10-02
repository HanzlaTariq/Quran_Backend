import {mailTransport,mailConfig} from '../src/email.js';
let transport;
try{transport=mailTransport();await transport.verify();console.log(`SMTP connection/authentication succeeded for ${mailConfig().host}:${mailConfig().port}.`);console.log('This checks SMTP access, not inbox delivery. Complete one real login OTP test, including the spam folder.');}
catch(e){console.error('SMTP check failed. Confirm host/port, the sender account, its NEW app password, and provider permissions.');console.error('Error category:',e.code||e.name);process.exitCode=1;}
finally{transport?.close?.();}
