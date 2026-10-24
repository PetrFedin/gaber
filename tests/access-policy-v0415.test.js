import test from 'node:test';
import assert from 'node:assert/strict';
import {authorizeGaberAction,GABER_ACCESS_SCHEMA} from '../server/accessPolicy.js';

const now=1000000;
const resource={source:'server-repository',tenantId:'TENANT-A',
 orderId:'ORDER-1',clientId:'CLIENT-1',brandId:'BRAND-1',
 partnerIds:['PARTNER-1'],factoryId:'FACTORY-A'};
const principal=(role,props={})=>({
 identitySource:'server-session',authenticated:true,tenantId:'TENANT-A',
 subject:'USER-1',roles:[role],mfaVerified:true,sessionExpiresAtMs:now+60000,
 clientId:'CLIENT-1',brandId:'BRAND-1',partnerId:'PARTNER-1',factoryId:'FACTORY-A',
 ...props
});
const allowed=(role,action,overrides={},r=resource)=>authorizeGaberAction({
 principal:principal(role,overrides),resource:r,action,nowMs:now});

test('server verified owners receive tenant analytics, clients get only own order',()=>{
 assert.equal(allowed('owner','analytics.tenant').schemaVersion,undefined);
 assert.equal(allowed('owner','analytics.tenant').allowed,true);
 assert.equal(allowed('owner','analytics.tenant').scope,'tenant');
 assert.equal(allowed('client','orders.read').allowed,true);
 assert.equal(allowed('client','analytics.tenant').allowed,false);
 assert.equal(allowed('client','orders.read',{clientId:'OTHER'}).allowed,false);
 assert.equal(allowed('client','offers.write').allowed,false);
});
test('brand and partner cannot browse unassigned orders or other tenants',()=>{
 assert.equal(allowed('brand','analytics.own').allowed,true);
 assert.equal(allowed('partner','orders.read').allowed,true);
 assert.equal(allowed('partner','orders.read',{partnerId:'PARTNER-OTHER'}).allowed,false);
 assert.equal(allowed('brand','catalog.manage',{brandId:'BRAND-OTHER'}).allowed,false);
 assert.equal(allowed('owner','orders.read',{}, {...resource,tenantId:'TENANT-B'}).allowed,false);
 assert.equal(allowed('factory-operator','orders.read',{factoryId:'FACTORY-B'}).allowed,false);
});
test('factory technical review is not production release and needs MFA',()=>{
 assert.equal(allowed('factory-technologist','factory.technical_review').allowed,true);
 assert.equal(allowed('factory-technologist','factory.technical_review',{mfaVerified:false}).reason,'MFA_REQUIRED');
 assert.equal(allowed('factory-operator','factory.technical_review').allowed,false);
 for(const action of ['production.start','factory.production_release','payments.verify_bank','shipments.confirm_carrier']){
  const result=allowed('owner',action);
  assert.equal(result.allowed,false);assert.equal(result.productionRelease.allowed,false);
 }
});
test('unverified identity, non-server resource and expired session all fail closed',()=>{
 assert.equal(allowed('owner','analytics.tenant',{identitySource:'browser-state'}).allowed,false);
 assert.equal(allowed('owner','analytics.tenant',{sessionExpiresAtMs:now}).allowed,false);
 assert.equal(allowed('owner','analytics.tenant',{}, {...resource,source:'browser-json'}).allowed,false);
 assert.equal(allowed('owner','nonexistent.action').reason,'ACTION_UNKNOWN');
});
test('read-only partner operations do not grant factory payment or customer decisions',()=>{
 for(const action of ['payments.record_unverified','offers.accept','qc.record','shipments.record']){
  assert.equal(allowed('partner',action).allowed,false);
 }
 assert.equal(allowed('partner','analytics.own').allowed,true);
 assert.equal(allowed('partner','analytics.tenant').allowed,false);
});
