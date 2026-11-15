/** Sequential bridge: quantity → waste → price, time → rate; residual reconciles rounded lines. */
const cents = n => Math.round(n * 100);
const rub = n => n / 100;
export function buildCostVariance(before, after) {
 if ([before, after].some(r => r.status === 'invalid-input'))
  return {comparable:false, reason:'INVALID_INPUT', rows:[], totals:null};
 if ([before,after].some(r=>!Number.isSafeInteger(cents(r.totals.partialDirectRUB))))
  return {comparable:false,reason:'UNSAFE_MONEY_RANGE',rows:[],totals:null};
 const rows=[];
 const bridge=(oldRows,newRows,key,type)=>{
  const a=new Map(oldRows.map(r=>[key(r),r])),b=new Map(newRows.map(r=>[key(r),r]));
  for(const id of new Set([...a.keys(),...b.keys()])){
   const x=a.get(id),y=b.get(id),delta=cents(y?.amountRUB??0)-cents(x?.amountRUB??0);
   const effects={quantity:0,waste:0,price:0,time:0,rate:0,scope:0,rounding:0};
   let reason='matched';
   if(!x||!y){effects.scope=delta;reason=x?'removed':'added';}
   else if(type==='material'&&(x.unit!==y.unit||x.sku!==y.sku)){
    effects.scope=delta;reason='basis-changed';
   }else if(type==='material'){
    effects.quantity=cents((y.measuredQty-x.measuredQty)*(1+x.wastePct/100)*x.rateRUB);
    effects.waste=cents(y.measuredQty*(y.wastePct-x.wastePct)/100*x.rateRUB);
    effects.price=cents(y.measuredQty*(1+y.wastePct/100)*(y.rateRUB-x.rateRUB));
   }else{
    effects.time=cents((y.minutes-x.minutes)*x.rateRUBPerHour/60);
    effects.rate=cents(y.minutes*(y.rateRUBPerHour-x.rateRUBPerHour)/60);
   }
   effects.rounding=delta-Object.values(effects).reduce((s,n)=>s+n,0);
   const sourceChanged=type==='material'&&x&&y&&
    (x.priceId!==y.priceId||x.supplierRef!==y.supplierRef||x.sourceRef!==y.sourceRef||x.quoteRevision!==y.quoteRevision);
   if(delta||Object.values(effects).some(Boolean)||reason!=='matched'||sourceChanged)
    rows.push({id,type,reason,sourceChanged:!!sourceChanged,beforeRUB:x?.amountRUB??0,
     afterRUB:y?.amountRUB??0,deltaRUB:rub(delta),effects:Object.fromEntries(Object.entries(effects).map(([k,v])=>[k,rub(v)]))});
  }
 };
 bridge(before.materialLines,after.materialLines,r=>r.entityId,'material');
 bridge(before.operationLines,after.operationLines,r=>r.routeId+'|'+r.operationCode,'operation');
 if(rows.some(r=>Object.values(r.effects).some(v=>!Number.isSafeInteger(cents(v)))))
  return {comparable:false,reason:'UNSAFE_MONEY_RANGE',rows:[],totals:null};
 const totals=Object.fromEntries(['quantity','waste','price','time','rate','scope','rounding'].map(k=>
  [k,rub(rows.reduce((s,r)=>s+cents(r.effects[k]),0))]));
 const delta=cents(after.totals.partialDirectRUB)-cents(before.totals.partialDirectRUB);
 if(!Number.isSafeInteger(delta)||Object.values(totals).some(v=>!Number.isSafeInteger(cents(v))))
  return {comparable:false,reason:'UNSAFE_MONEY_RANGE',rows:[],totals:null};
 return {comparable:true, scope:'entered-inputs-only', method:'sequential-quantity-waste-price-time-rate',
  rows,totals,deltaRUB:rub(delta),reconciled:rows.reduce((s,r)=>s+cents(r.deltaRUB),0)===delta};
}
