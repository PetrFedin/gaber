/** Millimetres; box envelopes from the concept cut list, not approved joinery CAD. */
export function frameInstances(model) {
  const c=model.source.configuration,g=model.geometry;
  const instances=[];
  const add=(id,positionMm,axes=['length','height','width'],rotationXDeg=0)=>{
    const row=model.cutList.find(p=>p.id===id);
    if(!row)throw Error('Missing frame group: '+id);
    const ordinal=instances.filter(p=>p.sourceGroup===id).length+1;
    const partId=id+'-'+String(ordinal).padStart(3,'0');
    instances.push({partId,sourceGroup:id,sceneNodeRef:'GABER_PART:'+partId,
      sizeMm:{x:row.sizeMm[axes[0]],y:row.sizeMm[axes[1]],z:row.sizeMm[axes[2]]},
      positionMm,rotationXDeg,geometryKind:'concept-box-envelope'});
  };
  if(!['bed','headboard'].includes(c.category)){
    const n=g.moduleCount,mw=g.moduleWidthCm*10,fd=g.frameDepthCm*10;
    const z=-c.depth*5+c.backDepth*10+c.seatDepth*5,y=g.frameTopCm*10-30;
    for(let i=0;i<n;i++){
      const x=(i-(n-1)/2)*mw;
      for(const side of [-1,1]){
        add('FRAME-F',{x,y,z:z+side*(fd/2-20)});
        add('FRAME-S',{x:x+side*(mw/2-20),y,z},['width','height','length']);
      }
      add('FRAME-X',{x,y,z});
      for(const sx of [-1,1])for(const sz of [-1,1])
        add('FRAME-K',{x:x+sx*(mw/2-45),y:y-39,z:z+sz*(fd/2-45)});
      const back=model.cutList.find(p=>p.id==='BACK-P');
      add('BACK-P',{x,y:c.seatHeight*10+back.sizeMm.width/2-80,z:-c.depth*5+120},['length','width','height'],-c.backLeanDeg);
    }
    if(g.armCm)for(const side of [-1,1]){
      const arm=model.cutList.find(p=>p.id==='ARM-P');
      add('ARM-P',{x:side*(c.width*5-g.armCm*5),y:arm.sizeMm.width/2,z:0},['height','width','length']);
    }
  }else{
    const w=c.width*10,d=c.depth*10,h=c.height*10;
    if(c.category==='bed')for(const side of [-1,1]){
      add('BED-L',{x:side*(w/2-9),y:290,z:0},['height','width','length']);
      add('BED-T',{x:0,y:290,z:side*(d/2-9)},['length','width','height']);
    }
    for(let i=0;i<c.panels;i++)
      add('HB-P',{x:(i-(c.panels-1)/2)*w/c.panels,y:h/2,z:c.category==='bed'?-d/2+35:-40},['length','width','height']);
    if(c.category==='headboard')for(const y of [160,h-160])add('HB-R',{x:0,y,z:-85});
  }
  for(const row of model.cutList)
    if(instances.filter(p=>p.sourceGroup===row.id).length!==row.quantity)
      throw Error('Frame instance count differs from cut list: '+row.id);
  return instances;
}
