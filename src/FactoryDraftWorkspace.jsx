import React,{useEffect,useMemo,useRef,useState} from 'react';
import {emptyFactoryCostDraft,evaluateFactoryCostDraft,auditFactoryCostDraft} from './factoryCosting.js';
import {money} from './domain.js';
import {
  FACTORY_WORKSPACE_KEY, MAX_FACTORY_REVISIONS, MAX_FACTORY_IMPORT_BYTES,
  readFactoryWorkspace, saveFactoryRevision, matchingFactoryRevisions,
  getFactoryRevision, exportFactoryRevision, exportFactoryWorkspaceRaw,
  parseFactoryDraftImport, factoryConfigKey
} from './factoryDraftStorage.js';

const messages={
  WORKSPACE_CORRUPT:'Журнал повреждён или имеет неизвестный формат. Скачайте исходную копию; перезапись заблокирована.',
  STORAGE_UNAVAILABLE:'Хранилище браузера недоступно. Скачайте текст черновика; локальное сохранение не выполнено.',
  UNOBSERVED_WORKSPACE:'Состояние журнала неизвестно. Обновите историю перед сохранением.',
  STALE_WORKSPACE:'Журнал изменился в другой вкладке. Обновите историю и повторите сохранение. Текст редактора сохранён на экране.',
  DUPLICATE_REVISION:'Такой идентификатор ревизии уже существует.',
  INVALID_REVISION:'Проверьте название и данные ревизии.',
  REVISION_LIMIT:'Достигнут лимит 30 ревизий. Скачайте журнал и текущий текст; старые записи не удалены.',
  DRAFT_TOO_LARGE:'Черновик превышает лимит 512 КБ.',
  WORKSPACE_TOO_LARGE:'Журнал превышает лимит 2 МБ. Скачайте журнал и текущий текст.',
  STORAGE_WRITE_FAILED:'Браузер отклонил запись, возможно, из-за квоты. Текст редактора не заменён.',
  STORAGE_VERIFY_FAILED:'Не удалось подтвердить запись чтением. Обновите историю; успех сохранения не подтверждён.',
  REVISION_CONFIG_MISMATCH:'Ревизия не относится к текущей конфигурации.',
  IMPORT_TOO_LARGE:'Файл импорта превышает лимит 1 МБ.',
  IMPORT_JSON_INVALID:'Файл не содержит корректный JSON.',
  IMPORT_DRAFT_INVALID:'Это не поддерживаемый черновик расчёта. Исходный текст редактора не изменён.',
  IMPORT_CONFIG_MISMATCH:'Размеры или материалы импортируемого черновика отличаются от текущей конфигурации.',
  IMPORT_REVIEW_FAILED:'Проверка импортируемых ставок, единиц или ссылок не пройдена.',
  IMPORT_PREVIEW_STALE:'Предпросмотр устарел после изменения текста или конфигурации. Повторите импорт.',
  CRYPTO_UNAVAILABLE:'Не удалось получить надёжный идентификатор ревизии. Локальное сохранение отменено.'
};
function localStorageOrNull(){
  try{return globalThis.localStorage??null;}catch{return null;}
}
export function loadInitialFactoryText(config){
  try{
    const state=readFactoryWorkspace(localStorageOrNull());
    return matchingFactoryRevisions(state,config)[0]?.text??'';
  }catch{return '';}
}
function download(name,body,type='application/json'){
  const url=URL.createObjectURL(new Blob([body],{type}));
  const link=document.createElement('a');link.href=url;link.download=name;link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function sourceOf(text,fallback){
  try{
    const value=JSON.parse(text);
    if(value?.schemaVersion==='gaber-factory-cost-draft/0.4.7'){
      factoryConfigKey(value.sourceConfig);
      return value.sourceConfig;
    }
  }catch{/* Unfinished text is still worth preserving with its original editor context. */}
  return fallback;
}
function newRevisionId(){
  if(!globalThis.crypto?.getRandomValues)throw Error('CRYPTO_UNAVAILABLE');
  const values=crypto.getRandomValues(new Uint8Array(16));
  return 'local-'+Array.from(values,b=>b.toString(16).padStart(2,'0')).join('');
}

/** Local journal is keyed by exact configuration, not by customer/order identity. */
export default function FactoryDraftWorkspace({config,text,onChange,onMessage}){
  const [storage]=useState(localStorageOrNull);
  const [workspace,setWorkspace]=useState(()=>readFactoryWorkspace(storage));
  const [savedText,setSavedText]=useState(text);
  const [label,setLabel]=useState('Рабочий расчёт');
  const [selected,setSelected]=useState('');
  const [preview,setPreview]=useState(null);
  const [externalChange,setExternalChange]=useState(false);
  const input=useRef(null),generation=useRef(0),editorContext=useRef(structuredClone(config));
  const configKey=factoryConfigKey(config);
  const history=useMemo(()=>matchingFactoryRevisions(workspace,config),[workspace,configKey]);
  const selectedId=history.some(r=>r.id===selected)?selected:history[0]?.id??'';
  const dirty=text!==savedText;

  useEffect(()=>{generation.current++;setPreview(null);},[text,configKey]);
  useEffect(()=>()=>{generation.current++;},[]);
  useEffect(()=>{
    const changed=event=>{if(event.key===FACTORY_WORKSPACE_KEY||event.key===null)setExternalChange(true);};
    window.addEventListener('storage',changed);
    return()=>window.removeEventListener('storage',changed);
  },[]);
  useEffect(()=>{
    const warn=event=>{if(dirty&&text.trim()){event.preventDefault();event.returnValue='';}};
    window.addEventListener('beforeunload',warn);
    return()=>window.removeEventListener('beforeunload',warn);
  },[dirty,text]);

  const notifyError=error=>onMessage(messages[error?.message]||'Операция не выполнена: '+(error?.message||'неизвестная ошибка'));
  const checkpoint=(value,name,state=workspace,context=editorContext.current)=>{
    const id=newRevisionId();
    const next=saveFactoryRevision(storage,state,{
      id,label:(name||'Рабочий расчёт').slice(0,100),savedAt:new Date().toISOString(),
      sourceConfig:sourceOf(value,context),text:value
    });
    setWorkspace(next);setExternalChange(false);setSelected(id);
    return next;
  };
  const preserveCurrent=state=>{
    if(!text.trim()||!dirty)return state;
    const next=checkpoint(text,'Перед заменой · '+label,state);
    setSavedText(text);
    return next;
  };
  const saveCurrent=()=>{
    try{
      checkpoint(text,label);setSavedText(text);
      onMessage('Локальная ревизия записана и прочитана обратно. Это сохранение черновика, не заводское утверждение.');
    }catch(error){notifyError(error);}
  };
  const refresh=()=>{
    setWorkspace(readFactoryWorkspace(storage));setExternalChange(false);
    onMessage('История перечитана. Текст редактора не изменён.');
  };
  const restore=()=>{
    try{
      const record=getFactoryRevision(workspace,selectedId,config);
      preserveCurrent(workspace);
      generation.current++;setPreview(null);
      editorContext.current=structuredClone(record.sourceConfig);
      onChange(record.text);setSavedText(record.text);setLabel(record.label);setSelected(record.id);
      onMessage('Ревизия загружена. Расчёт строится из её исходных данных; прежние несохранённые правки сохранены отдельно.');
    }catch(error){notifyError(error);}
  };
  const create=()=>{
    try{
      const nextText=JSON.stringify(emptyFactoryCostDraft(config,new Date().toISOString().slice(0,10)),null,2);
      const state=preserveCurrent(workspace);
      checkpoint(nextText,'Новый черновик',state,config);
      editorContext.current=structuredClone(config);
      generation.current++;setPreview(null);
      onChange(nextText);setSavedText(nextText);
      onMessage('Создан и локально сохранён пустой черновик. Цены, замеры и нормы времени необходимо ввести.');
    }catch(error){notifyError(error);}
  };
  const readImport=async event=>{
    const file=event.target.files?.[0];
    event.target.value='';
    if(!file)return;
    const ticket=++generation.current;
    setPreview(null);
    try{
      if(file.size>MAX_FACTORY_IMPORT_BYTES)throw Error('IMPORT_TOO_LARGE');
      const contents=await file.text();
      if(ticket!==generation.current)return;
      const parsed=parseFactoryDraftImport(contents,config);
      const report=evaluateFactoryCostDraft(config,parsed.draft);
      const audit=auditFactoryCostDraft(config,parsed.draft,report);
      if(report.status==='invalid-input'||!audit.ok)throw Error('IMPORT_REVIEW_FAILED');
      setPreview({text:parsed.text,report,configKey,beforeText:text,fileName:file.name});
      onMessage('Файл проверен без изменения редактора. Просмотрите расчёт и подтвердите импорт.');
    }catch(error){if(ticket===generation.current)notifyError(error);}
  };
  const applyImport=()=>{
    try{
      if(!preview||preview.configKey!==configKey||preview.beforeText!==text)throw Error('IMPORT_PREVIEW_STALE');
      const parsed=parseFactoryDraftImport(preview.text,config);
      const report=evaluateFactoryCostDraft(config,parsed.draft);
      if(report.status==='invalid-input'||!auditFactoryCostDraft(config,parsed.draft,report).ok)throw Error('IMPORT_REVIEW_FAILED');
      const state=preserveCurrent(workspace);
      checkpoint(parsed.text,'Импорт · '+(parsed.draft.revisionId||label),state,config);
      editorContext.current=structuredClone(config);
      generation.current++;setPreview(null);
      onChange(parsed.text);setSavedText(parsed.text);
      onMessage('Исходные данные импортированы и сохранены отдельной локальной ревизией. Суммы из файла не использовались.');
    }catch(error){notifyError(error);}
  };

  return <section className="gaber-workspace" aria-label="Локальные ревизии заводского расчёта">
    <h3>История расчёта · v0.4.9</h3>
    <p className="helper">Ревизии привязаны к текущим размерам и материалам, а не к номеру заказа.
      Сохранение — кнопкой. Перед сменой раздела сохраните правки.
      Журнал хранится только в этом браузере и экспортируется отдельно от клиентских проектов.</p>
    {workspace.error&&<p className="inline-warning" role="alert">{messages[workspace.error]}</p>}
    {externalChange&&<p className="inline-warning" role="status">Журнал изменён в другой вкладке. Перед записью обновите историю.</p>}
    <label className="advanced-field"><span>Название локальной ревизии</span>
      <input value={label} maxLength={100} onChange={event=>setLabel(event.target.value)}/></label>
    <p className="helper" role="status">{dirty?'Есть несохранённые изменения':'Текст не изменён после загрузки или сохранения'}.
      Ревизий этой конфигурации: {history.length}; всего: {workspace.records.length}/{MAX_FACTORY_REVISIONS}.</p>
    <div className="technical-actions">
      <button type="button" className="button outline" disabled={workspace.status!=='ready'} onClick={create}>Новый черновик</button>
      <button type="button" className="button dark" disabled={workspace.status!=='ready'||!text.trim()||!label.trim()} onClick={saveCurrent}>Сохранить локальную ревизию</button>
      <button type="button" className="button outline" onClick={refresh}>Обновить историю</button>
      <button type="button" className="button outline" disabled={!text.trim()} onClick={()=>download('gaber-factory-editor-raw.json',text)}>Скачать текст редактора</button>
    </div>
    {history.length>0&&<div className="advanced-field">
      <label htmlFor="gaber-factory-history">Сохранённая ревизия</label>
      <select id="gaber-factory-history" value={selectedId} onChange={event=>setSelected(event.target.value)}>
        {history.map(record=><option key={record.id} value={record.id}>{record.label} · {new Date(record.savedAt).toLocaleString('ru-RU')}</option>)}
      </select>
      <div className="technical-actions">
        <button type="button" className="button outline" onClick={restore}>Восстановить выбранную</button>
        <button type="button" className="button outline" onClick={()=>{
          try{download('gaber-factory-revision.json',exportFactoryRevision(getFactoryRevision(workspace,selectedId,config)));}
          catch(error){notifyError(error);}
        }}>Экспорт ревизии JSON</button>
      </div>
    </div>}
    <div className="technical-actions">
      <input ref={input} type="file" accept=".json,application/json" hidden aria-label="Импорт расчёта JSON" onChange={readImport}/>
      <button type="button" className="button outline" onClick={()=>input.current?.click()}>Импортировать JSON</button>
      <button type="button" className="button outline" disabled={workspace.status==='unavailable'} onClick={()=>{
        try{download('gaber-factory-workspace-raw.json',exportFactoryWorkspaceRaw(workspace));}
        catch(error){notifyError(error);}
      }}>Скачать исходную копию журнала</button>
    </div>
    {preview&&<div className="formula-details" role="region" aria-label="Предпросмотр импорта расчёта">
      <h4>Предпросмотр: {preview.fileName}</h4>
      <p>Внесённые прямые затраты: {money(preview.report.totals.partialDirectRUB)}.
        Это частичный или предварительный расчёт, не утверждённая себестоимость.</p>
      <p>Без исходных норм: материалов {preview.report.coverage.missingMaterialRefs.length},
        операций {preview.report.coverage.missingOperations.length}.
        Требуют проверки единиц: {preview.report.coverage.unitReviewRefs?.length??0}.</p>
      <p>Предыдущий несохранённый текст будет помещён в историю. Из импортируемого файла принимаются только исходные данные; итоги рассчитываются заново.</p>
      <div className="technical-actions">
        <button type="button" className="button dark" disabled={workspace.status!=='ready'} onClick={applyImport}>Применить импорт</button>
        <button type="button" className="button outline" onClick={()=>{generation.current++;setPreview(null);}}>Отменить</button>
      </div>
    </div>}
    <p className="page-disclaimer">Локальная история не заменяет серверные ревизии, резервное копирование фабрики или подпись технолога. Производственный допуск закрыт.</p>
  </section>;
}
