import {frameInstances} from './frameLayout.js';
import {supportInstances} from './supportLayout.js';
import {softInstances} from './softLayout.js';
import {jointInstances} from './jointLayout.js';

export const TRACEABILITY_AUDIT_VERSION='gaber-traceability-audit/0.4.5';
const round6=n=>Math.round(n*1000000)/1000000;
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const sorted=a=>[...a].sort();
const unique=a=>new Set(a).size===a.length;

/**
 * Checks the digital identity/geometry/route contract only.
 * A green audit never validates joinery loads, factory measurements, safety or pricing.
 */
export function auditProductionTraceability(pkg,model){
  const issues=[],record=(code,detail)=>issues.push({code,detail});
  if(!pkg||!model||!pkg.traceability||!Array.isArray(pkg.parts))
    return {schemaVersion:TRACEABILITY_AUDIT_VERSION,ok:false,issues:[{code:'BAD_PACKAGE',detail:'Manufacturing package is missing'}]};
  const frame=frameInstances(model),supports=supportInstances(model),soft=softInstances(model);
  const parts=pkg.parts, supportParts=pkg.suspension?.pieces||[],layers=pkg.layers||[],
    routes=pkg.routing||[],hardware=pkg.hardware||[],joints=pkg.joinery||[];
  const compareIds=(kind,expected,actual)=>{
    if(!unique(actual))record(kind+'_DUPLICATE','Duplicate scene or manufacturing identifiers');
    if(!same(sorted(expected),sorted(actual)))record(kind+'_MISMATCH','Expected and exported identifiers differ');
  };
  const validPos=p=>p&&['x','y','z'].every(k=>typeof p[k]==='number'&&Number.isFinite(p[k]));
  const validBoxSize=s=>validPos(s)&&Object.values(s).every(n=>n>0);
  const validSupportSize=s=>s&&['width','height','length'].every(k=>
    typeof s[k]==='number'&&Number.isFinite(s[k])&&s[k]>0);
  if(!same(pkg.sourceConfig,model.source.configuration))record('CONFIG_SOURCE','Exported configuration differs from engineering source');
  if(!same(pkg.envelopeCm,model.envelopeCm))record('ENVELOPE','Product envelope differs from engineering source');
  compareIds('FRAME',frame.map(p=>p.partId),parts.map(p=>p.partId));
  compareIds('ROUTE',frame.map(p=>'RT-'+p.partId),routes.map(r=>r.id));
  compareIds('SUPPORT',supports.map(s=>s.sceneNodeRef),supportParts.map(s=>s.sceneNodeRef));
  compareIds('SOFT_LAYER',model.layers.map(l=>l.id),layers.map(l=>l.id));
  compareIds('HARDWARE',model.hardware.map(h=>h.id),hardware.map(h=>h.hardwareId));
  const partById=new Map(parts.map(p=>[p.partId,p]));
  for(const expected of frame){
    const part=partById.get(expected.partId);
    if(!part)continue;
    const row=model.cutList.find(r=>r.id===expected.sourceGroup);
    if(part.sourceGroup!==expected.sourceGroup ||
       part.sceneNodeRef!==expected.sceneNodeRef ||
       !same(part.sceneTransform,expected) ||
       !same(part.nominalSizeMm,row?.sizeMm) ||
       !same(sorted(Object.values(part.sceneTransform?.sizeMm||{})),sorted(Object.values(row?.sizeMm||{}))) ||
       !validBoxSize(part.sceneTransform?.sizeMm) || !validPos(part.sceneTransform?.positionMm))
      record('FRAME_GEOMETRY',expected.partId+' differs from model or cut list');
    if(part.manufacturingRouteId!=='RT-'+part.partId)
      record('FRAME_ROUTE_REF',expected.partId+' has an invalid route');
  }
  for(const route of routes){
    const part=partById.get(route.partId);
    if(!part||part.manufacturingRouteId!==route.id ||
       !Array.isArray(route.operations)||!['CUT','DRILL-JOIN','QC-DIM'].every(code=>route.operations.some(o=>o.code===code)))
      record('ROUTE_OPERATIONS',route.id+' lacks an associated part or process operations');
  }
  const supportById=new Map(supportParts.map(p=>[p.sceneNodeRef,p]));
  for(const expected of supports){
    const item=supportById.get(expected.sceneNodeRef);
    if(!item)continue;
    if(item.kind!==expected.kind || item.moduleIndex!==expected.moduleIndex ||
       item.location!==expected.location || !same(item.positionMm,expected.positionMm) ||
       !same(item.sizeMm,expected.sizeMm)||!validPos(item.positionMm)||!validSupportSize(item.sizeMm))
      record('SUPPORT_GEOMETRY',expected.sceneNodeRef+' differs from scene layout');
  }
  if(pkg.suspension?.partCount!==supports.length ||
     pkg.traceability?.supportPartCount!==supports.length)
    record('SUPPORT_COUNT','Support part counters do not match');
  const softByLayer=new Map(model.layers.map(l=>[l.id,soft.filter(x=>x.layerId===l.id)]));
  for(const source of model.layers){
    const recordLayer=layers.find(l=>l.id===source.id);
    if(!recordLayer)continue;
    const expected=softByLayer.get(source.id);
    compareIds('SOFT_'+source.id,expected.map(s=>s.sceneNodeRef),recordLayer.sceneNodeRefs||[]);
    const expectedEnvelopes=expected.map(p=>({
      sceneNodeRef:p.sceneNodeRef,sizeMm:p.sizeMm,positionMm:p.positionMm,
      rotationXDeg:p.rotationXDeg,geometryKind:p.geometryKind
    }));
    if(!same(recordLayer.envelopes,expectedEnvelopes))
      record('SOFT_TRANSFORMS',source.id+' has mismatched per-instance dimensions or positions');
    const volumeM3=expected.reduce((sum,s)=>sum+s.sizeMm.x*s.sizeMm.y*s.sizeMm.z,0)/1e9;
    const mass=Number.isFinite(source.densityKgM3)&&source.densityKgM3>0
      ?round6(volumeM3*source.densityKgM3):null;
    if(recordLayer.zone!==source.zone ||
       recordLayer.thicknessMm!==source.thicknessMm ||
       recordLayer.nominalEnvelopeVolumeM3!==(expected.length?round6(volumeM3):null) ||
       recordLayer.conceptEnvelopeMassKg!==mass ||
       recordLayer.quantity!==(expected.length||null))
      record('SOFT_QUANTITY',source.id+' has inconsistent layer volume, quantity or thickness');
  }
  const refs=[
    ...parts.map(p=>p.sceneNodeRef),...supportParts.map(p=>p.sceneNodeRef),
    ...layers.flatMap(l=>l.sceneNodeRefs||[]),...hardware.flatMap(h=>h.sceneNodeRefs||[])
  ];
  if(!unique(refs)||refs.some(x=>typeof x!=='string'||!x))
    record('SCENE_NODE_COLLISION','3D scene references collide or are missing');
  const hardwareSource=new Map(model.hardware.map(h=>[h.id,h]));
  for(const item of hardware){
    const expected=hardwareSource.get(item.hardwareId);
    if(!expected)continue;
    if(item.quantity!==expected.qty)record('HARDWARE_COUNT',item.hardwareId+' quantity mismatch');
    const shouldRender=['chaiseFoot','chaisePlinth'].includes(item.hardwareId);
    const wanted=shouldRender?Array.from({length:expected.qty},(_,i)=>
      'GABER_HW:'+item.hardwareId+':'+String(i+1).padStart(3,'0')):[];
    if(!same(item.sceneNodeRefs,wanted)||
       item.geometryStatus!==(shouldRender?'unapproved-placeholder':'not-modelled'))
      record('HARDWARE_SCENE',item.hardwareId+' placeholder geometry mismatch');
  }
  const expectedJoints=jointInstances(model.source.configuration,model,frame);
  compareIds('JOINT',expectedJoints.map(j=>j.id),joints.map(j=>j.id));
  const jointById=new Map(joints.map(j=>[j.id,j]));
  for(const expected of expectedJoints){
    const actual=jointById.get(expected.id);
    if(!actual)continue;
    for(const key of ['kind','partRefs','partInstanceRefs','locationMm',
      'nominalJointGapMm','proposedCutToleranceMm','worstCaseRemainingGapMm'])
      if(!same(actual[key]??null,expected[key]??null))
        record('JOINT_GEOMETRY',expected.id+' mismatches '+key);
  }
  if(!unique(joints.map(j=>j.id)))record('JOINT_DUPLICATE','Joint IDs must be unique');
  for(const j of joints){
    if(!Array.isArray(j.partInstanceRefs)||j.partInstanceRefs.length<2||
       !unique(j.partInstanceRefs)||j.partInstanceRefs.some(id=>!partById.has(id))||
       j.partInstanceRefs.some(id=>!j.partRefs?.includes(partById.get(id)?.sourceGroup))||
       (j.locationMm!==null&&!validPos(j.locationMm)))
      record('JOINT_LINK',j.id+' references non-existent parts or an invalid joint location');
  }
  if(pkg.traceability.partCount!==frame.length ||
     !same(pkg.traceability.linkedPartIds,parts.map(p=>p.partId))||
     !same(pkg.traceability.nodeToPartId,Object.fromEntries(parts.map(p=>[p.sceneNodeRef,p.partId])))||
     pkg.traceability.softNodeCount!==soft.length)
    record('TRACEABILITY_INDEX','Index or counters do not match source records');
  if(pkg.productionRelease?.allowed!==false)
    record('RELEASE_NOT_BLOCKED','Client-side production release must remain prohibited');
  return {
    schemaVersion:TRACEABILITY_AUDIT_VERSION,ok:issues.length===0,issues,
    counts:{frameParts:frame.length,supportParts:supports.length,softEnvelopes:soft.length,
      joints:joints.length,unmodelledSoftLayers:model.layers.filter(l=>!softByLayer.get(l.id).length).map(l=>l.id)},
    scope:'digital IDs, envelope geometry and route identity only; not factory certification'
  };
}
