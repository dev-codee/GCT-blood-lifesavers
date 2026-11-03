const groups=['A+','A-','B+','B-','AB+','AB-','O+','O-'];
function validateRequest(body){
 if(!body||typeof body!=='object'||Array.isArray(body))throw Error('Invalid request details.');
 const result={};
 for(const [key,max] of Object.entries({patient_name:100,hospital_name:120,city:80,contact_phone:25,contact_name:100,notes:500})){
 const value=body[key]??'';
 if(typeof value!=='string'||value.trim().length>max)throw Error('Please check '+key.replaceAll('_',' ')+'.');
 result[key]=value.trim();
 }
 for(const key of ['patient_name','hospital_name','city','contact_phone'])if(!result[key])throw Error('Please complete all required fields.');
 if(!/^[+\d ()-]{7,25}$/.test(result.contact_phone)||result.contact_phone.replace(/\D/g,'').length<7)throw Error('Enter a valid contact phone number.');
 if(!groups.includes(body.blood_group))throw Error('Select a valid blood group.');
 result.blood_group=body.blood_group;
 result.units=Number(body.units??1);
 if(!Number.isInteger(result.units)||result.units<1||result.units>10)throw Error('Units must be between 1 and 10.');
 result.urgency_level=body.urgency_level||'Critical';
 if(!['Critical','Urgent','Scheduled'].includes(result.urgency_level))throw Error('Select a valid urgency.');
 return result;
}
module.exports={validateRequest};
