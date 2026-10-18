import * as THREE from 'three';
import {getEngineeringModel} from './engineering.js';
import {frameInstances} from './frameLayout.js';

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
      const springs=Math.min(16,model.suspension.countPerModule);
      const available=Math.max(.04,moduleW-.09);
      for(let j=0;j<springs;j++){
        const sx=x-available/2+available*(j+.5)/springs;
        if(config.support==='webbing'){
          box(.055,.007,Math.max(.1,frameD-.065),sx,yTop+.005,originZ,mat.pocket,'support');
        }else{
          const pts=[];
          for(let k=0;k<=18;k++){
            const t=k/18;
            pts.push(new THREE.Vector3(sx+Math.sin(k*Math.PI/2)*.015,yTop+.011,originZ+(t-.5)*(frameD-.09)));
          }
          const path=new THREE.CatmullRomCurve3(pts);
          const coil=new THREE.Mesh(new THREE.TubeGeometry(path,36,.003,4,false),mat.metal);
          coil.userData.part='support';
          group.add(coil);
        }
      }
      let y=yTop;
      model.layers.filter(l=>l.zone==='seat').forEach((layer,j)=>{
        const t=layer.thicknessMm/1000;
        const material=layer.id==='seat-pocket'?mat.pocket:j===0?mat.core:layer.id==='seat-periotek'?mat.batting:mat.top;
        box(Math.max(.02,moduleW-.045),t,Math.max(.1,seatD-.025),x,y+t/2,originZ,material,'filling');
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
      const supportCount=Math.min(16,model.suspension.countPerModule);
      for(let j=0;j<supportCount;j++){
        const sx=cx-(mw-.09)/2+(mw-.09)*(j+.5)/supportCount;
        if(config.support==='webbing'){
          box(.055,.007,ext-.08,sx,yTop+.005,cz,mat.pocket,'support');
        }else{
          const pts=[];
          for(let k=0;k<=18;k++){
            const t=k/18;
            pts.push(new THREE.Vector3(sx+Math.sin(k*Math.PI/2)*.015,yTop+.011,cz+(t-.5)*(ext-.09)));
          }
          const curve=new THREE.CatmullRomCurve3(pts);
          const spring=new THREE.Mesh(new THREE.TubeGeometry(curve,36,.003,4,false),mat.metal);
          spring.userData.part='support';
          group.add(spring);
        }
      }
      let elevation=yTop;
      for(const [j,layer] of model.layers.filter(l=>l.zone==='seat').entries()){
        const th=layer.thicknessMm/1000;
        const material=layer.id==='seat-pocket'?mat.pocket:j===0?mat.core:layer.id==='seat-periotek'?mat.batting:mat.top;
        box(Math.max(.02,mw-.045),th,Math.max(.05,ext-.06),cx,elevation+th/2,cz,material,'filling');
        elevation+=th;
      }
      // These supports are deliberately UNTRACEABLE placeholders; vendor-rated
      // foot or plinth geometry must replace them before any manufacturing use.
      const footH=Math.max(.06,model.geometry.frameTopCm/100-.065);
      if(config.legs==='none'){
        box(Math.max(.05,mw-.12),footH,.07,cx,footH/2,frontZ+ext-.10,mat.pocket,'support');
      }else for(const side of [-1,1]){
        box(.045,footH,.045,cx+side*(mw/2-.09),footH/2,frontZ+ext-.10,mat.metal,'support');
      }
    }
  }else if(config.category==='bed'){
    const w=config.width/100,d=config.depth/100;
    const count=Math.max(10,Math.floor((d-.25)/.11));
    for(let i=0;i<count;i++)box(w-.16,.012,.06,0,.405,-d/2+.13+(d-.26)*(i+.5)/count,mat.beam,'support');
  }
  // Keep soft headboard layers visible without creating duplicate frame panels.
  for(const part of frameInstances(model).filter(p=>p.sourceGroup==='HB-P')){
    let z=part.positionMm.z+part.sizeMm.z/2;
    for(const layer of model.layers.filter(l=>l.zone==='headboard')){
      const t=layer.thicknessMm;
      box(part.sizeMm.x/1000,part.sizeMm.y/1000,t/1000,part.positionMm.x/1000,
        part.positionMm.y/1000,(z+t/2)/1000,layer.id==='head-foam'?mat.core:mat.batting,'filling');
      z+=t;
    }
  }
  group.userData.engineeringVersion=model.schemaVersion;
  group.userData.productionApproved=false;
  return group;
}

