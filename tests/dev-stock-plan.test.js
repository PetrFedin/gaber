import test from 'node:test';
import assert from 'node:assert/strict';
import {getInvestorDemoTemplates} from '../src/investorDemo.js';
import {deriveDemoStockPlan,validateBatchPick,validateIndependentBatchReceipt} from '../server/inventoryPlan.js';
test('all five original BOMs map each part group to distinct source-signed synthetic SKU',()=>{
 const articles=getInvestorDemoTemplates();
 assert.equal(articles.length,5);
 const skuTypes=new Map();
 for(const article of articles){
  const plan=deriveDemoStockPlan(article.config);
  assert.equal(plan.realWarehouseAuthority,false);
  assert.ok(plan.lines.length>0);
  assert.ok(plan.lines.every(x=>x.supplierSku===null&&!x.approvedForRealPurchase));
  assert.ok(plan.lines.every(x=>/^DEVSKU-[a-f0-9]{24}$/.test(x.skuId)));
  assert.deepEqual(plan,deriveDemoStockPlan(article.config));
  for(const item of plan.lines){
   assert.equal(item.evidence,'SYNTHETIC_CONCEPT_SKU_NOT_SUPPLIER_VERIFIED');
   assert.ok(item.requiredQty>0);
   const previous=skuTypes.get(item.skuId);
   if(previous)assert.equal(previous,item.sourceSignature);
   skuTypes.set(item.skuId,item.sourceSignature);
  }
 }
});
test('partial batch picks cannot exceed remaining reservation or forge part refs',()=>{
 const plan=deriveDemoStockPlan(getInvestorDemoTemplates()[0].config);
 const remaining=Object.fromEntries(plan.lines.map(x=>[x.partRef,x.requiredQty]));
 const first=plan.lines[0];
 assert.deepEqual(validateBatchPick(plan,[{partRef:first.partRef,quantity:1}],remaining),
  [{partRef:first.partRef,skuId:first.skuId,quantity:1}]);
 for(const rows of [
  [{partRef:first.partRef,quantity:first.requiredQty+1}],
  [{partRef:'FORGED-NO-SKU',quantity:1}],
  [{partRef:first.partRef,quantity:0}],
  [{partRef:first.partRef,quantity:1.5}],
  [{partRef:first.partRef,quantity:1},{partRef:first.partRef,quantity:1}]
 ])assert.throws(()=>validateBatchPick(plan,rows,remaining),/STOCK_/);
});
test('client independently receives each partial batch with bounded damage',()=>{
 const lines=[{partRef:'FRAME',skuId:'DEVSKU-001',quantity:3},
 {partRef:'FABRIC',skuId:'DEVSKU-002',quantity:2}];
 const r=validateIndependentBatchReceipt(lines,[
  {partRef:'FRAME',receivedQty:2,damagedQty:1},
  {partRef:'FABRIC',receivedQty:2,damagedQty:0}
 ]);
 assert.equal(r.matched,false);
 assert.equal(r.lines[1].missingQty,1);
 assert.ok(r.authority.includes('CUSTOMER_DEV_SELF_REPORT'));
 for(const v of [
  [{partRef:'FRAME',receivedQty:2,damagedQty:3},{partRef:'FABRIC',receivedQty:2,damagedQty:0}],
  [{partRef:'FRAME',receivedQty:4,damagedQty:0},{partRef:'FABRIC',receivedQty:2,damagedQty:0}],
  [{partRef:'FRAME',receivedQty:2,damagedQty:0},{partRef:'FRAME',receivedQty:1,damagedQty:0}],
  [{partRef:'FRAME',receivedQty:2,damagedQty:0}]
 ])assert.throws(()=>validateIndependentBatchReceipt(lines,v),/BATCH_/);
});
