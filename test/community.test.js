const {test}=require('node:test');
const assert=require('node:assert/strict');
const db=require('../lib/db');
const self=require('../lib/self-service');
const {ObjectId}=require('mongodb');
let donor=null,changes=[];
self.authenticate=async()=>donor;
db.getDb=async()=>({collection:()=>({updateOne:async(f,u)=>{changes.push({f,u});return {matchedCount:1};}})});
db.getEmergencyRequests=async()=>[{responses:{abc:{phone:'private',status:'confirmed'}},status:'open'}];
const handler=require('../api/community');
async function call(method,body){let result;await handler({method,body,headers:{}},{setHeader(){},end(s){result={status:this.statusCode,body:JSON.parse(s)};}});return result;}
test('anonymous users cannot update profiles or volunteer',async()=>{assert.equal((await call('POST',{action:'profile'})).status,401);assert.equal((await call('POST',{action:'respond'})).status,401);});
test('public request progress does not expose respondent contacts',async()=>{const r=await call('GET');assert.equal(r.body.requests[0].confirmed,1);assert.equal(r.body.requests[0].responses,undefined);});
test('profile writes are scoped to authenticated donor and ignore privileged fields',async()=>{donor={_id:new ObjectId()};const r=await call('POST',{action:'profile',availability:'unavailable',phone:'03001234567',city:'Lahore',is_verified:true,access_hash:'evil'});assert.equal(r.status,200);const c=changes.at(-1);assert.equal(c.f._id,donor._id);assert.equal(c.u.$set.is_verified,undefined);assert.equal(c.u.$set.access_hash,undefined);assert.ok(c.u.$set.availability_confirmed_at);});
test('reject future donation dates and invalid availability',async()=>{assert.equal((await call('POST',{action:'profile',availability:'bogus'})).status,400);assert.equal((await call('POST',{action:'profile',availability:'available',last_donation_date:'2999-01-01'})).status,400);});
