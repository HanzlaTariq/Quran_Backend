import {Server} from 'socket.io';
import mongoose from 'mongoose';
import {createAdapter} from '@socket.io/mongo-adapter';
import {sessionFrom,sessionCookie,origins} from './auth.js';
import {equal,fail,text,same} from './core.js';
import {member} from './chat.js';
function cookieValue(header,name) {try{return decodeURIComponent(String(header||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(`${name}=`))?.slice(name.length+1)||'');}catch{return '';}}
export async function sockets(server){
  const io=new Server(server,{transports:['websocket'],serveClient:false,cors:{origin:origins(),credentials:true},maxHttpBufferSize:32000,allowRequest:(req,cb)=>cb(null,origins().includes(req.headers.origin)),connectionStateRecovery:undefined});
  if(process.env.VERCEL==='1'||process.env.SOCKET_ADAPTER==='mongo') {
    // Change Streams need MongoDB Atlas/a replica set, not standalone MongoDB.
    const hello=await mongoose.connection.db.admin().command({hello:1});
    if(!hello.setName&&hello.msg!=='isdbgrid')throw new Error('Realtime on Vercel needs MongoDB Atlas or a replica set.');
    const events=mongoose.connection.db.collection('academy_socket_events');
    await events.createIndex({createdAt:1},{expireAfterSeconds:3600});
    io.adapter(createAdapter(events,{addCreatedAtField:true}));
  }
  io.use(async(socket,next)=>{
    try{
      const raw=cookieValue(socket.request.headers.cookie,sessionCookie),session=await sessionFrom(raw);
      if(!session||!equal(session.csrf,socket.handshake.auth?.csrf))return next(new Error('Authentication required.'));
      // Never put raw credentials in adapter-serialized socket.data.
      socket.noorRaw=raw;socket.data.sessionId=String(session._id);socket.data.user={_id:String(session.user._id),name:session.user.name,role:session.user.role};next();
    }catch{next(new Error('Authentication failed.'));}
  });
  io.on('connection',socket=>{
    socket.join(`user:${socket.data.user._id}`);socket.data.events=[];
    const guard=fn=>async(payload={},ack=()=>{})=>{
      try{
        const now=Date.now();socket.data.events=socket.data.events.filter(t=>now-t<10000);
        if(socket.data.events.length>=100)fail(429,'Too many events.');socket.data.events.push(now);
        const session=await sessionFrom(socket.noorRaw);if(!session){socket.disconnect(true);return;}
        socket.data.user={_id:String(session.user._id),name:session.user.name,role:session.user.role};await fn(payload,typeof ack==='function'?ack:()=>{});
      }catch(e){if(typeof ack==='function')ack({error:e.status?e.message:'Unable to process this request.'});}
    };
    socket.on('chat:typing',guard(async data=>{
      const c=await member(socket.data.user,data.conversationId,true),receiver=same(c.studentId,socket.data.user._id)?c.ulmaId:c.studentId;
      io.to(`user:${receiver}`).emit('chat:typing',{conversationId:String(c._id),name:socket.data.user.name,typing:!!data.typing});
    }));
    // Media is carried by Daily. Never expose a parallel legacy classroom signaling path.
    const expiryCheck=setInterval(async()=>{try{if(!await sessionFrom(socket.noorRaw))socket.disconnect(true);}catch{socket.disconnect(true);}},60000);
    socket.on('disconnect',()=>clearInterval(expiryCheck));
  });
  return io;
}
