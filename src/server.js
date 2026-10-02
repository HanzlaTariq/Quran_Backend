import express from 'express';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import {existsSync} from 'node:fs';
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import {limiter} from './rate-limit.js';
import auth,{attachSession,csrf,origins,protect} from './auth.js';
import academy from './academy.js';
import booking from './booking.js';
import chat from './chat.js';
import {AppError} from './core.js';
import {sockets} from './socket.js';
for(const key of ['SESSION_SECRET','CHAT_KEY'])if(!/^[a-f\d]{64}$/i.test(process.env[key]||''))throw new Error(`${key} must be a 64-character hex secret. Run npm run setup and check .env.`);
if(!process.env.MONGODB_URI)throw new Error('MONGODB_URI is required.');
mongoose.set('strictQuery',true);mongoose.set('sanitizeFilter',false); // Inputs are explicitly typed; never pass req.body/query into a Mongo filter.
await mongoose.connect(process.env.MONGODB_URI,{serverSelectionTimeoutMS:10000});
const app=express(),server=createServer(app);app.disable('x-powered-by');
const hops=Number(process.env.TRUST_PROXY ?? (process.env.VERCEL==='1'?'1':'0'))||0;if(hops)app.set('trust proxy',hops);
app.use(helmet({contentSecurityPolicy:{directives:{defaultSrc:["'self'"],scriptSrc:["'self'"],styleSrc:["'self'","'unsafe-inline'","https://fonts.googleapis.com"],fontSrc:["'self'","https://fonts.gstatic.com"],imgSrc:["'self'",'data:'],connectSrc:["'self'",'wss:'],mediaSrc:["'self'",'blob:','https://cdn.islamic.network'],objectSrc:["'none'"],frameAncestors:["'none'"],upgradeInsecureRequests:process.env.NODE_ENV==='production'?[]:null}},crossOriginEmbedderPolicy:false,referrerPolicy:{policy:'no-referrer'}}));
app.use(cors({origin:(origin,cb)=>{if(!origin||origins().includes(origin))cb(null,true);else cb(Object.assign(new Error('Origin not allowed.'),{status:403}));},credentials:true}));
app.use('/api',limiter('api',{windowMs:15*60000,limit:1200,standardHeaders:'draft-8',legacyHeaders:false,message:{message:'Request limit reached. Try again shortly.'}}));
app.use(express.json({limit:'320kb',strict:true}));app.use(cookieParser());
app.use('/api',(req,res,next)=>{res.set('Cache-Control','private, no-store, max-age=0');next();});
app.get('/',(req,res,next)=>process.env.VERCEL==='1'?res.json({service:'Noor Academy API',health:'/api/health'}):next());
app.get('/api/health',(req,res)=>res.json({status:mongoose.connection.readyState===1?'ok':'unavailable',version:'2.1.0'}));
app.use('/api',attachSession,csrf,(req,res,next)=>{
  if(['POST','PUT','PATCH'].includes(req.method)&&(!req.body||typeof req.body!=='object'||Array.isArray(req.body)))return res.status(400).json({message:'Send a JSON object as the request body.'});
  next();
});
app.use('/api/auth',auth);
app.get('/api/rtc-config',protect,(req,res)=>{
  const iceServers=[{urls:'stun:stun.l.google.com:19302'}];if(process.env.TURN_URL)iceServers.push({urls:process.env.TURN_URL,username:process.env.TURN_USERNAME,credential:process.env.TURN_PASSWORD});
  res.set('Cache-Control','no-store');res.json({iceServers,turnConfigured:!!process.env.TURN_URL});
});
const io=await sockets(server);app.set('io',io);app.use('/api/chat',chat);app.use('/api',booking);app.use('/api',academy);
app.use('/api',(req,res)=>res.status(404).json({message:'API endpoint not found.'}));
const dist=fileURLToPath(new URL('../../frontend/dist/',import.meta.url));
if(process.env.VERCEL!=='1'&&existsSync(`${dist}index.html`)){
  app.use(express.static(dist,{maxAge:'1h',index:false}));app.get('/{*path}',(req,res)=>res.sendFile(`${dist}index.html`));
}
app.use((err,req,res,next)=>{
  if(res.headersSent)return next(err);
  let status=err.status||500,message=err.message;
  if(err.code===11000){status=409;message='This record already exists. Refresh and try again.';}
  if(['ValidationError','CastError'].includes(err.name)){status=400;message='Invalid form data. Check the fields and try again.';}
  if(status>=500){console.error(`[${new Date().toISOString()}] ${err.name}: ${err.message}`);if(!(err instanceof AppError))message='The server could not complete this request. Check the server configuration and retry.';}
  res.status(status).json({message});
});
// Do not open a listening port or register process-exit hooks inside a Vercel Function.
export {app};
export default server;
if(process.env.VERCEL!=='1') {
  const port=Number(process.env.PORT)||5000;
  server.listen(port,'0.0.0.0',()=>console.log(`Noor Academy API running on port ${port}. Database connected.`));
  let closing=false;
  async function shutdown(){if(closing)return;closing=true;io.close();server.close();await mongoose.disconnect();process.exit(0);}
  process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
}
