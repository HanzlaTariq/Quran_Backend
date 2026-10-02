/** Read-only by default. Back up MongoDB, stop all API instances, review, then use --apply. */
import mongoose from 'mongoose';
import {Class,Attendance,Audit} from '../src/models.js';
const apply=process.argv.includes('--apply');
const resetLegacy=process.argv.includes('--reset-legacy-live');
if(!process.env.MONGODB_URI)throw new Error('MONGODB_URI is required. Run this through npm run classroom:migrate.');
try{
  await mongoose.connect(process.env.MONGODB_URI,{autoIndex:false,serverSelectionTimeoutMS:10000});
  const classes=Class.collection,attendance=Attendance.collection;
  const legacyRoomQuery={$or:[{roomId:{$exists:false}},{roomId:null},{roomId:''}]};
  const legacyLiveQuery={status:'ongoing','liveRoom.readyAt':{$exists:false}};
  const indexes=await attendance.indexes().catch(e=>{if(e.codeName==='NamespaceNotFound')return [];throw e;});
  const oldUnique=indexes.filter(i=>i.unique&&Object.keys(i.key).length===2&&i.key.enrollment===1&&i.key.date===1);
  const dupes=await attendance.aggregate([{$match:{classId:{$type:'objectId'}}},{$group:{_id:'$classId',count:{$sum:1}}},{$match:{count:{$gt:1}}}]).toArray();
  if(dupes.length)throw new Error(`${dupes.length} class IDs already have duplicate attendance records. Resolve them manually; nothing was changed.`);
  // Only direct, unambiguous existing Class.attendance references are migrated.
  // Do not guess from a day that could contain multiple lessons.
  const links=await classes.aggregate([{$match:{attendance:{$type:'objectId'}}},{$group:{_id:'$attendance',ids:{$push:'$_id'},count:{$sum:1}}}]).toArray();
  const proposals=[];let ambiguous=0;
  for(const link of links){
    if(link.count!==1){ambiguous++;continue;}
    const a=await attendance.findOne({_id:link._id,classId:{$exists:false}});
    if(!a)continue;
    if(await attendance.findOne({classId:link.ids[0]})){ambiguous++;continue;}
    proposals.push({attendanceId:link._id,classId:link.ids[0]});
  }
  const plan={mode:apply?'APPLY':'DRY RUN',roomIdsToBackfill:await classes.countDocuments(legacyRoomQuery),legacyLiveClasses:await classes.countDocuments(legacyLiveQuery),resetLegacyLive:resetLegacy,unambiguousAttendanceLinks:proposals.length,ambiguousLinksKeptUnchanged:ambiguous,oldDayUniqueIndexesToRemove:oldUnique.map(i=>i.name)};
  console.log(JSON.stringify(plan,null,2));
  if(!apply){console.log('No changes made. Back up your database and STOP all API instances before applying.\nApply: npm run classroom:migrate -- --apply\nTo reset old non-Daily ongoing rooms too: npm run classroom:migrate -- --apply --reset-legacy-live');}
  else{
    for await(const c of classes.find(legacyRoomQuery,{projection:{_id:1}}))await classes.updateOne({_id:c._id},{$set:{roomId:`quran-class-${c._id}`,resourceVersion:0}});
    for(const p of proposals)await attendance.updateOne({_id:p.attendanceId,classId:{$exists:false}},{$set:{classId:p.classId}});
    // Establish the new integrity constraint before removing the old, incompatible one.
    await attendance.createIndex({classId:1},{unique:true,partialFilterExpression:{classId:{$type:'objectId'}}});
    for(const i of oldUnique)await attendance.dropIndex(i.name);
    await attendance.createIndex({enrollment:1,date:1});
    await classes.createIndex({roomId:1},{unique:true,partialFilterExpression:{roomId:{$type:'string'}}});
    if(resetLegacy){
      const result=await classes.updateMany(legacyLiveQuery,{$set:{status:'scheduled'},$unset:{operationLock:1}});
      console.log(`Reset ${result.modifiedCount} legacy live states to scheduled. Expired lessons cannot restart. No attendance/completion was invented.`);
    }
    await Audit.create({action:'classroom.migration',record:JSON.stringify(plan)});
    console.log('Migration finished. Existing users, enrollments, payments, messages and ambiguous attendance were preserved. Restart the updated API.');
  }
}catch(e){console.error('Migration stopped:',e.message);process.exitCode=1;}
finally{await mongoose.disconnect();}
