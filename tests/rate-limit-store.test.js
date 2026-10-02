import test from 'node:test';
import assert from 'node:assert/strict';
import {MongoLimitStore} from '../src/rate-limit-store.js';

test('rate-limit storage hashes keys and isolates namespaces',()=>{
 const a=new MongoLimitStore('login',()=>{}),b=new MongoLimitStore('chat',()=>{});
 assert.notEqual(a.key('192.0.2.1'),b.key('192.0.2.1'));
 assert.ok(!a.key('192.0.2.1').includes('192.0.2.1'));
 assert.equal(a.key('user'),a.key('user'));
 assert.equal(a.localKeys,false);
});
test('increment issues a single atomic upsert with a future expiry',async()=>{
 let args;const reset=new Date(Date.now()+60000);
 const collection={findOneAndUpdate:async(...value)=>{args=value;return{hits:1,resetAt:reset};}};
 const store=new MongoLimitStore('test',async()=>collection);store.init({windowMs:60000});
 const result=await store.increment('person');
 assert.equal(result.totalHits,1);assert.deepEqual(result.resetTime,reset);
 assert.equal(args[2].upsert,true);assert.equal(args[2].returnDocument,'after');
 assert.equal(args[2].includeResultMetadata,false);
 assert.equal(args[1][0].$set.hits.$cond[2],1);
 assert.ok(args[1][0].$set.resetAt.$cond[2] instanceof Date);
});
test('increment returns an existing counter and reset time',async()=>{
 const expiry=new Date(Date.now()+1000);
 const store=new MongoLimitStore('test',async()=>({findOneAndUpdate:async()=>({hits:42,resetAt:expiry})}));store.init({windowMs:1000});
 assert.deepEqual(await store.increment('user'),{totalHits:42,resetTime:expiry});
});
test('first-write duplicate race is retried once',async()=>{
 let calls=0;const store=new MongoLimitStore('test',async()=>({findOneAndUpdate:async()=>{if(++calls===1)throw Object.assign(new Error('duplicate'),{code:11000});return{hits:2,resetAt:new Date()};}}));store.init({windowMs:1000});
 assert.equal((await store.increment('user')).totalHits,2);assert.equal(calls,2);
});
test('database failure propagates instead of failing open',async()=>{
 const store=new MongoLimitStore('test',async()=>{throw new Error('database unavailable');});store.init({windowMs:1000});
 await assert.rejects(()=>store.increment('user'),/database unavailable/);
});
test('malformed database counter is rejected',async()=>{
 const store=new MongoLimitStore('test',async()=>({findOneAndUpdate:async()=>null}));store.init({windowMs:1000});
 await assert.rejects(()=>store.increment('user'),/counter/);
});
test('decrement never selects a zero or negative counter',async()=>{
 let args;const store=new MongoLimitStore('test',async()=>({updateOne:async(...a)=>{args=a;}}));
 await store.decrement('user');assert.deepEqual(args[0].hits,{$gt:0});assert.deepEqual(args[1],{$inc:{hits:-1}});
});
test('reset deletes only the specified hashed bucket',async()=>{
 let filter;const store=new MongoLimitStore('test',async()=>({deleteOne:async f=>{filter=f;}}));
 await store.resetKey('user');assert.deepEqual(filter,{_id:store.key('user')});
});
