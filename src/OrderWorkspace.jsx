import React,{useEffect,useMemo,useState} from 'react';
import {money,dimensions} from './domain.js';
import {ORDER_STAGES,orderFinancials,orderEngineering} from './orderWorkflow.js';
import {ORDER_STORAGE_KEY,readOrderWorkspace,saveOrderCommand,exportOrderWorkspace} from './orderStorage.js';
import ConfigurationDetails from './ConfigurationDetails.jsx';

const ERRORS={STALE_WORKSPACE:'Заказ изменён в другой вкладке. Обновите журнал и повторите действие.',STALE_ORDER:'Версия заказа устарела. Обновите журнал.',REVISION_MISMATCH:'Предложение изменилось. Просмотрите актуальную ревизию.',OFFER_INVALID:'Проверьте цену, аванс, срок и описание предложения.',CONFIG_INVALID:'Параметры изделия недопустимы.',PAYMENT_DUPLICATE:'Такой номер платёжной записи уже использован.',PAYMENT_EXCEEDS_BALANCE:'Сумма больше остатка текущей ревизии.',START_BLOCKED:'Для запуска сценария нужны согласование и полный аванс.',SHIPMENT_BLOCKED:'Нужны контроль качества, полный расчёт и сведения об отгрузке.',CREDIT_INVALID:'Перенос больше доступного аванса или остатка новой ревизии.'};
const LABELS={create:'Создан заказ',offer:'Предложение производства',accept:'Клиент согласовал',request_change:'Запрошена корректировка',report_payment:'Сообщение клиента об оплате',record_payment:'Локальная запись оплаты',allocate_credit:'Клиент перенёс аванс',start:'Проверка запуска пройдена · локально',complete:'Работы завершены · локально',quality_pass:'Контроль качества · локально',ship:'Отгрузка · локально',deliver:'Доставка · локально',accept_delivery:'Приёмка клиентом · локально',report_issue:'Замечания клиента',message:'Сообщение'};
const account=role=>role==='factory'?'Производство':'Клиент';
function storage(){try{return globalThis.localStorage??null;}catch{return null;}}
function amount(text){
 if(!/^\d{1,10}([.,]\d{1,2})?$/.test(text.trim()))throw Error('Введите сумму в рублях, не более двух знаков после запятой.');
 const [whole,fraction='']=text.trim().replace(',','.').split('.');
 return Number(whole)*100+Number(fraction.padEnd(2,'0'));
}
function exportFile(text){
 const url=URL.createObjectURL(new Blob([text],{type:'application/json'}));
 const link=document.createElement('a');link.href=url;link.download='gaber-order-journal.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
export default function OrderWorkspace({projects,role,selectedProjectId=null}){
 const [store]=useState(storage),[workspace,setWorkspace]=useState(()=>readOrderWorkspace(store));
 const [selected,setSelected]=useState(selectedProjectId??''),[message,setMessage]=useState('');
 const refresh=()=>setWorkspace(readOrderWorkspace(store));
 useEffect(()=>{
  const onStorage=e=>{if(e.key===ORDER_STORAGE_KEY||e.key===null)refresh();};
  window.addEventListener('storage',onStorage);return()=>window.removeEventListener('storage',onStorage);
 },[store]);
 const choices=new Map(workspace.orders.map(row=>[row.id,{id:row.id,name:row.state.name}]));
 for(const p of projects.filter(p=>p.status!=='draft'))if(!choices.has(p.id))choices.set(p.id,p);
 const selectedId=choices.has(selected)?selected:choices.keys().next().value;
 const row=workspace.orders.find(row=>row.id===selectedId),project=projects.find(p=>p.id===selectedId);
 const send=(type,payload={},revision=true)=>{
  try{
   const command={id:crypto.randomUUID(),at:new Date().toISOString(),role,type,payload,expectedVersion:row?.state.version??0};
   if(revision&&row?.state.revisions.length)command.revisionId=row.state.revisions.at(-1).id;
   const next=saveOrderCommand(store,workspace,selectedId,command);
   setWorkspace(next);setMessage('Сохранено в общем локальном журнале заказа.');
  }catch(error){setMessage(ERRORS[error.message]||'Действие не выполнено: '+error.message);}
 };
 return <section id="gaber-order-workspace" className="page order-workspace" aria-label={role==='factory'?'Кабинет производства · заказы':'Кабинет клиента · заказы'}>
  <div className="order-heading"><div><span className="eyebrow">ЗАКАЗ И ИСПОЛНЕНИЕ</span>
   <h2>{role==='factory'?'Производство и отгрузка':'Мои заказы'}</h2>
   <p>Одна ревизия изделия, условия и история для двух кабинетов.</p></div>
   <a className="button outline" href={role==='factory'?'#projects':'#factory'}>Открыть кабинет {role==='factory'?'клиента':'производства'}</a>
  </div>
  <p className="order-local-notice">Локальный сценарий без авторизации: кабинеты используют данные этого браузера. Оплаты, производство и доставка здесь не подтверждают реальные операции. Производственный допуск закрыт.</p>
  <div className="technical-actions">
   <button className="button outline" onClick={refresh}>Обновить журнал заказов</button>
   <button className="button outline" onClick={()=>{try{exportFile(exportOrderWorkspace(store));}catch{setMessage('Не удалось выгрузить журнал.');}}}>Скачать журнал заказов</button>
  </div>
  {workspace.error&&<p className="inline-warning" role="alert">{workspace.error}</p>}
  {workspace.status==='ready'&&<>
   {workspace.orders.length>0&&<dl className="order-overview" aria-label="Сводка общего журнала">
    <div><dt>Открытые заказы</dt><dd>{workspace.orders.filter(o=>o.state.stage!=='closed').length}</dd></div>
    <div><dt>Решение клиента</dt><dd>{workspace.orders.filter(o=>['offered','delivered'].includes(o.state.stage)).length}</dd></div>
    <div><dt>В работе / на контроле</dt><dd>{workspace.orders.filter(o=>['production','quality'].includes(o.state.stage)).length}</dd></div>
    <div><dt>Замечания</dt><dd>{workspace.orders.filter(o=>o.state.stage==='disputed').length}</dd></div>
   </dl>}
   {!choices.size?<p>Отправьте проект из конструктора на рассмотрение. Здесь появится его заказ.</p>:<>
    <label className="order-field">Изделие / заказ<select value={selectedId} onChange={e=>{setSelected(e.target.value);setMessage('');}}>
     {[...choices.values()].map(p=>{const state=workspace.orders.find(o=>o.id===p.id)?.state;return <option key={p.id} value={p.id}>{p.name} · {state?ORDER_STAGES[state.stage]:'Создать заказ'} · {p.id.slice(0,8)}</option>;})}
    </select></label>
    {!row?<div className="order-empty"><p>Проект ещё не связан с журналом заказа. Первое предложение и согласования будут записаны отдельно от эскиза.</p>
     {role==='client'?<button className="button dark" onClick={()=>send('create',{projectId:project.id,name:project.name,config:project.config},false)}>Создать заказ из проекта</button>:<p>Создание заказа доступно из кабинета клиента.</p>}</div>:
     <OrderDetail key={row.id+':'+row.state.version+':'+role} row={row} role={role} send={send} onError={setMessage}/>}
   </>}
  </>}
  {message&&<p className="order-feedback" role="status">{message}</p>}
 </section>;
}
function OrderDetail({row,role,send,onError}){
 const s=row.state,r=s.revisions.at(-1),f=orderFinancials(s),factory=role==='factory';
 const engineering=useMemo(()=>orderEngineering(s),[r?.config,s.sourceConfig]);
 const [note,setNote]=useState(''),[reference,setReference]=useState(''),[payment,setPayment]=useState('');
 const [changeNote,setChangeNote]=useState(''),[issueNote,setIssueNote]=useState(''),[messageText,setMessageText]=useState(''),[paymentRef,setPaymentRef]=useState('');
 const [price,setPrice]=useState(r?String(r.priceKopecks/100):''),[advance,setAdvance]=useState(r?String(r.advanceBps/100):'50');
 const [due,setDue]=useState(r?.dueDate??''),[width,setWidth]=useState(String((r?.config??s.sourceConfig).width));
 const [carrier,setCarrier]=useState(''),[tracking,setTracking]=useState(''),[agreed,setAgreed]=useState(false);
 const submit=(e,fn)=>{e.preventDefault();try{fn();}catch(error){onError(error.message);}};
 const paymentStage=['accepted','production','quality','ready'].includes(s.stage)&&s.acceptedRevisionId===r?.id;
 return <div className="order-dossier">
  <div className="order-heading"><h3>{s.name}</h3><span className="order-stage">{ORDER_STAGES[s.stage]} · версия журнала {s.version}</span></div>
  <div className="order-columns"><div>
   <h4>{r?'Предложение '+r.id:'Исходная конфигурация'}</h4>
   <p>{Object.values(dimensions(r?.config??s.sourceConfig)).join(' × ')} см</p>
   <ConfigurationDetails config={r?.config??s.sourceConfig}/>
   <p>{factory?`Связь с инженерной моделью: ${engineering.integrityOk?'цифровые ссылки согласованы':'есть ошибки связей'} · маршрутов: ${engineering.routingCount}. Допуск к изготовлению закрыт: ${engineering.blockers.length} незакрытых проверок.`:'Комплектация предложения связана с инженерным составом. Производственное подтверждение конструкции ещё не получено.'}</p>
   {r&&<><dl className="order-ledger">
    <div><dt>Цена предложения</dt><dd>{money(r.priceKopecks/100)}</dd></div>
    <div><dt>Аванс · {r.advanceBps/100}%</dt><dd>{money(f.advanceKopecks/100)}</dd></div>
    <div><dt>Локально учтено · {r.id}</dt><dd>{money(f.currentKopecks/100)}</dd></div>
    <div><dt>Осталось до аванса</dt><dd>{money(f.advanceDueKopecks/100)}</dd></div>
    <div><dt>Остаток до полного расчёта</dt><dd>{money(f.balanceKopecks/100)}</dd></div>
    <div><dt>Плановая готовность</dt><dd>{r.dueDate}</dd></div>
    <div><dt>Подтверждение клиентом</dt><dd>{s.acceptedRevisionId===r.id?r.id:'Требуется'}</dd></div>
   </dl><p>{r.note}</p></>}
   {s.changeNote&&<p className="inline-warning">Корректировка: {s.changeNote}</p>}
   {s.shipment&&<p>Отгрузка: {s.shipment.carrier} · {s.shipment.tracking}<br/>Документ: {s.shipment.reference}</p>}
   {s.delivery&&<p>Доставка: {s.delivery.reference}. {s.stage==='closed'?'Клиент принял заказ.':'Приёмка клиента не завершена.'}</p>}
   {s.issue&&<p className="inline-warning" role="alert">Замечания клиента: {s.issue.note}. Заказ не закрыт.</p>}
   {s.revisions.length>1&&<details><summary>Предыдущие предложения ({s.revisions.length-1})</summary>
    {s.revisions.slice(0,-1).map(old=><p key={old.id}>{old.id} · {old.config.width} см · {money(old.priceKopecks/100)} · {old.dueDate}<br/>{old.note}</p>)}
   </details>}
  </div><div className="order-actions-panel">
   <h4>{factory?'Действия производства':'Решения клиента'}</h4>
   {factory&&['requested','offered','accepted','change_requested'].includes(s.stage)&&<form onSubmit={e=>submit(e,()=>{
    if(!/^\d{1,3}([.,]\d{1,2})?$/.test(advance))throw Error('Проверьте процент аванса.');
    send('offer',{config:{...(r?.config??s.sourceConfig),width:Number(width)},priceKopecks:amount(price),advanceBps:amount(advance),dueDate:due,note},false);
   })}>
    <p>Новое предложение отменяет прежнее согласование. Все предыдущие ревизии и платёжные записи сохраняются.</p>
    <label className="order-field">Ширина изделия, см<input required type="number" value={width} onChange={e=>setWidth(e.target.value)}/></label>
    <label className="order-field">Цена предложения, ₽<input required inputMode="decimal" value={price} onChange={e=>setPrice(e.target.value)}/></label>
    <label className="order-field">Аванс, %<input required inputMode="decimal" value={advance} onChange={e=>setAdvance(e.target.value)}/></label>
    <label className="order-field">Плановая дата готовности<input required type="date" value={due} onChange={e=>setDue(e.target.value)}/></label>
    <label className="order-field">Состав предложения / изменения<textarea required maxLength={500} value={note} onChange={e=>setNote(e.target.value)}/></label>
    <button className="button dark" type="submit">{r?'Выпустить новую ревизию':'Подготовить предложение R1'}</button>
   </form>}
   {!factory&&s.stage==='offered'&&<div className="order-decision">
    <label><input type="checkbox" checked={agreed} onChange={e=>setAgreed(e.target.checked)}/> Проверены комплектация, цена, аванс и срок предложения {r.id}</label>
    <button className="button dark" disabled={!agreed} onClick={()=>send('accept')}>Согласовать {r.id}</button>
   </div>}
   {!factory&&['offered','accepted','change_requested'].includes(s.stage)&&<form onSubmit={e=>submit(e,()=>send('request_change',{note:changeNote}))}>
    <label className="order-field">Что необходимо скорректировать<textarea required maxLength={500} value={changeNote} onChange={e=>setChangeNote(e.target.value)}/></label>
    <button className="button outline" type="submit">Запросить корректировку</button>
   </form>}
   {f.priorCredits.length>0&&<div><h4>Средства предыдущих ревизий · локальные записи</h4>
    {f.priorCredits.map(credit=><div className="order-credit" key={credit.revisionId}><p>{credit.revisionId}: {money(credit.amountKopecks/100)}. Автоматически не зачтены.</p>
     {!factory&&s.stage==='accepted'&&f.balanceKopecks>0&&<button className="button outline" onClick={()=>send('allocate_credit',{fromRevisionId:credit.revisionId,amountKopecks:Math.min(credit.amountKopecks,f.balanceKopecks)})}>Перенести {money(Math.min(credit.amountKopecks,f.balanceKopecks)/100)} на {r.id}</button>}</div>)}
   </div>}
   {paymentStage&&<form onSubmit={e=>submit(e,()=>send(factory?'record_payment':'report_payment',{amountKopecks:amount(payment),reference:paymentRef}))}>
    <p>{factory?'Локальная запись для проверки сценария. Банковское подтверждение отсутствует.':'Сообщение об оплате не меняет учтённый баланс и не разрешает запуск.'}</p>
    <label className="order-field">Сумма, ₽<input required inputMode="decimal" value={payment} onChange={e=>setPayment(e.target.value)}/></label>
    <label className="order-field">Номер / ссылка на платёжный документ<input required maxLength={500} value={paymentRef} onChange={e=>setPaymentRef(e.target.value)}/></label>
    <button className="button outline" type="submit">{factory?'Добавить локальную запись оплаты':'Сообщить об оплате'}</button>
   </form>}
   {factory&&s.stage==='accepted'&&<><p>{f.advanceDueKopecks?'Сценарий запуска заблокирован до учёта аванса.':'Согласование и аванс позволяют проверить следующий этап локально.'}</p><button className="button dark" disabled={f.advanceDueKopecks>0} onClick={()=>send('start')}>Запустить производственный сценарий</button></>}
   {factory&&s.stage==='production'&&<button className="button dark" onClick={()=>send('complete')}>Передать на контроль качества</button>}
   {factory&&['quality','ready','shipped'].includes(s.stage)&&<form onSubmit={e=>submit(e,()=>send(s.stage==='quality'?'quality_pass':s.stage==='ready'?'ship':'deliver',s.stage==='ready'?{carrier,tracking,reference}:{reference}))}>
    {s.stage==='ready'&&<><label className="order-field">Перевозчик<input required maxLength={500} value={carrier} onChange={e=>setCarrier(e.target.value)}/></label><label className="order-field">Номер отправления<input required maxLength={500} value={tracking} onChange={e=>setTracking(e.target.value)}/></label></>}
    <label className="order-field">{s.stage==='quality'?'Акт контроля качества':s.stage==='ready'?'Отгрузочный документ':'Подтверждение доставки'}<input required maxLength={500} value={reference} onChange={e=>setReference(e.target.value)}/></label>
    {s.stage==='ready'&&f.balanceKopecks>0&&<p>Отгрузка заблокирована: остался полный расчёт {money(f.balanceKopecks/100)}.</p>}
    <button className="button dark" type="submit" disabled={s.stage==='ready'&&f.balanceKopecks>0}>{s.stage==='quality'?'Зафиксировать контроль · локально':s.stage==='ready'?'Зафиксировать отгрузку · локально':'Зафиксировать доставку · локально'}</button>
   </form>}
   {!factory&&s.stage==='delivered'&&<button className="button dark" onClick={()=>send('accept_delivery')}>Принять доставленный заказ</button>}
   {!factory&&['shipped','delivered'].includes(s.stage)&&<form onSubmit={e=>submit(e,()=>send('report_issue',{note:issueNote}))}>
    <label className="order-field">Замечания к заказу<textarea required maxLength={500} value={issueNote} onChange={e=>setIssueNote(e.target.value)}/></label><button className="button outline" type="submit">Сообщить о проблеме</button>
   </form>}
  </div></div>
  <details className="order-payments"><summary>Платёжные записи и сообщения ({s.payments.length+s.paymentClaims.length})</summary>
   {[...s.payments,...s.paymentClaims].map((p,i)=><p key={i}>{p.revisionId} · {money(p.amountKopecks/100)} · {p.reference}<br/>{p.authority==='CLIENT_CLAIM'?'Сообщение клиента; в балансе не учтено':'Локальная запись; банк не подтвердил'}</p>)}
  </details>
  <div className="order-conversation"><h4>Обсуждение заказа</h4>
   {s.messages.map((m,i)=><p key={i}><strong>{account(m.role)} · {m.revisionId??'Заявка'}</strong><br/>{m.note}</p>)}
   <form onSubmit={e=>submit(e,()=>send('message',{note:messageText}))}><label className="order-field">Сообщение другой стороне<textarea required maxLength={500} value={messageText} onChange={e=>setMessageText(e.target.value)}/></label><button className="button outline" type="submit">Записать сообщение в заказ</button></form>
  </div>
  <details className="order-history"><summary>Общая история заказа ({row.events.length})</summary><ol>
   {row.events.map(event=><li key={event.id}><strong>{LABELS[event.type]}</strong><span>{account(event.role)} · {event.revisionId??'—'} · {new Date(event.at).toLocaleString('ru-RU')}</span>{event.payload.note&&<p>{event.payload.note}</p>}</li>)}
  </ol></details>
 </div>;
}
