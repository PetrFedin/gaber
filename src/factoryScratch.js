import {factoryConfigKey} from './factoryDraftStorage.js';

export const FACTORY_SCRATCH_SCHEMA='gaber-factory-working-copy/1';
export const FACTORY_SCRATCH_KEY='gaber.factory-working-copy.v1';
const MAX_ENTRIES=12, MAX_TEXT_BYTES=512*1024,MAX_STORE_BYTES=2*1024*1024;
const bytes=s=>new TextEncoder().encode(s).length;
const storageDefault=()=>{try{return globalThis.sessionStorage;}catch{return null;}};
const err=code=>{throw new Error(code);};
const decode=raw=>{
 if(raw===null)return [];
 if(bytes(raw)>MAX_STORE_BYTES)err('SCRATCH_TOO_LARGE');
 let doc;try{doc=JSON.parse(raw);}catch{err('SCRATCH_CORRUPT');}
 if(!doc||doc.schemaVersion!==FACTORY_SCRATCH_SCHEMA||!Array.isArray(doc.entries)||
    doc.entries.length>MAX_ENTRIES)err('SCRATCH_CORRUPT');
 const keys=new Set();
 for(const e of doc.entries){
  if(!e||typeof e.configKey!=='string'||typeof e.text!=='string'||
     bytes(e.text)>MAX_TEXT_BYTES||keys.has(e.configKey))err('SCRATCH_CORRUPT');
  keys.add(e.configKey);
 }
 return doc.entries;
};
/** Temporary, tab-scoped text only. No approved costing fields or authority. */
export function readFactoryScratch(config,storage=storageDefault()){
 if(!storage)return null;
 const key=factoryConfigKey(config);
 const rows=decode(storage.getItem(FACTORY_SCRATCH_KEY));
 return rows.find(row=>row.configKey===key)?.text??null;
}
/** Synchronous write on an edit event so a SPA route change does not lose input. */
export function writeFactoryScratch(config,text,storage=storageDefault()){
 if(!storage)err('SCRATCH_STORAGE_UNAVAILABLE');
 if(typeof text!=='string'||bytes(text)>MAX_TEXT_BYTES)err('SCRATCH_TEXT_TOO_LARGE');
 const key=factoryConfigKey(config);
 const original=storage.getItem(FACTORY_SCRATCH_KEY);
 const rows=decode(original);
 const idx=rows.findIndex(row=>row.configKey===key);
 if(idx<0&&rows.length>=MAX_ENTRIES)err('SCRATCH_LIMIT');
 const next=rows.filter(row=>row.configKey!==key);
 next.push({configKey:key,text});
 const raw=JSON.stringify({schemaVersion:FACTORY_SCRATCH_SCHEMA,entries:next});
 if(bytes(raw)>MAX_STORE_BYTES)err('SCRATCH_TOO_LARGE');
 if(storage.getItem(FACTORY_SCRATCH_KEY)!==original)err('SCRATCH_STALE');
 try{storage.setItem(FACTORY_SCRATCH_KEY,raw);}catch{err('SCRATCH_WRITE_FAILED');}
 if(storage.getItem(FACTORY_SCRATCH_KEY)!==raw)err('SCRATCH_VERIFY_FAILED');
 return true;
}
export function clearFactoryScratch(config,storage=storageDefault()){
 if(!storage)err('SCRATCH_STORAGE_UNAVAILABLE');
 const key=factoryConfigKey(config),original=storage.getItem(FACTORY_SCRATCH_KEY);
 const remaining=decode(original).filter(row=>row.configKey!==key);
 const raw=JSON.stringify({schemaVersion:FACTORY_SCRATCH_SCHEMA,entries:remaining});
 if(storage.getItem(FACTORY_SCRATCH_KEY)!==original)err('SCRATCH_STALE');
 try{storage.setItem(FACTORY_SCRATCH_KEY,raw);}catch{err('SCRATCH_WRITE_FAILED');}
 return true;
}
