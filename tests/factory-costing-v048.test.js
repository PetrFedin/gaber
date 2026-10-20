import test from 'node:test';
import assert from 'node:assert/strict';
import {initialConfig,families} from '../src/domain.js';
import {emptyFactoryCostDraft,evaluateFactoryCostDraft,auditFactoryCostDraft,compareFactoryCostDrafts} from '../src/factoryCosting.js';
const day='2026-10-20';
function full(config,typed=false){
 const d=emptyFactoryCostDraft(config,day,'R1');
 d.quotes.push({priceId:'P1',sku:'SAMPLE',supplierRef:'Supplier',
   documentRef:'Unverified source',revision:'A',currency:'RUB',unit:'pcs',
   unitPriceRUB:125,validFrom:'2026-10-01',validTo:'2026-10-31'});
 d.workCenters.push({rateId:'W1',workCenterId:'SHOP-1',documentRef:'Unverified source',
   revision:'A',rateRUBPerHour:600,validFrom:'2026-10-01',validTo:'2026-10-31'});
 const initial=evaluateFactoryCostDraft(config,d);
 for(const entityId of initial.coverage.requiredMaterialRefs)
   d.consumption.push({entityId,priceId:'P1',measuredQty:1,wastePct:0,
    measurementRef:'User-entered quantity',...(typed?{measuredUnit:'pcs'}:{})});
 for(const id of initial.coverage.requiredOperations){
   const i=id.lastIndexOf('|');
   d.operations.push({routeId:id.slice(0,i),operationCode:id.slice(i+1),
    rateId:'W1',minutes:3,measurementRef:'User-entered time'});
 }
 return d;
}
test('v0.4.8: legacy local drafts reconcile and preserve separate unit warnings',()=>{
 for(const f of families)for(const width of [f.min,f.max]){
  const c={...initialConfig(f.id),width},d=full(c),r=evaluateFactoryCostDraft(c,d);
  assert.equal(r.status,'self-reported-input-complete');
  assert.ok(r.coverage.unitReviewRefs.length>0);
  assert.ok(r.materialLines.every(x=>x.unitReviewRequired));
  assert.equal(r.productionRelease.allowed,false);
  assert.equal(r.totals.actualCostRUB,null);
  assert.equal(auditFactoryCostDraft(c,d,r).ok,true);
 }
});
test('v0.4.8: different suppliers cannot charge the same entity twice',()=>{
 const c=initialConfig(),d=full(c);
 d.quotes.push({...d.quotes[0],priceId:'P2',supplierRef:'Other'});
 d.consumption.push({...structuredClone(d.consumption[0]),priceId:'P2'});
 const r=evaluateFactoryCostDraft(c,d);
 assert.equal(r.status,'invalid-input');
 assert.ok(r.issues.some(x=>x.code==='CONSUMPTION_ENTITY_DUPLICATE'));
 assert.equal(r.totals.provisionalDirectRUB,null);
});
test('v0.4.8: duplicate supplier SKU and rate center are rejected despite case and spaces',()=>{
 const c=initialConfig(),a=full(c);
 a.quotes.push({...a.quotes[0],priceId:'P2',supplierRef:' supplier ',sku:' sample '});
 const r=evaluateFactoryCostDraft(c,a);
 assert.ok(r.issues.some(x=>x.code==='AMBIGUOUS_SUPPLIER_SKU'));
 const b=full(c);
 b.workCenters.push({...b.workCenters[0],rateId:'W2',workCenterId:' shop-1 '});
 const q=evaluateFactoryCostDraft(c,b);
 assert.ok(q.issues.some(x=>x.code==='AMBIGUOUS_WORKCENTER'));
 assert.equal(r.totals.provisionalDirectRUB,null);
 assert.equal(q.totals.provisionalDirectRUB,null);
});
test('v0.4.8: quote and consumed units must agree, with legacy support',()=>{
 const c=initialConfig(),d=full(c),item=d.consumption[0];
 assert.ok(evaluateFactoryCostDraft(c,d).coverage.unitReviewRefs.includes(item.entityId));
 item.measuredUnit='m3';
 const bad=evaluateFactoryCostDraft(c,d);
 assert.ok(bad.issues.some(x=>x.code==='CONSUMPTION_UNIT_MISMATCH'));
 item.measuredUnit='pcs';
 const good=evaluateFactoryCostDraft(c,d);
 assert.equal(good.status,'self-reported-input-complete');
 assert.equal(good.materialLines[0].unitReviewRequired,false);
 assert.equal(good.materialLines[0].quoteRevision,'A');
 assert.equal(good.materialLines[0].supplierRef,'Supplier');
});
test('v0.4.8: forged unit review and source provenance changes fail audit',()=>{
 const c=initialConfig(),d=full(c,true),report=evaluateFactoryCostDraft(c,d);
 const a=structuredClone(report);a.coverage.unitReviewRefs=[];
 assert.equal(auditFactoryCostDraft(c,d,a).ok,false);
 const b=structuredClone(report);b.materialLines[0].supplierRef='Forged';
 assert.equal(auditFactoryCostDraft(c,d,b).ok,false);
 const next=structuredClone(d);next.revisionId='R2';next.quotes[0].unitPriceRUB++;
 const delta=compareFactoryCostDrafts(c,d,c,next);
 assert.ok(delta.materialChanges.length>0);
 assert.equal(delta.productionRelease.allowed,false);
});
