/** Concept BOM-based packout/receipt check. Not warehouse authority or production approval. */
import {createManufacturingPackage} from './manufacturing.js';
export const INSPECTION_SCHEMA='gaber-concept-inspection/1';
const fail=code=>{throw Error(code)};
const qty=n=>Number.isSafeInteger(n)&&n>=0&&n<=10000;
const valid=s=>typeof s==='string'&&s.trim().length>0&&s.length<=160;
export function getConceptPackoutPlan(config){
 const pkg=createManufacturingPackage(config);
 if(!pkg?.integrity?.ok)fail('PACKOUT_ENGINEERING_INVALID');
 const groups=new Map();
 for(const part of pkg.parts){
  if(!valid(part.sourceGroup)||!valid(part.name))fail('PACKOUT_BOM_INVALID');
  if(groups.has(part.sourceGroup))groups.get(part.sourceGroup).expectedQty++;
  else groups.set(part.sourceGroup,{partRef:part.sourceGroup,name:part.name,expectedQty:1});
 }
 const lines=[...groups.values()].sort((a,b)=>a.partRef.localeCompare(b.partRef,'en'));
 if(!lines.length||lines.length>80||lines.some(x=>!qty(x.expectedQty)||x.expectedQty===0))
  fail('PACKOUT_BOM_INVALID');
 return {schemaVersion:INSPECTION_SCHEMA,source:'CONCEPT_BOM_NOT_RELEASED',lines};
}
function matchLines(plan,raw,key,{receipt=false}={}){
 if(!Array.isArray(raw)||raw.length!==plan.lines.length)fail('INSPECTION_LINE_COUNT');
 const keyed=new Map();
 for(const item of raw){
  if(!item||typeof item!=='object'||Array.isArray(item)||
    Object.keys(item).some(k=>!['partRef',key,...(receipt?['damagedQty']:[])].includes(k))||
    !valid(item.partRef)||keyed.has(item.partRef)||!qty(item[key])||
    (receipt&&!qty(item.damagedQty)))fail('INSPECTION_LINE_INVALID');
  keyed.set(item.partRef,item);
 }
 return plan.lines.map(line=>{
  const item=keyed.get(line.partRef);
  if(!item||item[key]>line.expectedQty||(receipt&&item.damagedQty>item[key]))
   fail('INSPECTION_QUANTITY_INVALID');
  return {partRef:line.partRef,expectedQty:line.expectedQty,[key]:item[key],
   ...(receipt?{damagedQty:item.damagedQty}:{})};
 });
}
export function validateConceptPackout(config,lines){
 const plan=getConceptPackoutPlan(config),checked=matchLines(plan,lines,'packedQty');
 const shortages=checked.filter(x=>x.packedQty<x.expectedQty).map(x=>({
  partRef:x.partRef,missingQty:x.expectedQty-x.packedQty
 }));
 return {plan,lines:checked,shortages,complete:shortages.length===0};
}
export function validateConceptReceipt(packout,raw){
 if(!packout?.complete||!Array.isArray(packout.lines))fail('PACKOUT_REQUIRED');
 const plan={lines:packout.lines.map(x=>({partRef:x.partRef,expectedQty:x.packedQty}))};
 const lines=matchLines(plan,raw,'receivedQty',{receipt:true});
 const discrepancies=lines.filter(x=>x.receivedQty!==x.expectedQty||x.damagedQty>0)
  .map(x=>({partRef:x.partRef,missingQty:x.expectedQty-x.receivedQty,damagedQty:x.damagedQty}));
 return {lines,discrepancies,matched:discrepancies.length===0};
}
export function validateCorrectionProposal(discrepancies,raw){
 if(!Array.isArray(raw)||!raw.length||raw.length>80)fail('CORRECTION_INVALID');
 const allowed=new Map(discrepancies.map(x=>[x.partRef,x])),seen=new Set();
 return raw.map(x=>{
  if(!x||typeof x!=='object'||Array.isArray(x)||
     Object.keys(x).some(k=>!['partRef','kind','quantity'].includes(k))||
     !valid(x.partRef)||seen.has(x.partRef)||
     !['replace','repair','investigate'].includes(x.kind)||
     !Number.isSafeInteger(x.quantity)||x.quantity<1)fail('CORRECTION_INVALID');
  seen.add(x.partRef);
  const row=allowed.get(x.partRef);
  // A missing part cannot be repaired before it has actually been received.
  // "replace" and "investigate" may address missing and/or damaged units,
  // while "repair" is restricted to damaged units physically reported on receipt.
  const possible=row&&(x.kind==='repair'?row.damagedQty:row.missingQty+row.damagedQty);
  if(!possible||x.quantity>possible)fail('CORRECTION_NOT_RELEVANT');
  return {partRef:x.partRef,kind:x.kind,quantity:x.quantity};
 });
}
