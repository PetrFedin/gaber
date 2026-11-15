import {normalize,estimate,CATALOG_VERSION} from './domain.js';
const KEY='gaber.projects.v1',LIMIT=100;
const snapshots=new WeakMap(),recoveryPlans=new WeakMap();
const BACKUP_SCHEMA='gaber-projects-backup/1',BACKUP_POINTER=KEY+'.last-recovery';
export const IMPORT_MAX_BYTES=10*1024*1024;
const statuses=['draft','requested','approved','changes'];
const validDate=v=>typeof v==='string'&&Number.isFinite(Date.parse(v));
const text=(v,fallback)=>typeof v==='string'&&v.trim()?v:fallback;
const amount=v=>Number.isFinite(v)&&v>=0;
function validEstimate(e){
 return !!e&&amount(e.cost)&&amount(e.price)&&Array.isArray(e.rows)&&e.rows.length>0
  &&e.rows.every(r=>r&&typeof r.id==='string'&&typeof r.name==='string'&&typeof r.unit==='string'&&[r.qty,r.rate,r.cost].every(amount))
  &&e.rows.reduce((sum,r)=>sum+r.cost,0)===e.cost;
}
function projectRecord(p){
 if(!p||typeof p!=='object'||typeof p.id!=='string'||!p.id.trim()||!statuses.includes(p.status))return null;
 const config=normalize(p.config);if(!config)return null;
 const createdAt=validDate(p.createdAt)?p.createdAt:'1970-01-01T00:00:00.000Z';
 const result={id:p.id,name:text(p.name,'Восстановленный проект'),config,status:p.status,createdAt,
  catalogVersion:text(p.catalogVersion,CATALOG_VERSION),
  estimate:validEstimate(p.estimate)?p.estimate:estimate(config),
  estimateRecovered:p.estimateRecovered===true||!validEstimate(p.estimate),
  image:typeof p.image==='string'&&/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(p.image)?p.image:null,
  events:Array.isArray(p.events)?p.events.filter(e=>e&&validDate(e.date)&&typeof e.label==='string').map(e=>({date:e.date,label:e.label})):[]};
 const q=p.quote;
 if(q&&amount(q.price)&&Number.isFinite(q.margin)&&Number.isFinite(q.discount)&&q.discount>=0&&q.discount<=30&&validDate(q.createdAt))
  result.quote={price:q.price,margin:q.margin,discount:q.discount,createdAt:q.createdAt};
 return result;
}
function decode(raw){
 if(raw===null)return {projects:[],rejected:0};
 const data=JSON.parse(raw);if(!Array.isArray(data))throw Error('Некорректный формат списка проектов');
 const seen=new Set(),projects=[];let rejected=0;
 for(const p of data){const record=projectRecord(p);if(!record||seen.has(record.id)){rejected++;continue;}seen.add(record.id);projects.push(record);}
 return {projects,rejected};
}
export function newId(){const bytes=crypto.getRandomValues(new Uint8Array(16));return [...bytes].map(x=>x.toString(16).padStart(2,'0')).join('');}
export function readProjects(){
 let raw=null,readable=false;
 try{raw=localStorage.getItem(KEY);readable=true;const state=decode(raw);snapshots.set(state.projects,{raw,rejected:state.rejected});return state.projects;}
 catch{const projects=[];snapshots.set(projects,{raw,error:true,unreadable:!readable});return projects;}
}
export function projectStorageWarning(projects){
 const state=snapshots.get(projects);
 if(state?.error)return 'Не удалось прочитать сохранённые проекты. Исходные данные не перезаписаны; сохранение заблокировано.';
 if(state?.rejected)return 'Часть записей повреждена или содержит повторяющиеся ID. Показаны исправные проекты; сохранение заблокировано, чтобы сохранить исходные данные.';
 if(projects.some(p=>p.estimateRecovered))return 'Для части проектов демонстрационная калькуляция восстановлена по текущим базовым ставкам. Это не исходный расчёт.';
 return '';
}
export function writeProjects(projects,expected){
 const baseline=snapshots.get(expected);
 if(!baseline||baseline.error||baseline.rejected)throw Error('Сохранение заблокировано: сначала восстановите исходные данные проектов.');
 if(localStorage.getItem(KEY)!==baseline.raw)throw Error('Проекты изменились в другой вкладке. Обновите страницу перед сохранением; текущий вариант можно экспортировать.');
 if(!Array.isArray(projects)||(projects.length>LIMIT&&(projects.length>expected.length||projects.some(p=>!expected.some(old=>old.id===p?.id)))))throw Error('Достигнут лимит 100 проектов. Экспортируйте и удалите ненужные варианты.');
 const encoded=JSON.stringify(projects),state=decode(encoded);
 if(state.rejected)throw Error('Нельзя сохранить повреждённые записи или повторяющиеся ID.');
 // Serialize the validated snapshot, without mutating caller-owned records.
 const raw=JSON.stringify(state.projects);
 localStorage.setItem(KEY,raw);
 snapshots.set(state.projects,{raw,rejected:0});return state.projects;
}
// A backup contains the exact stored string, including malformed JSON and duplicate records.
function backupEnvelope(raw){return JSON.stringify({schemaVersion:BACKUP_SCHEMA,mode:'demonstration',exportedAt:new Date().toISOString(),raw},null,2);}
export function exportProjectBackup(){return backupEnvelope(localStorage.getItem(KEY));}
export function lastRecoveryBackup(){
 const key=localStorage.getItem(BACKUP_POINTER);
 if(!key||!key.startsWith(KEY+'.recovery.'))return null;
 return localStorage.getItem(key);
}
function observed(projects){
 const state=snapshots.get(projects);
 if(!state||state.unreadable)throw Error('Хранилище недоступно. Восстановление не выполнено.');
 if(localStorage.getItem(KEY)!==state.raw)throw Error('Проекты изменились в другой вкладке. Обновите страницу и повторите проверку.');
 return state;
}
function planFor(projects,next,summary){
 const state=observed(projects);
 const plan={...summary,total:next.length};
 recoveryPlans.set(plan,{expected:projects,raw:state.raw,encoded:JSON.stringify(next)});
 return plan;
}
export function prepareProjectRecovery(projects){
 const state=observed(projects);
 if(!state.error&&!state.rejected)throw Error('Повреждённых записей не обнаружено.');
 return planFor(projects,projects,{kind:'repair',retained:projects.length,added:0,rejected:state.error?null:state.rejected});
}
export function prepareProjectImport(input,projects){
 const baseline=observed(projects);
 if(baseline.error||baseline.rejected)throw Error('Сначала восстановите текущий список проектов.');
 if(typeof input!=='string'||new TextEncoder().encode(input).length>IMPORT_MAX_BYTES)throw Error('Файл импорта должен быть JSON размером не более 10 МБ.');
 let data;try{data=JSON.parse(input);}catch{throw Error('Файл не содержит корректный JSON.');}
 if(!Array.isArray(data)){
  if(data?.schemaVersion!==BACKUP_SCHEMA||!(data.raw===null||typeof data.raw==='string'))throw Error('Неизвестный формат резервной копии.');
  try{data=JSON.parse(data.raw??'[]');}catch{throw Error('В копии сохранён повреждённый исходный JSON. Автоматический импорт невозможен.');}
 }
 if(!Array.isArray(data))throw Error('В резервной копии должен быть список проектов.');
 const incoming=decode(JSON.stringify(data));
 if(incoming.rejected)throw Error('В файле есть повреждённые записи или повторяющиеся ID. Импорт отменён.');
 if(!incoming.projects.length)throw Error('Файл не содержит проектов для добавления.');
 const existing=new Set(projects.map(p=>p.id));
 if(incoming.projects.some(p=>existing.has(p.id)))throw Error('ID проекта уже существует. Импорт не заменяет сохранённые варианты.');
 if(incoming.projects.length+projects.length>LIMIT)throw Error('После импорта будет больше 100 проектов. Импорт отменён.');
 return planFor(projects,[...incoming.projects,...projects],{kind:'import',retained:projects.length,added:incoming.projects.length,rejected:0});
}
export function applyProjectRecovery(plan,projects){
 const saved=recoveryPlans.get(plan);
 if(!saved||saved.expected!==projects)throw Error('Предварительная проверка устарела. Проверьте данные заново.');
 const state=observed(projects);
 if(state.raw!==saved.raw)throw Error('Предварительная проверка устарела.');
 // Keep immutable proposal data out of the editable UI plan object.
 const next=decode(saved.encoded);
 if(next.rejected)throw Error('Проверенный список повреждён.');
 const raw=JSON.stringify(next.projects),key=KEY+'.recovery.'+newId();
 const backup=backupEnvelope(state.raw);
 // If quota/access/backup verification fails, never attempt the destructive write.
 localStorage.setItem(key,backup);
 if(localStorage.getItem(key)!==backup)throw Error('Резервная копия не сохранена. Исходные данные не изменены.');
 localStorage.setItem(BACKUP_POINTER,key);
 if(localStorage.getItem(BACKUP_POINTER)!==key)throw Error('Не удалось зарегистрировать резервную копию. Исходные данные не изменены.');
 // Recheck after backup operations as storage adapters can change the observed value.
 observed(projects);
 localStorage.setItem(KEY,raw);
 snapshots.set(next.projects,{raw,rejected:0});
 recoveryPlans.delete(plan);return next.projects;
}
export function publicLink(config){const data=btoa(unescape(encodeURIComponent(JSON.stringify(config))));return `${location.origin}${location.pathname}#studio?c=${encodeURIComponent(data)}`;}
export function configFromHash(){try{const raw=location.hash.split('?')[1];const v=new URLSearchParams(raw).get('c');return v&&v.length<4000?normalize(JSON.parse(decodeURIComponent(escape(atob(v))))):null;}catch{return null;}}
