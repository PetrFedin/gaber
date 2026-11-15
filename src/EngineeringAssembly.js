import * as THREE from 'three';
import {getEngineeringModel} from './engineering.js';
import {frameInstances} from './frameLayout.js';
import {supportInstances} from './supportLayout.js';
import {softInstances} from './softLayout.js';

/**
 * Visual inspection overlay for the same design model as the technical sheet.
 * Deliberately schematic. Beam strength, spring tension, collisions and loads
 * are NOT simulated here. Dimension conversion: centimetres -> metres.
 */
export function buildInspectionAssembly(config) {
  const model=getEngineeringModel(config);
  const group=new THREE.Group();
  group.name='GABER / engineering concept cutaway';
  const mat={
    birch:new THREE.MeshStandardMaterial({color:'#c7a577',roughness:.86,metalness:0}),
    beam:new THREE.MeshStandardMaterial({color:'#966c45',roughness:.9,metalness:0}),
    metal:new THREE.MeshStandardMaterial({color:'#64757a',roughness:.42,metalness:.62}),
    core:new THREE.MeshStandardMaterial({color:'#d6ba83',roughness:1}),
    top:new THREE.MeshStandardMaterial({color:'#f2dcc1',roughness:1}),
    batting:new THREE.MeshStandardMaterial({color:'#f9f3e5',roughness:1,transparent:true,opacity:.85}),
    pocket:new THREE.MeshStandardMaterial({color:'#b9b4a6',roughness:.93})
  };
  group.userData.materials=Object.values(mat);
  const box=(w,h,d,x,y,z,material,part='frame')=>{
    if(![w,h,d,x,y,z].every(Number.isFinite)||w<=0||h<=0||d<=0)return null;
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);
    mesh.position.set(x,y,z);
    mesh.castShadow=true;
    mesh.receiveShadow=true;
    mesh.userData.part=part;
    group.add(mesh);
    return mesh;
  };
  // The same instances feed the manufacturing registry and the inspection scene.
  for(const part of frameInstances(model)){
    const s=part.sizeMm,p=part.positionMm;
    const material=part.sourceGroup.startsWith('FRAME-')&&part.sourceGroup!=='FRAME-K'?mat.beam:mat.birch;
    const mesh=box(s.x/1000,s.y/1000,s.z/1000,p.x/1000,p.y/1000,p.z/1000,material);
    mesh.name=part.sceneNodeRef;
    mesh.userData.partId=part.partId;
    mesh.userData.sourceGroup=part.sourceGroup;
    mesh.userData.geometryKind=part.geometryKind;
    mesh.rotation.x=part.rotationXDeg*Math.PI/180;
  }
  // Every soft mesh uses its exact manufacturing-registry instance.
  const softLayers=model.layers.filter(l=>l.zone==='seat');
  for(const part of softInstances(model)){
    const s=part.sizeMm,p=part.positionMm;
    const index=softLayers.findIndex(l=>l.id===part.layerId);
    const material=part.zone==='seat'
      ? part.layerId==='seat-pocket'?mat.pocket
        :part.layerId==='seat-periotek'?mat.batting:index===0?mat.core:mat.top
      :part.layerId==='back-foam'||part.layerId==='head-foam'?mat.core:mat.batting;
    const mesh=box(s.x/1000,s.y/1000,s.z/1000,p.x/1000,p.y/1000,p.z/1000,material,'filling');
    if(!mesh)throw Error('Invalid shared soft geometry: '+part.sceneNodeRef);
    mesh.name=part.sceneNodeRef;
    mesh.rotation.x=part.rotationXDeg*Math.PI/180;
    mesh.userData.sourceLayer=part.layerId;
    mesh.userData.geometryStatus='unapproved-envelope';
    mesh.userData.approved=false;
  }
  // The forward chaise supports are placeholders without verified load ratings.
  if(model.geometry.chaise){
    const ch=model.geometry.chaise,n=model.geometry.moduleCount;
    const mw=ch.moduleWidthMm/1000,cx=(ch.moduleIndex-(n-1)/2)*mw;
    const originZ=-config.depth/200+config.backDepth/100+config.seatDepth/200;
    const frontZ=originZ+model.geometry.frameDepthCm/200-.02;
    const ext=ch.extensionMm/1000;
    const footH=Math.max(.06,model.geometry.frameTopCm/100-.065);
    const supportId=config.legs==='none'?'chaisePlinth':'chaiseFoot';
    const registerSupport=(mesh,ordinal)=>{
      mesh.name='GABER_HW:'+supportId+':'+String(ordinal).padStart(3,'0');
      mesh.userData.hardwareId=supportId;
      mesh.userData.geometryStatus='unapproved-placeholder';
      mesh.userData.productionApproved=false;
    };
    if(config.legs==='none'){
      const mesh=box(Math.max(.05,mw-.12),footH,.07,cx,footH/2,frontZ+ext-.10,mat.pocket,'support');
      registerSupport(mesh,1);
    }else for(const [i,side] of [-1,1].entries()){
      const mesh=box(.045,footH,.045,cx+side*(mw/2-.09),footH/2,frontZ+ext-.10,mat.metal,'support');
      registerSupport(mesh,i+1);
    }
  }
  // Suspension, webbing and mattress slats are all placed from the same
  // manufacturing support register: never use a separate visual count.
  for(const item of supportInstances(model)){
    const p=item.positionMm,s=item.sizeMm;
    let mesh;
    if(item.kind==='webbing'||item.kind==='slat'){
      mesh=box(s.width/1000,s.height/1000,s.length/1000,
        p.x/1000,p.y/1000,p.z/1000,
        item.kind==='slat'?mat.beam:mat.pocket,'support');
    }else{
      const pts=[];
      for(let k=0;k<=18;k++){
        const fraction=k/18;
        pts.push(new THREE.Vector3(
          p.x/1000+Math.sin(k*Math.PI/2)*.015,
          p.y/1000,
          p.z/1000+(fraction-.5)*s.length/1000
        ));
      }
      const curve=new THREE.CatmullRomCurve3(pts);
      mesh=new THREE.Mesh(new THREE.TubeGeometry(curve,36,.003,4,false),mat.metal);
      mesh.userData.part='support';
      group.add(mesh);
    }
    mesh.name=item.sceneNodeRef;
    mesh.userData.supportRef=item.sceneNodeRef;
    mesh.userData.supportKind=item.kind;
    mesh.userData.approved=false;
  }
  group.userData.engineeringVersion=model.schemaVersion;
  group.userData.productionApproved=false;
  return group;
}

