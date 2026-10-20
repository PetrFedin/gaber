import {createManufacturingPackage} from './manufacturing.js';
import {createCostTraceability} from './costTraceability.js';

export const FACTORY_DRAFT_SCHEMA='gaber-factory-cost-draft/0.4.7';
export const FACTORY_REVIEW_SCHEMA='gaber-factory-cost-review/0.4.7';
const UNITS=new Set(['pcs','m','m2','m3','kg']);
const text=x=>typeof x==='string'&&x.trim().length>0&&x.length<=200;
const nonnegative=x=>Number.isFinite(x)&&x>=0&&x<=1e9;
const positive=x=>nonnegative(x)&&x>0;
const money=x=>Math.round((x+Number.EPSILON)*100)/100;
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const date=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&!Number.isNaN(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x;
const validPeriod=(v,day)=>date(v.validFrom)&&date(v.validTo)&&v.validFrom<=day&&day<=v.validTo;

export function emptyFactoryCostDraft(config,asOfDate,revisionId='LOCAL-DRAFT'){
 if(!date(asOfDate))throw Error('Expected YYYY-MM-DD date');
 return {schemaVersion:FACTORY_DRAFT_SCHEMA,sourceConfig:structuredClone(config),asOfDate,revisionId,parentRevisionId:null,
   quotes:[],consumption:[],workCenters:[],operations:[]};
}
function emptyReview(d,issues){
 return {schemaVersion:FACTORY_REVIEW_SCHEMA,revisionId:d?.revisionId??null,status:'invalid-input',issues,
  materialLines:[],operationLines:[],coverage:{requiredMaterialRefs:[],missingMaterialRefs:[],requiredOperations:[],missingOperations:[],unmodelledRefs:[]},
  totals:{enteredMaterialRUB:0,enteredLaborRUB:0,partialDirectRUB:0,provisionalDirectRUB:null,approvedCostRUB:null,actualCostRUB:null},
  sourceAuthority:'user-supplied-unverified',productionRelease:{allowed:false}};
}

/** A user-entered, provisional scenario. No CAD envelope can imply measured consumption. */
export function evaluateFactoryCostDraft(config,draft){
 if(!draft||draft.schemaVersion!==FACTORY_DRAFT_SCHEMA||!['quotes','consumption','workCenters','operations'].every(k=>Array.isArray(draft[k])))
   return emptyReview(draft,[{code:'BAD_SCHEMA',path:'draft'}]);
 if(draft.quotes.length>2000||draft.consumption.length>20000||draft.workCenters.length>2000||draft.operations.length>20000)
   return emptyReview(draft,[{code:'TOO_LARGE',path:'draft'}]);
 const issues=[],bad=(code,path)=>issues.push({code,path});
 if(!date(draft.asOfDate))bad('INVALID_DATE','asOfDate');
 if(!text(draft.revisionId))bad('REVISION_REQUIRED','revisionId');
 if(draft.parentRevisionId!==null&&!text(draft.parentRevisionId))bad('INVALID_PARENT','parentRevisionId');
 if(!same(config,draft.sourceConfig))bad('STALE_CONFIGURATION','sourceConfig');
 const pkg=createManufacturingPackage(config),trace=createCostTraceability(config);
 if(!pkg.integrity.ok||!trace.audit.ok)bad('DIGITAL_AUDIT_FAILED','manufacturing');
 const entities=new Map(trace.designElements.map(e=>[e.id,e]));
 const costable=new Set(['frame','soft','support','hardware','unmodelled-layer','unmodelled-textile','unmodelled-packing','unmodelled-hardware']);
 const requiredMaterialRefs=[...new Set([
   ...trace.designElements.filter(e=>['frame','soft','support','hardware'].includes(e.kind)).map(e=>e.id),
   ...trace.rows.flatMap(r=>r.linkedEntityIds).filter(id=>costable.has(entities.get(id)?.kind))
 ])];
 const requiredOperations=pkg.routing.flatMap(r=>r.operations.map(o=>r.id+'|'+o.code));
 const routes=new Map(pkg.routing.map(r=>[r.id,new Set(r.operations.map(o=>o.code))]));
 const quotes=new Map(),rates=new Map(),materialLines=[],operationLines=[];
 for(const [i,q] of draft.quotes.entries()){
   if(!q||!text(q.priceId)||!text(q.sku)||!text(q.supplierRef)||!text(q.documentRef)||!text(q.revision)||
     !UNITS.has(q.unit)||q.currency!=='RUB'||!nonnegative(q.unitPriceRUB)||!validPeriod(q,draft.asOfDate)){
     bad('QUOTE_INVALID','quotes['+i+']');continue;
   }
   if(quotes.has(q.priceId)){bad('QUOTE_DUPLICATE','quotes['+i+']');continue;}
   quotes.set(q.priceId,q);
 }
 for(const [i,r] of draft.workCenters.entries()){
   if(!r||!text(r.rateId)||!text(r.workCenterId)||!text(r.documentRef)||!text(r.revision)||
      !nonnegative(r.rateRUBPerHour)||!validPeriod(r,draft.asOfDate)){
     bad('WORKCENTER_INVALID','workCenters['+i+']');continue;
   }
   if(rates.has(r.rateId)){bad('WORKCENTER_DUPLICATE','workCenters['+i+']');continue;}
   rates.set(r.rateId,r);
 }
 const charged=new Set(),pricedEntities=new Set();
 for(const [i,row] of draft.consumption.entries()){
   const at='consumption['+i+']';
   if(!row||!text(row.entityId)||!text(row.priceId)||!positive(row.measuredQty)||!nonnegative(row.wastePct)||
      row.wastePct>100||!text(row.measurementRef)){bad('CONSUMPTION_INVALID',at);continue;}
   const entity=entities.get(row.entityId),q=quotes.get(row.priceId);
   if(!entity||!costable.has(entity.kind)){bad('ENTITY_UNKNOWN',at);continue;}
   if(!q){bad('QUOTE_NOT_ACTIVE',at);continue;}
   const key=row.entityId+'|'+row.priceId;
   if(charged.has(key)){bad('CONSUMPTION_DUPLICATE',at);continue;}
   charged.add(key);
   const amount=money(row.measuredQty*(1+row.wastePct/100)*q.unitPriceRUB);
   if(!Number.isFinite(amount)||amount>1e12){bad('PRICE_OVERFLOW',at);continue;}
   pricedEntities.add(row.entityId);
   materialLines.push({entityId:row.entityId,priceId:q.priceId,sku:q.sku,unit:q.unit,
     measuredQty:row.measuredQty,wastePct:row.wastePct,rateRUB:q.unitPriceRUB,amountRUB:amount,
     sourceRef:q.documentRef,measurementRef:row.measurementRef,factoryVerified:false});
 }
 const usedOperations=new Set(),pricedSteps=new Set();
 for(const [i,row] of draft.operations.entries()){
   const at='operations['+i+']';
   if(!row||!text(row.routeId)||!text(row.operationCode)||!text(row.rateId)||
     !positive(row.minutes)||!text(row.measurementRef)){bad('OPERATION_INVALID',at);continue;}
   const key=row.routeId+'|'+row.operationCode;
   if(!routes.get(row.routeId)?.has(row.operationCode)){bad('UNKNOWN_ROUTE',at);continue;}
   const rate=rates.get(row.rateId);
   if(!rate){bad('RATE_NOT_ACTIVE',at);continue;}
   if(usedOperations.has(key)){bad('OPERATION_DUPLICATE',at);continue;}
   usedOperations.add(key);
   const amount=money(row.minutes*rate.rateRUBPerHour/60);
   if(!Number.isFinite(amount)||amount>1e12){bad('LABOR_OVERFLOW',at);continue;}
   pricedSteps.add(key);
   operationLines.push({routeId:row.routeId,operationCode:row.operationCode,
      rateId:rate.rateId,workCenterId:rate.workCenterId,minutes:row.minutes,
      rateRUBPerHour:rate.rateRUBPerHour,amountRUB:amount,
      rateSourceRef:rate.documentRef,measurementRef:row.measurementRef,factoryVerified:false});
 }
 const missingMaterialRefs=requiredMaterialRefs.filter(id=>!pricedEntities.has(id));
 const missingOperations=requiredOperations.filter(id=>!pricedSteps.has(id));
 const materialSum=money(materialLines.reduce((s,r)=>s+r.amountRUB,0));
 const laborSum=money(operationLines.reduce((s,r)=>s+r.amountRUB,0));
 const complete=!issues.length&&!missingMaterialRefs.length&&!missingOperations.length;
 return {schemaVersion:FACTORY_REVIEW_SCHEMA,revisionId:draft.revisionId,
  status:issues.length?'invalid-input':complete?'self-reported-input-complete':'incomplete',issues,
  materialLines,operationLines,coverage:{requiredMaterialRefs,missingMaterialRefs,requiredOperations,missingOperations,
    unmodelledRefs:trace.designElements.filter(e=>e.kind.startsWith('unmodelled-')).map(e=>e.id)},
  totals:{enteredMaterialRUB:materialSum,enteredLaborRUB:laborSum,
    partialDirectRUB:money(materialSum+laborSum),provisionalDirectRUB:complete?money(materialSum+laborSum):null,
    approvedCostRUB:null,actualCostRUB:null},
  sourceAuthority:'user-supplied-unverified',manufacturingIntegrityOk:pkg.integrity.ok,
  productionRelease:{allowed:false,reason:'Supplier records and time entries are user claims, not verified factory data'}};
}
/** Recompute, rather than trust, exported totals, coverage, and release status. */
export function auditFactoryCostDraft(config,draft,report){
 const actual=evaluateFactoryCostDraft(config,draft);
 const keys=['schemaVersion','revisionId','status','issues','materialLines','operationLines','coverage','totals','sourceAuthority','productionRelease','manufacturingIntegrityOk'];
 const mismatched=keys.filter(k=>!same(actual[k]??null,report?.[k]??null));
 return {ok:!mismatched.length&&actual.status!=='invalid-input',mismatched,productionRelease:{allowed:false}};
}
export function compareFactoryCostDrafts(aConfig,aDraft,bConfig,bDraft){
 const a=evaluateFactoryCostDraft(aConfig,aDraft),b=evaluateFactoryCostDraft(bConfig,bDraft);
 const keyed=(arr,fn)=>new Map(arr.map(row=>[fn(row),row.amountRUB]));
 const diff=(x,y)=>[...new Set([...x.keys(),...y.keys()])].filter(k=>x.get(k)!==y.get(k))
  .map(key=>({key,beforeRUB:x.get(key)??0,afterRUB:y.get(key)??0,deltaRUB:money((y.get(key)??0)-(x.get(key)??0))}));
 return {beforeRevisionId:a.revisionId,afterRevisionId:b.revisionId,beforeStatus:a.status,afterStatus:b.status,
  materialChanges:diff(keyed(a.materialLines,r=>r.entityId+'|'+r.priceId),keyed(b.materialLines,r=>r.entityId+'|'+r.priceId)),
  operationChanges:diff(keyed(a.operationLines,r=>r.routeId+'|'+r.operationCode),keyed(b.operationLines,r=>r.routeId+'|'+r.operationCode)),
  partialDirectDeltaRUB:money(b.totals.partialDirectRUB-a.totals.partialDirectRUB),
  completeDirectDeltaRUB:a.totals.provisionalDirectRUB!==null&&b.totals.provisionalDirectRUB!==null
    ?money(b.totals.provisionalDirectRUB-a.totals.provisionalDirectRUB):null,
  productionRelease:{allowed:false}};
}
/** Local snapshots are copies, not authenticated immutable revisions. */
export function snapshotFactoryCostDraft(config,draft,recordedAt,revisionId){
 if(!text(revisionId)||typeof recordedAt!=='string'||!Number.isFinite(Date.parse(recordedAt)))
   throw Error('Revision ID and ISO recordedAt required');
 const review=evaluateFactoryCostDraft(config,draft);
 if(review.status==='invalid-input')throw Error('Invalid or stale production-cost inputs');
 return {schemaVersion:'gaber-local-factory-revision/0.4.7',revisionId,
  parentRevisionId:draft.parentRevisionId??null,recordedAt,
  configSnapshot:structuredClone(config),inputSnapshot:structuredClone(draft),reviewSnapshot:structuredClone(review),
  authority:'LOCAL_DRAFT_NOT_FACTORY_APPROVED'};
}
