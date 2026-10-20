import {createManufacturingPackage} from './manufacturing.js';
import {estimate,defaultProfile} from './costing.js';

export const COST_TRACE_VERSION='gaber-cost-traceability/0.4.6';
const round6=n=>Math.round(n*1e6)/1e6;
const volume=s=>round6(s.x*s.y*s.z/1e9);

/**
 * Demo line-item references to manufacturing entities only. These are NOT
 * allocated part costs, purchased quantities, supplier rates or instructions.
 */
export function createCostTraceability(config,profile=defaultProfile()){
 const pkg=createManufacturingPackage(config),quote=estimate(config,0,profile);
 const entities=[];
 const add=(id,kind,properties={})=>{
   if(entities.some(x=>x.id===id))throw Error('Duplicate entity '+id);
   entities.push({id,kind,productionCostRUB:null,approved:false,...properties});
 };
 for(const p of pkg.parts)add('PART:'+p.partId,'frame',{
   sceneNodeRef:p.sceneNodeRef,routeRef:p.manufacturingRouteId,
   quantity:1,quantityUnit:'concept-piece',conceptVolumeM3:volume(p.sceneTransform.sizeMm),
   dimensionsMm:structuredClone(p.sceneTransform.sizeMm),materialSku:p.actualMaterialSku});
 for(const p of pkg.suspension.pieces)add('SUPPORT:'+p.sceneNodeRef,'support',{
   sceneNodeRef:p.sceneNodeRef,quantity:1,quantityUnit:'concept-piece',
   conceptLengthMm:p.sizeMm.length,dimensionsMm:structuredClone(p.sizeMm),materialSku:p.supplierSku});
 for(const layer of pkg.layers){
   if(!layer.envelopes.length)add('UNMODELLED:SOFT:'+layer.id,'unmodelled-layer',{
     layerId:layer.id,quantity:null,quantityUnit:null,reason:'No measured mass or modeled filling envelope'});
   for(const p of layer.envelopes)add('SOFT:'+p.sceneNodeRef,'soft',{
     layerId:layer.id,sceneNodeRef:p.sceneNodeRef,quantity:1,quantityUnit:'concept-envelope',
     conceptVolumeM3:volume(p.sizeMm),dimensionsMm:structuredClone(p.sizeMm),materialSku:layer.materialSku});
 }
 for(const h of pkg.hardware)add('HARDWARE:'+h.hardwareId,'hardware',{
   quantity:h.quantity,quantityUnit:'supplier set/piece requires confirmation',
   sceneNodeRefs:[...h.sceneNodeRefs],materialSku:h.supplierSku});
 for(const r of pkg.routing)add('ROUTE:'+r.id,'routing',{
   partId:r.partId,operations:r.operations.map(o=>({code:o.code,minutes:o.timeMin,workCenter:o.machine})),
   quantity:null,quantityUnit:'not-yet-issued-operation'});
 const textile='UPHOLSTERY:'+pkg.referenceFabric.digitalId;
 add(textile,'unmodelled-textile',{quantity:null,quantityUnit:'unverified-marker',
   reason:'Full upholstery patterns, shrinkage, grain, roll width and nesting remain unverified'});
 for(const [id,kind,reason] of [
   ['UNMODELLED:PACKING','unmodelled-packing','Packaging specification unknown'],
   ['UNMODELLED:HEADBOARD_MOUNT','unmodelled-hardware','Wall/mounting fasteners unspecified'],
   ['UNMODELLED:WOOD_ARM_INSERTS','unmodelled-hardware','Decorative inserts not modeled'],
   ['UNMODELLED:UPHOLSTERY_LABOR','unmodelled-operation','No sewing/upholstering route with approved time'],
   ['FINANCE:OVERHEAD','financial-only','Demonstration overhead, not a part']
 ])add(id,kind,{quantity:null,quantityUnit:null,reason});
 const ids=new Set(entities.map(e=>e.id));
 const group=k=>entities.filter(e=>e.kind===k).map(e=>e.id);
 const hardware=k=>ids.has('HARDWARE:'+k)?['HARDWARE:'+k]:[];
 const target=id=>{
   switch(id){
     case 'fabric':case 'seam':return [textile];
     case 'frame':return group('frame');
     case 'filling':return [...group('soft'),...group('unmodelled-layer'),...group('support')];
     case 'mount':return ['UNMODELLED:HEADBOARD_MOUNT'];
     case 'legs':return hardware('legs');
     case 'storage':return hardware('storage');
     case 'woodArms':return ['UNMODELLED:WOOD_ARM_INSERTS'];
     case 'charging':return hardware('charging');
     case 'lamps':return hardware('lamps');
     case 'covers':return [...hardware('zipper'),textile];
     case 'connector':return hardware('connector');
     case 'fold':case 'slide':case 'recliner':return hardware('mechanism');
     case 'labor':return [...group('routing'),'UNMODELLED:UPHOLSTERY_LABOR'];
     case 'packing':return ['UNMODELLED:PACKING'];
     case 'overhead':return ['FINANCE:OVERHEAD'];
     default:throw Error('Missing explicit mapping for cost row '+id);
   }
 };
 const rows=quote.rows.map(r=>{
   const linkedEntityIds=target(r.id);
   if(!linkedEntityIds.length||new Set(linkedEntityIds).size!==linkedEntityIds.length||
      linkedEntityIds.some(id=>!ids.has(id)))throw Error('Unlinked demo expense '+r.id);
   return {
     id:r.id,sourceRowRef:'DEMO_COST:'+r.id,description:r.name,
     demoQuantity:r.qty,demoUnit:r.unit,demoUnitRateRUB:r.rate,
     demoAmountRUB:r.cost,demoSource:r.source,linkedEntityIds,
     hasUnmodelledBasis:linkedEntityIds.some(id=>id.startsWith('UNMODELLED:')||id===textile),
     realMaterialConsumption:null,realUnitCostRUB:null,realTotalCostRUB:null,
     status:'demonstration-only-not-allocated-to-parts'
   };
 });
 const linked=new Set(rows.flatMap(r=>r.linkedEntityIds));
 const result={
   schemaVersion:COST_TRACE_VERSION,mode:'ILLUSTRATIVE_ONLY_NOT_A_PURCHASE_ORDER',
   sourceConfig:structuredClone(config),profileSnapshot:structuredClone(profile),
   manufacturingSchema:pkg.schemaVersion,manufacturingIntegrityOk:pkg.integrity.ok,
   designElements:entities,rows,
   totals:{
     demoCostRUB:quote.cost,demoDirectRUB:quote.direct,
     demoPriceRUB:quote.price,demoFinalPriceRUB:quote.finalPrice,
     demoRowTotalRUB:rows.reduce((sum,r)=>sum+r.demoAmountRUB,0),
     actualCostRUB:null,actualMaterialCostRUB:null,actualLaborCostRUB:null
   },
   coverage:{
     entityCount:entities.length,mappedEntityCount:linked.size,
     rowsWithUnmodelledBasis:rows.filter(r=>r.hasUnmodelledBasis).map(r=>r.id),
     unpricedHardwareRefs:entities.filter(e=>e.kind==='hardware'&&!linked.has(e.id)).map(e=>e.id),
     sourceUnverified:true,measuredConsumptionAvailable:false,routeMinutesAvailable:false
   },
   productionRelease:{allowed:false,reason:'Supplier rates, approved consumption, routing and authorized factory review missing'}
 };
 result.audit=auditCostTraceability(result,quote);
 return result;
}

export function auditCostTraceability(ledger,expectedEstimate=null){
 const issues=[],fail=(code,message)=>issues.push({code,message});
 if(!ledger||!Array.isArray(ledger.rows)||!Array.isArray(ledger.designElements))
   return {ok:false,issues:[{code:'BAD_LEDGER',message:'Invalid cost document'}]};
 const refs=new Set(ledger.designElements.map(x=>x.id)),rows=new Set(ledger.rows.map(x=>x.id));
 if(refs.size!==ledger.designElements.length)fail('DUPLICATE_ENTITY','Duplicate entity ID');
 if(rows.size!==ledger.rows.length)fail('DUPLICATE_ROW','Duplicate expense ID');
 for(const r of ledger.rows){
   if(!Array.isArray(r.linkedEntityIds)||!r.linkedEntityIds.length||
      new Set(r.linkedEntityIds).size!==r.linkedEntityIds.length||
      r.linkedEntityIds.some(x=>!refs.has(x)))fail('UNLINKED_EXPENSE','Unmatched cost row '+r.id);
   if(!Number.isFinite(r.demoAmountRUB)||r.demoAmountRUB<0)
     fail('INVALID_AMOUNT','Invalid expense amount '+r.id);
   if(r.realMaterialConsumption!==null||r.realUnitCostRUB!==null||r.realTotalCostRUB!==null)
     fail('FAKE_REAL_COST','Unverified rates must remain unknown '+r.id);
 }
 const summed=ledger.rows.reduce((n,r)=>n+r.demoAmountRUB,0);
 if(!Number.isSafeInteger(summed)||summed!==ledger.totals?.demoCostRUB||
    summed!==ledger.totals?.demoRowTotalRUB)
   fail('UNBALANCED_LEDGER','Demo expenses do not balance');
 if(ledger.productionRelease?.allowed!==false||
    ledger.totals?.actualCostRUB!==null||
    ledger.totals?.actualMaterialCostRUB!==null||
    ledger.totals?.actualLaborCostRUB!==null)fail('UNAUTHORIZED_RELEASE','Real costing must remain blocked');
 if(expectedEstimate){
   if(expectedEstimate.cost!==summed||expectedEstimate.rows.length!==ledger.rows.length)
     fail('ESTIMATE_TOTAL','Mismatch against calculator');
   for(const p of expectedEstimate.rows){
     const r=ledger.rows.find(row=>row.id===p.id);
     if(!r||r.demoQuantity!==p.qty||r.demoUnitRateRUB!==p.rate||
        r.demoAmountRUB!==p.cost||r.demoSource!==p.source)
       fail('ESTIMATE_ROW','Calculator row changed '+p.id);
   }
 }
 return {ok:issues.length===0,issues};
}

/** Comparison keeps both demo snapshots immutable; also supports changed rates. */
export function compareCostTraceability(beforeConfig,afterConfig,beforeProfile=defaultProfile(),afterProfile=beforeProfile){
 const before=createCostTraceability(beforeConfig,beforeProfile);
 const after=createCostTraceability(afterConfig,afterProfile);
 const previous=new Map(before.rows.map(r=>[r.id,r]));
 const changedRows=after.rows.filter(r=>{
   const old=previous.get(r.id);
   return !old||old.demoAmountRUB!==r.demoAmountRUB||
     old.demoQuantity!==r.demoQuantity||old.demoUnitRateRUB!==r.demoUnitRateRUB||
     old.demoSource!==r.demoSource;
 }).map(r=>({
   id:r.id,priorCostRUB:previous.get(r.id)?.demoAmountRUB??0,
   currentCostRUB:r.demoAmountRUB,
   deltaRUB:r.demoAmountRUB-(previous.get(r.id)?.demoAmountRUB??0)
 }));
 for(const r of before.rows)if(!after.rows.some(a=>a.id===r.id))
   changedRows.push({id:r.id,priorCostRUB:r.demoAmountRUB,currentCostRUB:0,deltaRUB:-r.demoAmountRUB});
 const oldEntities=new Map(before.designElements.map(e=>[e.id,e]));
 const newEntities=new Map(after.designElements.map(e=>[e.id,e]));
 return {
   schemaVersion:COST_TRACE_VERSION,
   beforeCostRUB:before.totals.demoCostRUB,afterCostRUB:after.totals.demoCostRUB,
   deltaCostRUB:after.totals.demoCostRUB-before.totals.demoCostRUB,
   beforePriceRUB:before.totals.demoPriceRUB,afterPriceRUB:after.totals.demoPriceRUB,
   changedRows,
   addedEntityIds:after.designElements.filter(e=>!oldEntities.has(e.id)).map(e=>e.id),
   removedEntityIds:before.designElements.filter(e=>!newEntities.has(e.id)).map(e=>e.id),
   changedEntityIds:after.designElements.filter(e=>{
     const old=oldEntities.get(e.id);
     return old&&JSON.stringify(old)!==JSON.stringify(e);
   }).map(e=>e.id),
   illustrative:true,productionRelease:{allowed:false}
 };
}
