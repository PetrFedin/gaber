/** Concept joint proposals and resolved instance references; not approved drilling CAD. */
const round=n=>Math.round(n*1000)/1000;
export function jointProposals(model) {
  const n=model.geometry.moduleCount;
  const seating= !['bed','headboard'].includes(model.source.catalogCategory);
  if(!seating) return [{
    id:'J-MOUNT',
    kind:'mounting-interface',
    partRefs:model.cutList.filter(p=>p.id==='HB-P'||p.id==='BED-L'||p.id==='HB-R').map(p=>p.id),
    locationMm:null,
    fastenerSku:null,
    drillPatternMm:null,
    review:'Determine approved wall substrate or bed base, anchors and manufacturer-rated mounting points'
  }];
  const joints=[];
  const halfW=model.geometry.moduleWidthCm*5;
  const halfD=model.geometry.frameDepthCm*5;
  const y=model.geometry.frameTopCm*10-30;
  for(let i=0;i<n;i++) {
    const centerX=Math.round((i-(n-1)/2)*model.geometry.moduleWidthCm*10);
    for(const sx of [-1,1])for(const sz of [-1,1])joints.push({
      id:'J-'+(i+1)+'-'+(sx===-1?'L':'R')+'-'+(sz===-1?'F':'B'),
      kind:'rail-to-rail-corner',
      partRefs:['FRAME-F','FRAME-S'],
      locationMm:{x:round(centerX+sx*halfW),y:round(y),z:round(sz*halfD)},
      nominalJointGapMm:2,
      proposedCutToleranceMm:0.5,
      worstCaseRemainingGapMm:1,
      fastenerSku:null,drillPatternMm:null,
      review:'Joinery, grain orientation, fastener centres, embedment and edge distances require approved shop drawings'
    });
    for(const sx of [-1,1])joints.push({
      id:'J-'+(i+1)+'-X-'+(sx===-1?'L':'R'),
      kind:'cross-brace-interface',
      partRefs:['FRAME-X','FRAME-S'],
      locationMm:{x:round(centerX+sx*halfW),y:round(y),z:0},
      fastenerSku:null,drillPatternMm:null,
      review:'Bracing anchor detail to be engineered'
    });
  }
  if(model.geometry.chaise){
    const ch=model.geometry.chaise,ci=ch.moduleIndex;
    const mx=(ci-(n-1)/2)*ch.moduleWidthMm;
    const xx=ch.moduleWidthMm/2-20;
    const z0=model.geometry.frameDepthCm*5-20;
    const rearFrontId='FRAME-F-'+String(ci*2+2).padStart(3,'0');
    for(const side of [-1,1]){
      const lr=side===-1?'L':'R';
      const s='CHAISE-S-'+(side===-1?'001':'002');
      const plate='CHAISE-K-'+(side===-1?'001':'002');
      for(const [name,kind,z,refs] of [
        ['ANCHOR','extension-anchor',z0,[s,rearFrontId]],
        ['END','extension-front-corner',z0+ch.extensionMm,[s,'CHAISE-F-001',plate]],
        ['BRACE','extension-intermediate-brace',z0+ch.extensionMm/2,[s,'CHAISE-X-001']]
      ])joints.push({
        id:'J-CHAISE-'+name+'-'+lr,kind,
        partRefs:[...new Set(refs.map(r=>r.replace(/-\d{3}$/,'')))],
        partInstanceRefs:refs,
        locationMm:{x:round(mx+side*xx),y:round(y),z:round(z)},
        nominalJointGapMm:null,proposedCutToleranceMm:null,
        fastenerSku:null,drillPatternMm:null,
        review:'Проектный интерфейс удлинения шезлонга: испытания соединения, сдвига, изгиба и устойчивости отсутствуют'
      });
    }
  }
  return joints;
}


export function jointInstances(config,engineering,instances){
  const instanceRef=(group,ordinal)=>group+'-'+String(ordinal).padStart(3,'0');
  const joints=jointProposals(engineering).map(j=>{
    const match=/^J-(\d+)-/.exec(j.id),module=match?Number(match[1])-1:null;
    const suffix=j.id.split('-').at(-1);
    const partInstanceRefs=j.partInstanceRefs?.length ? [...j.partInstanceRefs] : module===null
      ? instances.filter(p=>j.partRefs.includes(p.sourceGroup)).map(p=>p.partId)
      : j.kind==='cross-brace-interface'
        ? [instanceRef('FRAME-X',module+1),instanceRef('FRAME-S',module*2+(suffix==='L'?1:2))]
        : [instanceRef('FRAME-F',module*2+(suffix==='F'?1:2)),instanceRef('FRAME-S',module*2+(j.id.split('-')[2]==='L'?1:2))];
    // Seat frames are offset from the product origin; use the same transform as 3D.
    const locationMm=j.locationMm?{...j.locationMm,z:round(j.locationMm.z-config.depth*5+config.backDepth*10+config.seatDepth*5)}:null;
    return {...j,locationMm,partInstanceRefs};
  });
  return joints;
}
