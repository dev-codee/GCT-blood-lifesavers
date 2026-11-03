const {test}=require('node:test');
const assert=require('node:assert/strict');
const {deadline,effectiveStatus}=require('../public/request-expiry');
const start=Date.parse('2026-11-01T10:00:00.000Z');
test('open requests expire exactly at 48 hours',()=>{const r={status:'open',created_at:new Date(start).toISOString()};assert.equal(deadline(r),start+172800000);assert.equal(effectiveStatus(r,start+172799999),'open');assert.equal(effectiveStatus(r,start+172800000),'expired');});
test('explicit deadlines take precedence and closed requests stay closed',()=>{const r={status:'open',created_at:new Date(start).toISOString(),expires_at:new Date(start+1000).toISOString()};assert.equal(effectiveStatus(r,start+1000),'expired');assert.equal(effectiveStatus({...r,status:'fulfilled'},start+2000),'fulfilled');});
