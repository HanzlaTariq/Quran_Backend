import mongoose from 'mongoose';
import {Message,Conversation} from '../src/models.js';
import {encrypt} from '../src/core.js';
if(!/^[a-f\d]{64}$/i.test(process.env.CHAT_KEY||''))throw new Error('Valid CHAT_KEY is required.');
await mongoose.connect(process.env.MONGODB_URI);
try{
 let count=0;
 for await(const m of Message.find({message:{$not:/^enc:v1:/}}).cursor()){
  m.message=encrypt(m.message,process.env.CHAT_KEY);await m.save();count++;
 }
 for await(const c of Conversation.find({lastMessage:{$not:/^enc:v1:/,$ne:''}}).cursor()){
  c.lastMessage=encrypt(c.lastMessage,process.env.CHAT_KEY);await c.save();
 }
 console.log(`Encrypted ${count} legacy messages. Keep CHAT_KEY backed up securely.`);
}finally{await mongoose.disconnect();}
