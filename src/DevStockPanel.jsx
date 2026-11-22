import React,{useEffect,useRef,useState} from 'react';

/** DEV only; the server rechecks cookie, factory membership, order revision,
 * SKU balance and client receipt. This UI never certifies actual inventory.
 */
const endpoint=id=>'/api/v1/orders/'+encodeURIComponent(id)+'/dev-stock';
const msg=code=>({
 STOCK_INSUFFICIENT:'Недостаточно свободного DEMO-остатка',
 STOCK_SKU_NOT_SEEDED:'Нет синтетических SKU для этой конфигурации',
 STOCK_BATCH_ALREADY_SHIPPED:'Партия уже отгружена в тестовом журнале',
 STOCK_BATCH_ALREADY_RECEIVED:'Акт приёмки партии уже записан',
 STALE_ORDER_VERSION:'Версия заказа изменилась, обновите заказ',
 DEV_STOCK_DISABLED:'Складской режим доступен только в DEV'
}[code]??'Сервер отклонил операцию: '+code);
const positive=n=>Number.isSafeInteger(n)&&n>=0;
function ReceiveForm({batch,busy,send}){
 const [reference,setReference]=useState('');
 const [values,setValues]=useState(()=>Object.fromEntries(batch.lines.map(x=>[
  x.partRef,{receivedQty:x.quantity,damagedQty:0}
 ])));
 const change=(part,key,value)=>setValues(s=>{
  const row={...s[part],[key]:value===''?NaN:Number(value)};
  if(key==='receivedQty'&&row.damagedQty>row.receivedQty)row.damagedQty=row.receivedQty;
  return {...s,[part]:row};
 });
 return <form className="server-inspection" data-batch-receipt={batch.batchId} onSubmit={e=>{
  e.preventDefault();send('receive_batch',{reference,batchId:batch.batchId,
   lines:batch.lines.map(x=>({partRef:x.partRef,...values[x.partRef]}))});
 }}>
  <h5>Приёмка партии {batch.batchId}</h5>
  {batch.lines.map(x=><fieldset className="server-spec-geometry" key={x.partRef}>
   <legend>{x.partRef} · отправлено {x.quantity} шт.</legend>
   <label className="advanced-field">Получено
    <input type="number" required min="0" max={x.quantity} step="1"
     value={values[x.partRef].receivedQty}
     onChange={e=>change(x.partRef,'receivedQty',e.target.value)}/></label>
   <label className="advanced-field">Повреждено
    <input type="number" required min="0" step="1"
     max={positive(values[x.partRef].receivedQty)?values[x.partRef].receivedQty:x.quantity}
     value={values[x.partRef].damagedQty}
     onChange={e=>change(x.partRef,'damagedQty',e.target.value)}/></label>
  </fieldset>)}
  <label className="advanced-field">Акт приёмки партии<input required maxLength={160}
   value={reference} onChange={e=>setReference(e.target.value)}/></label>
  <button className="button dark" disabled={busy||!reference.trim()}>Зафиксировать приёмку DEV-партии</button>
 </form>;
}
export default function DevStockPanel({order,role}){
 const [open,setOpen]=useState(false),[data,setData]=useState(null);
 const [problem,setProblem]=useState(''),[note,setNote]=useState(''),[busy,setBusy]=useState(false);
 const [pick,setPick]=useState({}),[reference,setReference]=useState(''),[batchId,setBatchId]=useState('');
 const guard=useRef(false),pending=useRef(null);
 const load=async()=>{
  const res=await fetch(endpoint(order.orderId),{credentials:'same-origin'});
  const j=await res.json();if(!res.ok)throw Error(msg(j.code));
  setData(j.devStock);
 };
 useEffect(()=>{
  if(!open)return;
  let cancelled=false;
  fetch(endpoint(order.orderId),{credentials:'same-origin'})
   .then(async res=>{const j=await res.json();if(!res.ok)throw Error(msg(j.code));return j.devStock})
   .then(d=>{if(!cancelled){setData(d);setProblem('')}})
   .catch(e=>{if(!cancelled)setProblem(e.message)});
  return ()=>{cancelled=true};
 },[open,order.orderId,order.version,role]);
 const submit=async(type,payload,revisionId=data?.revisionId)=>{
  if(guard.current||!data||!revisionId)return;
  guard.current=true;setBusy(true);setProblem('');setNote('');
  const key=JSON.stringify({type,payload,revisionId});
  if(pending.current?.key!==key)pending.current={key,requestId:crypto.randomUUID()};
  try{
   const res=await fetch(endpoint(order.orderId)+'/commands',{
    method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},
    body:JSON.stringify({requestId:pending.current.requestId,expectedVersion:data.orderVersion,
     revisionId,type,payload})
   });
   const j=await res.json();
   if(!res.ok){if(res.status<500)pending.current=null;throw Error(msg(j.code))}
   pending.current=null;setNote('DEV-документ записан; физическое движение не подтверждено.');
   setPick({});setReference('');setBatchId('');
   await load();
  }catch(e){setProblem(e.message)}
  finally{guard.current=false;setBusy(false)}
 };
 const remaining=Object.fromEntries((data?.reservations??[])
  .map(x=>[x.partRef,x.reservedQty-x.shippedQty]));
 const available=Object.entries(remaining).filter(([,qty])=>qty>0);
 const dispatchLines=Object.entries(pick)
  .filter(([id,qty])=>positive(qty)&&qty>0&&qty<=remaining[id])
  .map(([partRef,quantity])=>({partRef,quantity}));
 const shipped=data?.documents?.filter(x=>x.kind==='ship_batch')??[];
 const received=new Set(data?.documents?.filter(x=>x.kind==='receive_batch').map(x=>x.batchId)??[]);
 return <section className="server-stock-panel" data-stock-order={order.orderId}>
  <button className="button outline" type="button" aria-expanded={open} onClick={()=>setOpen(x=>!x)}>
   {open?'Свернуть складской журнал':'Склад, SKU и партии · DEMO'}
  </button>
  {open&&<div>
   <p className="helper">Синтетические DEV-SKU и самоотчёты. Нет реальных складских остатков,
    сертификата поставщика, актов перевозчика и допуска производства.</p>
   <button className="button outline" type="button" disabled={busy}
    onClick={()=>load().catch(e=>setProblem(e.message))}>Обновить партии</button>
   {problem&&<p className="inline-warning" role="alert">{problem}</p>}
   {note&&<p className="small-note" role="status">{note}</p>}
   {data&&<>
    <p className="helper">Ревизия {data.revisionId??'не согласована'} ·
      {data.documents.length} документов · {data.plan?.lines?.length??0} групп BOM</p>
    {data.plan&&<details><summary>Привязка BOM к DEV-SKU</summary>
     <ul className="server-messages">{data.plan.lines.map(x=><li key={x.partRef}>
      {x.partRef} · {x.name} · {x.skuId} · {x.requiredQty} шт. ·
      реальный поставщик не подтверждён</li>)}</ul>
    </details>}
    {role==='factory'&&data.revisionId&&['accepted','production','quality','ready'].includes(order.stage)&&
     !data.reservations.length&&<button className="button dark" type="button" disabled={busy}
      onClick={()=>submit('reserve',{reference:'DEMO-RES-'+crypto.randomUUID()})}>
      Зарезервировать DEMO-комплектующие</button>}
    {role==='factory'&&order.stage==='ready'&&order.fulfillment?.packout?.complete===true&&
     available.length>0&&<form className="server-inspection" onSubmit={e=>{
      e.preventDefault();if(dispatchLines.length)submit('ship_batch',{
       reference:reference.trim(),batchId:batchId.trim(),lines:dispatchLines});
     }}>
      <h5>Частичная отгрузка по партиям</h5>
      {available.map(([partRef,max])=><label key={partRef} className="advanced-field">
       {partRef} · резерв к отгрузке {max}
       <input type="number" min="0" max={max} step="1" required
        value={pick[partRef]??0}
        onChange={e=>setPick(s=>({...s,[partRef]:Number(e.target.value)}))}/>
      </label>)}
      <label className="advanced-field">ID партии<input required maxLength={128}
       value={batchId} onChange={e=>setBatchId(e.target.value)}/></label>
      <label className="advanced-field">Номер накладной DEV<input required maxLength={160}
       value={reference} onChange={e=>setReference(e.target.value)}/></label>
      <button className="button dark" disabled={busy||!dispatchLines.length||!reference.trim()||!batchId.trim()}>
       Отправить выбранную DEV-партию</button>
     </form>}
    {role==='client'&&shipped.filter(x=>!received.has(x.batchId)).map(x=>
      <ReceiveForm key={x.batchId} batch={x} busy={busy} send={submit}/>)}
    {role==='partner'&&data.reservations.some(x=>x.reservedQty>x.shippedQty)&&
     !['accepted','production','quality','ready'].includes(order.stage)&&
     <button className="button dark" disabled={busy} type="button"
      onClick={()=>submit('release',{reference:'DEV-RELEASE-'+crypto.randomUUID()})}>
      Освободить неотгруженный резерв</button>}
    {data.documents.length>0&&<details open><summary>Документы партий · {data.documents.length}</summary>
     <ul className="server-messages">{data.documents.map(x=><li key={x.documentId}>
      <b>{x.kind}</b> · {x.reference} · {x.batchId??'без партии'} ·
      {x.lines.map(l=>l.partRef+':'+l.quantity+(l.damagedQty?' (повреждено '+l.damagedQty+')':'')).join(', ')}
      <span className="helper"> · DEV-самоотчёт</span></li>)}</ul>
    </details>}
   </>}
  </div>}
 </section>;
}
