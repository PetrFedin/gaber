/**
 * Explicit glTF/PBR and kinematic asset contracts.
 * These functions are validation / preview checks only, not physics simulation.
 */
export const ASSET_SCHEMA='gaber-asset-contract/0.4.0';
export function validatePBRAsset(asset){
 const issues=[];
 if(!asset||typeof asset!=='object')return {ready:false,issues:['Missing asset descriptor']};
 if(!asset.gltfUri || typeof asset.gltfUri!=='string')issues.push('A locally approved glTF/GLB URI is required');
 if(asset.unit!=='m')issues.push('Scene coordinates must be metres');
 if(!Number.isFinite(asset.metersPerTextureRepeat)||asset.metersPerTextureRepeat<=0)
   issues.push('Physical textile repeat / texture scale is required');
 if(!asset.uvSet || typeof asset.uvSet!=='string')issues.push('UV set required');
 if(!asset.supplierSku)issues.push('Physical fabric supplier SKU missing');
 if(!asset.calibrationReference)issues.push('Color and light calibration reference missing');
 if(!asset.maps || !['baseColor','normal','roughness'].every(k=>typeof asset.maps[k]==='string'&&asset.maps[k]))
   issues.push('PBR texture map set incomplete');
 if(!asset.materialTestReference)issues.push('Fabric technical test evidence missing');
 return {ready:issues.length===0,issues,quality:'metadata-validation-only'};
}
const DEG=Math.PI/180;
const r=n=>Math.round(n*1000)/1000;
export function hingedPreview(spec,angleDeg){
 if(!spec || !Number.isFinite(angleDeg)||!Number.isFinite(spec.maxAngleDeg)||!Number.isFinite(spec.minAngleDeg)||
    angleDeg<spec.minAngleDeg||angleDeg>spec.maxAngleDeg || spec.maxAngleDeg<=spec.minAngleDeg ||
    !Number.isFinite(spec.linkLengthMm)||spec.linkLengthMm<=0)
    throw Error('Outside stated kinematic range or invalid hinge geometry');
 const a=angleDeg*DEG, L=spec.linkLengthMm;
 return {
  angleDeg,linkEndMm:{x:r(L*Math.cos(a)),y:r(L*Math.sin(a))},
  boundingRadiusMm:L,
  kinematicStatus:'ideal-rigid-single-hinge-only',
  clearanceCertified:false,
  forceCertified:false,
  trapZoneCertified:false
 };
}
export function axisAlignedCollision(a,b,clearanceMm=0) {
 if(!Number.isFinite(clearanceMm)||clearanceMm<0)throw Error('Invalid clearance');
 for(const v of [a,b])if(!v||!['min','max'].every(k=>v[k]&&['x','y','z'].every(axis=>Number.isFinite(v[k][axis]))) ||
 ['x','y','z'].some(axis=>v.min[axis]>v.max[axis]))throw Error('Invalid collision box');
 const separation={};
 for(const axis of ['x','y','z']) separation[axis]=Math.max(a.min[axis]-b.max[axis],b.min[axis]-a.max[axis],0);
 const intersects=['x','y','z'].every(axis=>separation[axis]===0);
 const distanceMm=Math.hypot(separation.x,separation.y,separation.z);
 return {intersects,withinClearance:distanceMm<clearanceMm,distanceMm:r(distanceMm),
  method:'axis-aligned-bounding-box',certifiedSafe:false};
}
export function transformPreview(spec,angles,obstacles=[]){
 if(!Array.isArray(angles)||!angles.length||angles.some(x=>!Number.isFinite(x)))throw Error('Sampled angles required');
 const poses=angles.map(a=>hingedPreview(spec,a));
 const collisions=obstacles.map(box=>axisAlignedCollision(
  {min:{x:-spec.linkLengthMm,y:-spec.linkLengthMm,z:-10},max:{x:spec.linkLengthMm,y:spec.linkLengthMm,z:10}},box,spec.clearanceMm??0));
 return {poses,collisions,releaseAllowed:false,
  disclaimers:['Not a mechanism digital twin','AABB sweep is conservative and not a true swept-volume test',
  'No self-collision, friction, spring forces, trapping hazard or fatigue is calculated']};
}
