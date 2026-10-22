import {evaluateFactoryCostDraft} from './factoryCosting.js';
import {createCostTraceability} from './costTraceability.js';

export const FACTORY_INSIGHTS_SCHEMA='gaber-factory-insights/0.4.10';
const round=x=>Math.round((x+Number.EPSILON)*100)/100;
const pct=(n,d)=>d>0?Math.round(n/d*1000)/10:0;
const LABELS={
 frame:'Каркас',soft:'Наполнение',support:'Основание и подвеска',
 hardware:'Комплектующие', 'unmodelled-layer':'Неразработанные мягкие слои',
 'unmodelled-textile':'Обивка без раскройной карты',
 'unmodelled-packing':'Упаковка без спецификации',
 'unmodelled-hardware':'Непроработанный крепёж'
};
/**
 * Decision support for human-entered preliminary costs only.
 * Neither complete input coverage nor a balanced amount proves factory approval.
 * Recompute on every call: never trust totals or entities from an imported report.
 */
export function buildFactoryInsights(config,draft){
 const report=evaluateFactoryCostDraft(config,draft);
 const trace=createCostTraceability(config);
 const kinds=new Map(trace.designElements.map(e=>[e.id,e.kind]));
 const groups=new Map();
 const group=(kind)=>{
  if(!groups.has(kind))groups.set(kind,{
   id:kind,label:LABELS[kind]||kind,
   enteredRUB:0,enteredLines:0,requiredItems:0,missingItems:0
  });
  return groups.get(kind);
 };
 for(const id of report.coverage.requiredMaterialRefs||[])
  group(kinds.get(id)||'unmapped').requiredItems++;
 for(const id of report.coverage.missingMaterialRefs||[])
  group(kinds.get(id)||'unmapped').missingItems++;
 const materialLines=report.materialLines.map(line=>{
  const kind=kinds.get(line.entityId)||'unmapped',g=group(kind);
  g.enteredRUB=round(g.enteredRUB+line.amountRUB);g.enteredLines++;
  return {type:'material',id:line.entityId,groupId:kind,label:line.entityId,
   amountRUB:line.amountRUB,unit:line.unit,source:line.sourceRef,
   verified:false,unitReviewRequired:line.unitReviewRequired===true};
 });
 const centers=new Map();
 const operationLines=report.operationLines.map(line=>{
  const id=line.workCenterId;
  if(!centers.has(id))centers.set(id,{id,minutes:0,enteredRUB:0,operations:0});
  const item=centers.get(id);
  item.minutes=round(item.minutes+line.minutes);
  item.enteredRUB=round(item.enteredRUB+line.amountRUB);
  item.operations++;
  return {type:'operation',id:line.routeId+'|'+line.operationCode,
   groupId:'operation',label:line.operationCode+' · '+line.routeId,
   amountRUB:line.amountRUB,unit:'min',source:line.rateSourceRef,
   verified:false,unitReviewRequired:false};
 });
 const totalMaterials=round(materialLines.reduce((s,r)=>s+r.amountRUB,0));
 const totalOperations=round(operationLines.reduce((s,r)=>s+r.amountRUB,0));
 const total=round(totalMaterials+totalOperations);
 const reportSum=report.totals.partialDirectRUB;
 const issues=[...report.issues];
 if(total!==reportSum)issues.push({code:'INSIGHT_COST_RECONCILIATION',path:'totals'});
 const requiredMaterials=report.coverage.requiredMaterialRefs?.length||0;
 const requiredOperations=report.coverage.requiredOperations?.length||0;
 const measuredMaterials=requiredMaterials-(report.coverage.missingMaterialRefs?.length||0);
 const measuredOperations=requiredOperations-(report.coverage.missingOperations?.length||0);
 const allLines=[...materialLines,...operationLines];
 const topLines=[...allLines].sort((a,b)=>b.amountRUB-a.amountRUB||
   a.id.localeCompare(b.id)).slice(0,8).map(line=>({...line,sharePct:pct(line.amountRUB,total)}));
 const byGroup=[...groups.values()].sort((a,b)=>b.enteredRUB-a.enteredRUB||
   a.id.localeCompare(b.id)).map(g=>({...g,sharePct:pct(g.enteredRUB,total)}));
 const reviewUnits=report.coverage.unitReviewRefs||[];
 const totalRequired=requiredMaterials+requiredOperations;
 const missing=totalRequired-measuredMaterials-measuredOperations;
 return {
  schemaVersion:FACTORY_INSIGHTS_SCHEMA,
  status:issues.length?'invalid-input':report.status,
  issues,source:'local-human-input-not-independent-factory-evidence',
  scope:'provisional-entered-amounts-only',
  totals:{enteredMaterialsRUB:totalMaterials,enteredOperationsRUB:totalOperations,
   enteredDirectRUB:total,
   provisionalDirectRUB:!issues.length?report.totals.provisionalDirectRUB:null,
   factoryApprovedCostRUB:null,actualCostRUB:null},
  coverage:{
   requiredMaterials,enteredMaterials:measuredMaterials,
   requiredOperations,enteredOperations:measuredOperations,
   totalRequired,missing,
   enteredPct:pct(measuredMaterials+measuredOperations,totalRequired),
   materialPct:pct(measuredMaterials,requiredMaterials),
   operationPct:pct(measuredOperations,requiredOperations),
   unitReviewRefs:[...reviewUnits],
   unmodelledRefs:[...(report.coverage.unmodelledRefs||[])],
   externallyVerified:false,
   fullyEntered:!issues.length&&report.status==='self-reported-input-complete'
  },
  byGroup,byWorkCenter:[...centers.values()].sort((a,b)=>b.enteredRUB-a.enteredRUB||
   a.id.localeCompare(b.id)),
  topLines,
  anomalies:[
   ...(reviewUnits.length?[{code:'UNIT_BASIS_REVIEW',count:reviewUnits.length}]:[]),
   ...(report.coverage.unmodelledRefs?.length?[{code:'UNMODELLED_ENTITIES',count:report.coverage.unmodelledRefs.length}]:[]),
   ...(missing?[{code:'INCOMPLETE_DATA',count:missing}]:[])
  ],
  productionRelease:{allowed:false}
 };
}
