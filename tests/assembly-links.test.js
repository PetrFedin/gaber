import test from 'node:test';
import assert from 'node:assert/strict';
import {initialConfig,families} from '../src/domain.js';
import {getEngineeringModel} from '../src/engineering.js';
import {createManufacturingPackage,panelPattern} from '../src/manufacturing.js';
import {buildInspectionAssembly} from '../src/EngineeringAssembly.js';

function dispose(group){
  group.traverse(node=>node.geometry?.dispose());
  for(const m of group.userData.materials)m.dispose();
}
function verifyLinks(c){
  const model=getEngineeringModel(c),pkg=createManufacturingPackage(c),group=buildInspectionAssembly(c);
  try{
    const meshes=group.children.filter(p=>p.userData.partId);
    assert.equal(meshes.length,model.cutList.reduce((n,p)=>n+p.quantity,0));
    assert.equal(meshes.length,pkg.parts.length);
    assert.equal(new Set(meshes.map(p=>p.name)).size,meshes.length);
    for(const part of pkg.parts){
      const mesh=group.getObjectByName(part.sceneNodeRef);
      assert.ok(mesh,part.partId);
      assert.equal(mesh.userData.partId,part.partId);
      const dims=mesh.geometry.parameters;
      const actual=[dims.width,dims.height,dims.depth].map(n=>Math.round(n*1000)).sort((a,b)=>a-b);
      assert.deepEqual(actual,Object.values(part.nominalSizeMm).sort((a,b)=>a-b));
      assert.ok(pkg.routing.some(r=>r.id===part.manufacturingRouteId&&r.partId===part.partId));
      for(const axis of ['x','y','z'])assert.ok(Math.abs(mesh.position[axis]*1000-part.sceneTransform.positionMm[axis])<1e-7);
    }
    for(const joint of pkg.joinery){
      assert.ok(joint.partInstanceRefs.length>=2);
      assert.equal(new Set(joint.partInstanceRefs).size,joint.partInstanceRefs.length);
      for(const id of joint.partInstanceRefs)assert.ok(pkg.parts.some(p=>p.partId===id),id);
    }
  }finally{dispose(group);}
}

test('actual Three.js frame meshes match cut-list dimensions, IDs, quantities and routes',()=>{
  for(const f of families)for(const width of [f.min,f.max])verifyLinks({...initialConfig(f.id),width});
});
test('assembly links survive module, arm, support, core and panel changes',()=>{
  for(const moduleCount of [2,5])for(const arm of ['none','slim','rounded'])
    verifyLinks({...initialConfig(),moduleCount,arm,support:'webbing',seatCore:'pocket',layout:'left'});
  verifyLinks({...initialConfig('headboard'),panels:8});
});
test('every engineering blocker propagates into manufacturing release checks',()=>{
  const c={...initialConfig(),seatDepth:70,depth:85};
  const pkg=createManufacturingPackage(c);
  for(const id of getEngineeringModel(c).productionRelease.blockingChecks)
    assert.ok(pkg.productionRelease.blockers.includes('ENGINEERING:'+id));
  assert.ok(pkg.productionRelease.blockers.includes('ENGINEERING:SEAT_ENVELOPE'));
});
test('no decorative pillows does not waive the furniture upholstery requirements',()=>{
  for(const f of families){
    const pkg=createManufacturingPackage({...initialConfig(f.id),pillows:0});
    assert.equal(pkg.upholstery.status,'none');
    assert.ok(pkg.productionRelease.blockers.includes('UPHOLSTERY'));
  }
});
test('directed textile pieces cannot rotate to hide a roll-width conflict',()=>{
  const pattern=panelPattern({...initialConfig(),pillowWidth:70,pillowHeight:20},{rollWidthMm:500});
  assert.equal(pattern.status,'does-not-fit-roll');
});
test('manufacturing export snapshots do not mutate with subsequent configuration edits',()=>{
  const c=initialConfig(),pkg=createManufacturingPackage(c),before=JSON.stringify(pkg);
  c.width=320;c.pillowColors[0]='wine';
  assert.equal(JSON.stringify(pkg),before);
  assert.notEqual(createManufacturingPackage(c).parts[0].nominalSizeMm.length,pkg.parts[0].nominalSizeMm.length);
});
