import {getEngineeringModel} from './engineering.js';
import {getFabric} from './domain.js';
import {frameInstances} from './frameLayout.js';

export const PRODUCTION_SCHEMA = 'gaber-production-concept/0.4.1';

const round = n => Math.round(n * 1000) / 1000;
const finitePositive = n => typeof n === 'number' && Number.isFinite(n) && n > 0;
const approvedDoc = doc => Boolean(
  doc && typeof doc === 'object' && doc.status === 'approved' &&
  typeof doc.reference === 'string' && doc.reference.trim() &&
  typeof doc.revision === 'string' && doc.revision.trim() &&
  typeof doc.approvedBy === 'string' && doc.approvedBy.trim() &&
  typeof doc.approvedAt === 'string' && Number.isFinite(Date.parse(doc.approvedAt))
);

/** Advisory only; even complete public-browser evidence cannot authorize manufacture. */
export function assessBeam(input) {
  const keys = ['spanMm','widthMm','heightMm','loadN','elasticModulusMPa','allowableStressMPa','allowableDeflectionMm'];
  if(!input || keys.some(key => !finitePositive(input[key]))) {
    return {status:'missing-measured-inputs',required:keys,disclaimer:'Нужны реальные характеристики материала, схема нагрузок и расчётное обоснование'};
  }
  const {spanMm:L,widthMm:b,heightMm:h,loadN:load,
    elasticModulusMPa:E,allowableStressMPa:sigmaLimit,allowableDeflectionMm:deltaLimit} = input;
  const I = b * h ** 3 / 12;
  const W = b * h ** 2 / 6;
  const q = load / L;
  const bendingMomentNmm = q * L ** 2 / 8;
  const maxStressMPa = bendingMomentNmm / W;
  const deflectionMm = 5 * q * L ** 4 / (384 * E * I);
  // Finite inputs may still overflow or underflow intermediate arithmetic,
  // and 3-decimal presentation can conceal a non-zero result as zero.
  // Neither situation can justify a positive engineering safety conclusion.
  const derived = [I, W, q, bendingMomentNmm, maxStressMPa, deflectionMm];
  const reported = [round(bendingMomentNmm), round(I), round(maxStressMPa), round(deflectionMm)];
  if (derived.some(n => !Number.isFinite(n) || n <= 0) ||
      reported.some(n => !Number.isFinite(n) || n <= 0)) {
    return {
      status:'numerical-range-invalid', withinUserLimits:false,
      certifiesFurniture:false,
      disclaimer:'Расчёт вышел за устойчивый числовой диапазон или точность отображения; вывод о прочности запрещён'
    };
  }
  return {
    status:'preliminary-simple-span',
    assumptions:['Равномерно распределённая нагрузка','Два шарнирных опирания','Линейная упругость','Без учёта креплений, ползучести, боковой устойчивости и динамики'],
    inputs:structuredClone(input),
    bendingMomentNmm:round(bendingMomentNmm),
    secondMomentMm4:round(I),
    maxStressMPa:round(maxStressMPa),
    deflectionMm:round(deflectionMm),
    withinUserLimits:maxStressMPa <= sigmaLimit && deflectionMm <= deltaLimit,
    certifiesFurniture:false
  };
}

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

export function panelPattern(config,materialSpec={}) {
  const allowanceMm=12;
  const width=config.pillowWidth*10,height=config.pillowHeight*10,depth=config.pillowShape==='bolster'?230:130;
  if(config.pillows===0) return {status:'none',pieces:[],requiredEvidence:[]};
  if(config.pillowShape==='bolster')return {
    status:'cad-template-required',pieces:[],
    requiredEvidence:['Выкройка торцов валика','Реальный диаметр и длина','Крепление канта и молнии']
  };
  const pieces=[
    {id:'PILLOW-FRONT',qty:config.pillows,widthMm:width+2*allowanceMm,heightMm:height+2*allowanceMm,grain:'along-height'},
    {id:'PILLOW-BACK',qty:config.pillows,widthMm:width+2*allowanceMm,heightMm:height+2*allowanceMm,grain:'along-height'},
    {id:'PILLOW-GUSSET',qty:config.pillows,widthMm:2*(width+height)+4*allowanceMm,heightMm:depth+2*allowanceMm,grain:'along-length'}
  ];
  const rollWidthMm=materialSpec?.rollWidthMm;
  if(!finitePositive(rollWidthMm))return {
    status:'roll-width-unverified',pieces,markerLengthMm:null,
    requiredEvidence:['Подтверждённая ширина рулона','Раппорт рисунка','Усадка','Направление ворса']
  };
  // Grain is fixed: rotating a directed textile piece is not an allowed fallback.
  const impossible=pieces.filter(p=>(p.grain==='along-height'?p.widthMm:p.heightMm)>rollWidthMm);
  return {
    status:impossible.length?'does-not-fit-roll':'layout-required',
    pieces,rollWidthMm,markerLengthMm:null,
    requiredEvidence:['Раскладка лекал на рулоне с припусками','Направление ворса','Раппорт рисунка','Усадка'],
    note:'Детали заданы прямоугольными оболочками, не финальными лекалами. Метраж не рассчитывается без раскладки.'
  };
}

export function foamCompression(curve,relativeCompression,originalThicknessMm) {
  if(!Array.isArray(curve)||curve.length<2||!Number.isFinite(relativeCompression)||relativeCompression<0||relativeCompression>0.8||!finitePositive(originalThicknessMm))
    throw new Error('Неверная кривая сжатия или толщина');
  for(let i=0;i<curve.length;i++){
    const p=curve[i];
    if(!Number.isFinite(p.strain)||p.strain<0||p.strain>0.8||!Number.isFinite(p.stressKPa)||p.stressKPa<0 ||
      (i && (p.strain<=curve[i-1].strain || p.stressKPa<curve[i-1].stressKPa)))
      throw new Error('Кривая должна быть строго упорядоченной по деформации и неубывающей по напряжению');
  }
  if(relativeCompression<curve[0].strain || relativeCompression>curve.at(-1).strain)
    throw new Error('Экстраполяция за пределами подтверждённого измерения запрещена');
  const upper=curve.findIndex(p=>p.strain>=relativeCompression);
  if(upper===0)return {stressKPa:curve[0].stressKPa,deformedThicknessMm:round(originalThicknessMm*(1-relativeCompression)),measuredRangeOnly:true};
  const a=curve[upper-1],b=curve[upper],t=(relativeCompression-a.strain)/(b.strain-a.strain);
  return {
    stressKPa:round(a.stressKPa+(b.stressKPa-a.stressKPa)*t),
    deformedThicknessMm:round(originalThicknessMm*(1-relativeCompression)),
    measuredRangeOnly:true,
    note:'Численная интерполяция реальной кривой материала; не расчёт всей подушки или тела человека'
  };
}

function lookupApproved(evidence,id) {
  const entry=evidence?.materials?.[id];
  return approvedDoc(entry)?{
    sku: typeof entry.sku==='string'&&entry.sku.trim()?entry.sku:null,
    documentRef:entry.reference,revision:entry.revision,approvedBy:entry.approvedBy
  }:null;
}

export function createManufacturingPackage(config,evidence={}) {
  const engineering=getEngineeringModel(config);
  const instances=frameInstances(engineering);
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
  const parts=instances.map(instance=>{
    const row=engineering.cutList.find(p=>p.id===instance.sourceGroup);
    const partId=instance.partId,materialApproval=lookupApproved(evidence,row.id);
    return {
      partId,sourceGroup:row.id,name:row.name,
      drawingRevision:approvedDoc(evidence.drawings?.[row.id])?evidence.drawings[row.id].revision:null,
      nominalSizeMm:structuredClone(row.sizeMm), materialConcept:row.material,
      actualMaterialSku:materialApproval?.sku??null,
      supplyEvidenceRef:materialApproval?.documentRef??null,
      workflow:['cut','join','assemble'],
      manufacturingRouteId:'RT-'+partId,
      sceneNodeRef:instance.sceneNodeRef,
      sceneTransform:structuredClone(instance),
      unitCostRUB:null,
      unitCostEvidenceRef:null,
      approval:'unreleased'
    };
  });
  const layers=engineering.layers.map(layer=>({
    id:layer.id,zone:layer.zone,thicknessMm:layer.thicknessMm,
    nominalDensityKgM3:layer.densityKgM3,
    compressionCurveRef:approvedDoc(evidence.foam?.[layer.id])?evidence.foam[layer.id].reference:null,
    materialSku:lookupApproved(evidence,layer.id)?.sku??null,
    quantity:null,costRUB:null,approval:'unreleased'
  }));
  const hardware=engineering.hardware.map(h=>({
    hardwareId:h.id,description:h.name,quantity:h.qty,
    supplierSku:lookupApproved(evidence,'HW-'+h.id)?.sku??null,
    drawingsRef:approvedDoc(evidence.drawings?.['HW-'+h.id])?evidence.drawings['HW-'+h.id].reference:null,
    unitCostRUB:null,approval:'unreleased'
  }));
  const routing=parts.map(p=>({
    id:p.manufacturingRouteId,partId:p.partId,
    operations:[
      {code:'CUT',timeMin:null,machine:null,revision:null},
      {code:'DRILL-JOIN',timeMin:null,machine:null,revision:null},
      {code:'QC-DIM',timeMin:null,machine:null,revision:null}
    ],instructions:'Await approved process instructions, machine capabilities and inspection tolerances'
  }));
  const pattern=panelPattern(config,evidence.fabric);
  const releaseChecks=[
    ...engineering.checks.filter(g=>g.status!=='pass').map(g=>({id:'ENGINEERING:'+g.id,passed:false,message:g.message})),
    {id:'DESIGN_REVIEW',passed:approvedDoc(evidence.designReview),message:'Engineering signoff with approved revision'},
    {id:'CAD_DRAWINGS',passed:engineering.cutList.every(p=>approvedDoc(evidence.drawings?.[p.id])),message:'Approved revision for each frame part family'},
    {id:'BOM_MATERIALS',passed:parts.every(p=>p.actualMaterialSku),message:'Approved supplier materials and SKUs'},
    {id:'JOINTS',passed:joints.every(j=>typeof j.fastenerSku==='string'&&j.fastenerSku&&j.drillPatternMm),message:'Joint fasteners and drilling patterns unverified'},
    {id:'SOFT_MATERIALS',passed:layers.every(x=>x.materialSku&&x.compressionCurveRef),message:'Approved foam material properties and compression curves'},
    {id:'UPHOLSTERY',passed:finitePositive(evidence.fabric?.rollWidthMm)&&approvedDoc(evidence.patternDrawing)&&!['does-not-fit-roll','cad-template-required'].includes(pattern.status),message:'Approved cutting marker, supplier roll and cover drawing'},
    {id:'HARDWARE',passed:hardware.every(x=>x.supplierSku&&x.drawingsRef),message:'Manufacturer specifications and hardware certifications'},
    {id:'ROUTING',passed:false,message:'Operation standards and QC route require factory MES approval'},
    {id:'PRICE',passed:false,message:'Cost rates, effective dates, scrap and finance approval absent'},
    {id:'STRUCTURAL_TESTS',passed:approvedDoc(evidence.loadTest),message:'Finished assembly safety/strength test needed'},
    {id:'MOTION_SAFETY',passed:config.mechanism==='none'||approvedDoc(evidence.motionTest),message:'Vendor-certified mechanism motion and entrapment inspection'},
    {id:'AUTHORITY',passed:false,message:'Client-side prototype has no authenticated engineer/factory approval'}
  ];
  return {
    schemaVersion:PRODUCTION_SCHEMA,
    productionRelease:{
      allowed:false,
      blockers:releaseChecks.filter(x=>!x.passed).map(x=>x.id),
      reason:'Approval cannot be granted by a public client-side configurator'
    },
    sourceConfig:structuredClone(config),
    engineeringVersion:engineering.schemaVersion,
    envelopeCm:structuredClone(engineering.envelopeCm),
    joinery:joints,parts,layers,hardware,routing,upholstery:pattern,
    traceability:{
      partCount:parts.length,
      linkedPartIds:parts.map(p=>p.partId),
      nodeToPartId:Object.fromEntries(parts.map(p=>[p.sceneNodeRef,p.partId])),
      costingMode:'no-verified-production-price',
      actualCostsAvailable:false,
      drawingReleaseId:null
    },
    releaseChecks,
    referenceFabric:{digitalId:getFabric(config).id,approvedSku:null}
  };
}

export function requireProductionRelease(pkg) {
  if(!pkg?.productionRelease?.allowed || pkg.productionRelease.blockers?.length)
    throw new Error('Производственный выпуск запрещён: недостаточно подтверждённых нормативов и полномочий');
  throw new Error('Выпуск возможен только через будущий серверный авторизованный контур');
}

