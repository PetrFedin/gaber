import * as THREE from 'three';
import {getEngineeringModel} from './engineering.js';

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
  const beam=(w,d,x,y,z)=>box(w,.06,d,x,y,z,mat.beam);
  const isSeat=config.category!=='headboard'&&config.category!=='bed';
  if(isSeat){
    const n=model.geometry.moduleCount;
    const span=model.geometry.usableWidthCm/100;
    const moduleW=span/n;
    const frameD=Math.max(.05,model.geometry.frameDepthCm/100);
    const seatD=config.seatDepth/100;
    const originZ=-config.depth/200+config.backDepth/100+seatD/2;
    const yTop=model.geometry.frameTopCm/100;
    const yRail=yTop-.03;
    for(let i=0;i<n;i++){
      const x=-span/2+moduleW*(i+.5);
      for(const side of [-1,1]){
        beam(Math.max(.01,moduleW-.04),.04,x,yRail,originZ+side*(frameD/2-.02));
        beam(.04,Math.max(.01,frameD-.08),x+side*(moduleW/2-.02),yRail,originZ);
      }
      beam(Math.max(.01,moduleW-.08),.04,x,yRail,originZ);
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
      const backH=Math.max(.2,(config.height-config.seatHeight+8)/100);
      const rearZ=-config.depth/200+.12;
      const panel=box(Math.max(.02,moduleW-.035),backH,.012,x,config.seatHeight/100+backH/2-.08,rearZ,mat.birch);
      if(panel)panel.rotation.x=-config.backLeanDeg*Math.PI/180;
    }
    if(model.geometry.armCm){
      const w=config.width/100;
      for(const s of [-1,1])box(model.geometry.armCm/100-.045,Math.max(.16,config.seatHeight/100),.018,s*(w/2-model.geometry.armCm/200),config.seatHeight/200+.05,0,mat.birch);
    }
  }else if(config.category==='bed'){
    const w=config.width/100,d=config.depth/100;
    const y=.29,rail=.055;
    for(const s of [-1,1]){
      box(rail,.20,d-.10,s*(w/2-.04),y,0,mat.birch);
      box(w-.1,.20,rail,0,y,s*(d/2-.04),mat.birch);
    }
    const count=Math.max(10,Math.floor((d-.25)/.11));
    for(let i=0;i<count;i++)box(w-.16,.012,.06,0,.405,-d/2+.13+(d-.26)*(i+.5)/count,mat.beam,'support');
    const moduleW=w/config.panels;
    for(let i=0;i<config.panels;i++)box(Math.max(.02,moduleW-.014),config.height/100,.012,-w/2+moduleW*(i+.5),config.height/200,-d/2+.035,mat.birch);
  }else {
    const w=config.width/100,h=config.height/100;
    const moduleW=w/config.panels;
    for(let i=0;i<config.panels;i++){
      const x=-w/2+moduleW*(i+.5);
      box(Math.max(.02,moduleW-.012),h,.012,x,h/2,-.04,mat.birch);
      box(Math.max(.02,moduleW-.016),h,.04,x,h/2,-.005,mat.core,'filling');
    }
    for(const y of [.16,h-.16])beam(w-.08,.04,0,y,-.085);
  }
  group.userData.engineeringVersion=model.schemaVersion;
  group.userData.productionApproved=false;
  return group;
}
