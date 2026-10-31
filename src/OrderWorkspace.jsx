import React,{useEffect,useMemo,useState} from 'react';
import {dimensions} from './domain.js';
import {ORDER_STAGES,orderFinancials,orderEngineering} from './orderWorkflow.js';
import {ORDER_STORAGE_KEY,readOrderWorkspace,saveOrderCommand,exportOrderWorkspace} from './orderStorage.js';
import ConfigurationDetails from './ConfigurationDetails.jsx';
import ClientOfferAssurance from './ClientOfferAssurance.jsx';
import {getCurrentClientOffer} from './clientOffer.js';
import {visibleOrderMessages,canAccessOrderMessageChannel} from './orderMessageChannels.js';
import {orderMoney} from './orderMoney.js';

const ERRORS={STALE_WORKSPACE:'Заказ изменён в другой вкладке. Обновите журнал и повторите действие.',STALE_ORDER:'Версия заказа устарела. Обновите журнал.',REVISION_MISMATCH:'Предложение изменилось. Просмотрите актуальную ревизию.',OFFER_INVALID:'Проверьте цену, аванс, срок и описание предложения.',CONFIG_INVALID:'Параметры изделия недопустимы.',PAYMENT_DUPLICATE:'Такой номер платёжной записи уже использован.',PAYMENT_EXCEEDS_BALANCE:'Сумма больше остатка текущей ревизии.',START_BLOCKED:'Для запуска сценария нужны согласование и полный аванс.',SHIPMENT_BLOCKED:'Нужны контроль качества, полный расчёт и сведения об отгрузке.',CREDIT_INVALID:'Перенос больше доступного аванса или остатка новой ревизии.',ISSUE_RESPONSE_BLOCKED:'Ответ возможен только на открытое замечание.',ISSUE_REJECTION_BLOCKED:'Отклонить можно только предложенное решение.',ISSUE_CONFIRMATION_BLOCKED:'Сначала требуется ответ производства.'};
const LABELS={create:'Создан заказ',assign_factory:'Габер назначил фабрику',prepare_spec:'ТЗ партнёра направлено фабрике',confirm_spec:'Фабрика подтвердила концепт-ТЗ',return_spec:'Фабрика вернула ТЗ на корректировку',offer:'Предложение Габер опубликовано',accept:'Клиент согласовал',request_change:'Запрошена корректировка',report_payment:'Сообщение клиента об оплате',record_payment:'Локальная запись оплаты',allocate_credit:'Клиент перенёс аванс',start:'Проверка запуска пройдена · локально',complete:'Работы завершены · локально',quality_pass:'Контроль качества · локально',ship:'Отгрузка · локально',deliver:'Доставка · локально',accept_delivery:'Приёмка клиентом · локально',report_issue:'Замечания клиента',respond_issue:'Ответ фабрики на замечание',reject_resolution:'Клиент отклонил решение',confirm_resolution:'Клиент подтвердил решение',message:'Сообщение'};
const account=role=>({client:'Клиент',factory:'Фабрика',partner:'Партнёр GABER'}[role]??'Неизвестная роль');
const CHANNEL_LABELS={shared:'Общий канал',client_partner:'Клиент ↔ Габер',factory_partner:'Фабрика ↔ Габер'};
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
   if(revision){
    if(['confirm_spec','return_spec','offer'].includes(type)&&row?.state.specs?.length)
     command.revisionId=row.state.specs.at(-1).id;
    else if(row?.state.revisions.length)command.revisionId=row.state.revisions.at(-1).id;
   }
   const next=saveOrderCommand(store,workspace,selectedId,command);
   setWorkspace(next);setMessage('Сохранено в общем локальном журнале заказа.');
  }catch(error){setMessage(ERRORS[error.message]||'Действие не выполнено: '+error.message);}
 };
 return <section id="gaber-order-workspace" className="page order-workspace" aria-label={role==='factory'?'Кабинет фабрики · заказы':role==='partner'?'Кабинет партнёра GABER · заказы':'Кабинет клиента · заказы'}>
  <div className="order-heading"><div><span className="eyebrow">ЗАКАЗ И ИСПОЛНЕНИЕ</span>
   <h2>{role==='factory'?'Фабрика · производство':role==='partner'?'Партнёр GABER · сделки и ТЗ':'Мои заказы'}</h2>
   <p>Клиент создаёт запрос, партнёр рассчитывает экономику и ТЗ, фабрика подтверждает возможность изготовления.</p></div>
   <div className="technical-actions"><a className="button outline" href="#partner">Партнёр</a><a className="button outline" href="#projects">Клиент</a><a className="button outline" href="#factory">Фабрика</a></div>
  </div>
  <p className="order-local-notice">Локальный сценарий без авторизации: кабинеты используют данные этого браузера. Оплаты, производство и доставка здесь не подтверждают реальные операции. Производственный допуск закрыт.</p>
  <div className="technical-actions">
   <button className="button outline" onClick={refresh}>Обновить журнал заказов</button>
   {role==='partner'&&<button className="button outline" onClick={()=>{try{exportFile(exportOrderWorkspace(store));}catch{setMessage('Не удалось выгрузить журнал.');}}}>Скачать полный журнал · только оператор</button>}
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
 const s=row.state,r=s.revisions.at(-1),spec=s.specs?.at(-1),f=orderFinancials(s),factory=role==='factory',partner=role==='partner',client=role==='client';
 const activeClientOffer=client?getCurrentClientOffer(s):null;
 const displayConfig=client?(activeClientOffer?.config??r?.config??s.sourceConfig):(spec?.config??r?.config??s.sourceConfig);
 const engineering=useMemo(()=>orderEngineering(s),[r?.config,s.sourceConfig]);
 const [note,setNote]=useState(''),[reference,setReference]=useState(''),[payment,setPayment]=useState('');
 const [changeNote,setChangeNote]=useState(''),[issueNote,setIssueNote]=useState(''),[messageText,setMessageText]=useState(''),[paymentRef,setPaymentRef]=useState('');
 const [messageChannel,setMessageChannel]=useState('client_partner');
 const [factoryId,setFactoryId]=useState('');
 const [price,setPrice]=useState(spec?String(spec.economics.customerPriceKopecks/100):r?String(r.priceKopecks/100):'');
 const [factoryCost,setFactoryCost]=useState(spec?String(spec.economics.factoryCostKopecks/100):'');
 const [commission,setCommission]=useState(spec?String(spec.economics.platformCommissionKopecks/100):'');
 const [logistics,setLogistics]=useState(spec?String(spec.economics.logisticsKopecks/100):'0');
 const [taxes,setTaxes]=useState(spec?String(spec.economics.taxKopecks/100):'0');
 const [otherCosts,setOtherCosts]=useState(spec?String(spec.economics.otherCostsKopecks/100):'0');
 const [technicalNote,setTechnicalNote]=useState(spec?.technicalNote??'');
 const [advance,setAdvance]=useState(spec?String(spec.advanceBps/100):r?String(r.advanceBps/100):'50');
 const [due,setDue]=useState(spec?.dueDate??r?.dueDate??''),[width,setWidth]=useState(String((spec?.config??r?.config??s.sourceConfig).width));
 const [carrier,setCarrier]=useState(''),[tracking,setTracking]=useState(''),[agreed,setAgreed]=useState(false);
 const [resolutionNote,setResolutionNote]=useState(''),[rejectNote,setRejectNote]=useState(''),[resolutionAgreed,setResolutionAgreed]=useState(false);
 const submit=(e,fn)=>{e.preventDefault();try{fn();}catch(error){onError(error.message);}};
 const paymentStage=['accepted','production','quality','ready'].includes(s.stage)&&s.acceptedRevisionId===r?.id;
 const visibleEvents=row.events.filter(event=>{
  if(event.type==='message'&&!canAccessOrderMessageChannel(role,event.payload?.channel))return false;
  if(role==='client'&&['prepare_spec','confirm_spec','return_spec','record_payment'].includes(event.type))return false;
  if(role==='factory'&&event.type==='record_payment')return false;
  return true;
 });
 return <div className="order-dossier">
  <div className="order-heading"><h3>{s.name}</h3><span className="order-stage">{ORDER_STAGES[s.stage]} · версия журнала {s.version}</span></div>
  <div className="order-columns"><div>
   <h4>{client&&r&&!activeClientOffer?'Историческая конфигурация '+r.id:r?'Предложение '+r.id:spec?'ТЗ '+spec.id:'Исходная конфигурация'}</h4>
   {client&&r&&!activeClientOffer&&<p className="inline-warning" role="status">Прежнее предложение отозвано после запроса изменений или подготовки нового ТЗ. Действующей цены и счёта нет. Дождитесь нового подтверждения фабрики и предложения Габер.</p>}
   <p>{Object.values(dimensions(displayConfig)).join(' × ')} см</p>
   <ConfigurationDetails config={displayConfig}/>
   <p>{factory?`Связь с инженерной моделью: ${engineering.integrityOk?'цифровые ссылки согласованы':'есть ошибки связей'} · маршрутов: ${engineering.routingCount}. Допуск к изготовлению закрыт: ${engineering.blockers.length} незакрытых проверок.`:'Комплектация предложения связана с инженерным составом.'}</p>
   {client&&<ClientOfferAssurance state={s}/>}
   {((client&&activeClientOffer)||(partner&&r))&&<><dl className="order-ledger">
    <div><dt>Цена предложения</dt><dd>{orderMoney(r.priceKopecks)}</dd></div>
    <div><dt>Аванс · {r.advanceBps/100}%</dt><dd>{orderMoney(f.advanceKopecks)}</dd></div>
    <div><dt>Локально учтено · {r.id}</dt><dd>{orderMoney(f.currentKopecks)}</dd></div>
    <div><dt>Осталось до аванса</dt><dd>{orderMoney(f.advanceDueKopecks)}</dd></div>
    <div><dt>Остаток до полного расчёта</dt><dd>{orderMoney(f.balanceKopecks)}</dd></div>
    <div><dt>Проектная дата готовности · календарь не подтверждён</dt><dd>{r.dueDate}</dd></div>
    <div><dt>Подтверждение клиентом</dt><dd>{s.acceptedRevisionId===r.id?r.id:'Требуется'}</dd></div>
   </dl><p>{r.note}</p></>}
   {s.changeNote&&<p className="inline-warning">Корректировка: {s.changeNote}</p>}
   {s.shipment&&<p>Отгрузка: {s.shipment.carrier} · {s.shipment.tracking}<br/>Документ: {s.shipment.reference}</p>}
   {s.delivery&&<p>Доставка: {s.delivery.reference}. {s.stage==='closed'?'Клиент принял заказ.':'Приёмка клиента не завершена.'}</p>}
   {s.issue&&s.issue.status!=='resolved'&&<p className="inline-warning" role="alert">
    Замечание: {s.issue.note}. {s.issue.status==='response_proposed'?'Ожидается ответ клиента.':'Ожидается ответ производства.'}</p>}
   {!!s.issues?.length&&<details className="order-issue-history"><summary>История замечаний ({s.issues.length})</summary>
    {s.issues.map(issue=><article key={issue.id}><strong>{issue.id} · {issue.status==='resolved'?'Решено':issue.status==='response_proposed'?'Предложено решение':'Открыто'}</strong>
     <p>Замечание: {issue.note}</p>{issue.response&&<p>Ответ фабрики: {issue.response.note}</p>}
     {issue.rejections.map((rejected,i)=><p key={i}>Отклонено клиентом: {rejected.note}</p>)}</article>)}
   </details>}
   {s.revisions.length>1&&<details><summary>Предыдущие предложения ({s.revisions.length-1})</summary>
    {s.revisions.slice(0,-1).map(old=><p key={old.id}>{old.id} · {old.config.width} см · {orderMoney(old.priceKopecks)} · {old.dueDate}<br/>{old.note}</p>)}
   </details>}
  </div><div className="order-actions-panel">
   <h4>{factory?'Решения фабрики':partner?'Сделка, себестоимость и ТЗ':'Решения клиента'}</h4>
   {partner&&s.assignedFactoryId&&<p>Назначенная фабрика: <strong>{s.assignedFactoryId}</strong>. Изменение назначения требует отдельного аудита и нового заказа.</p>}
   {partner&&!s.assignedFactoryId&&['requested','awaiting_factory','factory_changes'].includes(s.stage)&&
    <form className="order-factory-assignment" onSubmit={e=>submit(e,()=>
     send('assign_factory',{factoryId:factoryId.trim()},false))}>
     <p>Для настоящего серверного исполнения Габер должен назначить фабрику. Действие ниже пока записывается только в демонстрационном журнале браузера.</p>
     <label className="order-field">Код фабрики
      <input required maxLength={128} pattern="[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}" value={factoryId} onChange={e=>setFactoryId(e.target.value)}/>
     </label>
     <button className="button outline" type="submit">Назначить фабрику · локально</button>
    </form>}
   {factory&&!s.assignedFactoryId&&<p className="inline-warning">Демонстрационный заказ: назначение фабрики на сервере не подтверждено.</p>}
   {partner&&['requested','change_requested','factory_changes','offered'].includes(s.stage)&&<form onSubmit={e=>submit(e,()=>{
    if(!/^\d{1,3}([.,]\d{1,2})?$/.test(advance))throw Error('Проверьте процент аванса.');
    send('prepare_spec',{config:{...(spec?.config??r?.config??s.sourceConfig),width:Number(width)},
     technicalNote,customerPriceKopecks:amount(price),factoryCostKopecks:amount(factoryCost),
     platformCommissionKopecks:amount(commission),logisticsKopecks:amount(logistics),
     taxKopecks:amount(taxes),otherCostsKopecks:amount(otherCosts),
     advanceBps:amount(advance),dueDate:due,note},false);
   })}>
    <p>Партнёр Габер рассчитывает себестоимость и комиссию, готовит ТЗ и передаёт его фабрике. Клиентская цена публикуется после ответа фабрики.</p>
    <label className="order-field">Ширина изделия, см<input required type="number" value={width} onChange={e=>setWidth(e.target.value)}/></label>
    <label className="order-field">Цена клиенту, ₽<input required inputMode="decimal" value={price} onChange={e=>setPrice(e.target.value)}/></label>
    <label className="order-field">Себестоимость фабрики, ₽<input required inputMode="decimal" value={factoryCost} onChange={e=>setFactoryCost(e.target.value)}/></label>
    <label className="order-field">Комиссия Габер, ₽<input required inputMode="decimal" value={commission} onChange={e=>setCommission(e.target.value)}/></label>
    <label className="order-field">Логистика, ₽<input required inputMode="decimal" value={logistics} onChange={e=>setLogistics(e.target.value)}/></label>
    <label className="order-field">Налоги, ₽<input required inputMode="decimal" value={taxes} onChange={e=>setTaxes(e.target.value)}/></label>
    <label className="order-field">Прочие расходы, ₽<input required inputMode="decimal" value={otherCosts} onChange={e=>setOtherCosts(e.target.value)}/></label>
    <label className="order-field">Аванс, %<input required inputMode="decimal" value={advance} onChange={e=>setAdvance(e.target.value)}/></label>
    <label className="order-field">Плановая дата готовности<input required type="date" value={due} onChange={e=>setDue(e.target.value)}/></label>
    <label className="order-field">Техническое задание фабрике<textarea required maxLength={500} value={technicalNote} onChange={e=>setTechnicalNote(e.target.value)}/></label>
    <label className="order-field">Описание предложения<textarea required maxLength={500} value={note} onChange={e=>setNote(e.target.value)}/></label>
    <button className="button dark" type="submit">Отправить ТЗ фабрике на подтверждение</button>
   </form>}
   {spec&&(factory||partner)&&<div className="order-technical-task"><h4>ТЗ {spec.id} · {spec.status}</h4>
     {(factory||partner)&&<><p>{spec.technicalNote}</p><p>Стоимость изготовления: {orderMoney(spec.economics.factoryCostKopecks)}</p>
      {spec.factoryDecision&&<p>Ответ фабрики: {spec.factoryDecision.note}{spec.factoryDecision.reference?' · '+spec.factoryDecision.reference:''}</p>}</>}
     {partner&&<dl className="order-ledger">
      <div><dt>Цена клиенту</dt><dd>{orderMoney(spec.economics.customerPriceKopecks)}</dd></div>
      <div><dt>Плановая комиссия Габер</dt><dd>{orderMoney(spec.economics.platformCommissionKopecks)}</dd></div>
      <div><dt>Логистика / налоги / прочие</dt><dd>{orderMoney(spec.economics.logisticsKopecks+spec.economics.taxKopecks+spec.economics.otherCostsKopecks)}</dd></div>
      <div><dt>Плановый резерв</dt><dd>{orderMoney(spec.economics.plannedReserveKopecks)}</dd></div>
     </dl>}
     {factory&&s.stage==='awaiting_factory'&&<form onSubmit={e=>submit(e,()=>send('confirm_spec',{reference,note}))}>
      <p>Проверьте конструкцию, материалы, сроки и стоимость. Это подтверждение проектного ТЗ, не запуск изготовления.</p>
      <label className="order-field">Документ подтверждения фабрики<input required maxLength={500} value={reference} onChange={e=>setReference(e.target.value)}/></label>
      <label className="order-field">Комментарий фабрики<textarea required maxLength={500} value={note} onChange={e=>setNote(e.target.value)}/></label>
      <button className="button dark" type="submit">Подтвердить ТЗ · локально</button>
      <button className="button outline" type="button" onClick={()=>send('return_spec',{note:note||'Требуются уточнения ТЗ'})}>Вернуть ТЗ на доработку</button>
     </form>}
     {partner&&s.stage==='factory_confirmed'&&<button className="button dark" onClick={()=>send('offer',{note:spec.note})}>Опубликовать предложение клиенту</button>}
   </div>}
   {client&&s.stage==='offered'&&<div className="order-decision">
    <label><input type="checkbox" checked={agreed} onChange={e=>setAgreed(e.target.checked)}/> Проверены комплектация, цена, аванс и срок предложения {r.id}</label>
    <button className="button dark" disabled={!agreed} onClick={()=>send('accept')}>Согласовать {r.id}</button>
   </div>}
   {client&&['offered','accepted','change_requested'].includes(s.stage)&&<form onSubmit={e=>submit(e,()=>send('request_change',{note:changeNote}))}>
    <label className="order-field">Что необходимо скорректировать<textarea required maxLength={500} value={changeNote} onChange={e=>setChangeNote(e.target.value)}/></label>
    <button className="button outline" type="submit">Запросить корректировку</button>
   </form>}
   {f.priorCredits.length>0&&<div><h4>Средства предыдущих ревизий · локальные записи</h4>
    {f.priorCredits.map(credit=><div className="order-credit" key={credit.revisionId}><p>{credit.revisionId}: {orderMoney(credit.amountKopecks)}. Автоматически не зачтены.</p>
     {client&&s.stage==='accepted'&&f.balanceKopecks>0&&<button className="button outline" onClick={()=>send('allocate_credit',{fromRevisionId:credit.revisionId,amountKopecks:Math.min(credit.amountKopecks,f.balanceKopecks)})}>Перенести {orderMoney(Math.min(credit.amountKopecks,f.balanceKopecks))} на {r.id}</button>}</div>)}
   </div>}
   {paymentStage&&(partner||client)&&<form onSubmit={e=>submit(e,()=>send(partner?'record_payment':'report_payment',{amountKopecks:amount(payment),reference:paymentRef}))}>
    <p>{partner?'Локальная запись партнёра не является банковским подтверждением.':'Сообщение об оплате не меняет учтённый баланс и не разрешает запуск.'}</p>
    <label className="order-field">Сумма, ₽<input required inputMode="decimal" value={payment} onChange={e=>setPayment(e.target.value)}/></label>
    <label className="order-field">Номер / ссылка на платёжный документ<input required maxLength={500} value={paymentRef} onChange={e=>setPaymentRef(e.target.value)}/></label>
    <button className="button outline" type="submit">{partner?'Добавить локальную запись оплаты':'Сообщить об оплате'}</button>
   </form>}
   {factory&&s.stage==='accepted'&&<><p>{f.advanceDueKopecks?'Сценарий запуска заблокирован до учёта аванса.':'Согласование и аванс позволяют проверить следующий этап локально.'}</p><button className="button dark" disabled={f.advanceDueKopecks>0} onClick={()=>send('start')}>Запустить производственный сценарий</button></>}
   {factory&&s.stage==='production'&&<button className="button dark" onClick={()=>send('complete')}>Передать на контроль качества</button>}
   {factory&&['quality','ready','shipped'].includes(s.stage)&&<form onSubmit={e=>submit(e,()=>send(s.stage==='quality'?'quality_pass':s.stage==='ready'?'ship':'deliver',s.stage==='ready'?{carrier,tracking,reference}:{reference}))}>
    {s.stage==='ready'&&<><label className="order-field">Перевозчик<input required maxLength={500} value={carrier} onChange={e=>setCarrier(e.target.value)}/></label><label className="order-field">Номер отправления<input required maxLength={500} value={tracking} onChange={e=>setTracking(e.target.value)}/></label></>}
    <label className="order-field">{s.stage==='quality'?'Акт контроля качества':s.stage==='ready'?'Отгрузочный документ':'Подтверждение доставки'}<input required maxLength={500} value={reference} onChange={e=>setReference(e.target.value)}/></label>
    {s.stage==='ready'&&f.balanceKopecks>0&&<p>Отгрузка заблокирована: остался полный расчёт {orderMoney(f.balanceKopecks)}.</p>}
    <button className="button dark" type="submit" disabled={s.stage==='ready'&&f.balanceKopecks>0}>{s.stage==='quality'?'Зафиксировать контроль · локально':s.stage==='ready'?'Зафиксировать отгрузку · локально':'Зафиксировать доставку · локально'}</button>
   </form>}
   {client&&s.stage==='delivered'&&<button className="button dark" onClick={()=>send('accept_delivery')}>Принять доставленный заказ</button>}
   {client&&['shipped','delivered'].includes(s.stage)&&<form onSubmit={e=>submit(e,()=>send('report_issue',{note:issueNote}))}>
    <label className="order-field">Замечания к заказу<textarea required maxLength={500} value={issueNote} onChange={e=>setIssueNote(e.target.value)}/></label><button className="button outline" type="submit">Сообщить о проблеме</button>
   </form>}
   {factory&&s.stage==='disputed'&&s.issue?.status==='open'&&<form className="order-dispute-action"
    onSubmit={e=>submit(e,()=>send('respond_issue',{note:resolutionNote}))}>
    <h4>Ответить на замечание {s.issue.id}</h4>
    <p>Предложенное действие не является подтверждённым актом ремонта.</p>
    <label className="order-field">Предложение фабрики<textarea required maxLength={500}
     value={resolutionNote} onChange={e=>setResolutionNote(e.target.value)}/></label>
    <button className="button dark" type="submit">Предложить решение · локально</button>
   </form>}
   {client&&s.stage==='disputed'&&s.issue?.status==='response_proposed'&&<div className="order-dispute-action">
    <h4>Решение фабрики по замечанию {s.issue.id}</h4><p>{s.issue.response?.note}</p>
    <label className="order-resolution-check"><input type="checkbox" checked={resolutionAgreed}
     onChange={e=>setResolutionAgreed(e.target.checked)}/>
     Подтверждаю принятие решения в локальном сценарии</label>
    <button type="button" className="button dark" disabled={!resolutionAgreed}
     onClick={()=>send('confirm_resolution')}>Принять решение</button>
    <form onSubmit={e=>submit(e,()=>send('reject_resolution',{note:rejectNote}))}>
     <label className="order-field">Причина отказа<textarea required maxLength={500}
      value={rejectNote} onChange={e=>setRejectNote(e.target.value)}/></label>
     <button className="button outline" type="submit">Вернуть на доработку</button>
    </form>
   </div>}

  </div></div>
  {!factory&&<details className="order-payments"><summary>Платёжные записи и сообщения ({s.payments.length+s.paymentClaims.length})</summary>
   {[...s.payments,...s.paymentClaims].map((p,i)=><p key={i}>{p.revisionId} · {orderMoney(p.amountKopecks)} · {p.reference}<br/>{p.authority==='CLIENT_CLAIM'?'Сообщение клиента; в балансе не учтено':'Локальная запись; банк не подтвердил'}</p>)}
  </details>}
  <div className="order-conversation"><h4>Обсуждение заказа</h4>
   <p>Клиент и фабрика ведут отдельные диалоги с Габер. Общий канал видят все три стороны. Оператору доступна вся переписка своего заказа.</p>
   {visibleOrderMessages(s.messages,role).map((m,i)=><p key={i}><strong>{account(m.role)} · {CHANNEL_LABELS[m.channel??'shared']??'Канал не определён'} · {m.revisionId??'Заявка'}</strong><br/>{m.note}</p>)}
   <form onSubmit={e=>submit(e,()=>send('message',{note:messageText,channel:client?'client_partner':factory?'factory_partner':messageChannel}))}>
    {partner&&<label className="order-field">Кому сообщение<select value={messageChannel} onChange={e=>setMessageChannel(e.target.value)}>
     <option value="client_partner">Клиенту</option><option value="factory_partner">Фабрике</option><option value="shared">В общий канал</option>
    </select></label>}
    <label className="order-field">Сообщение другой стороне<textarea required maxLength={500} value={messageText} onChange={e=>setMessageText(e.target.value)}/></label>
    <button className="button outline" type="submit">Записать сообщение в заказ</button>
   </form>
  </div>
  <details className="order-history"><summary>История доступных событий ({visibleEvents.length})</summary><ol>
   {visibleEvents.map(event=><li key={event.id}><strong>{LABELS[event.type]??event.type}</strong><span>{account(event.role)} · {event.revisionId??'—'} · {new Date(event.at).toLocaleString('ru-RU')}</span>{event.payload.note&&<p>{event.payload.note}</p>}</li>)}
  </ol></details>
 </div>;
}
