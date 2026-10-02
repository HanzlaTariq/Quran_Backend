import mongoose from 'mongoose';
import readline from 'node:readline/promises';
import {Writable} from 'node:stream';
import User from '../models/User.js';
import {email,password,text} from '../src/core.js';
let muted=false;
const out=new Writable({write(chunk,enc,cb){if(!muted)process.stdout.write(chunk);cb();}});
const rl=readline.createInterface({input:process.stdin,output:out,terminal:process.stdin.isTTY});
try{
  const name=text(await rl.question('Admin name: '),'Name',2,80);
  const mail=email(await rl.question('Admin email: '));
  process.stdout.write('Admin password (10+ characters, hidden): ');muted=true;const pass=password(await rl.question(''));muted=false;process.stdout.write('\n');
  await mongoose.connect(process.env.MONGODB_URI);
  if(await User.exists({email:mail}))throw new Error('This email already exists. No account was modified. Use a different email.');
  await User.create({name,email:mail,password:pass,role:'admin',isVerified:true,isActive:true});console.log('Administrator created. Sign in through the regular login page and verify the email OTP. SMTP must be configured.');
}catch(e){console.error(e.message);process.exitCode=1;}finally{rl.close();await mongoose.disconnect();}
