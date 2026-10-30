import test from 'node:test';
import assert from 'node:assert/strict';
import {authorizeGaberAction,GABER_ROLES} from '../server/accessPolicy.js';

const now=100000;
const resource={source:'server-repository',tenantId:'TENANT-A',orderId:'ORDER-1',
 clientId:'CLIENT-1',factoryId:'FACTORY-A'};
const actor=(role,changes={})=>({identitySource:'server-session',
 authenticated:true,subject:'USER-1',tenantId:'TENANT-A',roles:[role],
 clientId:'CLIENT-1',factoryId:'FACTORY-A',mfaVerified:true,
 sessionExpiresAtMs:now+60000,...changes});
const ask=(role,action,changes={},r=resource)=>authorizeGaberAction({
 principal:actor(role,changes),resource:r,action,nowMs:now});

test('exactly three roles, partner controls tenant but never other tenants',()=>{
 assert.deepEqual(GABER_ROLES,['client','factory','partner']);
 assert.equal(ask('partner','analytics.tenant').allowed,true);
 assert.equal(ask('partner','finance.internal.read').scope,'tenant');
 assert.equal(ask('partner','orders.read',{}, {...resource,tenantId:'TENANT-B'}).allowed,false);
 assert.equal(ask('client','analytics.tenant').allowed,false);
 assert.equal(ask('factory','analytics.tenant').allowed,false);
 for(const legacy of ['brand','owner','factory-operator','factory-technologist','factory-admin','technologist'])
  assert.equal(ask(legacy,'orders.read').reason,'NO_VERIFIED_SESSION');
});
test('client and factory cannot cross assigned order membership',()=>{
 assert.equal(ask('client','orders.read').allowed,true);
 assert.equal(ask('client','orders.read',{clientId:'OTHER'}).reason,'RESOURCE_MEMBERSHIP_DENIED');
 assert.equal(ask('factory','orders.read').allowed,true);
 assert.equal(ask('factory','orders.read',{factoryId:'OTHER'}).reason,'RESOURCE_MEMBERSHIP_DENIED');
 assert.equal(ask('partner','orders.read').allowed,true);
});
test('partner owns economics, offer and local payment entry; factory owns technical confirmation',()=>{
 for(const action of ['partner.spec.prepare','offers.write','payments.record_unverified',
   'analytics.tenant','finance.internal.read']){
  assert.equal(ask('partner',action).allowed,true,action);
  assert.equal(ask('client',action).allowed,false,action);
  assert.equal(ask('factory',action).allowed,false,action);
 }
 for(const action of ['factory.spec.confirm','factory.spec.return','factory.technical_review']){
  assert.equal(ask('factory',action).allowed,true);
  assert.equal(ask('partner',action).allowed,false);
 }
 assert.equal(ask('partner','partner.spec.prepare',{mfaVerified:false}).reason,'MFA_REQUIRED');
 assert.equal(ask('factory','factory.spec.confirm',{mfaVerified:false}).reason,'MFA_REQUIRED');
});
test('no browser identity, role array injection, expired or forged sessions',()=>{
 assert.equal(ask('partner','orders.read',{identitySource:'browser-state'}).allowed,false);
 assert.equal(ask('partner','orders.read',{sessionExpiresAtMs:now}).allowed,false);
 assert.equal(ask('partner','orders.read',{roles:['partner','client']}).allowed,false);
 assert.equal(ask('partner','orders.read',{authenticated:false}).allowed,false);
 assert.equal(ask('partner','orders.read',{}, {...resource,source:'browser-json'}).allowed,false);
 assert.equal(ask('partner','fabricated.action').reason,'ACTION_UNKNOWN');
});
test('even partner/factory cannot infer bank settlement or manufacturing approval',()=>{
 for(const role of GABER_ROLES){
  for(const action of ['production.start','factory.production_release',
    'payments.verify_bank','payments.charge','shipments.confirm_carrier']){
   const x=ask(role,action);assert.equal(x.allowed,false);
   assert.equal(x.productionRelease.allowed,false);
  }
 }
});
