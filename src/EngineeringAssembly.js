import * as THREE from 'three';
import {getEngineeringModel} from './engineering.js';
import {frameInstances} from './frameLayout.js';
import {supportInstances} from './supportLayout.js';

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
  const isSeat=config.category!=='headboard'&&config.category!=='bed';
  if(isSeat){
    const n=model.geometry.moduleCount;
    const span=model.geometry.usableWidthCm/100;
    const moduleW=span/n;
    const frameD=Math.max(.05,model.geometry.frameDepthCm/100);
    const seatD=config.seatDepth/100;
    const originZ=-config.depth/200+config.backDepth/100+seatD/2;
    const yTop=model.geometry.frameTopCm/100;
    for(let i=0;i<n;i++){
      const x=-span/2+moduleW*(i+.5);
      let y=yTop;
      model.layers.filter(l=>l.zone==='seat').forEach((layer,j)=>{
        const t=layer.thicknessMm/1000;
        const material=layer.id==='seat-pocket'?mat.pocket:j===0?mat.core:layer.id==='seat-periotek'?mat.batting:mat.top;
        const mesh=box(Math.max(.02,moduleW-.045),t,Math.max(.1,seatD-.025),x,y+t/2,originZ,material,'filling');
        mesh.name='GABER_SOFT:SEAT:'+(i+1)+':'+layer.id;
        mesh.userData.sourceLayer=layer.id;
        mesh.userData.approved=false;
        y+=t;
      });
    }
    // Additional fore-aft chaise support and foam use the same +650 mm
    // concept envelope as the frame instance registry, not a vendor mechanism.
    const ch=model.geometry.chaise;
    if(ch){
      const mw=ch.moduleWidthMm/1000;
      const cx=(ch.moduleIndex-(n-1)/2)*mw;
      const frontZ=originZ+frameD/2-.02;
      const ext=ch.extensionMm/1000;
      const cz=frontZ+ext/2;
      // The upholstering envelope must reach the +650 mm OUTER depth,
      // while the frame end rail remains inset 40 mm. The soft layer
      // joins the base seat at its nominal forward edge.
      const softStartZ=originZ+seatD/2;
      const softEndZ=config.depth/200+ch.outerDepthExtensionMm/1000;
      const softLength=softEndZ-softStartZ;
      const softCenterZ=(softEndZ+softStartZ)/2;
      if(!Number.isFinite(softLength)||softLength<=0)
        throw Error('Invalid chaise cushion geometry');
      let elevation=yTop;
      for(const [j,layer] of model.layers.filter(l=>l.zone==='seat').entries()){
        const th=layer.thicknessMm/1000;
        const material=layer.id==='seat-pocket'?mat.pocket:j===0?mat.core:layer.id==='seat-periotek'?mat.batting:mat.top;
        const foam=box(Math.max(.02,mw-.045),th,softLength,cx,elevation+th/2,softCenterZ,material,'filling');
        foam.name='GABER_SOFT:CHAISE:'+layer.id;
        foam.userData.sourceLayer=layer.id;
        foam.userData.approved=false;
        elevation+=th;
      }
      // Support placeholders have scene IDs, but require verified supplier
      // geometry, attachment details and safety tests before manufacture.
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
  // Upholstered back and headboard layers share physical panel instance IDs.
  // Geometry is an inspected envelope; no actual compression or folds simulated.
  for(const part of frameInstances(model).filter(p=>p.sourceGroup==='BACK-P')){
    const angle=part.rotationXDeg*Math.PI/180;
    let offsetMm=part.sizeMm.z/2;
    for(const layer of model.layers.filter(l=>l.zone==='back')){
      const t=layer.thicknessMm;
      const distance=(offsetMm+t/2)/1000;
      const nx=-Math.sin(angle),nz=Math.cos(angle);
      const mesh=box(part.sizeMm.x/1000,part.sizeMm.y/1000,t/1000,
        part.positionMm.x/1000,part.positionMm.y/1000+nx*distance,
        part.positionMm.z/1000+nz*distance,
        layer.id==='back-foam'?mat.core:mat.batting,'filling');
      mesh.rotation.x=angle;
      mesh.name='GABER_SOFT:BACK:'+part.partId+':'+layer.id;
      mesh.userData.sourceLayer=layer.id;
      mesh.userData.approved=false;
      offsetMm+=t;
    }
  }
  for(const part of frameInstances(model).filter(p=>p.sourceGroup==='HB-P')){
    let z=part.positionMm.z+part.sizeMm.z/2;
    for(const layer of model.layers.filter(l=>l.zone==='headboard')){
      const t=layer.thicknessMm;
      const mesh=box(part.sizeMm.x/1000,part.sizeMm.y/1000,t/1000,part.positionMm.x/1000,
        part.positionMm.y/1000,(z+t/2)/1000,layer.id==='head-foam'?mat.core:mat.batting,'filling');
      mesh.name='GABER_SOFT:HEADBOARD:'+part.partId+':'+layer.id;
      mesh.userData.sourceLayer=layer.id;
      mesh.userData.approved=false;
      z+=t;
    }
  }
  group.userData.engineeringVersion=model.schemaVersion;
  group.userData.productionApproved=false;
  return group;
}

