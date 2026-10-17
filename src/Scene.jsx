import React,{forwardRef,useEffect,useImperativeHandle,useRef,useState} from 'react';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import {SVGRenderer} from 'three/addons/renderers/SVGRenderer.js';
import {getColor,getFabric} from './domain.js';

function texture(kind){
 const canvas=document.createElement('canvas');canvas.width=canvas.height=256;const c=canvas.getContext('2d');c.fillStyle='#888';c.fillRect(0,0,256,256);
 let seed=1143;const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
 for(let y=0;y<256;y+=kind==='boucle'?4:2)for(let x=0;x<256;x+=kind==='boucle'?4:2){let v=100+Math.round(rand()*70);c.fillStyle=`rgb(${v},${v},${v})`;if(kind==='boucle'){c.beginPath();c.ellipse(x,y,1+rand()*2,1+rand()*2,0,0,Math.PI*2);c.fill();}else c.fillRect(x,y,kind==='velvet'?1:2,kind==='velvet'?4:1);}
 const t=new THREE.CanvasTexture(canvas);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(kind==='boucle'?5:10,kind==='boucle'?5:10);t.anisotropy=4;return t;
}
function release(group){const gs=new Set(),ms=new Set(),ts=new Set();group.traverse(o=>{if(o.geometry)gs.add(o.geometry);const mats=Array.isArray(o.material)?o.material:[o.material];mats.filter(Boolean).forEach(m=>{ms.add(m);for(const v of Object.values(m))if(v?.isTexture)ts.add(v);});});gs.forEach(x=>x.dispose());ms.forEach(x=>x.dispose());ts.forEach(x=>x.dispose());}
function furniture(config,simplified=false){
 const group=new THREE.Group(),col=getColor(config),fab=getFabric(config),bump=texture(fab.texture);
 const cloth=new THREE.MeshPhysicalMaterial({color:col.hex,roughness:fab.roughness,metalness:0,sheen:fab.sheen,sheenColor:new THREE.Color(col.hex).lerp(new THREE.Color('#ffffff'),.22),sheenRoughness:.8,bumpMap:bump,bumpScale:fab.texture==='boucle'?.014:.005});
 const darker=cloth.clone();darker.color.multiplyScalar(.9);
 const wood=new THREE.MeshStandardMaterial({color:config.legs==='wood'?'#785339':config.legs==='black'?'#343531':'#9c7b43',roughness:config.legs==='brass'?.3:.65,metalness:config.legs==='wood'?0:.65});
 const seamMat=new THREE.LineBasicMaterial({color:new THREE.Color(col.hex).multiplyScalar(.73),transparent:true,opacity:.48});
 const box=(w,h,d,x,y,z,material=cloth,r=.08,part='seat')=>{
  const g=new RoundedBoxGeometry(w,h,d,simplified?1:5,Math.min(r,w/3,h/3,d/3));
  const m=new THREE.Mesh(g,material);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;m.userData.part=part;group.add(m);return m;
 };
 const leg=(x,z)=>{const m=new THREE.Mesh(new THREE.CylinderGeometry(.027,.019,.155,16),wood);m.position.set(x,.09,z);m.castShadow=true;m.userData.part='legs';group.add(m);};
 const seam=(w,d,x,y,z)=>{const pts=[];const radius=.08;for(let i=0;i<=80;i++){const angle=i/80*Math.PI*2;const xx=(w/2-radius)*Math.sign(Math.cos(angle))+radius*Math.cos(angle),zz=(d/2-radius)*Math.sign(Math.sin(angle))+radius*Math.sin(angle);pts.push(new THREE.Vector3(xx+x,y,zz+z));}const line=new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(pts),seamMat);group.add(line);};
 const w=config.width/100,depth=config.depth/100;
 if(config.category==='headboard'){
  const h=config.height/100,n=config.panels;
  box(w,.10,.16,0,.16,0,darker,.025,'back');
  for(let i=0;i<n;i++)box(w/n-.012,h,.15,-w/2+w/n*(i+.5),h/2+.13,0,cloth,.07,'back');
  leg(-w*.35,0);leg(w*.35,0);
  return group;
 }
 const arm=config.arm==='none'?0:config.arm==='slim'?.12:.23,inner=w-arm*2;
 const count=config.category==='chair'?1:w>=2.6?3:2,seatW=inner/count;
 const chaise=config.category==='sofa'&&config.layout!=='straight';
 box(w-.08,.23,depth-.09,0,.29,0,darker,.08,'seat');
 for(let i=0;i<count;i++){
  const x=-inner/2+seatW*(i+.5),extended=chaise&&((config.layout==='left'&&i===0)||(config.layout==='right'&&i===count-1));
  const sd=depth-.22+(extended?.65:0),z=.075+(extended?.325:0);
  box(seatW-.025,.225,sd,x,.495,z,cloth,.095,'seat');seam(seatW-.045,sd-.025,x,.586,z);
  const backHeight=config.height/100-.44;
  const back=box(seatW-.028,backHeight,.23,x,.44+backHeight/2,-depth/2+.14,cloth,.08,'back');back.rotation.x=-.06;
 }
 if(arm){for(const side of [-1,1]){const a=box(arm,.44,depth,side*(w/2-arm/2),.49,0,cloth,config.arm==='slim'?.045:.105,'arm');a.rotation.z=side*.012;}}
 for(const x of [-w/2+.15,w/2-.15])for(const z of [-depth/2+.14,depth/2-.14])leg(x,z);
 if(chaise){const x=(config.layout==='left'?-1:1)*(inner/2-seatW/2);box(seatW-.04,.23,.67,x,.29,depth/2+.29,darker,.07);for(const lx of [x-seatW*.35,x+seatW*.35])leg(lx,depth/2+.53);}
 for(let i=0;i<config.pillows;i++){
  const n=Math.min(config.pillows,6),x=n===1?0:-inner*.36+i*(inner*.72/(n-1));
  const p=box(.32,.30,.13,x,.65,-depth/2+.35,i%2===0?darker:cloth,.065,'pillow');p.rotation.set(-.18,0,(i%2===0?1:-1)*.12);
 }
 return group;
}
const Scene=forwardRef(function Scene({config,onSelect,hero=false},ref){
 const host=useRef(null),runtime=useRef(null),onSelectRef=useRef(onSelect),[failed,setFailed]=useState(false),[simplified,setSimplified]=useState(false);
 onSelectRef.current=onSelect;
 useImperativeHandle(ref,()=>({
  view(mode){const r=runtime.current;if(!r)return;const w=config.width/100,scale=config.category==='chair'?.6:config.category==='headboard'?.8:1;r.controls.target.set(0,config.category==='headboard'?.7:.52,.12);if(mode==='top')r.camera.position.set(0,Math.max(2.3,w*1.7),.01);else if(mode==='front')r.camera.position.set(0,1,4.8*scale);else r.camera.position.set(3.1*scale,2.05*scale,4.4*scale);r.controls.update();},
  zoom(amount){const r=runtime.current;if(!r)return;r.camera.position.sub(r.controls.target).multiplyScalar(amount).add(r.controls.target);r.controls.update();},
  snapshot(){const r=runtime.current;if(!r)return null;r.renderer.render(r.scene,r.camera);if(r.simplified){const svg=r.renderer.domElement.cloneNode(true);svg.setAttribute('xmlns','http://www.w3.org/2000/svg');return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(new XMLSerializer().serializeToString(svg));}const c=document.createElement('canvas');c.width=540;c.height=360;const ctx=c.getContext('2d');ctx.fillStyle='#eeebe4';ctx.fillRect(0,0,540,360);ctx.drawImage(r.renderer.domElement,0,0,540,360);return c.toDataURL('image/webp',.65);}
 }),[config.width,config.category]);
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
   const animate=()=>{if(disposed)return;raf=requestAnimationFrame(animate);if(document.hidden)return;controls.update();if(!isSVG||dirty){renderer.render(scene,camera);dirty=false;}};animate();
   const ray=new THREE.Raycaster(),pointer=new THREE.Vector2();let down=null;
   const start=e=>{down=[e.clientX,e.clientY];};const end=e=>{if(!down||Math.hypot(e.clientX-down[0],e.clientY-down[1])>6)return;const rect=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);ray.setFromCamera(pointer,camera);const hits=runtime.current?.model?ray.intersectObject(runtime.current.model,true):[];const target=hits.find(x=>x.object.userData.part);if(target)onSelectRef.current?.(target.object.userData.part);};
   renderer.domElement.addEventListener('pointerdown',start);renderer.domElement.addEventListener('pointerup',end);
   const lost=e=>{e.preventDefault();setFailed(true);};renderer.domElement.addEventListener('webglcontextlost',lost);
   runtime.current.cleanup=()=>{renderer.domElement.removeEventListener('pointerdown',start);renderer.domElement.removeEventListener('pointerup',end);renderer.domElement.removeEventListener('webglcontextlost',lost);};
  }catch{setFailed(true);}
  return()=>{disposed=true;cancelAnimationFrame(raf);observer?.disconnect();runtime.current?.cleanup?.();controls?.dispose();if(runtime.current?.model)release(runtime.current.model);if(scene)scene.traverse(o=>{if(o.geometry)o.geometry.dispose();});env?.dispose();pmrem?.dispose();renderer?.dispose?.();renderer?.domElement.remove();runtime.current=null;};
 },[hero]);
 useEffect(()=>{const r=runtime.current;if(!r)return;try{if(r.model){r.scene.remove(r.model);release(r.model);}r.model=furniture(config,r.simplified);r.scene.add(r.model);r.controls.target.set(0,config.category==='headboard'?.7:.55,config.layout==='straight'?0:.25);if(r.lastCategory!==config.category){const scale=config.category==='chair'?.6:config.category==='headboard'?.8:1;r.camera.position.set(3.1*scale,2.05*scale,4.4*scale);r.lastCategory=config.category;}r.controls.update();r.invalidate();}catch{setFailed(true);}},[config]);
 return <div className="scene-host" ref={host}>{simplified&&!failed&&<span className="simplified-badge">Упрощённый просмотр · без WebGL</span>}{failed&&<div className="scene-fallback"><span>3D-просмотр недоступен</span><p>Параметры, расчёт и сохранение проекта продолжают работать. Попробуйте обновить страницу или использовать устройство с WebGL.</p></div>}</div>;
});
export default Scene;
