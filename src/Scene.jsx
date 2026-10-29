import React,{forwardRef,useEffect,useImperativeHandle,useRef,useState} from 'react';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {SVGRenderer} from 'three/addons/renderers/SVGRenderer.js';
import {getColor,getFabric,colors} from './domain.js';
import {buildInspectionAssembly} from './EngineeringAssembly.js';
import {planSeatingPreview} from './previewLayout.js';
import {applyPhysicalBoxUv, makeUpholsteryTrim, createBolsterPillow} from './visualDetailing.js';

function texture(kind){
 const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const c=canvas.getContext('2d');c.fillStyle='#888';c.fillRect(0,0,256,256);
 let seed=1143;const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
 for(let y=0;y<256;y+=kind==='boucle'?4:2)for(let x=0;x<256;x+=kind==='boucle'?4:2){let v=100+Math.round(rand()*70);c.fillStyle=`rgb(${v},${v},${v})`;if(kind==='boucle'){c.beginPath();c.ellipse(x,y,1+rand()*2,1+rand()*2,0,0,Math.PI*2);c.fill();}else c.fillRect(x,y,kind==='velvet'?1:2,kind==='velvet'?4:1);}
 const t=new THREE.CanvasTexture(canvas);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(1,1);t.anisotropy=8;t.colorSpace=THREE.NoColorSpace;return t;
}
function release(group){const gs=new Set(),ms=new Set(),ts=new Set();group.traverse(o=>{if(o.geometry)gs.add(o.geometry);const mats=Array.isArray(o.material)?o.material:[o.material];mats.filter(Boolean).forEach(m=>{ms.add(m);for(const v of Object.values(m))if(v?.isTexture)ts.add(v);});});for(const m of group.userData.materials||[]){ms.add(m);for(const v of Object.values(m))if(v?.isTexture)ts.add(v);}gs.forEach(x=>x.dispose());ms.forEach(x=>x.dispose());ts.forEach(x=>x.dispose());}
function furniture(config,simplified=false){
 if(config.exploded) return buildInspectionAssembly(config);
 const group=new THREE.Group(),col=getColor(config),fab=getFabric(config),bump=texture(fab.texture);
 const preview=['sofa','chair','chairbed'].includes(config.category)?planSeatingPreview(config):null;
 const cloth=new THREE.MeshPhysicalMaterial({color:col.hex,roughness:fab.roughness,metalness:0,sheen:fab.sheen,sheenColor:new THREE.Color(col.hex).lerp(new THREE.Color('#ffffff'),.22),sheenRoughness:.8,bumpMap:bump,bumpScale:fab.texture==='boucle'?.0022:fab.texture==='leather'?.0008:.00055});
 const darker=cloth.clone();darker.color.multiplyScalar(.9);
 const zone=id=>{const m=cloth.clone(),color=colors.find(x=>x.id===id);if(color)m.color.set(color.hex);return m;};
 const seatCloth=zone(config.seatColor),backCloth=zone(config.backColor),armCloth=zone(config.armColor);group.userData.materials=[cloth,darker,seatCloth,backCloth,armCloth];
 const timber=new THREE.MeshStandardMaterial({color:'#876345',roughness:.75});
 const radius=config.shape==='linear'?.025:config.shape==='organic'?.16:.08;
 const wood=new THREE.MeshStandardMaterial({color:config.legs==='wood'?'#785339':config.legs==='black'?'#343531':'#9c7b43',roughness:config.legs==='brass'?.3:.65,metalness:config.legs==='wood'?0:.65});
 const stitchColor='#'+new THREE.Color(col.hex).multiplyScalar(.64).getHexString();
 group.userData.materials.push(timber,wood);
 const box=(w,h,d,x,y,z,material=cloth,r=.08,part='seat')=>{
  const g=new RoundedBoxGeometry(w,h,d,simplified?1:5,Math.min(config.shape==='linear'?.02:config.shape==='organic'?r*1.5:r,w/3,h/3,d/3));
  if(material?.isMeshPhysicalMaterial)applyPhysicalBoxUv(g,{widthM:w,heightM:h,depthM:d,tileMm:fab.scale});
   const m=new THREE.Mesh(g,material);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;m.userData.part=part;group.add(m);return m;
 };
 const leg=(x,z)=>{if(config.legs==='none')return;const m=new THREE.Mesh(new THREE.CylinderGeometry(.027,.019,.155,16),wood);m.position.set(x,.09,z);m.castShadow=true;m.userData.part='legs';group.add(m);};
 const trim=(mesh,w,h,d,face='top',r=.06)=>{if(config.seam!=='none')mesh.add(makeUpholsteryTrim({widthM:w,heightM:h,depthM:d,face,mode:config.seam,radiusM:r,color:stitchColor,simplified}));};
 const w=config.width/100,depth=config.depth/100;
 if(config.category==='headboard'){
  const h=config.height/100,n=config.panels;
  box(w,.10,.16,0,.16,0,darker,.025,'back');
  for(let i=0;i<n;i++){const ph=h-(config.backShape==='arched'?Math.abs(i-(n-1)/2)*.07:0);const panel=box(w/n-.012,ph,depth,-w/2+w/n*(i+.5),ph/2,config.exploded?i*.025:0,backCloth,radius,'back');trim(panel,w/n-.012,ph,depth,'front',radius);}
  if(config.backShape==='winged')for(const side of [-1,1])box(.12,h,.35,side*w/2,h/2,.12,backCloth,radius,'back');
  if(config.lamps)for(const x of [-w*.35,w*.35])box(.05,.45,.05,x,h*.75,.22,timber,.02,'back');
  if(config.charging)box(.12,.07,.025,w*.35,.35,depth/2+.02,timber,.01,'back');
  leg(-w*.35,0);leg(w*.35,0);
  return group;
 }
 if(config.category==='bed'){
  box(w,.32,depth,0,.30,.0,darker,.09,'seat');
  const mattress=new THREE.MeshStandardMaterial({color:'#e9e4d8',roughness:1});
  box(w-.13,.22,depth-.22,0,config.storage&&config.exploded?.92:.57,.03,mattress,.09,'seat');
  for(let i=0;i<config.panels;i++){const ph=config.height/100-(config.backShape==='arched'?Math.abs(i-(config.panels-1)/2)*.06:0);const panel=box(w/config.panels-.012,ph,.16,-w/2+w/config.panels*(i+.5),ph/2,-depth/2,backCloth,radius,'back');trim(panel,w/config.panels-.012,ph,.16,'front',radius);}
  if(config.backShape==='winged')for(const side of [-1,1])box(.1,config.height/100,.35,side*w/2,config.height/200,-depth/2+.12,backCloth,radius,'back');
  for(const x of [-w/2+.15,w/2-.15])for(const z of [-depth/2+.14,depth/2-.14])leg(x,z);
  for(let i=0;i<config.pillows;i++){
    const pw=config.pillowWidth/100,ph=config.pillowHeight/100,x=-w*.3+(i%3)*w*.3,material=zone(config.pillowColors[i]);
    if(config.pillowShape==='bolster'){
      const p=createBolsterPillow({widthM:pw,diameterM:ph,material,threadColor:stitchColor,tileMm:fab.scale});
      p.position.set(x,.74+ph/2,-depth/2+.4);group.add(p);
    }else{
      const p=box(pw,config.pillowShape==='lumbar'?ph*.65:ph,.14,x,.8,-depth/2+.4,material,.06,'pillow');
      trim(p,pw,config.pillowShape==='lumbar'?ph*.65:ph,.14,'front',.06);
    }
   }
  if(config.charging)box(.14,.08,.035,w*.38,.8,-depth/2+.1,timber,.01,'back');
  if(config.lamps)for(const x of [-w*.42,w*.42]){box(.025,.5,.025,x,1.15,-depth/2+.12,timber,.01,'back');box(.15,.08,.1,x,1.4,-depth/2+.15,mattress,.02,'back');}
  return group;
 }
 const arm=config.arm==='none'?0:config.arm==='slim'?.12:.23,inner=w-arm*2;
 const count=['chair','chairbed'].includes(config.category)?1:config.moduleCount,seatW=inner/count;
 if(config.legs==='none')box(w-.2,.14,depth-.2,0,.08,0,darker,.03,'legs');
 const chaise=config.category==='sofa'&&config.layout!=='straight';
 const seatH=preview.seat.thicknessM,seatY=preview.seat.centerYM,seatTop=preview.seat.topM;
  box(w-.08,preview.base.heightM,depth-.09,0,preview.base.centerYM,0,darker,.08,'seat');
 for(let i=0;i<count;i++){
  const x=-inner/2+seatW*(i+.5),extended=chaise&&((config.layout==='left'&&i===0)||(config.layout==='right'&&i===count-1));
  const sd=preview.seat.depthM+(extended?.65:0),z=preview.seat.centerZM+(extended?.325:0);
  const seat=box(seatW-.025,seatH,sd,x+(config.exploded?(i-(count-1)/2)*.12:0),seatY,z+(config.expanded?.4:0),seatCloth,radius,'seat');trim(seat,seatW-.025,seatH,sd,'top',radius);
  const backHeight=preview.back.heightM;
  const bh=Math.max(.20,backHeight-(config.backShape==='arched'?.10*Math.abs(i-(count-1)/2)/count:0));const back=box(seatW-.028,bh,config.backDepth/100,x,preview.back.centerYM-(backHeight-bh)/2+(config.exploded?.3:0),preview.back.centerZM-(config.exploded?.3:0),backCloth,radius,'back');back.rotation.x=preview.back.leanRad;trim(back,seatW-.028,bh,config.backDepth/100,'front',radius);
 }
 if(arm){for(const side of [-1,1]){const a=box(arm,preview.arm.heightM,depth,side*(w/2-arm/2),preview.arm.centerYM,0,armCloth,config.arm==='slim'?.045:radius*1.3,'arm');trim(a,arm,preview.arm.heightM,depth,'top',.035);a.rotation.z=side*.012;}}
 for(const x of [-w/2+.15,w/2-.15])for(const z of [-depth/2+.14,depth/2-.14])leg(x,z);
 if(chaise){const x=(config.layout==='left'?-1:1)*(inner/2-seatW/2);box(seatW-.04,preview.base.heightM,.67,x,preview.base.centerYM,depth/2+.29,darker,.07);for(const lx of [x-seatW*.35,x+seatW*.35])leg(lx,depth/2+.53);}
 if(config.backShape==='winged')for(const side of [-1,1])box(.12,.45,.35,side*(inner/2),.70,-depth/2+.25,backCloth,radius,'back');
 if(config.woodArms)for(const side of [-1,1])box(arm+.025,.045,depth*.75,side*(w/2-arm/2),preview.arm.topM+.02,0,timber,.02,'arm');
 if(config.charging)box(.13,.07,.035,w/2-arm/2,preview.arm.topM+.05,.12,timber,.01,'arm');
 if(config.lamps){box(.025,.55,.025,-w/2+.08,.96,-depth/2+.12,timber,.01,'arm');box(.18,.08,.14,-w/2+.08,1.23,-depth/2+.16,new THREE.MeshStandardMaterial({color:'#e7d7b1',emissive:'#987c35',emissiveIntensity:.3}),.03,'arm');}
 if(config.storage){box(w*.72,.10,depth*.6,0,preview.base.centerYM,.08,timber,.02,'seat');}
 if(config.expanded&&config.mechanism!=='none'){box(inner,seatH,config.mechanism==='recliner'?.5:.9,0,seatY,depth/2+.4,seatCloth,radius,'seat');for(const x of [-inner*.4,inner*.4])leg(x,depth/2+.75);}
 // Double stitching is now attached to each actual cushion rather than floating in world space.
 for(let i=0;i<config.pillows;i++){
  const n=Math.min(config.pillows,8),x=n===1?0:-inner*.36+i*(inner*.72/(n-1));
  const ph=config.pillowHeight/100*(config.pillowShape==='lumbar'?.65:1),pw=config.pillowWidth/100,material=zone(config.pillowColors[i]);
   if(config.pillowShape==='bolster'){
     const p=createBolsterPillow({widthM:pw,diameterM:ph,material,threadColor:stitchColor,tileMm:fab.scale});
     p.position.set(x,seatTop+ph/2+.015,-depth/2+.4);p.rotation.set(-.18,0,(i%2===0?1:-1)*.12);group.add(p);
   }else{
     const p=box(pw,ph,.13,x,seatTop+ph*.45+(config.exploded?.35:0),-depth/2+.4,material,.065,'pillow');
     trim(p,pw,ph,.13,'front',.065);p.rotation.set(-.18,0,(i%2===0?1:-1)*.12);
   }
 }
 return group;
}
function addRoom(group,c,simplified=false){if(c.room==='studio')return;const dark=c.room==='loft',warm=c.room==='house';const mat=new THREE.MeshStandardMaterial({color:dark?'#8b8981':warm?'#c9b396':'#ded9ce',roughness:1}),floorMat=new THREE.MeshStandardMaterial({color:dark?'#918f87':'#b6a58b',roughness:.9});const cube=(w,h,d,x,y,z,m)=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);mesh.position.set(x,y,z);mesh.receiveShadow=true;group.add(mesh);};const rw=c.roomWidth/100,rd=c.roomDepth/100;if(!simplified)cube(rw,.03,rd,0,-.03,.2,floorMat);cube(rw,2.8,.04,0,1.38,-rd/2+.2,mat);cube(.04,2.8,rd,-rw/2,1.38,.2,mat);const art=new THREE.MeshStandardMaterial({color:dark?'#4f574c':'#9d997b',roughness:1});cube(.8,.9,.04,rw*.25,1.7,-rd/2+.24,art);const rug=new THREE.MeshStandardMaterial({color:'#cbc5b5',roughness:1});if(!simplified)cube(Math.min(rw-.3,c.width/100+.5),.015,Math.min(rd-.3,c.depth/100+1),0,.005,.3,rug);if(c.room==='hotel')cube(.45,.5,.45,c.width/200+.35,.25,-.5,art);}
const Scene=forwardRef(function Scene({config,onSelect,hero=false,quality='atelier'},ref){
 const host=useRef(null),runtime=useRef(null),onSelectRef=useRef(onSelect),[failed,setFailed]=useState(false),[simplified,setSimplified]=useState(false);
 onSelectRef.current=onSelect;
 useImperativeHandle(ref,()=>({
  view(mode){const r=runtime.current;if(!r)return;const w=config.width/100,scale=config.category==='chair'?.6:config.category==='headboard'?.8:1;r.controls.target.set(0,config.category==='headboard'?.7:.52,.12);if(mode==='top')r.camera.position.set(0,Math.max(2.3,w*1.7),.01);else if(mode==='front')r.camera.position.set(0,1,4.8*scale);else r.camera.position.set(3.1*scale,2.05*scale,4.4*scale);r.controls.update();},
  zoom(amount){const r=runtime.current;if(!r)return;r.camera.position.sub(r.controls.target).multiplyScalar(amount).add(r.controls.target);r.controls.update();},
  async exportPreviewGLB(){
   // Concept preview only: no verified joinery CAD, cutting patterns or factory approval.
   const {GLTFExporter}=await import('three/addons/exporters/GLTFExporter.js');
   const model=furniture(config,false),materials=model.userData.materials;
   model.userData.materials=[]; // Prevent Three Material references in userData extras.
   model.userData.exportDisclaimer='Concept visualisation only. Not approved CAD or manufacturing instructions.';
   model.userData.dimensionUnits='m';
   try{
    const bytes=await new GLTFExporter().parseAsync(model,{binary:true,onlyVisible:true,maxTextureSize:1024,includeCustomExtensions:false});
    if(!(bytes instanceof ArrayBuffer))throw Error('GLB_EXPORT_FAILED');
    return bytes;
   }finally{model.userData.materials=materials;release(model);}
  },
  snapshot(){const r=runtime.current;if(!r)return null;r.renderer.render(r.scene,r.camera);if(r.simplified){const svg=r.renderer.domElement.cloneNode(true);svg.setAttribute('xmlns','http://www.w3.org/2000/svg');return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(new XMLSerializer().serializeToString(svg));}const c=document.createElement('canvas');c.width=720;c.height=480;const ctx=c.getContext('2d');ctx.fillStyle='#eeebe4';ctx.fillRect(0,0,720,480);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(r.renderer.domElement,0,0,720,480);return c.toDataURL('image/webp',.84);}
 }),[config]);
 useEffect(()=>{
  const element=host.current;let renderer,scene,camera,controls,env,pmrem,raf,observer;let disposed=false,isSVG=false,dirty=true;
  try{
   try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,preserveDrawingBuffer:true,powerPreference:'high-performance'});}catch{renderer=new SVGRenderer();isSVG=true;setSimplified(true);renderer.setQuality('low');}
   if(!isSVG){renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.12;renderer.setClearColor('#eeebe4',0);}else renderer.setClearColor(new THREE.Color('#eeebe4'),0);
   element.appendChild(renderer.domElement);
   renderer.domElement.setAttribute('aria-label','Интерактивная 3D-модель мебели. Вращайте указателем; настройки доступны рядом.');
   scene=new THREE.Scene();camera=new THREE.PerspectiveCamera(hero?36:36,1,.1,50);camera.position.set(3.1,2.05,4.4);
   controls=new OrbitControls(camera,renderer.domElement);controls.target.set(0,.58,.1);controls.enableDamping=!isSVG;controls.dampingFactor=.075;controls.minDistance=2;controls.maxDistance=8;controls.maxPolarAngle=Math.PI*.48;controls.enablePan=false;controls.autoRotate=!isSVG&&hero&&!matchMedia('(prefers-reduced-motion: reduce)').matches;controls.autoRotateSpeed=.35;controls.addEventListener('change',()=>{dirty=true;});controls.update();
   if(!isSVG){pmrem=new THREE.PMREMGenerator(renderer);const room=new RoomEnvironment();env=pmrem.fromScene(room,.04);scene.environment=env.texture;room.dispose();}
   if(isSVG)scene.add(new THREE.AmbientLight('#ffffff',.65));else scene.add(new THREE.HemisphereLight('#fff9ef','#a79c86',2.4));
   const light=new THREE.DirectionalLight('#fff4dd',isSVG?.7:3.4);light.position.set(-3,6,4);light.castShadow=true;light.shadow.mapSize.set(1024,1024);light.shadow.camera.left=-4;light.shadow.camera.right=4;light.shadow.camera.top=4;light.shadow.camera.bottom=-4;light.shadow.normalBias=.04;light.shadow.bias=-.0001;light.shadow.radius=5;scene.add(light);
   const fill=new THREE.DirectionalLight('#e5edf7',isSVG?.15:1.2);fill.position.set(4,3,-3);scene.add(fill);
   if(!isSVG){const floor=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.ShadowMaterial({opacity:.13}));floor.rotation.x=-Math.PI/2;floor.position.y=.005;floor.receiveShadow=true;scene.add(floor);}
   runtime.current={renderer,scene,camera,controls,model:null,simplified:isSVG,invalidate:()=>{dirty=true;}};
   observer=new ResizeObserver(()=>{const {width,height}=element.getBoundingClientRect();if(width&&height){renderer.setSize(width,height);camera.aspect=width/height;camera.updateProjectionMatrix();dirty=true;}});observer.observe(element);
   const animate=()=>{if(disposed)return;raf=requestAnimationFrame(animate);if(document.hidden)return;const moving=controls.update();if(moving||dirty){renderer.render(scene,camera);dirty=false;}};animate();
   const ray=new THREE.Raycaster(),pointer=new THREE.Vector2();let down=null;
   const start=e=>{down=[e.clientX,e.clientY];};const end=e=>{if(!down||Math.hypot(e.clientX-down[0],e.clientY-down[1])>6)return;const rect=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);ray.setFromCamera(pointer,camera);const hits=runtime.current?.model?ray.intersectObject(runtime.current.model,true):[];const target=hits.find(x=>x.object.userData.part);if(target)onSelectRef.current?.(target.object.userData.part);};
   renderer.domElement.addEventListener('pointerdown',start);renderer.domElement.addEventListener('pointerup',end);
   const lost=e=>{e.preventDefault();setFailed(true);};renderer.domElement.addEventListener('webglcontextlost',lost);
   runtime.current.cleanup=()=>{renderer.domElement.removeEventListener('pointerdown',start);renderer.domElement.removeEventListener('pointerup',end);renderer.domElement.removeEventListener('webglcontextlost',lost);};
  }catch{setFailed(true);}
  return()=>{disposed=true;cancelAnimationFrame(raf);observer?.disconnect();runtime.current?.cleanup?.();controls?.dispose();if(runtime.current?.model)release(runtime.current.model);if(scene)scene.traverse(o=>{if(o.geometry)o.geometry.dispose();});env?.dispose();pmrem?.dispose();renderer?.dispose?.();renderer?.domElement.remove();runtime.current=null;};
 },[hero]);
 useEffect(()=>{const r=runtime.current;if(!r)return;try{if(r.model){r.scene.remove(r.model);release(r.model);}r.model=furniture(config,r.simplified||quality==='draft');if(!hero)addRoom(r.model,config,r.simplified);r.scene.add(r.model);r.controls.target.set(0,config.category==='headboard'?.7:.55,config.layout==='straight'?0:.25);if(r.lastCategory!==config.category){const scale=config.category==='chair'?.6:config.category==='headboard'?.8:1;r.camera.position.set(3.1*scale,2.05*scale,4.4*scale);r.lastCategory=config.category;}r.controls.update();r.invalidate();setFailed(false);}catch{setFailed(true);}},[config,quality]);
 return <div className="scene-host" ref={host}>{simplified&&!failed&&<span className="simplified-badge">Упрощённый просмотр · без WebGL</span>}{failed&&<div className="scene-fallback"><span>3D-просмотр недоступен</span><p>Параметры, расчёт и сохранение проекта продолжают работать. Попробуйте обновить страницу или использовать устройство с WebGL.</p></div>}</div>;
});
export default Scene;
