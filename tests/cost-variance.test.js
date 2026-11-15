import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCostVariance} from '../src/costVariance.js';
import {initialConfig} from '../src/domain.js';
import {emptyFactoryCostDraft,evaluateFactoryCostDraft,compareFactoryCostDrafts} from '../src/factoryCosting.js';
const config=initialConfig();
function fixture(){
 const d=emptyFactoryCostDraft(config,'2026-10-23','R1');
 const needs=evaluateFactoryCostDraft(config,d).coverage;
 d.quotes=[{priceId:'Q1',sku:'TEST',supplierRef:'TEST',documentRef:'TEST',revision:'1',unit:'pcs',currency:'RUB',unitPriceRUB:100,validFrom:'2026-10-01',validTo:'2026-10-31'}];
 d.consumption=[{entityId:needs.requiredMaterialRefs[0],priceId:'Q1',measuredQty:2,measuredUnit:'pcs',wastePct:10,measurementRef:'TEST'}];
 d.workCenters=[{rateId:'W1',workCenterId:'TEST',documentRef:'TEST',revision:'1',rateRUBPerHour:600,validFrom:'2026-10-01',validTo:'2026-10-31'}];
 const [routeId,operationCode]=needs.requiredOperations[0].split('|');
 d.operations=[{routeId,operationCode,rateId:'W1',minutes:6,measurementRef:'TEST'}];
 return d;
}
const compare=(a,b)=>compareFactoryCostDrafts(config,a,config,b).variance;
test('sequential factors reconcile actual draft recalculations',()=>{
 const a=fixture(),b=structuredClone(a);
 b.consumption[0].measuredQty=3;b.consumption[0].wastePct=20;b.quotes[0].unitPriceRUB=120;
 b.operations[0].minutes=9;b.workCenters[0].rateRUBPerHour=900;
 const r=compare(a,b);
 assert.deepEqual(r.totals,{quantity:110,waste:30,price:72,time:30,rate:45,scope:0,rounding:0});
 assert.equal(r.deltaRUB,287);assert.equal(r.reconciled,true);
});
test('new quote ID maps by entity and exposes source changes with unchanged money',()=>{
 const a=fixture(),b=structuredClone(a);b.quotes[0].priceId='Q2';b.consumption[0].priceId='Q2';
 const r=compare(a,b);assert.equal(r.rows.length,1);assert.equal(r.rows[0].sourceChanged,true);
 assert.equal(r.totals.scope,0);assert.equal(r.deltaRUB,0);
});
test('unit and SKU substitutions cannot masquerade as a price increase',()=>{
 for(const key of ['unit','sku']){
  const a=fixture(),b=structuredClone(a);b.quotes[0][key]=key==='unit'?'kg':'OTHER';
  if(key==='unit')b.consumption[0].measuredUnit='kg';b.quotes[0].unitPriceRUB=150;
  const r=compare(a,b);assert.equal(r.rows[0].reason,'basis-changed');
  assert.equal(r.totals.price,0);assert.equal(r.totals.scope,110);
 }
});
test('added and removed entered rows are scope, not a saving or efficiency claim',()=>{
 const a=fixture(),b=structuredClone(a);b.consumption=[];
 assert.equal(compare(a,b).totals.scope,-220);assert.equal(compare(b,a).totals.scope,220);
});
test('invalid drafts expose no usable factor bridge',()=>{
 const a=fixture(),b=structuredClone(a);b.operations[0].minutes=-1;
 assert.equal(compare(a,b).comparable,false);assert.equal(compare(a,b).totals,null);
});
test('fractional and opposing effects reconcile in integer kopecks',()=>{
 for(let i=1;i<=100;i++){
  const a=fixture(),b=structuredClone(a);
  a.quotes[0].unitPriceRUB=i/37;a.consumption[0].measuredQty=i/19;
  b.quotes[0].unitPriceRUB=i/29;b.consumption[0].measuredQty=i/23;
  b.consumption[0].wastePct=i/7;
  const r=compare(a,b);assert.equal(r.reconciled,true);
  assert.equal(Object.values(r.totals).reduce((s,n)=>s+Math.round(n*100),0),Math.round(r.deltaRUB*100));
 }
});

test('unsafe money aggregates never produce a reconciled financial bridge',()=>{
 const r={status:'incomplete',materialLines:[],operationLines:[],totals:{partialDirectRUB:1e16}};
 assert.deepEqual(buildCostVariance(r,r),{comparable:false,reason:'UNSAFE_MONEY_RANGE',rows:[],totals:null});
});
