import React,{useMemo,useState} from 'react';
import {emptyFactoryCostDraft,evaluateFactoryCostDraft,auditFactoryCostDraft} from './factoryCosting.js';
import {money,csv} from './domain.js';

/** Local human-input review only. Never a production or purchasing approval UI. */
export default function FactoryCostDraftPanel({config}){
 const [text,setText]=useState('');
 const [message,setMessage]=useState('');
 const review=useMemo(()=>{
  if(!text.trim())return null;
  try{
    const draft=JSON.parse(text);
    const report=evaluateFactoryCostDraft(config,draft);
    const audit=auditFactoryCostDraft(config,draft,report);
    return {report,audit};
  }catch(e){return {error:'Некорректный JSON: '+e.message};}
 },[text,config]);
 const exportRequirements=()=>{
  if(!review?.report)return;
  const coverage=review.report.coverage;
  const rows=[['Тип','ID','Единица','Источник / замер'],
   ...coverage.requiredMaterialRefs.map(id=>['MATERIAL',id,'Уточнить','Уточнить']),
   ...coverage.requiredOperations.map(id=>['OPERATION',id,'мин','Уточнить'])];
  const url=URL.createObjectURL(new Blob([csv(rows)],{type:'text/csv;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download='gaber-cost-required-ids.csv';a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
 };
 const loadTemplate=()=>{
  const date=new Date().toISOString().slice(0,10);
  setText(JSON.stringify(emptyFactoryCostDraft(config,date),null,2));
  setMessage('Создан пустой черновик для текущей конфигурации. Источники цен и замеры необходимо ввести самостоятельно.');
 };
 const save=()=>{
  if(!review?.report||!review.audit.ok){setMessage('Экспорт заблокирован: устраните некорректные или устаревшие данные.');return;}
  const payload={kind:'GABER_FACTORY_COST_PREVIEW_NOT_APPROVED',draft:JSON.parse(text),review:review.report};
  const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download='gaber-factory-cost-unapproved.json';a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  setMessage('Экспортирован непроверенный черновик. Это не производственная смета и не разрешение на выпуск.');
 };
 return <section className="rates-section" aria-label="Ввод заводских нормативов">
  <div className="section-top"><div><h2>Заводские нормативы · черновик v0.4.8</h2>
   <p>Ставки поставщиков, реальные измерения, нормы отходов и операции привязываются к существующим ID производственных деталей. Вводимые данные не утверждены заводом.</p>
  </div></div>
  <div className="technical-actions"><button type="button" className="button outline" onClick={loadTemplate}>Создать пустой шаблон JSON</button>
   <button type="button" className="button outline" disabled={!review?.report} onClick={exportRequirements}>Реестр ID · CSV</button>
   <button type="button" className="button outline" disabled={!review?.report||!review.audit.ok} onClick={save}>Экспортировать черновик</button></div>
  <label className="advanced-field"><span>JSON реестра поставщиков, расходов и нормо-времени</span>
   <textarea value={text} rows={9} spellCheck={false} onChange={e=>{setText(e.target.value);setMessage('');}} placeholder="Сначала создайте пустой шаблон. Указывайте только подтверждаемые самостоятельно исходные данные." /></label>
  {message&&<p className="helper" role="status">{message}</p>}
  {review?.error&&<p className="inline-warning" role="alert">{review.error}</p>}
  {review?.report&&<><div className="costing-summary">
    <article><small>Статус</small><strong>{review.report.status}</strong><span>Утверждение производства запрещено</span></article>
    <article><small>Введённые прямые затраты</small><strong>{money(review.report.totals.partialDirectRUB)}</strong><span>Частичный расчёт; не итог заказа</span></article>
    <article><small>Непокрытые элементы/операции</small><strong>{review.report.coverage.missingMaterialRefs.length+review.report.coverage.missingOperations.length}</strong><span>Отсутствующие заводские нормативы</span></article>
   </div>
   {review.report.issues.length>0&&<div className="inline-warning" role="alert"><strong>Обнаружены ошибки</strong><ul>{review.report.issues.slice(0,15).map((i,n)=><li key={n}>{i.path}: {i.code}</li>)}</ul></div>}
   <details><summary>Неоценённые материалы ({review.report.coverage.missingMaterialRefs.length})</summary><p>{review.report.coverage.missingMaterialRefs.join(' · ')||'Нет пропусков'}</p></details>
   <details><summary>Операции без нормо-времени ({review.report.coverage.missingOperations.length})</summary><p>{review.report.coverage.missingOperations.join(' · ')||'Нет пропусков'}</p></details>
   <details><summary>Единицы расхода и лекала требуют проверки ({review.report.coverage.unitReviewRefs?.length??0})</summary>
     <p>Для новых записей указывайте measuredUnit той же единицей, что и unit в прайсе. Проверка единицы не подтверждает физическую норму расхода, артикул или раскладку обивки.</p>
     <small>{review.report.coverage.unitReviewRefs?.join(' · ')||'Неотмеченных единиц нет; заводская валидация всё равно обязательна.'}</small>
   </details>
   <p className="page-disclaimer">Источник: данные пользователя, не проверенные независимой фабрикой. Утверждённая и фактическая себестоимость неизвестны. Производственный выпуск всегда заблокирован.</p>
  </>}
 </section>;
}
