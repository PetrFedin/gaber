import test from 'node:test';
import assert from 'node:assert/strict';
import {admitOrderCommand} from '../server/orderCommandAdmission.js';
const now=10000;
const resource={source:'server-repository',orderId:'O1',tenantId:'T1',clientId:'C1',factoryId:'F1'};
const base={identitySource:'server-session',authenticated:true,tenantId:'T1',
 subject:'U1',roles:['client'],clientId:'C1',factoryId:'F1',mfaVerified:true,sessionExpiresAtMs:30000};
const check=(role,type,commandRole=role,patch={},payload={})=>admitOrderCommand({
 principal:{...base,roles:[role],...patch},resource,
 command:{role:commandRole,type,payload},nowMs:now});
test('only partner prepares terms and publishes a factory-confirmed offer',()=>{
 assert.equal(check('partner','prepare_spec').allowed,true);
 assert.equal(check('partner','offer').allowed,true);
 assert.equal(check('client','prepare_spec').allowed,false);
 assert.equal(check('factory','prepare_spec').allowed,false);
 assert.equal(check('factory','offer').allowed,false);
 assert.equal(check('partner','offer','factory').allowed,false);
});
test('only factory confirms or returns TЗ and only client accepts',()=>{
 assert.equal(check('factory','confirm_spec').allowed,true);
 assert.equal(check('factory','return_spec').allowed,true);
 assert.equal(check('partner','confirm_spec').allowed,false);
 assert.equal(check('client','confirm_spec').allowed,false);
 assert.equal(check('client','accept').allowed,true);
 assert.equal(check('partner','accept').allowed,false);
});
test('partner alone records unverified money; bank and real production stay closed',()=>{
 assert.equal(check('partner','record_payment').allowed,true);
 assert.equal(check('factory','record_payment').allowed,false);
 assert.equal(check('client','report_payment').allowed,true);
 for(const type of ['start','complete','deliver']){
  assert.equal(check('factory',type).allowed,false);
 }
 assert.equal(check('partner','record_payment','partner',{mfaVerified:false}).allowed,false);
});
test('all three roles may message; legacy per-partner threads and roles are blocked',()=>{
 for(const role of ['client','partner','factory'])
  assert.equal(check(role,'message').allowed,true,role);
 assert.equal(check('partner','message','partner',{}, {partnerId:'P1',note:'Old thread'}).code,'LEGACY_PRIVATE_THREAD_REMOVED');
 assert.equal(check('owner','message').allowed,false);
 assert.equal(check('brand','message').allowed,false);
});
test('cross-tenant, wrong factory/customer, expired, spoofed and unknown blocked',()=>{
 assert.equal(check('client','accept','client',{clientId:'OTHER'}).allowed,false);
 assert.equal(check('factory','confirm_spec','factory',{factoryId:'OTHER'}).allowed,false);
 assert.equal(check('partner','offer','partner',{tenantId:'T2'}).allowed,false);
 assert.equal(check('client','accept','client',{sessionExpiresAtMs:now}).allowed,false);
 assert.equal(check('client','made-up').allowed,false);
});
