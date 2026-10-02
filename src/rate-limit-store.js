import {createHash} from 'node:crypto';

/** express-rate-limit Store. One atomic MongoDB document per bucket and window.
 * The collection provider keeps this module testable without a running database.
 */
export class MongoLimitStore {
  localKeys=false;
  constructor(prefix,getCollection){this.prefix=`noor:${prefix}:`;this.getCollection=getCollection;}
  init(options){this.windowMs=options.windowMs;}
  key(key){return this.prefix+createHash('sha256').update(String(key)).digest('hex');}
  async increment(key) {
    const collection=await this.getCollection(),now=new Date(),resetAt=new Date(now.getTime()+this.windowMs);
    const active={$gt:[{$ifNull:['$resetAt',new Date(0)]},now]};
    const pipeline=[{$set:{
      hits:{$cond:[active,{$add:[{$ifNull:['$hits',0]},1]},1]},
      resetAt:{$cond:[active,'$resetAt',resetAt]}
    }}];
    const perform=()=>collection.findOneAndUpdate({_id:this.key(key)},pipeline,{upsert:true,returnDocument:'after',includeResultMetadata:false});
    let doc;try{doc=await perform();}catch(error){if(error.code!==11000)throw error;doc=await perform();}
    if(!doc||!Number.isFinite(doc.hits))throw new Error('Could not update the request-limit counter.');
    return {totalHits:doc.hits,resetTime:new Date(doc.resetAt)};
  }
  async decrement(key){const collection=await this.getCollection();await collection.updateOne({_id:this.key(key),hits:{$gt:0}},{$inc:{hits:-1}});}
  async resetKey(key){const collection=await this.getCollection();await collection.deleteOne({_id:this.key(key)});}
}
