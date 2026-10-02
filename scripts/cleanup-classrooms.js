/** Run periodically on your server/task scheduler. Dry-run unless --apply is supplied. */
import mongoose from 'mongoose';
import {Class,Audit,Reservation} from '../src/models.js';
import {retryVideoClosure} from '../src/classroom-service.js';
const apply=process.argv.includes('--apply');
try{
  if(!process.env.MONGODB_URI)throw new Error('MONGODB_URI is required.');
  await mongoose.connect(process.env.MONGODB_URI,{autoIndex:false,serverSelectionTimeoutMS:10000});
  const query={'liveRoom.readyAt':{$exists:true},'liveRoom.closedAt':{$exists:false},$or:[{'liveRoom.closePending':true},{status:{$in:['completed','cancelled','paused']}},{utcEnd:{$lte:new Date()}}]};
  console.log(`${apply?'Applying':'Previewing'} video cleanup. ${await Class.countDocuments(query)} rooms match.`);
  for await(const c of Class.find(query).cursor()){
    console.log(`${c._id} | ${c.status} | scheduled end ${c.utcEnd.toISOString()}`);
    if(!apply)continue;
    if(c.status==='ongoing'&&+c.utcEnd<=Date.now()){
      // Conditional update cannot undo a simultaneous teacher cancellation.
      await Class.updateOne({_id:c._id,status:'ongoing'},{$set:{status:'completed',endedAt:new Date(),'liveRoom.closePending':true}});
      await Reservation.deleteMany({classId:c._id});
      await Audit.create({action:'class.auto_end',record:String(c._id)});
    }
    const result=await retryVideoClosure(c);
    if(!result.closed){console.error(`Room ${c._id}: ${result.warning}`);process.exitCode=1;}
  }
  console.log(apply?'Cleanup pass finished. Non-zero exit means at least one retry is needed.':'No state or provider changes made. Add --apply after reviewing the plan.');
}catch(e){console.error('Cleanup failed:',e.message);process.exitCode=1;}
finally{await mongoose.disconnect();}
