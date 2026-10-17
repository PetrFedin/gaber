import test from 'node:test';
import assert from 'node:assert/strict';
import {initialConfig} from '../src/domain.js';
import {assessBeam,jointProposals,panelPattern,foamCompression,createManufacturingPackage,requireProductionRelease} from '../src/manufacturing.js';

test('all families have traceable individual frame parts and fail closed',()=>{
 for(const category of ['sofa','chair','chairbed','bed','headboard']){
  const p=createManufacturingPackage(initialConfig(category));
  assert.ok(p.parts.length>0);
  assert.equal(new Set(p.parts.map(x=>x.partId)).size,p.parts.length);
  assert.equal(new Set(p.parts.map(x=>x.sceneNodeRef)).size,p.parts.length);
  assert.equal(p.productionRelease.allowed,false);
  assert.ok(p.releaseChecks.some(x=>!x.passed));
  assert.deepEqual(Object.values(p.traceability.nodeToPartId),p.traceability.linkedPartIds);
  assert.ok(p.parts.every(x=>x.unitCostRUB===null&&x.approval==='unreleased'));
  assert.throws(()=>requireProductionRelease(p));
 }
});

test('module count changes joinery count and part traceability',()=>{
 const a=createManufacturingPackage(initialConfig('sofa'));
 const b=createManufacturingPackage({...initialConfig('sofa'),moduleCount:5});
 assert.equal(a.joinery.length,18);
 assert.equal(b.joinery.length,30);
 assert.ok(b.parts.length>a.parts.length);
});

test('beam strength estimator requires measured inputs and uses explicit simple-span assumptions',()=>{
 assert.equal(assessBeam({spanMm:1000}).status,'missing-measured-inputs');
 const r=assessBeam({spanMm:1000,widthMm:40,heightMm:60,loadN:500,elasticModulusMPa:10000,allowableStressMPa:50,allowableDeflectionMm:5});
 assert.equal(r.status,'preliminary-simple-span');
 assert.equal(r.withinUserLimits,true);
 assert.ok(r.maxStressMPa>0&&r.deflectionMm>0);
 assert.equal(r.certifiesFurniture,false);
});

test('foam interpolation respects measured bounds and avoids extrapolation',()=>{
 const pts=[{strain:0,stressKPa:0},{strain:0.25,stressKPa:4},{strain:0.5,stressKPa:10}];
 const r=foamCompression(pts,0.375,100);
 assert.equal(r.stressKPa,7);
 assert.equal(r.deformedThicknessMm,62.5);
 assert.throws(()=>foamCompression(pts,0.6,100));
 assert.throws(()=>foamCompression([{strain:0.5,stressKPa:2},{strain:0.2,stressKPa:3}],0.25,100));
});

test('pattern envelopes do not claim optimized cut length',()=>{
 const a=panelPattern(initialConfig('sofa'));
 assert.equal(a.markerLengthMm,null);
 assert.equal(a.status,'roll-width-unverified');
 const b=panelPattern(initialConfig('sofa'),{rollWidthMm:1400});
 assert.equal(b.markerLengthMm,null);
 assert.equal(b.status,'layout-required');
 assert.equal(panelPattern({...initialConfig('chair'),pillows:0}).status,'none');
});

test('document evidence cannot bypass missing physical test or server authorization',()=>{
 const approved={status:'approved',reference:'DOC-1',revision:'R1',approvedBy:'technologist',approvedAt:'2026-10-17'};
 const p=createManufacturingPackage(initialConfig('chair'),{designReview:approved,loadTest:approved});
 assert.equal(p.releaseChecks.find(x=>x.id==='DESIGN_REVIEW').passed,true);
 assert.equal(p.releaseChecks.find(x=>x.id==='STRUCTURAL_TESTS').passed,true);
 assert.equal(p.productionRelease.allowed,false);
 assert.ok(p.productionRelease.blockers.includes('AUTHORITY'));
 assert.throws(()=>requireProductionRelease(p));
});
