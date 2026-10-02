import {Router} from 'express';
import {limiter} from './rate-limit.js';
import {Conversation,Message,Enrollment,Student,Ulma,Class} from './models.js';
import {protect} from './auth.js';
import {fail,id,text,same,encrypt,decrypt,pageParams} from './core.js';
const populated=[{path:'studentId',select:'name role'},{path:'ulmaId',select:'name role'},{path:'courseId',select:'name'}];
export async function member(user,conversationId,write=false) {
  const c=await Conversation.findById(id(conversationId));
  if(!c || (!same(c.studentId,user._id)&&!same(c.ulmaId,user._id)))fail(404,'Conversation not found.');
  if(write){
    const [s,t]=await Promise.all([Student.findOne({user:c.studentId}),Ulma.findOne({user:c.ulmaId,isApproved:true})]);
    if(!s||!t||!await Enrollment.exists({student:s._id,ulma:t._id,course:c.courseId,status:{$in:['approved','active']},chatEnabled:{$ne:false}}))fail(403,'Messaging is available only for active or approved enrollments.');
  }
  return c;
}
export const unpack=m=>({...m,message:m.deletedAt?'Message removed':decrypt(m.message,process.env.CHAT_KEY)});
const router=Router();router.use(protect);router.use((req,res,next)=>{res.set('Cache-Control','no-store');next();});
router.get('/conversations',async(req,res)=>{
  const raw=await Conversation.find({$or:[{studentId:req.user._id},{ulmaId:req.user._id}]}).populate(populated).sort({lastUpdated:-1}).limit(200).lean();
  const items=await Promise.all(raw.map(async c=>({...c,lastMessage:decrypt(c.lastMessage,process.env.CHAT_KEY),unread:await Message.countDocuments({conversationId:c._id,receiverId:req.user._id,isRead:false})})));
  res.json({items});
});
router.get('/:id/messages',async(req,res)=>{
  const c=await member(req.user,req.params.id);const query={conversationId:c._id};
  if(req.query.before)query._id={$lt:id(req.query.before)};
  const {limit}=pageParams(req.query,40);const items=await Message.find(query).sort({_id:-1}).limit(limit+1).lean();const hasMore=items.length>limit;if(hasMore)items.pop();
  res.json({items:items.reverse().map(unpack),hasMore});
});
const sendLimit=limiter('chat',{windowMs:60000,limit:60,keyGenerator:req=>String(req.user._id),standardHeaders:'draft-8',legacyHeaders:false,message:{message:'Message limit reached. Please slow down.'}});
router.post('/:id/messages',sendLimit,async(req,res)=>{
  const c=await member(req.user,req.params.id,true);
  const content=text(req.body.message,'Message',1,4000),clientId=text(req.body.clientId,'Client message ID',8,100);
  const receiverId=same(c.studentId,req.user._id)?c.ulmaId:c.studentId;
  let message=await Message.findOne({senderId:req.user._id,clientId});
  if(message){if(!same(message.conversationId,c._id))fail(409,'This message ID was already used.');return res.json(unpack(message.toObject()));}
  try{message=await Message.create({conversationId:c._id,courseId:String(c.courseId),senderId:req.user._id,receiverId,message:encrypt(content,process.env.CHAT_KEY),clientId});}
  catch(e){if(e.code!==11000)throw e;message=await Message.findOne({senderId:req.user._id,clientId});if(!message||!same(message.conversationId,c._id))throw e;return res.json(unpack(message.toObject()));}
  c.lastMessage=encrypt(content.slice(0,120),process.env.CHAT_KEY);c.lastUpdated=new Date();await c.save();
  const result=unpack(message.toObject());req.app.get('io')?.to([`user:${c.studentId}`,`user:${c.ulmaId}`]).emit('chat:refresh',{conversationId:String(c._id)});
  res.status(201).json(result);
});
router.post('/:id/read',async(req,res)=>{
  const c=await member(req.user,req.params.id);await Message.updateMany({conversationId:c._id,receiverId:req.user._id,isRead:false},{$set:{isRead:true}});
  req.app.get('io')?.to([`user:${c.studentId}`,`user:${c.ulmaId}`]).emit('chat:read',{conversationId:String(c._id),reader:String(req.user._id)});res.json({ok:true});
});
router.delete('/:id/messages/:messageId',async(req,res)=>{
  const c=await member(req.user,req.params.id),m=await Message.findOne({_id:id(req.params.messageId),conversationId:c._id,senderId:req.user._id});if(!m)fail(404,'Message not found.');
  m.message=encrypt('Message removed',process.env.CHAT_KEY);m.deletedAt=new Date();await m.save();
  const newest=await Message.findOne({conversationId:c._id}).sort({_id:-1});
  if(same(newest,m)){c.lastMessage=encrypt('Message removed',process.env.CHAT_KEY);await c.save();}
  req.app.get('io')?.to([`user:${c.studentId}`,`user:${c.ulmaId}`]).emit('chat:refresh',{conversationId:String(c._id)});res.json({ok:true});
});
export default router;
