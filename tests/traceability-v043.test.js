import test from 'node:test';
import assert from 'node:assert/strict';
import {families,initialConfig,estimate} from '../src/domain.js';
import {getEngineeringModel} from '../src/engineering.js';
import {softInstances} from '../src/softLayout.js';
import {auditProductionTraceability} from '../src/traceability.js';
import {createManufacturingPackage} from '../src/manufacturing.js';
import {buildInspectionAssembly} from '../src/EngineeringAssembly.js';
import {defaultProfile} from '../src/costing.js';

function verify(c){
  const model=getEngineeringModel(c),pkg=createManufacturingPackage(c);
  assert.deepEqual(pkg.integrity.issues,[],JSON.stringify(c));
  assert.equal(pkg.integrity.ok,true);
  assert.equal(pkg.productionRelease.allowed,false);
  assert.ok(pkg.productionRelease.blockers.includes('AUTHORITY'));
  const group=buildInspectionAssembly(c);
  try{
    const soft=softInstances(model);
    assert.equal(group.children.filter(x=>x.userData.part==='filling').length,soft.length);
    for(const p of soft){
      const mesh=group.getObjectByName(p.sceneNodeRef);
      assert.ok(mesh,p.sceneNodeRef);
      assert.equal(mesh.userData.sourceLayer,p.layerId);
      for(const [axis,measure] of [['width','x'],['height','y'],['depth','z']])
        assert.ok(Math.abs(mesh.geometry.parameters[axis]*1000-p.sizeMm[measure])<1e-6,p.sceneNodeRef+' '+measure);
      for(const axis of ['x','y','z'])
        assert.ok(Math.abs(mesh.position[axis]*1000-p.positionMm[axis])<1e-6,p.sceneNodeRef+' '+axis);
      assert.ok(Math.abs(mesh.rotation.x*180/Math.PI-p.rotationXDeg)<1e-8);
    }
  }finally{
    group.traverse(node=>node.geometry?.dispose());
    for(const m of group.userData.materials)m.dispose();
  }
  return {model,pkg};
}
test('v0.4.3: scene, cut list, routes, soft envelopes and export share IDs for every family',()=>{
  for(const f of families)for(const width of [f.min,f.max])
    verify({...initialConfig(f.id),width});
});
test('v0.4.3: geometry registry survives chaise sides, module counts, support and foam changes',()=>{
  for(const layout of ['left','right'])for(const moduleCount of [2,3,5])
    for(const support of ['webbing','zigzag'])for(const seatCore of ['foam','pocket'])
      verify({...initialConfig(),layout,moduleCount,support,seatCore});
  verify({...initialConfig('bed'),panels:8});
});
test('v0.4.3: inflated or orphaned quantities, routes, joints and geometry fail closed',()=>{
  const c={...initialConfig(),layout:'left'},model=getEngineeringModel(c),base=createManufacturingPackage(c);
  const probes=[
    p=>{p.parts[0].sceneTransform.sizeMm.x+=10;},
    p=>{p.parts[0].nominalSizeMm.length+=1;},
    p=>{p.routing.pop();},
    p=>{p.suspension.pieces[0].positionMm.z+=100;},
    p=>{p.layers.find(l=>l.zone==='seat').sceneNodeRefs.pop();},
    p=>{p.layers.find(l=>l.zone==='seat').nominalEnvelopeVolumeM3+=1;},
    p=>{p.joinery[0].partInstanceRefs[0]='FRAME-DOES-NOT-EXIST';},
    p=>{p.hardware.find(h=>h.sceneNodeRefs.length).sceneNodeRefs[0]='GABER_PART:COLLISION';},
    p=>{p.traceability.nodeToPartId={};},
    p=>{p.productionRelease.allowed=true;}
  ];
  for(const mutate of probes){
    const p=structuredClone(base);mutate(p);
    assert.equal(auditProductionTraceability(p,model).ok,false,mutate.toString());
  }
});
test('v0.4.3: theoretical envelope quantities never convert to approved material consumption',()=>{
  const {pkg}=verify({...initialConfig(),layout:'right',pillows:2});
  const pillow=pkg.layers.find(l=>l.id==='pillow-fill');
  assert.equal(pillow.quantity,null);
  assert.equal(pillow.nominalEnvelopeVolumeM3,null);
  assert.equal(pillow.geometryStatus,'not-modelled');
  for(const l of pkg.layers.filter(l=>l.sceneNodeRefs.length)){
    assert.ok(l.nominalEnvelopeVolumeM3>0);
    if(l.nominalDensityKgM3===null)assert.equal(l.conceptEnvelopeMassKg,null);
    assert.equal(l.approval,'unreleased');
  }
  assert.ok(pkg.productionRelease.blockers.includes('SOFT_MATERIALS'));
});
test('v0.4.3: live costing changes with width/fabric and retains independent profile snapshots',()=>{
  const c=initialConfig(),p=defaultProfile();
  const a=estimate(c,0,p);
  const b=estimate({...c,width:c.width+10},0,p);
  const moreFabric=estimate({...c,fabric:'velvet'},0,p);
  assert.notEqual(a.cost,b.cost);
  assert.notEqual(a.cost,moreFabric.cost);
  const previous=JSON.stringify(a);
  p.rates.frame+=100;
  assert.notEqual(estimate(c,0,p).cost,a.cost);
  assert.equal(JSON.stringify(a),previous);
});
