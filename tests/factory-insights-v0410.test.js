import test from 'node:test';
import assert from 'node:assert/strict';
import {initialConfig,families} from '../src/domain.js';
import {emptyFactoryCostDraft,evaluateFactoryCostDraft} from '../src/factoryCosting.js';
import {buildFactoryInsights} from '../src/factoryInsights.js';
const day='2026-10-22';
function withEnteredInputs(config){
 const draft=emptyFactoryCostDraft(config,day,'R1');
 draft.quotes.push({priceId:'Q1',sku:'ILLUSTRATIVE-ONLY',
  supplierRef:'User example',documentRef:'Self-reported',
  revision:'A',currency:'RUB',unit:'pcs',unitPriceRUB:15,
  validFrom:'2026-10-01',validTo:'2026-10-31'});
 draft.workCenters.push({rateId:'W1',workCenterId:'ASSEMBLY',documentRef:'Self-reported',
  revision:'A',rateRUBPerHour:600,validFrom:'2026-10-01',validTo:'2026-10-31'});
 const requirements=evaluateFactoryCostDraft(config,draft).coverage;
 for(const id of requirements.requiredMaterialRefs)
  draft.consumption.push({entityId:id,priceId:'Q1',measuredQty:1,
   measuredUnit:'pcs',wastePct:0,measurementRef:'Self-reported'});
 for(const id of requirements.requiredOperations){
  const index=id.lastIndexOf('|');
  draft.operations.push({routeId:id.slice(0,index),operationCode:id.slice(index+1),
   rateId:'W1',minutes:3,measurementRef:'Self-reported'});
 }
 return draft;
}
test('v0.4.10: empty input never fabricates factory-approved or actual money',()=>{
 for(const family of families){
  const c=initialConfig(family.id);
  const a=buildFactoryInsights(c,emptyFactoryCostDraft(c,day));
  assert.equal(a.status,'incomplete');
  assert.equal(a.coverage.enteredPct,0);
  assert.ok(a.coverage.totalRequired>0);
  assert.equal(a.totals.provisionalDirectRUB,null);
  assert.equal(a.totals.factoryApprovedCostRUB,null);
  assert.equal(a.totals.actualCostRUB,null);
  assert.equal(a.productionRelease.allowed,false);
 }
});
test('v0.4.10: all design families and sizes reconcile material and operation groups',()=>{
 for(const family of families)for(const width of [family.min,family.max]){
  const c={...initialConfig(family.id),width};
  const insights=buildFactoryInsights(c,withEnteredInputs(c));
  assert.equal(insights.status,'self-reported-input-complete');
  assert.equal(insights.coverage.enteredPct,100);
  assert.equal(insights.coverage.fullyEntered,true);
  assert.equal(insights.totals.provisionalDirectRUB,insights.totals.enteredDirectRUB);
  assert.equal(insights.totals.enteredMaterialsRUB,
   Math.round(insights.byGroup.reduce((s,g)=>s+g.enteredRUB,0)*100)/100);
  assert.equal(insights.totals.enteredOperationsRUB,
   Math.round(insights.byWorkCenter.reduce((s,g)=>s+g.enteredRUB,0)*100)/100);
  assert.ok(insights.topLines.every((r,i,a)=>i===0||a[i-1].amountRUB>=r.amountRUB));
  assert.equal(insights.coverage.externallyVerified,false);
  assert.equal(insights.totals.actualCostRUB,null);
  assert.equal(insights.productionRelease.allowed,false);
 }
});
test('v0.4.10: missing one measured entity changes coverage and clears complete cost',()=>{
 const c=initialConfig(),d=withEnteredInputs(c),before=buildFactoryInsights(c,d);
 d.consumption.pop();
 const after=buildFactoryInsights(c,d);
 assert.equal(after.status,'incomplete');
 assert.ok(after.coverage.enteredPct<before.coverage.enteredPct);
 assert.equal(after.coverage.missing,1);
 assert.equal(after.totals.provisionalDirectRUB,null);
 assert.equal(after.productionRelease.allowed,false);
});
test('v0.4.10: corrupted supplier quantity blocks the report even if other rows match',()=>{
 const c=initialConfig(),d=withEnteredInputs(c);
 d.consumption[0].measuredQty=-10;
 const report=buildFactoryInsights(c,d);
 assert.equal(report.status,'invalid-input');
 assert.ok(report.issues.some(x=>x.code==='CONSUMPTION_INVALID'));
 assert.equal(report.totals.provisionalDirectRUB,null);
});
test('v0.4.10: unknown consumption units are visible and do not grant verification',()=>{
 const c=initialConfig(),d=withEnteredInputs(c);
 delete d.consumption[0].measuredUnit;
 const report=buildFactoryInsights(c,d);
 assert.ok(report.coverage.unitReviewRefs.includes(d.consumption[0].entityId));
 assert.equal(report.coverage.externallyVerified,false);
 assert.equal(report.productionRelease.allowed,false);
});
