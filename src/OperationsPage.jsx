import React,{useEffect,useMemo,useState} from 'react';
import {readOrderWorkspace,ORDER_STORAGE_KEY} from './orderStorage.js';
import {analyzeOrderPortfolio,localOperationalDate} from './orderAnalytics.js';
import {ORDER_STAGES} from './orderWorkflow.js';
import {orderMoney} from './orderMoney.js';

const moneyExact=value=>value===null?'Не подтверждено':orderMoney(value);
const fmt=n=>new Intl.NumberFormat('ru-RU').format(n);
const box=(label,value,note)=><article key={label}>
  <small>{label}</small><strong>{fmt(value)}</strong><span>{note}</span>
 </article>;
function browserStorage(){try{return globalThis.localStorage??null;}catch{return null;}}
export default function OperationsPage({projects}){
 const [store]=useState(browserStorage);
 const [workspace,setWorkspace]=useState(()=>readOrderWorkspace(store));
 const partnerOperator=true;
 const [asOf,setAsOf]=useState(()=>localOperationalDate());
 const [query,setQuery]=useState('');
 useEffect(()=>{
  const onStorage=event=>{
   if(event.key===ORDER_STORAGE_KEY||event.key===null)setWorkspace(readOrderWorkspace(store));
  };
  window.addEventListener('storage',onStorage);
  return()=>window.removeEventListener('storage',onStorage);
 },[store]);
 const data=useMemo(()=>analyzeOrderPortfolio(workspace,projects,asOf),
  [workspace,projects,asOf]);
 const owner=partnerOperator;
 const listed=data.status==='ready'?data.rows.filter(row=>
  (row.name+' '+row.id+' '+row.stageLabel).toLowerCase().includes(query.toLowerCase())):[];
 return <main className="page gaber-operations" aria-label="Локальная аналитика процессов GABER">
  <div className="page-top"><div>
   <span className="eyebrow">GABER / ОПЕРАЦИОННЫЙ КОНТУР</span>
   <h1>Исполнение заказов</h1>
   <p>Ревизии, согласования и контроль переходов между клиентом и производством.
   Отображаются только сведения журнала этого браузера.</p>
  </div><a className="button outline" href="#factory">Перейти к заказам</a></div>
  <p className="gaber-operations-warning" role="note">
   Это локальный демонстрационный кабинет партнёра — оператора платформы.
   Переключение вида не предоставляет серверных полномочий. Данные не передаются
   между устройствами; платежи, изготовление и доставка не подтверждены независимыми системами.
  </p>
  <div className="gaber-operations-toolbar">
   <button type="button" className="button outline"
    onClick={()=>{setWorkspace(readOrderWorkspace(store));setAsOf(localOperationalDate());}}>
    Обновить журнал</button>
  </div>
  {data.status!=='ready'?<div className="inline-warning" role="alert">
   Журнал недоступен или не прошёл контроль. Аналитика и действия заблокированы.
   Сначала восстановите или экспортируйте исходные данные через кабинет заказов.
  </div>:<>
   <section className="gaber-operations-kpis" aria-label="Показатели локального журнала">
    {box('Заказы',data.metrics.orders,'Всего записей')}
    {box('Открытые',data.metrics.open,'Включая локальные сценарии исполнения')}
    {box('Ждут клиента',data.metrics.awaitingClient,'Согласование, оплата или приёмка')}
    {box('Ждут фабрику',data.metrics.awaitingFactory,'Подтверждение ТЗ, контроль, документы')}
    {box('Ждут партнёра',data.metrics.awaitingPartner,'Расчёт, публикация цены, согласование оплат')}
    {box('Замечания',data.metrics.disputed,'Незавершённые споры')}
    {box('Просрочка срока',data.metrics.overdue,'По плановой дате текущего предложения')}
    {box('Ревизии',data.metrics.versions,'Все исторические предложения')}
    {box('Сообщения',data.metrics.messages,'Записанные события переписки')}
   </section>
   <div className="gaber-operations-columns">
    <section><h2>Статусы процесса</h2>
     <div className="gaber-operations-stages">
      {Object.entries(data.byStage).map(([id,count])=><div key={id}>
       <span>{ORDER_STAGES[id]}</span><strong>{count}</strong></div>)}
     </div>
    </section>
    <section><h2>Достоверность и пробелы</h2>
     <dl className="gaber-operations-audit">
      <div><dt>Ошибки связности инженерных моделей</dt><dd>{data.metrics.engineeringIntegrityFailures}</dd></div>
      <div><dt>Несогласованные платёжные остатки</dt><dd>{data.metrics.financialReconciliationFailures}</dd></div>
      <div><dt>Заявки без связанного заказа</dt><dd>{data.metrics.unlinkedSubmittedProjects}</dd></div>
      <div><dt>Заказы без проекта в этом браузере</dt><dd>{data.metrics.ordersMissingProject}</dd></div>
      <div><dt>Выпуск реального производства</dt><dd>Не разрешён</dd></div>
     </dl>
    </section>
   </div>
   {owner&&<section className="gaber-operations-finance">
    <div className="gaber-operations-heading"><h2>Финансовый контекст</h2>
     <small>Рубли · исключительно сведения локального журнала</small></div>
    <dl>
     <div><dt>Общая стоимость текущих предложений</dt>
      <dd>{moneyExact(data.totals.offeredKopecks)}</dd></div>
     <div><dt>Записано локально за текущие ревизии</dt>
      <dd>{moneyExact(data.totals.locallyRecordedCurrentKopecks)}</dd></div>
     <div><dt>Локальные средства при переоценке · требуют перераспределения</dt>
      <dd>{moneyExact(data.totals.pendingRequoteLocalKopecks)}</dd></div>
     <div><dt>Незачтённые записи прежних ревизий</dt>
      <dd>{moneyExact(data.totals.unallocatedPriorCreditKopecks)}</dd></div>
     <div><dt>Заявлено клиентами об оплате</dt>
      <dd>{moneyExact(data.totals.claimedByClientKopecks)}</dd></div>
     <div><dt>Плановая стоимость изготовления фабрикой</dt><dd>{moneyExact(data.totals.plannedFactoryCostKopecks)}</dd></div>
     <div><dt>Плановая комиссия Габер</dt><dd>{moneyExact(data.totals.plannedPlatformCommissionKopecks)}</dd></div>
     <div><dt>Плановый резерв на уровне предложений</dt><dd>{moneyExact(data.totals.plannedReserveKopecks)}</dd></div>
     <div><dt>Подтверждённые банком поступления</dt><dd>Нет данных</dd></div>
     <div><dt>Подтверждённая выручка / фактическая маржа</dt><dd>Нет данных</dd></div>
    </dl>
    <p>Заявленные и локально учтённые суммы не являются денежными поступлениями.
     Партнёр управляет себестоимостью фабрики и комиссией Габер в карточке сделки. Фактические поступления должны подтверждаться банком. Демо-данные не использовать для отчётности.</p>
   </section>}
   {owner&&<section className="gaber-operations-queue">
    <div className="gaber-operations-heading"><div><h2>Очередь действий</h2>
      <p>Порядок: открытые замечания и просрочка, затем ожидающие решения.</p></div>
     <label>Найти заказ<input value={query}
      onChange={e=>setQuery(e.target.value)} placeholder="ID, название, статус"/></label>
    </div>
    {!listed.length?<p>По выбранным условиям заказов нет.</p>:
     <div className="gaber-operations-table"><table>
      <thead><tr><th>Изделие / ID</th><th>Состояние</th><th>Следующее действие</th><th>Срок</th></tr></thead>
      <tbody>{listed.map(row=><tr key={row.id}>
       <td><strong>{row.name}</strong><small>{row.id} · {row.revisionId??'без предложения'}</small></td>
       <td>{row.stageLabel}
        {row.openIssue&&<small>Открыто замечание</small>}
        {!row.engineeringIntegrityOk&&<small>Ошибка инженерной связности</small>}</td>
       <td><strong>{row.actionOwner==='client'?'Клиент':row.actionOwner==='factory'?'Фабрика':row.actionOwner==='partner'?'Партнёр GABER':'—'}</strong>
        <small>{row.nextAction}</small></td>
       <td>{row.dueDate??'—'}{row.dueDate&&row.dueDateAuthority==='DRAFT_UNCONFIRMED'&&<small>Только ориентир · не подтверждён</small>}{row.overdue&&<small className="gaber-overdue">Плановая дата прошла</small>}</td>
      </tr>)}</tbody></table></div>}
    <p>Очередь носит диагностический характер. Настоящие полномочия и поручения должны
     определяться сервером по объектным правам и проверенным участникам заказа.</p>
   </section>}
  </>}
 </main>;
}
