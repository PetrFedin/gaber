import React,{useEffect,useMemo,useState} from 'react';
import {evaluateFactoryCostDraft,auditFactoryCostDraft} from './factoryCosting.js';
import {money,csv} from './domain.js';
import FactoryDraftWorkspace,{loadInitialFactoryText} from './FactoryDraftWorkspace.jsx';
import FactoryCostEditor from './FactoryCostEditor.jsx';
import FactoryInsightsPanel from './FactoryInsightsPanel.jsx';
import {factoryConfigKey} from './factoryDraftStorage.js';
import {readFactoryScratch,writeFactoryScratch} from './factoryScratch.js';
function initialText(config){
  try{const saved=readFactoryScratch(config);if(saved!==null)return saved;}catch{}
  return loadInitialFactoryText(config);
}

/** Local human-input review only. Never a production or purchasing approval UI. */
export default function FactoryCostDraftPanel({config}){
 const [text,setText]=useState(()=>initialText(config));
 const [scratchWarning,setScratchWarning]=useState('');
 const configKey=factoryConfigKey(config);
 useEffect(()=>{setText(initialText(config));setScratchWarning('');},[configKey]);
 const changeText=next=>{
   setText(next);
   try{writeFactoryScratch(config,next);setScratchWarning('');}
   catch(e){setScratchWarning('Временная копия в этом браузере не сохранилась ('+e.message+'). Сохраните локальную ревизию или скачайте исходный текст.');}
 };

 const [message,setMessage]=useState('');
 const review=useMemo(()=>{
  if(!text.trim())return null;
  let draft;
  try{draft=JSON.parse(text);}
  catch(e){return {error:'Некорректный JSON: '+e.message};}
  try{
    const report=evaluateFactoryCostDraft(config,draft);
    const audit=auditFactoryCostDraft(config,draft,report);
    return {draft,report,audit};
  }catch(e){return {draft,error:'Не удалось проверить исходные данные: '+e.message};}
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
 const save=()=>{
  if(!review?.report||!review.audit.ok){setMessage('Экспорт заблокирован: устраните некорректные или устаревшие данные.');return;}
  const payload={kind:'GABER_FACTORY_COST_PREVIEW_NOT_APPROVED',draft:JSON.parse(text),review:review.report};
  const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download='gaber-factory-cost-unapproved.json';a.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
  setMessage('Экспортирован непроверенный черновик. Это не производственная смета и не разрешение на выпуск.');
 };
 return <section className="rates-section" aria-label="Ввод заводских нормативов">
  <div className="section-top"><div><h2>Заводские нормативы · финансовая модель</h2>
   <p>Ставки поставщиков, реальные измерения, нормы отходов и операции привязываются к существующим ID производственных деталей. Вводимые данные не утверждены заводом.</p>
  </div></div>
  <FactoryDraftWorkspace config={config} text={text} onChange={changeText} onMessage={setMessage}/>
  {scratchWarning&&<p className="gaber-insights-alert" role="alert">{scratchWarning}</p>}
  <FactoryCostEditor config={config} text={text} onChange={changeText}/>
  {review?.draft&&<FactoryInsightsPanel config={config} draft={review.draft}/>}

  <div className="technical-actions">
   <button type="button" className="button outline" disabled={!review?.report} onClick={exportRequirements}>Реестр ID · CSV</button>
   <button type="button" className="button outline" disabled={!review?.report||!review.audit.ok} onClick={save}>Экспортировать черновик</button></div>
  <details className="gaber-raw-editor"><summary>Расширенный режим · исходный JSON</summary>
  <label className="advanced-field"><span>JSON реестра поставщиков, расходов и нормо-времени</span>
   <textarea value={text} rows={12} spellCheck={false} onChange={e=>{changeText(e.target.value);setMessage('');}} placeholder="Данные для расширенного редактирования" /></label>
  </details>
  {message&&<p className="helper" role="status">{message}</p>}
  {review?.error&&<p className="inline-warning" role="alert">{review.error}</p>}
  {review?.report&&<>
   <p className="gaber-checkline">Техническая проверка: {review.audit?.ok?'логика отчёта согласована':'обнаружены расхождения'} ·
    Ввод: {review.report.status==='self-reported-input-complete'?'все обязательные позиции заполнены':review.report.status==='incomplete'?'неполные данные':'ошибки исходных данных'}.
    Производственное утверждение недоступно.</p>
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
