import test from 'node:test';
import assert from 'node:assert/strict';
import {families,initialConfig} from '../src/domain.js';
import {getEngineeringModel} from '../src/engineering.js';
import {frameInstances} from '../src/frameLayout.js';
import {jointProposals,jointInstances} from '../src/jointLayout.js';
import {jointProposals as legacyJointProposals,createManufacturingPackage} from '../src/manufacturing.js';
import {auditProductionTraceability} from '../src/traceability.js';

test('v0.4.5: one joinery registry across every family and chaise layout',()=>{
  let cases=0;
  const verify=c=>{
    const model=getEngineeringModel(c),expected=jointInstances(c,model,frameInstances(model));
    const pkg=createManufacturingPackage(c);
    assert.equal(pkg.integrity.ok,true,JSON.stringify(pkg.integrity.issues));
    assert.deepEqual(pkg.joinery,expected);
    assert.deepEqual(jointProposals(model),legacyJointProposals(model));
    assert.equal(new Set(expected.map(j=>j.id)).size,expected.length);
    assert.equal(expected.length,['headboard','bed'].includes(c.category)?1:6*model.geometry.moduleCount+(model.geometry.chaise?6:0));
    assert.equal(pkg.productionRelease.allowed,false);cases++;
  };
  for(const f of families)for(const width of [f.min,f.max])verify({...initialConfig(f.id),width});
  for(const layout of ['straight','left','right'])for(const moduleCount of [2,3,5])
    for(const arm of ['rounded','slim','none'])verify({...initialConfig(),layout,moduleCount,arm});
  for(const width of [220,260,300,360])for(const moduleCount of [2,3,4,5])
    verify({...initialConfig(),width,moduleCount});
  assert.equal(cases,53);
});
test('v0.4.5: deleted, inserted or displaced joints trigger digital integrity errors',()=>{
  const config={...initialConfig(),layout:'left'},model=getEngineeringModel(config),baseline=createManufacturingPackage(config);
  const changes=[
    p=>p.joinery.pop(),
    p=>p.joinery.push({...structuredClone(p.joinery[0]),id:'J-FORGED'}),
    p=>p.joinery[0].kind='forged-interface',
    p=>p.joinery[0].locationMm.x+=20,
    p=>p.joinery[0].partInstanceRefs.reverse(),
    p=>p.joinery[0].partRefs.reverse(),
    p=>p.joinery[0].proposedCutToleranceMm=0.1
  ];
  for(const mutate of changes){
    const pkg=structuredClone(baseline);mutate(pkg);
    const result=auditProductionTraceability(pkg,model);
    assert.equal(result.ok,false,mutate.toString());
    assert.ok(result.issues.some(i=>i.code.startsWith('JOINT')),JSON.stringify(result.issues));
  }
});
test('v0.4.5: an approved drawing metadata and roll width do not equal a cutting marker',()=>{
  const signature={status:'approved',reference:'DRAW-DEMO',revision:'A',
    approvedBy:'Demonstration only',approvedAt:'2026-10-20T00:00:00Z'};
  for(const pillows of [0,2]){
    const pkg=createManufacturingPackage({...initialConfig(),pillows},
      {patternDrawing:signature,fabric:{rollWidthMm:1800}});
    assert.equal(pkg.releaseChecks.find(g=>g.id==='UPHOLSTERY').passed,false);
    assert.equal(pkg.upholstery.markerLengthMm??null,null);
    assert.ok(pkg.productionRelease.blockers.includes('UPHOLSTERY'));
    assert.equal(pkg.productionRelease.allowed,false);
  }
});
