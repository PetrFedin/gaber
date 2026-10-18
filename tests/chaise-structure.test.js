import test from 'node:test';
import assert from 'node:assert/strict';
import {initialConfig,dimensions,estimate} from '../src/domain.js';
import {getEngineeringModel} from '../src/engineering.js';
import {frameInstances} from '../src/frameLayout.js';
import {createManufacturingPackage} from '../src/manufacturing.js';
import {buildInspectionAssembly} from '../src/EngineeringAssembly.js';

const padded=n=>String(n).padStart(3,'0');
const c=(layout='straight',patch={})=>({...initialConfig('sofa'),layout,...patch});

function checkScene(configuration){
  const engineering=getEngineeringModel(configuration);
  const manufacturing=createManufacturingPackage(configuration);
  const group=buildInspectionAssembly(configuration);
  try{
    const instances=frameInstances(engineering);
    const physicalMeshes=group.children.filter(x=>x.userData.partId);
    assert.equal(instances.length,manufacturing.parts.length);
    assert.equal(physicalMeshes.length,manufacturing.parts.length);
    assert.equal(new Set(physicalMeshes.map(x=>x.name)).size,physicalMeshes.length);
    for(const item of manufacturing.parts){
      const mesh=group.getObjectByName(item.sceneNodeRef);
      assert.ok(mesh,item.sceneNodeRef);
      assert.equal(mesh.userData.partId,item.partId);
      for(const axis of ['x','y','z'])
        assert.ok(Math.abs(mesh.position[axis]*1000-item.sceneTransform.positionMm[axis])<1e-7);
      const meshDimensions=[mesh.geometry.parameters.width,mesh.geometry.parameters.height,mesh.geometry.parameters.depth]
        .map(x=>Math.round(x*1000)).sort((a,b)=>a-b);
      assert.deepEqual(meshDimensions,Object.values(item.nominalSizeMm).sort((a,b)=>a-b));
      assert.ok(manufacturing.routing.some(r=>r.id===item.manufacturingRouteId&&r.partId===item.partId));
    }
    for(const joint of manufacturing.joinery){
      assert.equal(joint.partInstanceRefs.length,new Set(joint.partInstanceRefs).size);
      assert.ok(joint.partInstanceRefs.every(id=>manufacturing.parts.some(p=>p.partId===id)),joint.id);
    }
    for(const item of manufacturing.hardware)for(const ref of item.sceneNodeRefs){
      const mesh=group.getObjectByName(ref);
      assert.ok(mesh,'Unlinked hardware mesh: '+ref);
      assert.equal(mesh.userData.hardwareId,item.hardwareId);
      assert.equal(mesh.userData.productionApproved,false);
    }
    const documentedRefs=new Set(manufacturing.hardware.flatMap(h=>h.sceneNodeRefs));
    for(const placeholder of group.children.filter(n=>n.userData.hardwareId))
      assert.ok(documentedRefs.has(placeholder.name),'Undocumented hardware mesh: '+placeholder.name);
    const seenLayers=new Set();
    for(const layer of manufacturing.layers){
      if(['seat','back','headboard'].includes(layer.zone))assert.ok(layer.sceneNodeRefs.length>0,layer.id);
      for(const ref of layer.sceneNodeRefs){
        const mesh=group.getObjectByName(ref);
        assert.ok(mesh,'Missing physical filling mesh: '+ref);
        assert.equal(mesh.userData.sourceLayer,layer.id);
        assert.equal(mesh.userData.approved,false);
        assert.ok(!seenLayers.has(ref),'Duplicated filling ID: '+ref);
        seenLayers.add(ref);
      }
    }
    const visibleLayers=group.children.filter(mesh=>mesh.userData.sourceLayer);
    assert.equal(visibleLayers.length,seenLayers.size);
    for(const mesh of visibleLayers)assert.ok(seenLayers.has(mesh.name));
    if(engineering.geometry.chaise)for(const layer of engineering.layers.filter(l=>l.zone==='seat')){
      const foam=group.getObjectByName('GABER_SOFT:CHAISE:'+layer.id);
      assert.ok(foam);
      const forwardEdge=foam.position.z+foam.geometry.parameters.depth/2;
      assert.ok(Math.abs(forwardEdge-(configuration.depth/200+0.65))<1e-7,'Cushion exterior envelope mismatch');
    }
    assert.equal(manufacturing.productionRelease.allowed,false);
    return {engineering,manufacturing};
  }finally{
    group.traverse(mesh=>mesh.geometry?.dispose());
    for(const material of group.userData.materials)material.dispose();
  }
}

test('straight frame has no chaise parts, left/right adds six unique frame parts',()=>{
  const base=checkScene(c('straight'));
  for(const layout of ['left','right']){
    const ext=checkScene(c(layout));
    assert.equal(dimensions(c(layout)).depth,dimensions(c()).depth+65);
    assert.equal(ext.manufacturing.parts.length,base.manufacturing.parts.length+6);
    assert.equal(ext.manufacturing.joinery.length,base.manufacturing.joinery.length+6);
    assert.equal(ext.engineering.geometry.chaise.side,layout);
    for(const [id,quantity] of [['CHAISE-F',1],['CHAISE-S',2],['CHAISE-X',1],['CHAISE-K',2]])
      assert.equal(ext.engineering.cutList.find(p=>p.id===id)?.quantity,quantity);
    assert.ok(ext.manufacturing.productionRelease.blockers.includes('ENGINEERING:CHAISE_LOAD_PATH'));
    assert.ok(ext.manufacturing.productionRelease.blockers.includes('ENGINEERING:CHAISE_SUPPORT'));
    assert.ok(ext.manufacturing.hardware.some(p=>p.hardwareId==='chaiseFoot'));
    assert.ok(estimate(c(layout)).cost>estimate(c()).cost);
  }
});

test('chaise rail reaches the outer depth envelope with a declared 40 mm inset',()=>{
  for(const layout of ['left','right']){
    const m=createManufacturingPackage(c(layout));
    const n=m.sourceConfig.moduleCount;
    const ci=layout==='left'?0:n-1;
    const front=m.parts.find(p=>p.partId==='FRAME-F-'+padded(ci*2+2));
    const extended=m.parts.find(p=>p.partId==='CHAISE-F-001');
    assert.ok(front&&extended);
    const g=getEngineeringModel(c(layout)).geometry.chaise;
    assert.ok(Math.abs(extended.sceneTransform.positionMm.z-front.sceneTransform.positionMm.z-g.extensionMm)<0.001);
    assert.ok(Math.abs(extended.sceneTransform.positionMm.z-(c(layout).depth*5+650-40))<0.001);
    assert.equal(g.outerDepthExtensionMm,650);
    assert.equal(g.frontRailInsetMm,40);
    const cx=extended.sceneTransform.positionMm.x;
    assert.ok(layout==='left'?cx<0:cx>0);
    for(const joint of m.joinery.filter(j=>j.id.startsWith('J-CHAISE-'))){
      assert.ok(joint.partInstanceRefs.length>=2);
      assert.ok(joint.partInstanceRefs.every(ref=>m.parts.some(p=>p.partId===ref)));
    }
  }
});

test('chaise frame and joinery remain connected across width, modules, arm and support options',()=>{
  for(const layout of ['left','right'])
    for(const width of [220,280,360])
      for(const moduleCount of [2,5])
        for(const arm of ['rounded','none']){
          checkScene(c(layout,{width,moduleCount,arm,support:'webbing',seatCore:'pocket'}));
        }
});

test('structural extension is recalculated when base depth and cushion setback change',()=>{
  for(const depth of [85,100,125])for(const seatDepth of [45,55,70]){
    const config=c('left',{depth,seatDepth});
    const m=createManufacturingPackage(config);
    const end=m.parts.find(p=>p.partId==='CHAISE-F-001');
    const g=getEngineeringModel(config).geometry.chaise;
    assert.ok(g.extensionMm>40);
    assert.ok(Math.abs(end.sceneTransform.positionMm.z-(depth*5+650-40))<0.001);
    assert.ok(Math.abs(g.frontRailZMm-g.baseFrontRailZMm-g.extensionMm)<0.001);
  }
});

test('base frame does not silently change when toggling left/right',()=>{
  const left=createManufacturingPackage(c('left'));
  const right=createManufacturingPackage(c('right'));
  const lr=left.parts.filter(p=>!p.sourceGroup.startsWith('CHAISE-'));
  const rr=right.parts.filter(p=>!p.sourceGroup.startsWith('CHAISE-'));
  assert.deepEqual(lr,rr);
  const l=left.parts.find(p=>p.partId==='CHAISE-F-001');
  const r=right.parts.find(p=>p.partId==='CHAISE-F-001');
  assert.equal(l.sceneTransform.positionMm.x,-r.sceneTransform.positionMm.x);
});

test('chaise with plinth support is still not approved or costed as a real mechanism',()=>{
 const p=createManufacturingPackage(c('right',{legs:'none',pillows:0}));
 assert.ok(p.hardware.some(h=>h.hardwareId==='chaisePlinth'&&h.supplierSku===null));
 assert.equal(p.productionRelease.allowed,false);
 assert.ok(p.productionRelease.blockers.includes('ENGINEERING:CHAISE_SUPPORT'));
 assert.equal(p.traceability.actualCostsAvailable,false);
});
