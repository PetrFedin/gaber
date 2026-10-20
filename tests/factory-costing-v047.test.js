import test from 'node:test';
import assert from 'node:assert/strict';
import {initialConfig} from '../src/domain.js';
import {createManufacturingPackage} from '../src/manufacturing.js';
import {createCostTraceability} from '../src/costTraceability.js';
import {emptyFactoryCostDraft,evaluateFactoryCostDraft,auditFactoryCostDraft,compareFactoryCostDrafts,snapshotFactoryCostDraft} from '../src/factoryCosting.js';
const day='2026-10-20';
function full(config){
 const d=emptyFactoryCostDraft(config,day,'R1');
 d.quotes.push({priceId:'P1',sku:'DEMO-INPUT',supplierRef:'Sample',documentRef:'Sample quotation',revision:'A',currency:'RUB',unit:'pcs',unitPriceRUB:125,validFrom:'2026-10-01',validTo:'2026-10-31'});
 d.workCenters.push({rateId:'W1',workCenterId:'SHOP-1',documentRef:'Sample operation evidence',revision:'A',rateRUBPerHour:600,validFrom:'2026-10-01',validTo:'2026-10-31'});
 const r=evaluateFactoryCostDraft(config,d);
 for(const entityId of r.coverage.requiredMaterialRefs)d.consumption.push({entityId,priceId:'P1',measuredQty:1,wastePct:0,measurementRef:'User supplied measure'});
 for(const key of r.coverage.requiredOperations){
  const pos=key.lastIndexOf('|');
  d.operations.push({routeId:key.slice(0,pos),operationCode:key.slice(pos+1),rateId:'W1',minutes:3,measurementRef:'User supplied minutes'});
 }
 return d;
}
test('v0.4.7 empty registers preserve missing costs and production HOLD',()=>{
 for(const category of ['sofa','chair','chairbed','bed','headboard']){
  const c=initialConfig(category),draft=emptyFactoryCostDraft(c,day),r=evaluateFactoryCostDraft(c,draft);
  assert.equal(r.status,'incomplete');assert.equal(r.totals.provisionalDirectRUB,null);
  assert.ok(r.coverage.missingMaterialRefs.length>0);assert.ok(r.coverage.missingOperations.length>0);
  assert.equal(r.totals.actualCostRUB,null);assert.equal(r.productionRelease.allowed,false);
  assert.equal(auditFactoryCostDraft(c,draft,r).ok,true);
 }
});
test('v0.4.7 self reported complete inputs reconcile without pretending to be approved',()=>{
 const c=initialConfig(),draft=full(c),r=evaluateFactoryCostDraft(c,draft);
 assert.equal(r.status,'self-reported-input-complete');
 assert.equal(r.coverage.missingOperations.length,0);assert.equal(r.coverage.missingMaterialRefs.length,0);
 assert.equal(r.totals.enteredMaterialRUB,125*r.materialLines.length);
 assert.equal(r.totals.enteredLaborRUB,30*r.operationLines.length);
 assert.equal(r.totals.provisionalDirectRUB,r.totals.partialDirectRUB);
 assert.equal(r.totals.approvedCostRUB,null);assert.equal(r.productionRelease.allowed,false);
});
test('v0.4.7 stale, expired and fabricated inputs fail closed',()=>{
 const c=initialConfig(),mutations=[
 d=>{d.sourceConfig.width=300;},
 d=>{d.quotes[0].validTo='2026-10-19';},
 d=>{d.consumption[0].entityId='NOT-A-PART';},
 d=>{d.consumption[0].wastePct=101;},
 d=>{d.consumption[0].measuredQty=-1;},
 d=>{d.consumption.push(structuredClone(d.consumption[0]));},
 d=>{d.operations[0].operationCode='FAKE';},
 d=>{d.operations[0].rateId='FAKE';},
 d=>{d.quotes[0].currency='USD';}
 ];
 for(const mutate of mutations){
  const draft=full(c);mutate(draft);const report=evaluateFactoryCostDraft(c,draft);
  assert.equal(report.status,'invalid-input',mutate.toString());
  assert.equal(report.totals.provisionalDirectRUB,null);assert.equal(report.productionRelease.allowed,false);
 }
});
test('v0.4.7 report tampering and local revision changes are detectable',()=>{
 const c=initialConfig(),d=full(c),r=evaluateFactoryCostDraft(c,d);
 for(const mutate of [a=>a.totals.partialDirectRUB++,a=>a.materialLines[0].amountRUB++,a=>a.productionRelease.allowed=true,a=>a.totals.approvedCostRUB=100]){
  const change=structuredClone(r);mutate(change);assert.equal(auditFactoryCostDraft(c,d,change).ok,false);
 }
 const prior=snapshotFactoryCostDraft(c,d,'2026-10-20T10:00:00Z','R1');
 const modified=structuredClone(d);modified.revisionId='R2';modified.quotes[0].unitPriceRUB+=10;
 const diff=compareFactoryCostDrafts(c,d,c,modified);
 assert.ok(diff.materialChanges.length>0);assert.equal(diff.productionRelease.allowed,false);
 d.quotes[0].unitPriceRUB=9999;assert.equal(prior.inputSnapshot.quotes[0].unitPriceRUB,125);
});
