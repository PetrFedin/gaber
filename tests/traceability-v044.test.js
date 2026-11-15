import test from 'node:test';
import assert from 'node:assert/strict';
import {families,initialConfig,estimate} from '../src/domain.js';
import {getEngineeringModel} from '../src/engineering.js';
import {frameInstances} from '../src/frameLayout.js';
import {supportInstances} from '../src/supportLayout.js';
import {softInstances} from '../src/softLayout.js';
import {auditProductionTraceability} from '../src/traceability.js';
import {createManufacturingPackage} from '../src/manufacturing.js';
import {buildInspectionAssembly} from '../src/EngineeringAssembly.js';
import {defaultProfile} from '../src/costing.js';

const near=(a,b)=>Math.abs(a-b)<1e-6;
function inspect(c){
  const model=getEngineeringModel(c),pkg=createManufacturingPackage(c);
  assert.equal(pkg.integrity.ok,true,JSON.stringify(pkg.integrity.issues));
  assert.deepEqual(pkg.integrity.issues,[]);
  assert.equal(pkg.productionRelease.allowed,false);
  assert.ok(pkg.productionRelease.blockers.includes('AUTHORITY'));
  return {model,pkg};
}
test('v0.4.4: validate traceability on 190 family and width/module/arm cases',()=>{
  let count=0;
  for(const family of families)for(const width of [family.min,family.max]){
    inspect({...initialConfig(family.id),width});count++;
  }
  for(const width of [220,230,240,250,260,270,280,290,300,310,320,330,340,350,360])
    for(const moduleCount of [2,3,4,5])for(const arm of ['rounded','slim','none']){
      inspect({...initialConfig(),width,moduleCount,arm});count++;
    }
  assert.equal(count,190);
});
test('v0.4.4: module centers agree for frame, support and soft even with rounded width',()=>{
  for(const width of [230,250,280,330])for(const moduleCount of [3,4,5]){
    const {model}=inspect({...initialConfig(),width,moduleCount,arm:'slim',support:'webbing'});
    const cross=frameInstances(model).filter(p=>p.sourceGroup==='FRAME-X');
    const soft=softInstances(model),supports=supportInstances(model);
    assert.equal(cross.length,moduleCount);
    for(let i=0;i<moduleCount;i++){
      const x=cross[i].positionMm.x;
      const node=soft.find(p=>p.sceneNodeRef==='GABER_SOFT:SEAT:'+(i+1)+':seat-core');
      assert.ok(node);assert.ok(near(node.positionMm.x,x));
      const items=supports.filter(p=>p.location==='seat'&&p.moduleIndex===i);
      assert.ok(items.length>0);
      assert.ok(near(items.reduce((a,p)=>a+p.positionMm.x,0)/items.length,x));
    }
  }
});
test('v0.4.4: real Three.js frames and soft layer nodes match exported dimensions',()=>{
  const cases=[...families.flatMap(f=>[f.min,f.max].map(width=>({...initialConfig(f.id),width})))];
  cases.push(...['left','right'].flatMap(layout=>[2,3,5].map(moduleCount=>({
    ...initialConfig(),layout,moduleCount,support:'webbing',seatCore:'pocket'
  }))));
  for(const c of cases){
    const {model,pkg}=inspect(c),group=buildInspectionAssembly(c);
    try{
      for(const p of pkg.parts){
        const mesh=group.getObjectByName(p.sceneNodeRef);
        assert.ok(mesh,p.sceneNodeRef);assert.equal(mesh.userData.partId,p.partId);
      }
      const soft=softInstances(model);
      assert.equal(group.children.filter(n=>n.userData.part==='filling').length,soft.length);
      for(const p of soft){
        const mesh=group.getObjectByName(p.sceneNodeRef);
        assert.ok(mesh,p.sceneNodeRef);
        assert.equal(mesh.userData.sourceLayer,p.layerId);
        for(const [a,dim] of [['x','width'],['y','height'],['z','depth']]){
          assert.ok(near(mesh.position[a]*1000,p.positionMm[a]),p.sceneNodeRef);
          assert.ok(near(mesh.geometry.parameters[dim]*1000,p.sizeMm[a]),p.sceneNodeRef);
        }
        assert.ok(near(mesh.rotation.x*180/Math.PI,p.rotationXDeg));
      }
      for(const s of pkg.suspension.pieces)assert.ok(group.getObjectByName(s.sceneNodeRef));
      for(const h of pkg.hardware)for(const id of h.sceneNodeRefs)
        assert.ok(group.getObjectByName(id));
    }finally{
      group.traverse(node=>node.geometry?.dispose());
      for(const mat of group.userData.materials)mat.dispose();
    }
  }
});
test('v0.4.4: damaged geometry, operations, refs and unauthorized release are rejected',()=>{
  const c={...initialConfig(),layout:'left'},model=getEngineeringModel(c),base=createManufacturingPackage(c);
  const mutations=[
    p=>p.suspension.pieces[0].sizeMm.width++,
    p=>p.suspension.pieces[0].positionMm.x++,
    p=>p.layers[0].envelopes[0].positionMm.z++,
    p=>p.layers[0].envelopes[0].sizeMm.x++,
    p=>p.layers[0].nominalEnvelopeVolumeM3++,
    p=>p.parts[0].sceneTransform.sizeMm.x++,
    p=>p.routing.pop(),
    p=>p.joinery[0].partInstanceRefs[0]='MISSING-PART',
    p=>p.traceability.softNodeCount++,
    p=>p.productionRelease.allowed=true
  ];
  for(const mutate of mutations){
    const pkg=structuredClone(base);mutate(pkg);
    const audit=auditProductionTraceability(pkg,model);
    assert.equal(audit.ok,false,mutate.toString());assert.ok(audit.issues.length>0);
  }
});
test('v0.4.4: conceptual BOM and mutable demo rates cannot authorize factory costs',()=>{
  const c={...initialConfig(),layout:'right'},pkg=createManufacturingPackage(c);
  assert.ok(pkg.layers.some(l=>l.envelopes.length>0&&l.nominalEnvelopeVolumeM3>0));
  assert.ok(pkg.layers.every(l=>l.costRUB===null&&l.approval==='unreleased'));
  assert.ok(pkg.parts.every(p=>p.unitCostRUB===null&&p.approval==='unreleased'));
  assert.equal(pkg.traceability.actualCostsAvailable,false);
  assert.ok(pkg.productionRelease.blockers.includes('PRICE'));
  const rates=defaultProfile(),prior=estimate(c,0,rates),unchanged=JSON.stringify(prior);
  rates.rates.frame+=100;
  assert.notEqual(estimate(c,0,rates).cost,prior.cost);
  assert.equal(JSON.stringify(prior),unchanged);
  assert.equal(pkg.productionRelease.allowed,false);
});
