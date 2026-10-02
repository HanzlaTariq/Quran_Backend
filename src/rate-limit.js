import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import {MongoLimitStore} from './rate-limit-store.js';

const indexPromises=new WeakMap();
async function collection() {
  const db=mongoose.connection.db;
  if(!db)throw new Error('Rate-limit database is not connected.');
  if(!indexPromises.has(db)) {
    const pending=db.collection('academy_rate_limits').createIndex({resetAt:1},{expireAfterSeconds:0})
      .catch(error=>{indexPromises.delete(db);throw error;});
    indexPromises.set(db,pending);
  }
  await indexPromises.get(db);
  return db.collection('academy_rate_limits');
}
export function limiter(prefix,options) {
  return rateLimit({...options,store:new MongoLimitStore(prefix,collection),passOnStoreError:false});
}
