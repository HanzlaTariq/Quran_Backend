import {Server} from 'socket.io';
import mongoose from 'mongoose';
import {createAdapter} from '@socket.io/mongo-adapter';
import {sessionFrom,sessionCookie,origins} from './auth.js';
import {equal,fail,text,same} from './core.js';
import {member} from './chat.js';
import {findClass} from './access.js';
import {Enrollment} from './models.js';
import {getBookingConfig} from './booking-service.js';
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
    socket.on('class:join',guard(async(data,ack)=>{
      if(socket.data.user.role==='admin')fail(403,'The built-in classroom is for the enrolled teacher and student.');
      const c=await findClass(socket.data.user,data.classId);if(c.status!=='ongoing')fail(403,'The teacher must start the class first.');
      const config=await getBookingConfig();if(Date.now()<+new Date(c.utcStart)-config.joinEarlyMinutes*60000||Date.now()>=+new Date(c.utcEnd))fail(403,'This classroom is outside its scheduled time.');
      if(!await Enrollment.exists({_id:c.enrollment,status:{$in:['active','approved']}}))fail(403,'Your enrollment is not active.');
      const room=`class:${c._id}`,others=await io.in(room).fetchSockets();
      if(others.some(s=>same(s.data.user,socket.data.user)&&s.id!==socket.id))fail(409,'You already joined this class on another device.');
      if(others.filter(s=>s.id!==socket.id).length>=2)fail(409,'The classroom is full.');
      if(socket.data.classRoom&&socket.data.classRoom!==room){socket.to(socket.data.classRoom).emit('class:left',{socketId:socket.id});socket.leave(socket.data.classRoom);}await socket.join(room);socket.data.classRoom=room;
      const peers=others.filter(s=>s.id!==socket.id).map(s=>({socketId:s.id,name:s.data.user.name,role:s.data.user.role}));
      socket.to(room).emit('class:peer',{socketId:socket.id,name:socket.data.user.name,role:socket.data.user.role});ack({peers});
    }));
    socket.on('class:signal',guard(async(data,ack)=>{
      const room=socket.data.classRoom;
      const targetId=text(data.to,'Peer',1,100);
      const [target]=await io.in(targetId).fetchSockets();
      if(!room||!target?.rooms.has(room)||target.id===socket.id)fail(403,'Peer is outside your classroom.');
      const c=await findClass(socket.data.user,room.slice(6));if(c.status!=='ongoing'||Date.now()>=+new Date(c.utcEnd))fail(403,'Class has ended.');
      if(!data.signal || JSON.stringify(data.signal).length>24000)fail(400,'Invalid signal.');
      const sig=data.signal;if(!['offer','answer','candidate'].includes(sig.type))fail(400,'Invalid signal type.');
      target.emit('class:signal',{from:socket.id,signal:sig});ack({ok:true});
    }));
    const leave=()=>{const room=socket.data.classRoom;if(room){socket.to(room).emit('class:left',{socketId:socket.id});socket.leave(room);socket.data.classRoom=null;}};
    socket.on('class:leave',leave);socket.on('disconnect',leave);
    const expiryCheck=setInterval(async()=>{try{if(!await sessionFrom(socket.noorRaw))socket.disconnect(true);}catch{socket.disconnect(true);}},60000);
    socket.on('disconnect',()=>clearInterval(expiryCheck));
  });
  return io;
}
