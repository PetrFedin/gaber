/**
 * GABER support concept layout, in millimetres.
 * One authoritative deterministic set feeds Three.js and manufacturing records.
 * Values are demonstration envelopes, NOT rated vendor spring/belt/slat data.
 */
export const SUPPORT_LAYOUT_VERSION='gaber-support-envelope/0.4.2';
const mm=n=>Math.round(n*1000)/1000;
const id=(zone,i,j)=>'GABER_SUPPORT:'+zone+':'+String(i).padStart(3,'0')+':'+String(j).padStart(3,'0');
export function supportInstances(model){
  const c=model?.source?.configuration,g=model?.geometry;
  if(!c||!g||!model.suspension)throw Error('Engineering model required for support layout');
  const out=[];
  if(['chair','chairbed','sofa'].includes(c.category)){
    const n=g.moduleCount,moduleW=g.moduleWidthCm*10,spanMm=moduleW*n;
    const frameDepthMm=g.frameDepthCm*10;
    const originZMm=-c.depth*5+c.backDepth*10+c.seatDepth*5;
    const yMm=g.frameTopCm*10+(c.support==='webbing'?5:11);
    const count=model.suspension.countPerModule;
    if(!Number.isInteger(count)||count<2||count>100)throw Error('Invalid suspension count');
    const availableMm=Math.max(40,moduleW-90);
    for(let i=0;i<n;i++){
      const cx=-spanMm/2+moduleW*(i+.5);
      for(let j=0;j<count;j++){
        const x=cx-availableMm/2+availableMm*(j+.5)/count;
        out.push({
          sceneNodeRef:id('MODULE',i+1,j+1),
          kind:c.support,
          moduleIndex:i,location:'seat',
          positionMm:{x:mm(x),y:mm(yMm),z:mm(originZMm)},
          sizeMm:{width:55,height:c.support==='webbing'?7:6,length:c.support==='webbing'?Math.max(100,frameDepthMm-65):frameDepthMm-90},
          materialSku:null,approval:'unreleased'
        });
      }
    }
    const chaise=g.chaise;
    if(chaise){
      const idx=chaise.moduleIndex;
      const cx=(idx-(n-1)/2)*moduleW;
      const frontZ=originZMm+frameDepthMm/2-20;
      const extension=chaise.extensionMm;
      for(let j=0;j<count;j++){
        const x=cx-availableMm/2+availableMm*(j+.5)/count;
        out.push({
          sceneNodeRef:id('CHAISE',idx+1,j+1),
          kind:c.support,moduleIndex:idx,location:'chaise-extension',
          positionMm:{x:mm(x),y:mm(yMm),z:mm(frontZ+extension/2)},
          sizeMm:{width:55,height:c.support==='webbing'?7:6,length:extension-(c.support==='webbing'?80:90)},
          materialSku:null,approval:'unreleased'
        });
      }
    }
  }else if(c.category==='bed'){
    const widthM=c.width/100,depthM=c.depth/100;
    const n=Math.max(10,Math.floor((depthM-.25)/.11));
    for(let i=0;i<n;i++)out.push({
      sceneNodeRef:id('BED',1,i+1),kind:'slat',moduleIndex:0,location:'bed-base',
      positionMm:{x:0,y:405,z:mm((-depthM/2+.13+(depthM-.26)*(i+.5)/n)*1000)},
      sizeMm:{width:mm((widthM-.16)*1000),height:12,length:60},
      materialSku:null,approval:'unreleased'
    });
  }
  for(const part of out){
    if(!Object.values(part.sizeMm).every(v=>Number.isFinite(v)&&v>0)||
       !Object.values(part.positionMm).every(Number.isFinite))throw Error('Non-physical support envelope');
  }
  if(new Set(out.map(x=>x.sceneNodeRef)).size!==out.length)
    throw Error('Duplicate support scene identifier');
  return out;
}
