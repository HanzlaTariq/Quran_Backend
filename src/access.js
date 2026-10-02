import {Student,Ulma,Class,Enrollment,Notice,Audit} from './models.js';
import {fail,id,pageParams} from './core.js';
export async function profile(user) {
  const Model=user.role==='student'?Student:user.role==='ulma'?Ulma:null;
  if(!Model)return null;const p=await Model.findOne({user:user._id});if(!p)fail(409,'Your account profile is missing. Sign out and sign in again.');return p;
}
export async function scope(user) {if(user.role==='admin')return {};const p=await profile(user);return {[user.role==='student'?'student':'ulma']:p._id};}
export const enrollmentPopulate=[{path:'student',select:'user currentLevel',populate:{path:'user',select:'name email timezone country city languages gender photoVersion profileImage'}},{path:'ulma',select:'user expertise',populate:{path:'user',select:'name email timezone country city languages gender photoVersion profileImage'}},{path:'course',select:'name duration monthlyFee currency level'}];
export async function findEnrollment(user,record) {
  const e=await Enrollment.findOne({_id:id(record),...await scope(user)});if(!e)fail(404,'Enrollment not found.');return e;
}
export async function findClass(user,record) {
  const c=await Class.findOne({_id:id(record),...await scope(user)});if(!c)fail(404,'Class not found.');return c;
}
export async function notify(user,title,body,href='/notifications',io) {const n=await Notice.create({user,title,body,href});io?.to(`user:${user}`).emit('notice',n);return n;}
export const log=(req,action,record)=>Audit.create({actor:req.user._id,action,record:String(record||'')});
export async function list(Model,query,params,populate=[],sort={createdAt:-1}) {
  const {page,limit}=pageParams(params);
  populate=(Array.isArray(populate)?populate:[populate]).filter(p=>Model.schema.path(typeof p==='string'?p:p.path));
  const [items,total]=await Promise.all([Model.find(query).populate(populate).sort(sort).skip((page-1)*limit).limit(limit).lean(),Model.countDocuments(query)]);
  return {items,total,page,pages:Math.max(1,Math.ceil(total/limit))};
}
