import test from 'node:test';
import assert from 'node:assert/strict';
import {admitOrderCommand} from '../server/orderCommandAdmission.js';
const now=10000;
const resource={source:'server-repository',orderId:'O1',tenantId:'T1',
 clientId:'C1',brandId:'B1',factoryId:'F1',partnerIds:['P1']};
const base={identitySource:'server-session',authenticated:true,tenantId:'T1',
 subject:'U1',roles:['client'],clientId:'C1',mfaVerified:true,sessionExpiresAtMs:30000};
const check=(principal,role,type,r=resource)=>admitOrderCommand({
 principal,resource:r,command:{role,type},nowMs:now});
test('client only accepts own order and cannot impersonate factory',()=>{
 assert.equal(check(base,'client','accept').allowed,true);
 assert.equal(check(base,'factory','offer').allowed,false);
 assert.equal(check({...base,clientId:'C2'},'client','accept').allowed,false);
});
test('factory offer needs assigned factory and MFA',()=>{
 const p={...base,roles:['factory-operator'],factoryId:'F1'};
 assert.equal(check(p,'factory','offer').allowed,true);
 assert.equal(check({...p,mfaVerified:false},'factory','offer').allowed,false);
 assert.equal(check({...p,factoryId:'F2'},'factory','offer').allowed,false);
});
test('bank and production facts cannot be inferred from local commands',()=>{
 for(const type of ['start','complete','deliver'])
  assert.equal(check({...base,roles:['owner']},'factory',type).allowed,false);
 assert.equal(check(base,'client','confirm_resolution').productionRelease.allowed,false);
});
test('partner messaging is not admitted until a server-native role event is defined',()=>{
 const partner={...base,roles:['partner'],partnerId:'P1'};
 assert.equal(check(partner,'factory','message').allowed,false);
 assert.equal(check(partner,'client','message').allowed,false);
});
test('cross-tenant, expired, forged perspective and unknown commands fail closed',()=>{
 assert.equal(check(base,'client','accept',{...resource,tenantId:'T2'}).allowed,false);
 assert.equal(check({...base,sessionExpiresAtMs:now},'client','accept').allowed,false);
 assert.equal(check(base,'factory','accept').allowed,false);
 assert.equal(check(base,'client','made-up').allowed,false);
});