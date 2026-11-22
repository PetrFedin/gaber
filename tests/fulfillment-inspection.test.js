import test from 'node:test';
import assert from 'node:assert/strict';
import {initialConfig} from '../src/domain.js';
import {getConceptPackoutPlan,validateConceptPackout,validateConceptReceipt,validateCorrectionProposal} from '../src/fulfillmentInspection.js';
test('five product types have deterministic concept-only BOM quantities',()=>{
 for(const category of ['sofa','chairbed','bed','headboard','chair']){
  const cfg=initialConfig(category),plan=getConceptPackoutPlan(cfg);
  assert.equal(plan.source,'CONCEPT_BOM_NOT_RELEASED');
  assert.ok(plan.lines.length>0);
  const packed=plan.lines.map(x=>({partRef:x.partRef,packedQty:x.expectedQty}));
  assert.equal(validateConceptPackout(cfg,packed).complete,true);
 }
});
test('part references, quantities and duplicates must match factory concept plan',()=>{
 const cfg=initialConfig('sofa'),plan=getConceptPackoutPlan(cfg);
 const packed=plan.lines.map(x=>({partRef:x.partRef,packedQty:x.expectedQty}));
 const partial=structuredClone(packed);partial[0].packedQty--;
 assert.equal(validateConceptPackout(cfg,partial).shortages[0].missingQty,1);
 for(const bad of [[...packed,packed[0]],
  [{partRef:'FAKE-SKU',packedQty:1},...packed.slice(1)],
  packed.map((x,i)=>i?x:{...x,packedQty:x.packedQty+1}),
  packed.map((x,i)=>i?x:{...x,packedQty:0.5})])
  assert.throws(()=>validateConceptPackout(cfg,bad),/INSPECTION_/);
});
test('independent receipt and correction proposal distinguish missing and damaged parts',()=>{
 const cfg=initialConfig('bed'),plan=getConceptPackoutPlan(cfg);
 const packout=validateConceptPackout(cfg,plan.lines.map(x=>({partRef:x.partRef,packedQty:x.expectedQty})));
 const full=packout.lines.map(x=>({partRef:x.partRef,receivedQty:x.packedQty,damagedQty:0}));
 assert.equal(validateConceptReceipt(packout,full).matched,true);
 const short=structuredClone(full);short[0].receivedQty--;
 const found=validateConceptReceipt(packout,short);
 assert.equal(found.matched,false);
 assert.deepEqual(found.discrepancies,[{partRef:short[0].partRef,missingQty:1,damagedQty:0}]);
 assert.equal(validateCorrectionProposal(found.discrepancies,
  [{partRef:short[0].partRef,kind:'replace',quantity:1}]).length,1);
 assert.throws(()=>validateCorrectionProposal(found.discrepancies,
  [{partRef:short[0].partRef,kind:'replace',quantity:2}]),/CORRECTION_NOT_RELEVANT/);
 assert.throws(()=>validateConceptReceipt({...packout,complete:false},full),/PACKOUT_REQUIRED/);
});

test('a missing part cannot be marked repaired; a damaged received item may be repaired',()=>{
 const missing=[{partRef:'frame',missingQty:2,damagedQty:0}];
 assert.throws(()=>validateCorrectionProposal(missing,
  [{partRef:'frame',kind:'repair',quantity:1}]),/CORRECTION_NOT_RELEVANT/);
 assert.deepEqual(validateCorrectionProposal(missing,
  [{partRef:'frame',kind:'replace',quantity:2}]),[{partRef:'frame',kind:'replace',quantity:2}]);
 const damaged=[{partRef:'foam',missingQty:0,damagedQty:2}];
 assert.deepEqual(validateCorrectionProposal(damaged,
  [{partRef:'foam',kind:'repair',quantity:2}]),[{partRef:'foam',kind:'repair',quantity:2}]);
 const mixed=[{partRef:'upholstery',missingQty:1,damagedQty:2}];
 assert.throws(()=>validateCorrectionProposal(mixed,
  [{partRef:'upholstery',kind:'repair',quantity:3}]),/CORRECTION_NOT_RELEVANT/);
 assert.deepEqual(validateCorrectionProposal(mixed,
  [{partRef:'upholstery',kind:'investigate',quantity:3}]).length,1);
});
