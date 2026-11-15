import {frameInstances} from './frameLayout.js';

export const SOFT_LAYOUT_VERSION = 'gaber-soft-envelope/0.4.3';

/**
 * Deterministic conceptual rectangular layer envelopes (millimetres).
 * The exact same instances feed the 3D inspector and manufacturing register.
 * These are neither production cutting patterns nor compressed cushion models.
 */
export function softInstances(model) {
  const c=model?.source?.configuration, g=model?.geometry;
  if(!c||!g||!Array.isArray(model.layers))throw Error('Engineering model required for soft layout');
  const out=[];
  const add=(zone,layerId,sceneNodeRef,sizeMm,positionMm,rotationXDeg=0)=>{
    if(!Object.values(sizeMm).every(v=>typeof v==='number'&&Number.isFinite(v)&&v>0) ||
       !Object.values(positionMm).every(v=>typeof v==='number'&&Number.isFinite(v)) ||
       !Number.isFinite(rotationXDeg))throw Error('Invalid soft envelope: '+sceneNodeRef);
    out.push({zone,layerId,sceneNodeRef,sizeMm,positionMm,rotationXDeg,
      geometryKind:'concept-layer-box',approval:'unreleased'});
  };
  const layers=zone=>model.layers.filter(l=>l.zone===zone);
  if(!['bed','headboard'].includes(c.category)){
    const n=g.moduleCount, moduleWidthMm=g.moduleWidthCm*10, spanMm=moduleWidthMm*n;
    const originZMm=-c.depth*5+c.backDepth*10+c.seatDepth*5;
    const seatDepthMm=c.seatDepth*10;
    for(let i=0;i<n;i++){
      const x=-spanMm/2+moduleWidthMm*(i+.5);
      let y=g.frameTopCm*10;
      for(const layer of layers('seat')){
        const t=layer.thicknessMm;
        add('seat',layer.id,'GABER_SOFT:SEAT:'+(i+1)+':'+layer.id,
          {x:Math.max(20,moduleWidthMm-45),y:t,z:Math.max(100,seatDepthMm-25)},
          {x,y:y+t/2,z:originZMm});
        y+=t;
      }
    }
    if(g.chaise){
      const ch=g.chaise, x=(ch.moduleIndex-(n-1)/2)*ch.moduleWidthMm;
      const softStartZ=originZMm+seatDepthMm/2;
      const softEndZ=c.depth*5+ch.outerDepthExtensionMm;
      const softLength=softEndZ-softStartZ;
      if(!Number.isFinite(softLength)||softLength<=0)throw Error('Invalid chaise cushion geometry');
      let y=g.frameTopCm*10;
      for(const layer of layers('seat')){
        const t=layer.thicknessMm;
        add('seat',layer.id,'GABER_SOFT:CHAISE:'+layer.id,
          {x:Math.max(20,ch.moduleWidthMm-45),y:t,z:softLength},
          {x,y:y+t/2,z:(softEndZ+softStartZ)/2});
        y+=t;
      }
    }
  }
  for(const part of frameInstances(model).filter(p=>p.sourceGroup==='BACK-P')){
    const angle=part.rotationXDeg*Math.PI/180;
    let offset=part.sizeMm.z/2;
    for(const layer of layers('back')){
      const t=layer.thicknessMm,distance=offset+t/2;
      add('back',layer.id,'GABER_SOFT:BACK:'+part.partId+':'+layer.id,
        {x:part.sizeMm.x,y:part.sizeMm.y,z:t},
        {x:part.positionMm.x,y:part.positionMm.y-Math.sin(angle)*distance,
          z:part.positionMm.z+Math.cos(angle)*distance},part.rotationXDeg);
      offset+=t;
    }
  }
  for(const part of frameInstances(model).filter(p=>p.sourceGroup==='HB-P')){
    let z=part.positionMm.z+part.sizeMm.z/2;
    for(const layer of layers('headboard')){
      const t=layer.thicknessMm;
      add('headboard',layer.id,'GABER_SOFT:HEADBOARD:'+part.partId+':'+layer.id,
        {x:part.sizeMm.x,y:part.sizeMm.y,z:t},
        {x:part.positionMm.x,y:part.positionMm.y,z:z+t/2});
      z+=t;
    }
  }
  if(new Set(out.map(p=>p.sceneNodeRef)).size!==out.length)
    throw Error('Duplicate soft scene identifier');
  return out;
}
