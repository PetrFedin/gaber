import React,{useMemo,useState} from 'react';
import {evaluateFactoryCostDraft} from './factoryCosting.js';

/**
 * Editable user-entered draft, not an ERP connection or approved bill of materials.
 * IDs are selected from the actual production traceability engine, never typed blindly.
 */
const UNITS=['pcs','m','m2','m3','kg'];
const sections=[
 {id:'quotes',label:'Цены материалов',add:'Добавить предложение'},
 {id:'consumption',label:'Расход компонентов',add:'Добавить норму расхода'},
 {id:'workCenters',label:'Ставки участков',add:'Добавить участок'},
 {id:'operations',label:'Операции',add:'Добавить операцию'}
];
const numberFields=new Set(['unitPriceRUB','rateRUBPerHour','measuredQty','wastePct','minutes']);
const fields={
 quotes:[
  ['priceId','ID цены'],['supplierRef','Поставщик'],['sku','Артикул'],['unit','Ед. цены','unit'],
  ['unitPriceRUB','Цена, ₽','number'],['documentRef','Документ-источник'],
  ['revision','Редакция'],['validFrom','Действует с','date'],['validTo','Действует по','date']
 ],
 consumption:[
  ['entityId','Производственная деталь','entity'],
  ['priceId','Предложение поставщика','quote'],
  ['measuredQty','Измеренный расход','number'],['measuredUnit','Единица расхода','unit'],
  ['wastePct','Отходы, %','number'],['measurementRef','Источник замера']
 ],
 workCenters:[
  ['rateId','ID ставки'],['workCenterId','Рабочий участок'],
  ['rateRUBPerHour','Стоимость часа, ₽','number'],
  ['documentRef','Документ-источник'],['revision','Редакция'],
  ['validFrom','Действует с','date'],['validTo','Действует по','date']
 ],
 operations:[
  ['operationKey','Производственная операция','operation'],
  ['rateId','Ставка участка','rate'],['minutes','Нормо-минуты','number'],
  ['measurementRef','Источник измеренного времени']
 ]
};
function nextId(rows,key,prefix){
 let n=1;while(rows.some(row=>row[key]===prefix+n))n++;return prefix+n;
}
const splitOperation=key=>{const pos=key.lastIndexOf('|');return [key.slice(0,pos),key.slice(pos+1)];};

export default function FactoryCostEditor({config,text,onChange}){
 const [active,setActive]=useState('quotes');
 const [limit,setLimit]=useState(6);
 const parsed=useMemo(()=>{
  if(!text.trim())return null;
  try{
   const draft=JSON.parse(text);
   if(draft?.schemaVersion!=='gaber-factory-cost-draft/0.4.7'||
      !['quotes','consumption','workCenters','operations'].every(k=>Array.isArray(draft[k])))return null;
   return draft;
  }catch{return null;}
 },[text]);
 const evaluation=useMemo(()=>{
  if(!parsed)return null;
  try{return evaluateFactoryCostDraft(config,parsed);}
  catch{return null;}
 },[config,parsed]);
 const persist=next=>onChange(JSON.stringify(next,null,2));
 const update=(section,index,key,raw)=>{
  if(!parsed)return;
  const copy=structuredClone(parsed),row=copy[section][index];
  if(!row)return;
  if(key==='operationKey'){
   const [routeId,operationCode]=splitOperation(raw);
   row.routeId=routeId;row.operationCode=operationCode;
  }else if(numberFields.has(key)){
   row[key]=raw===''?null:Number(raw);
  }else{row[key]=raw;}
  // Never silently change a user's entered quantities/rates when a quote is changed.
  persist(copy);
 };
 const remove=(section,index)=>{
  if(!parsed)return;
  const copy=structuredClone(parsed);copy[section].splice(index,1);persist(copy);
 };
 const add=section=>{
  if(!parsed||!evaluation)return;
  const copy=structuredClone(parsed);
  const req=evaluation.coverage;
  if(section==='quotes')copy.quotes.push({
   priceId:nextId(copy.quotes,'priceId','P'),supplierRef:'',sku:'',documentRef:'',
   revision:'',currency:'RUB',unit:'pcs',unitPriceRUB:null,validFrom:'',validTo:''
  });
  if(section==='workCenters')copy.workCenters.push({
   rateId:nextId(copy.workCenters,'rateId','W'),workCenterId:'',
   documentRef:'',revision:'',rateRUBPerHour:null,validFrom:'',validTo:''
  });
  if(section==='consumption'){
   const used=new Set(copy.consumption.map(x=>x.entityId));
   const id=req.requiredMaterialRefs.find(x=>!used.has(x));
   if(!id)return;
   copy.consumption.push({entityId:id,priceId:'',measuredQty:null,measuredUnit:'',
    wastePct:0,measurementRef:''});
  }
  if(section==='operations'){
   const used=new Set(copy.operations.map(x=>x.routeId+'|'+x.operationCode));
   const id=req.requiredOperations.find(x=>!used.has(x));
   if(!id)return;
   const [routeId,operationCode]=splitOperation(id);
   copy.operations.push({routeId,operationCode,rateId:'',minutes:null,measurementRef:''});
  }
  persist(copy);
 };
 if(!parsed)return <section className="gaber-ledger" aria-label="Редактор заводских данных">
  <div className="gaber-ledger-intro"><div><h3>Заводские исходные данные</h3>
   <p>Создайте черновик в разделе истории, чтобы получить таблицы для цен, расхода и операций.
   Некорректный JSON исправляется в расширенном режиме без автоматической замены данных.</p></div></div>
 </section>;
 const requirements=evaluation?.coverage;
 const available={
  entity:(requirements?.requiredMaterialRefs||[]).map(value=>({value,label:value})),
  operation:(requirements?.requiredOperations||[]).map(value=>({value,label:value})),
  quote:parsed.quotes.map(x=>({value:x.priceId,label:x.priceId+' · '+(x.sku||'без артикула')})),
  rate:parsed.workCenters.map(x=>({value:x.rateId,label:x.rateId+' · '+(x.workCenterId||'участок не указан')})),
  unit:UNITS.map(value=>({value,label:value}))
 };
 const noMore=active==='consumption'&&requirements&&
   requirements.requiredMaterialRefs.every(id=>parsed.consumption.some(row=>row.entityId===id))||
   active==='operations'&&requirements&&
   requirements.requiredOperations.every(id=>parsed.operations.some(row=>row.routeId+'|'+row.operationCode===id));
 const rows=parsed[active]||[];
 const heading=sections.find(s=>s.id===active);
 return <section className="gaber-ledger" aria-label="Форма заводских исходных данных">
  <div className="gaber-ledger-intro"><div>
   <span className="eyebrow">РАБОЧИЕ ИСХОДНЫЕ ДАННЫЕ</span>
   <h3>Материалы, расход и нормо-время</h3>
   <p>Меняйте только исходные значения. Каждая правка пересчитывает затраты и проверяет связи с деталями.
    Полнота ввода не означает подтверждения данных фабрикой.</p>
  </div><span className="gaber-ledger-revision">{parsed.revisionId||'Без ревизии'}</span></div>
  <div className="gaber-ledger-tabs" role="group" aria-label="Разделы реестра">
   {sections.map(s=><button key={s.id} type="button"
    className={active===s.id?'is-active':''} aria-pressed={active===s.id}
    onClick={()=>{setActive(s.id);setLimit(6);}}>
    <span>{s.label}</span><small>{parsed[s.id].length}</small></button>)}
  </div>
  <div className="gaber-ledger-toolbar">
   <div><h4>{heading.label}</h4>
    <small>Записей: {rows.length} · источник и единицы должны быть подтверждены документально</small></div>
   <button type="button" className="button outline" disabled={!evaluation||noMore}
    onClick={()=>{add(active);setLimit(Math.max(limit,rows.length+1));}}>
    {heading.add}</button>
  </div>
  {!rows.length?<p className="gaber-ledger-empty">Записей пока нет. Добавьте позицию и заполните обязательные поля.</p>:
   <div className="gaber-ledger-rows">
    {rows.slice(0,limit).map((row,index)=><div className="gaber-ledger-item" key={index}>
     <div className="gaber-ledger-item-head">
      <span>{String(index+1).padStart(2,'0')} / {active==='operations'
       ?row.operationCode||'Новая операция':active==='consumption'
       ?row.entityId||'Новый материал':row.sku||row.workCenterId||'Новая запись'}</span>
      <button type="button" className="text-button" aria-label={'Удалить запись '+(index+1)}
       onClick={()=>remove(active,index)}>Удалить</button>
     </div>
     <div className="gaber-ledger-fields">
      {fields[active].map(([key,label,type])=>{
       const value=key==='operationKey'?row.routeId+'|'+row.operationCode:row[key]??'';
       const options=available[type];
       return <label key={key} className="gaber-ledger-field">
        <span>{label}</span>
        {options?<select value={value} onChange={event=>update(active,index,key,event.target.value)}>
         <option value="">Выберите</option>
         {options.map(x=><option key={x.value} value={x.value}>{x.label}</option>)}
        </select>:<input value={value} type={type==='date'?'date':type==='number'?'number':'text'}
         step={type==='number'?'any':undefined} min={type==='number'?0:undefined}
         maxLength={type==='number'?undefined:200}
         onChange={event=>update(active,index,key,event.target.value)}/>}
       </label>;
      })}
     </div>
    </div>)}
    {rows.length>limit&&<button type="button" className="button outline"
     onClick={()=>setLimit(n=>Math.min(rows.length,n+20))}>Показать ещё {Math.min(20,rows.length-limit)} записей</button>}
   </div>}
  <p className="gaber-ledger-foot">ID производственных деталей и операций берутся из модели GABER.
   Калькуляция предварительная; закупка и производство из этого интерфейса не запускаются.</p>
 </section>;
}
