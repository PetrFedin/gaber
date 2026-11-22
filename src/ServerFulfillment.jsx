import React,{useState} from 'react';

/** Role-only UI for concept BOM inspection. HTTP server independently validates all commands. */
export function PackoutForm({order,busy,onRun}){
 const plan=order.fulfillment?.plan,previous=order.fulfillment?.packout;
 const [reference,setReference]=useState(''),[note,setNote]=useState('');
 const [qty,setQty]=useState(()=>Object.fromEntries(
  (plan?.lines??[]).map(row=>[row.partRef,
   previous?.lines?.find(x=>x.partRef===row.partRef)?.packedQty??row.expectedQty])));
 if(!plan?.lines?.length)return null;
 return <form className="server-action server-inspection" data-inspection="packout" onSubmit={e=>{
  e.preventDefault();
  onRun({type:previous?'amend_packout':'record_packout',revisionId:order.revisionId,
   payload:{reference:reference.trim(),note:note.trim(),lines:plan.lines.map(row=>({
    partRef:row.partRef,packedQty:qty[row.partRef]}))}});
 }}>
  <h4>Комплектация по концептуальной BOM</h4>
  <p className="helper">Не подтверждает фактический складской остаток или производственный допуск.</p>
  {plan.lines.map(row=><label key={row.partRef} className="advanced-field">
   {row.name} · {row.partRef} · по проекту {row.expectedQty} шт.
   <input type="number" required step="1" min="0" max={row.expectedQty}
    value={qty[row.partRef]??''}
    onChange={e=>setQty(v=>({...v,[row.partRef]:e.target.value===''?NaN:Number(e.target.value)}))}/>
  </label>)}
  <label className="advanced-field">Документ комплектации<input required maxLength={160}
   value={reference} onChange={e=>setReference(e.target.value)}/></label>
  <label className="advanced-field">Комментарий фабрики<textarea required maxLength={500}
   value={note} onChange={e=>setNote(e.target.value)}/></label>
  <button className="button dark" disabled={busy}>{previous?'Обновить состав упаковки':'Зафиксировать комплектацию'}</button>
 </form>;
}
export function ReceiptForm({order,busy,onRun}){
 const packed=order.fulfillment?.packout;
 const [reference,setReference]=useState(''),[note,setNote]=useState('');
 const [qty,setQty]=useState(()=>Object.fromEntries(
  (packed?.lines??[]).map(row=>[row.partRef,{receivedQty:row.packedQty,damagedQty:0}])));
 if(!packed?.complete)return null;
 const change=(id,key,value)=>setQty(prev=>({...prev,[id]:{
  ...prev[id],[key]:value===''?NaN:Number(value)}}));
 return <form className="server-action server-inspection" data-inspection="receipt" onSubmit={e=>{
  e.preventDefault();
  onRun({type:'record_receipt',revisionId:order.revisionId,
   payload:{reference:reference.trim(),note:note.trim(),lines:packed.lines.map(row=>({
    partRef:row.partRef,...qty[row.partRef]}))}});
 }}>
  <h4>{order.fulfillment?.correctionPending?'Повторная приёмка клиента':'Независимая приёмка клиента'}</h4>
  <p className="helper">Проверка заявленных количеств и повреждений; реальный акт и подпись ещё не верифицированы.</p>
  {packed.lines.map(row=><fieldset className="server-spec-geometry" key={row.partRef}>
   <legend>{row.partRef} · заявлено к отправке {row.packedQty} шт.</legend>
   <label className="advanced-field">Получено · {row.partRef}
    <input required type="number" step="1" min="0" max={row.packedQty}
     value={qty[row.partRef]?.receivedQty??''}
     onChange={e=>change(row.partRef,'receivedQty',e.target.value)}/></label>
   <label className="advanced-field">Повреждено · {row.partRef}
    <input required type="number" step="1" min="0" max={row.packedQty}
     value={qty[row.partRef]?.damagedQty??''}
     onChange={e=>change(row.partRef,'damagedQty',e.target.value)}/></label>
  </fieldset>)}
  <label className="advanced-field">Номер акта приёмки<input required maxLength={160}
   value={reference} onChange={e=>setReference(e.target.value)}/></label>
  <label className="advanced-field">Комментарий клиента<textarea required maxLength={500}
   value={note} onChange={e=>setNote(e.target.value)}/></label>
  <button className="button dark" disabled={busy}>Зафиксировать приёмку по позициям</button>
 </form>;
}
export function CorrectionForm({order,busy,onRun}){
 const rows=order.fulfillment?.receipt?.discrepancies??[];
 const [note,setNote]=useState('');
 const [values,setValues]=useState(()=>Object.fromEntries(
  rows.map(x=>[x.partRef,{kind:'replace',quantity:x.missingQty+x.damagedQty}])));
 if(!rows.length)return null;
 const change=(id,key,value)=>setValues(prev=>({...prev,[id]:{...prev[id],[key]:value}}));
 return <form className="server-action server-inspection" data-inspection="correction" onSubmit={e=>{
  e.preventDefault();
  onRun({type:'respond_issue',revisionId:order.revisionId,
   payload:{note:note.trim(),corrections:rows.map(x=>({partRef:x.partRef,...values[x.partRef]}))}});
 }}>
  <h4>План исправления недостачи / повреждения</h4>
  <p className="helper">Предложение требует отдельного согласия клиента и повторной приёмки. Не подтверждает физическое исполнение.</p>
  {rows.map(x=><fieldset className="server-spec-geometry" key={x.partRef}>
   <legend>{x.partRef} · недостача {x.missingQty} · повреждено {x.damagedQty}</legend>
   <label className="advanced-field">Действие · {x.partRef}
    <select value={values[x.partRef]?.kind??'replace'}
     onChange={e=>change(x.partRef,'kind',e.target.value)}>
     <option value="replace">Заменить</option><option value="repair">Отремонтировать</option><option value="investigate">Проверить претензию</option>
    </select></label>
   <label className="advanced-field">Количество · {x.partRef}
    <input required type="number" step="1" min="1" max={x.missingQty+x.damagedQty}
     value={values[x.partRef]?.quantity??''}
     onChange={e=>change(x.partRef,'quantity',Number(e.target.value))}/></label>
  </fieldset>)}
  <label className="advanced-field">Предложенное решение<textarea required maxLength={500}
   value={note} onChange={e=>setNote(e.target.value)}/></label>
  <button className="button dark" disabled={busy}>Предложить план корректировки</button>
 </form>;
}
export function InspectionSummary({order}){
 const f=order.fulfillment;
 if(!f?.packout&&!f?.receipt)return null;
 return <section className="server-inspection-summary" aria-label="Комплектация и приёмка">
  <h4>Комплектация / приёмка</h4>
  {f.packout&&<p>Упаковка: {f.packout.complete?'полная по заявлению фабрики':
   'недостача в '+f.packout.shortages.length+' группах'} · {f.packout.reference}</p>}
  {f.receipt&&<p>Приёмка: {f.receipt.status} · {f.receipt.reference}</p>}
  {f.receipt?.discrepancies?.map(row=><p className="inline-warning" key={row.partRef}>
   {row.partRef}: недостача {row.missingQty}, повреждено {row.damagedQty} шт.</p>)}
  {(order.issue?.receiptId||f.correctionPending)&&<p className="helper">Согласование плана не доказывает выполнение работ: нужна повторная независимая приёмка.</p>}
  {(f.packoutHistory?.length>0||f.receiptHistory?.length>0||f.issueHistory?.length>0)&&
   <details className="server-evidence-history" data-inspection="history">
    <summary>Журнал подтверждений · комплектация {f.packoutHistory?.length??0} · приёмка {f.receiptHistory?.length??0} · претензии {f.issueHistory?.length??0}</summary>
    <ul className="server-messages">
     {(f.packoutHistory??[]).map((x,index)=><li key={'pack-'+index}>
      <b>Комплектация {index+1}:</b> {x.reference} · {x.complete?'полная по заявлению':'есть недостачи'} · версия {x.revisionId} · самоотчёт фабрики
     </li>)}
     {(f.receiptHistory??[]).map((x,index)=><li key={'receipt-'+index}>
      <b>Акт приёмки {x.id}:</b> {x.reference} · {x.status} · {x.discrepancies.length} групп с расхождениями · заявлено клиентом
     </li>)}
     {(f.issueHistory??[]).map(x=><li key={x.id}>
      <b>Претензия {x.id}:</b> {x.status}
      {x.reinspectionReceiptId? ` · повторная приёмка ${x.reinspectionReceiptId} · ${x.reinspectionOutcome}` : ''}
      {x.status==='correction_plan_accepted'?' · согласован только план, факт работ не подтверждён':''}
     </li>)}
    </ul>
   </details>}
  <p className="helper">Данные концептуальные: склад, материальные документы и реальные внешние подтверждения отсутствуют.</p>
 </section>;
}
