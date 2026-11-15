import {getEngineeringModel} from './engineering.js';
import {getFabric} from './domain.js';
import {frameInstances} from './frameLayout.js';
import {supportInstances} from './supportLayout.js';
import {softInstances} from './softLayout.js';
import {auditProductionTraceability} from './traceability.js';
import {jointInstances} from './jointLayout.js';
export {jointProposals} from './jointLayout.js';

export const PRODUCTION_SCHEMA = 'gaber-production-concept/0.4.5';

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
  const joints=jointInstances(config,engineering,instances);
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
  const supportRecords=supportInstances(engineering);
  const suspension={
    type:engineering.suspension.type,
    nominalSpacingMm:engineering.suspension.spacingMm,
    supplierSku:null,approval:'unreleased',
    pieces:supportRecords.map(s=>({
      sceneNodeRef:s.sceneNodeRef,kind:s.kind,moduleIndex:s.moduleIndex,
      location:s.location,positionMm:structuredClone(s.positionMm),
      sizeMm:structuredClone(s.sizeMm),
      supplierSku:null,unitCostRUB:null,approval:'unreleased'
    })),
    partCount:supportRecords.length,
    geometryStatus:'concept-only',
    testEvidence:null
  };
  const soft=softInstances(engineering);
  const layers=engineering.layers.map(layer=>{
    const nodes=soft.filter(p=>p.layerId===layer.id);
    const sceneNodeRefs=nodes.map(p=>p.sceneNodeRef);
    const volumeM3=nodes.reduce((sum,p)=>sum+p.sizeMm.x*p.sizeMm.y*p.sizeMm.z,0)/1e9;
    const roundedVolume=nodes.length?Math.round(volumeM3*1000000)/1000000:null;
    const theoreticalMass=Number.isFinite(layer.densityKgM3)&&layer.densityKgM3>0
      ?Math.round(volumeM3*layer.densityKgM3*1000000)/1000000:null;
    return {
      id:layer.id,zone:layer.zone,thicknessMm:layer.thicknessMm,
      nominalDensityKgM3:layer.densityKgM3,sceneNodeRefs,
      envelopes:nodes.map(p=>({
        sceneNodeRef:p.sceneNodeRef,sizeMm:structuredClone(p.sizeMm),
        positionMm:structuredClone(p.positionMm),
        rotationXDeg:p.rotationXDeg,geometryKind:p.geometryKind
      })),
      geometryStatus:sceneNodeRefs.length?'schematic-layer-envelope':'not-modelled',
      quantity:nodes.length||null,
      nominalEnvelopeVolumeM3:roundedVolume,
      conceptEnvelopeMassKg:theoreticalMass,
      quantityBasis:'rectangular uncompressed 3D envelopes; not a cutting or material consumption norm',
      compressionCurveRef:approvedDoc(evidence.foam?.[layer.id])?evidence.foam[layer.id].reference:null,
      materialSku:lookupApproved(evidence,layer.id)?.sku??null,
      costRUB:null,approval:'unreleased'
    };
  });
  const hardware=engineering.hardware.map(h=>({
    hardwareId:h.id,description:h.name,quantity:h.qty,
    // Only explicitly modelled hardware receives real scene references.
    // Other mechanisms and accessories remain unmodelled and unreleased.
    sceneNodeRefs:['chaiseFoot','chaisePlinth'].includes(h.id)
      ? Array.from({length:h.qty},(_,i)=>'GABER_HW:'+h.id+':'+String(i+1).padStart(3,'0'))
      : [],
    geometryStatus:['chaiseFoot','chaisePlinth'].includes(h.id)
      ? 'unapproved-placeholder':'not-modelled',
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
    {id:'SUPPORT_SYSTEM',passed:false,message:'Опорная система: артикулы, монтажные натяжения, долговечность и нагрузочные испытания не утверждены'},
    {id:'UPHOLSTERY',passed:finitePositive(evidence.fabric?.rollWidthMm)&&approvedDoc(evidence.patternDrawing)&&pattern.status==='verified-layout'&&finitePositive(pattern.markerLengthMm),message:'Approved supplier fabric and measured full cover marker; a rectangular envelope or drawing alone is insufficient'},
    {id:'HARDWARE',passed:hardware.every(x=>x.supplierSku&&x.drawingsRef),message:'Manufacturer specifications and hardware certifications'},
    {id:'ROUTING',passed:false,message:'Operation standards and QC route require factory MES approval'},
    {id:'PRICE',passed:false,message:'Cost rates, effective dates, scrap and finance approval absent'},
    {id:'STRUCTURAL_TESTS',passed:approvedDoc(evidence.loadTest),message:'Finished assembly safety/strength test needed'},
    {id:'MOTION_SAFETY',passed:config.mechanism==='none'||approvedDoc(evidence.motionTest),message:'Vendor-certified mechanism motion and entrapment inspection'},
    {id:'AUTHORITY',passed:false,message:'Client-side prototype has no authenticated engineer/factory approval'}
  ];
  const packageData = {
    schemaVersion:PRODUCTION_SCHEMA,
    productionRelease:{
      allowed:false,
      blockers:releaseChecks.filter(x=>!x.passed).map(x=>x.id),
      reason:'Approval cannot be granted by a public client-side configurator'
    },
    sourceConfig:structuredClone(config),
    engineeringVersion:engineering.schemaVersion,
    envelopeCm:structuredClone(engineering.envelopeCm),
    joinery:joints,parts,layers,suspension,hardware,routing,upholstery:pattern,
    traceability:{
      partCount:parts.length,
      supportPartCount:suspension.partCount,
      softNodeCount:soft.length,
      linkedPartIds:parts.map(p=>p.partId),
      nodeToPartId:Object.fromEntries(parts.map(p=>[p.sceneNodeRef,p.partId])),
      costingMode:'no-verified-production-price',
      actualCostsAvailable:false,
      drawingReleaseId:null
    },
    releaseChecks,
    referenceFabric:{digitalId:getFabric(config).id,approvedSku:null}
  };
  packageData.integrity=auditProductionTraceability(packageData,engineering);
  packageData.releaseChecks.push({
    id:'DIGITAL_TRACEABILITY',passed:packageData.integrity.ok,
    message:'Shared scene/BOM/route/soft/support identifiers and envelope geometry; not a factory approval'
  });
  packageData.productionRelease.blockers=packageData.releaseChecks.filter(x=>!x.passed).map(x=>x.id);
  return packageData;
}

export function requireProductionRelease(pkg) {
  if(!pkg?.productionRelease?.allowed || pkg.productionRelease.blockers?.length)
    throw new Error('Производственный выпуск запрещён: недостаточно подтверждённых нормативов и полномочий');
  throw new Error('Выпуск возможен только через будущий серверный авторизованный контур');
}

