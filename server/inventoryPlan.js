/** Exact concept frame-BOM -> synthetic DEV stock item identities.
 * A hash makes separate sizes/materials distinct even when partRef repeats.
 * Synthetic IDs are NEVER vendor SKUs or evidence of supplier approval.
 */
import {createHash} from 'node:crypto';
import {createManufacturingPackage} from '../src/manufacturing.js';
export const STOCK_PLAN_SCHEMA='gaber-dev-stock-plan/1';
const fail=code=>{throw Error(code);};
const nonEmpty=x=>typeof x==='string'&&x.length>0&&x.length<=160;
export function deriveDemoStockPlan(config){
 const pkg=createManufacturingPackage(config);
 if(!pkg?.integrity?.ok)fail('STOCK_BOM_ENGINEERING_INVALID');
 const groups=new Map();
 for(const p of pkg.parts){
  if(!nonEmpty(p.sourceGroup)||!nonEmpty(p.name))fail('STOCK_BOM_PART_INVALID');
  const signature=createHash('sha256').update(JSON.stringify({
   category:config.category,partRef:p.sourceGroup,
   name:p.name,sizeMm:p.nominalSizeMm,material:p.materialConcept
  })).digest('hex');
  const item=groups.get(p.sourceGroup);
  if(item){
   if(item.sourceSignature!==signature)fail('STOCK_BOM_MIXED_PART_VARIANTS');
   item.requiredQty++;
  } else groups.set(p.sourceGroup,{
   partRef:p.sourceGroup,name:p.name,requiredQty:1,
   skuId:'DEVSKU-'+signature.slice(0,24),sourceSignature:signature,
   evidence:'SYNTHETIC_CONCEPT_SKU_NOT_SUPPLIER_VERIFIED',
   supplierSku:null,approvedForRealPurchase:false
  });
 }
 const lines=[...groups.values()].sort((a,b)=>a.partRef.localeCompare(b.partRef,'en'));
 if(!lines.length||lines.length>100||
    lines.some(x=>!Number.isSafeInteger(x.requiredQty)||x.requiredQty<=0||x.requiredQty>10000))
  fail('STOCK_BOM_QUANTITY_INVALID');
 return {schemaVersion:STOCK_PLAN_SCHEMA,category:config.category,
  source:'UNRELEASED_CONCEPT_BOM',lines,realWarehouseAuthority:false};
}
export function validateBatchPick(plan,raw,remainingByPart){
 if(!Array.isArray(raw)||!raw.length||raw.length>plan.lines.length)fail('STOCK_BATCH_LINES_INVALID');
 const allowed=new Map(plan.lines.map(x=>[x.partRef,x]));
 const seen=new Set();
 const lines=raw.map(row=>{
  if(!row||typeof row!=='object'||Array.isArray(row)||
   Object.keys(row).some(k=>!['partRef','quantity'].includes(k))||
   !nonEmpty(row.partRef)||seen.has(row.partRef)||
   !Number.isSafeInteger(row.quantity)||row.quantity<1||row.quantity>10000)
    fail('STOCK_BATCH_LINE_INVALID');
  const item=allowed.get(row.partRef),remaining=remainingByPart[row.partRef];
  if(!item||!Number.isSafeInteger(remaining)||remaining<row.quantity)
    fail('STOCK_BATCH_EXCEEDS_RESERVATION');
  seen.add(row.partRef);
  return {partRef:row.partRef,skuId:item.skuId,quantity:row.quantity};
 });
 return lines.sort((a,b)=>a.partRef.localeCompare(b.partRef,'en'));
}
export function validateIndependentBatchReceipt(shipped,raw){
 if(!Array.isArray(shipped)||!shipped.length||!Array.isArray(raw)||
   shipped.length!==raw.length)fail('BATCH_RECEIPT_LINE_COUNT');
 const expected=new Map(shipped.map(x=>[x.partRef,x]));
 const seen=new Set(),out=[];
 for(const row of raw){
  if(!row||typeof row!=='object'||Array.isArray(row)||
     Object.keys(row).some(k=>!['partRef','receivedQty','damagedQty'].includes(k))||
     !nonEmpty(row.partRef)||seen.has(row.partRef)||
     !Number.isSafeInteger(row.receivedQty)||row.receivedQty<0||
     !Number.isSafeInteger(row.damagedQty)||row.damagedQty<0||
     row.damagedQty>row.receivedQty)fail('BATCH_RECEIPT_LINE_INVALID');
  const shippedLine=expected.get(row.partRef);
  if(!shippedLine||row.receivedQty>shippedLine.quantity)
   fail('BATCH_RECEIPT_EXCEEDS_SHIPMENT');
  seen.add(row.partRef);
  out.push({partRef:row.partRef,skuId:shippedLine.skuId,
   shippedQty:shippedLine.quantity,receivedQty:row.receivedQty,
   damagedQty:row.damagedQty,
   missingQty:shippedLine.quantity-row.receivedQty});
 }
 out.sort((a,b)=>a.partRef.localeCompare(b.partRef,'en'));
 return {matched:out.every(x=>x.missingQty===0&&x.damagedQty===0),
  lines:out,authority:'CUSTOMER_DEV_SELF_REPORT_NOT_CARRIER_OR_WAREHOUSE_PROOF'};
}
