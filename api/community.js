const db=require('../lib/db');
const {ObjectId}=require('mongodb');
const {authenticate,issueKey}=require('../lib/self-service');
const {isAuthorized}=require('../lib/auth');
module.exports=async(req,res)=>{
 const send=(code,data)=>{res.statusCode=code;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(data));};
 try{
 const admin=isAuthorized(req), donor=await authenticate(req);
 const database=await db.getDb();
 if(req.method==='GET'){
 const requests=await db.getEmergencyRequests('');
 return send(200,{donor:donor?Object.fromEntries(Object.entries(donor).filter(([k])=>k!=='access_hash')):null,requests:requests.map(r=>{
 const entries=Object.values(r.responses||{});
 return {...r,responses:admin?entries:undefined,my_response:donor?(r.responses||{})[donor._id.toString()]:null,responded:entries.filter(x=>x.status!=='withdrawn').length,confirmed:entries.filter(x=>x.status==='confirmed').length,completed:entries.filter(x=>x.status==='completed').length};})});
 }
 if(req.method!=='POST')return send(405,{error:'Method not allowed'});
 let b=req.body;if(!b){let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>16000)return send(413,{error:'Too large'});}b=JSON.parse(raw||'{}');}
 if(b.action==='issue'&&admin)return send(200,{accessKey:await issueKey(b.id)});
 if(b.action==='profile'){
 if(!donor)return send(401,{error:'Open your private donor link to continue.'});
 const update={};
 for(const k of ['phone','whatsapp','city','area'])if(b[k]!==undefined){if(typeof b[k]!=='string'||b[k].length>120)return send(400,{error:'Invalid '+k});update[k]=b[k].trim();}
 if(update.phone!==undefined&&!/^[+\d ()-]{7,25}$/.test(update.phone))return send(400,{error:'Enter a valid phone number'});
 if(update.city==='')return send(400,{error:'City is required'});
 if(!['available','emergency_only','unavailable'].includes(b.availability))return send(400,{error:'Invalid availability'});
 if(b.last_donation_date && (!/^\d{4}-\d{2}-\d{2}$/.test(b.last_donation_date)||!Number.isFinite(Date.parse(b.last_donation_date))||Date.parse(b.last_donation_date)>Date.now()))return send(400,{error:'Invalid donation date'});
 Object.assign(update,{availability:b.availability,last_donation_date:b.last_donation_date||null,is_first_time:!b.last_donation_date,availability_confirmed_at:new Date().toISOString()});
 await database.collection('donors').updateOne({_id:donor._id},{$set:update});return send(200,{success:true});
 }
 if(b.action==='respond'){
 if(!donor&&!admin)return send(401,{error:'Open your private donor link first'});
 if(!ObjectId.isValid(b.id))return send(400,{error:'Invalid request'});
 const donorId=admin?b.donorId:donor._id.toString();
 if(!ObjectId.isValid(donorId))return send(400,{error:'Invalid donor'});
 const allowed=admin?['confirmed','completed','declined']:['volunteered','withdrawn'];
 if(!allowed.includes(b.status))return send(400,{error:'Invalid response'});
 if(!admin&&b.status==='volunteered'&&donor.availability==='unavailable')return send(400,{error:'Update your availability before volunteering'});
 const filter={_id:new ObjectId(b.id),status:'open',$or:[{expires_at:{$gt:new Date().toISOString()}},{expires_at:{$exists:false}}]};
 if(!admin)filter['responses.'+donorId+'.status']={$nin:['completed','declined']};
 if(admin)filter['responses.'+donorId]={$exists:true};
 const fields=admin?{['responses.'+donorId+'.status']:b.status,['responses.'+donorId+'.updated_at']:new Date().toISOString()}:{['responses.'+donorId]:{donorId,name:donor.name,phone:donor.phone,status:b.status,updated_at:new Date().toISOString()}};
 const result=await database.collection('emergency_requests').updateOne(filter,{$set:fields});
 return send(result.matchedCount?200:409,result.matchedCount?{success:true}:{error:'Request closed or response missing'});
 }
 return send(400,{error:'Unknown action'});
 }catch(e){console.error(e);return send(500,{error:'Unable to save. Please try again.'});}
};
