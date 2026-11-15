import {appendOrderCommand,replayOrder} from './orderWorkflow.js';
export const ORDER_STORAGE_KEY='gaber.order-workflow.v1';
const SCHEMA='gaber-local-order-journal/1',MAX_BYTES=4*1024*1024;
const observed=new WeakMap();
const fail=code=>{throw Error(code);};
const bytes=s=>new TextEncoder().encode(s).length;
function decode(raw){
 if(raw===null)return [];
 if(typeof raw!=='string'||bytes(raw)>MAX_BYTES)fail('ORDER_STORAGE_TOO_LARGE');
 const data=JSON.parse(raw);
 if(data?.schemaVersion!==SCHEMA||!Array.isArray(data.orders)||data.orders.length>100||
  Object.keys(data).some(k=>!['schemaVersion','orders'].includes(k)))fail('ORDER_STORAGE_CORRUPT');
 const ids=new Set();
 return data.orders.map(row=>{
  if(!row||Object.keys(row).some(k=>!['id','events'].includes(k))||ids.has(row.id))fail('ORDER_STORAGE_CORRUPT');
  const state=replayOrder(row.events);
  if(state.projectId!==row.id)fail('ORDER_STORAGE_CORRUPT');
  ids.add(row.id);return {id:row.id,events:structuredClone(row.events),state};
 });
}
export function readOrderWorkspace(storage){
 let raw=null,orders=[],status='ready',error=null;
 try{raw=storage.getItem(ORDER_STORAGE_KEY);orders=decode(raw);}
 catch{status='blocked';error='Журнал заказов недоступен или повреждён. Запись заблокирована; исходные данные сохранены.';}
 const result={status,error,orders:structuredClone(orders)};
 observed.set(result,{storage,raw,status,orders});return result;
}
export function saveOrderCommand(storage,workspace,orderId,command){
 const baseline=observed.get(workspace);
 if(!baseline||baseline.storage!==storage||baseline.status!=='ready')fail('ORDER_STORAGE_BLOCKED');
 if(storage.getItem(ORDER_STORAGE_KEY)!==baseline.raw)fail('STALE_WORKSPACE');
 const entries=structuredClone(baseline.orders),index=entries.findIndex(row=>row.id===orderId);
 if(index<0&&entries.length>=100)fail('ORDER_LIMIT');
 const result=appendOrderCommand(index<0?[]:entries[index].events,command);
 if(result.state.projectId!==orderId)fail('ORDER_ID_MISMATCH');
 if(result.duplicate)return readOrderWorkspace(storage);
 const row={id:orderId,events:result.events,state:result.state};
 if(index<0)entries.push(row);else entries[index]=row;
 const raw=JSON.stringify({schemaVersion:SCHEMA,orders:entries.map(({id,events})=>({id,events}))});
 if(bytes(raw)>MAX_BYTES)fail('ORDER_STORAGE_TOO_LARGE');
 if(storage.getItem(ORDER_STORAGE_KEY)!==baseline.raw)fail('STALE_WORKSPACE');
 storage.setItem(ORDER_STORAGE_KEY,raw);
 if(storage.getItem(ORDER_STORAGE_KEY)!==raw)fail('ORDER_STORAGE_VERIFY_FAILED');
 const saved=readOrderWorkspace(storage);
 if(saved.status!=='ready')fail('ORDER_STORAGE_VERIFY_FAILED');
 return saved;
}
/** Exact raw backup also works for corrupt JSON; contains no authoritative approvals. */
export function exportOrderWorkspace(storage){
 return JSON.stringify({schemaVersion:'gaber-local-order-backup/1',authority:'LOCAL_WORKFLOW_SIMULATION',raw:storage.getItem(ORDER_STORAGE_KEY)},null,2);
}
