import test from 'node:test';
import assert from 'node:assert/strict';
import {calculatePartnerEconomics} from '../src/partnerEconomics.js';
import {GABER_ROLES,authorizeGaberAction} from '../server/accessPolicy.js';

const input={customerPriceKopecks:123457,factoryCostKopecks:80001,
 platformCommissionKopecks:15003,logisticsKopecks:10000,
 taxKopecks:3001,otherCostsKopecks:450};

test('exact integer kopecks split customer, factory, platform and planned reserve',()=>{
 const x=calculatePartnerEconomics(input);
 assert.deepEqual(GABER_ROLES,['client','factory','partner']);
 assert.equal(x.customerPriceKopecks,123457);
 assert.equal(x.factoryCostKopecks,80001);
 assert.equal(x.platformCommissionKopecks,15003);
 assert.equal(x.plannedReserveKopecks,15002);
 assert.equal(x.plannedCommissionBps,Number(15003n*10000n/123457n));
 assert.equal(x.earnedCommissionKopecks,null);
 assert.equal(x.actualFactoryCostKopecks,null);
 assert.equal(x.bankVerifiedKopecks,null);
 assert.equal(x.productionRelease.allowed,false);
 assert.equal(Object.isFrozen(x),true);
});
test('invalid or oversubscribed costs, overflow and missing entries fail closed',()=>{
 for(const sample of [
  {...input,customerPriceKopecks:123456,factoryCostKopecks:123456},
  {...input,platformCommissionKopecks:-1},
  {...input,factoryCostKopecks:0},
  {...input,taxKopecks:1.5},
  {...input,otherCostsKopecks:Infinity},
  {...input,customerPriceKopecks:Number.MAX_SAFE_INTEGER},
  {...input,browserRole:'factory'}
 ]) assert.throws(()=>calculatePartnerEconomics(sample),/ECONOMICS_INVALID|NEGATIVE_DEAL_BALANCE/);
});
const now=100000;
const resource={source:'server-repository',tenantId:'PLATFORM-1',
 orderId:'ORDER-1',clientId:'CUSTOMER-1',factoryId:'FACTORY-1'};
const session=(role,props={})=>({
 identitySource:'server-session',authenticated:true,subject:'U1',
 tenantId:'PLATFORM-1',roles:[role],sessionExpiresAtMs:now+5000,
 clientId:'CUSTOMER-1',factoryId:'FACTORY-1',mfaVerified:true,...props
});
const allow=(role,action,props={},r=resource)=>authorizeGaberAction({
 principal:session(role,props),resource:r,action,nowMs:now
});
test('platform partner sees tenant economics, client and factory only own scope',()=>{
 assert.equal(allow('partner','finance.internal.read').allowed,true);
 assert.equal(allow('partner','analytics.tenant').scope,'tenant');
 assert.equal(allow('client','finance.internal.read').allowed,false);
 assert.equal(allow('factory','finance.internal.read').allowed,false);
 assert.equal(allow('factory','finance.factory.read').allowed,true);
 assert.equal(allow('client','orders.read',{clientId:'OTHER'}).allowed,false);
 assert.equal(allow('factory','orders.read',{factoryId:'OTHER'}).allowed,false);
 assert.equal(allow('partner','orders.read',{}, {...resource,tenantId:'OTHER'}).allowed,false);
 assert.equal(allow('partner','partner.spec.prepare',{mfaVerified:false}).reason,'MFA_REQUIRED');
 for(const role of ['owner','brand','factory-operator','factory-technologist','technologist','factory-admin'])
  assert.equal(allow(role,'orders.read').allowed,false,role);
 assert.equal(allow('partner','offers.accept').allowed,false);
 assert.equal(allow('factory','offers.write').allowed,false);
 assert.equal(allow('partner','production.start').allowed,false);
 assert.equal(allow('factory','production.start').reason,'EXTERNAL_AUTHORITY_REQUIRED');
});
