const crypto = require('node:crypto');
const {ObjectId}=require('mongodb');
const db=require('./db');
const hash=k=>crypto.createHash('sha256').update(k).digest('hex');
async function issueKey(id){
 if(!ObjectId.isValid(id)) throw new Error('Invalid donor');
 const key=crypto.randomBytes(32).toString('hex');
 const result=await (await db.getDb()).collection('donors').updateOne({_id:new ObjectId(id)},{$set:{access_hash:hash(key)}});
 if(!result.matchedCount) throw new Error('Donor not found');
 return key;
}
async function authenticate(req){
 const key=(req.headers.authorization||'').replace(/^Bearer /,'');
 if(!/^[a-f0-9]{64}$/.test(key)) return null;
 return (await db.getDb()).collection('donors').findOne({access_hash:hash(key)});
}
module.exports={issueKey,authenticate};
