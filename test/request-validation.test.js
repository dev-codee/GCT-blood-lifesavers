const {test}=require('node:test');
const assert=require('node:assert/strict');
const {validateRequest}=require('../lib/request-validation');
const valid={patient_name:' AB ',hospital_name:'Hospital',city:'Lahore',contact_phone:'0300 1234567',blood_group:'O+',units:'2',urgency_level:'Urgent'};
test('normalizes form input and ignores privileged fields',()=>{const v=validateRequest({...valid,status:'fulfilled',responses:{}});assert.equal(v.patient_name,'AB');assert.equal(v.units,2);assert.equal(v.status,undefined);assert.equal(v.responses,undefined);});
test('rejects invalid quantities, groups, contact details and urgency',()=>{for(const change of [{units:0},{units:11},{units:1.5},{blood_group:'X'},{city:' '},{contact_phone:'abcdefg'},{urgency_level:'Other'},{notes:'x'.repeat(501)},{patient_name:{}}])assert.throws(()=>validateRequest({...valid,...change}));});
test('accepts legacy form without urgency',()=>{const v=validateRequest({...valid,urgency_level:undefined});assert.equal(v.urgency_level,'Critical');});
