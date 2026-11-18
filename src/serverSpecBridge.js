import {validate,normalize} from './domain.js';

const ALLOWED_EDIT_KEYS=new Set([
  'width','depth','height','moduleCount','fabric','color','comfort','mechanism','storage'
]);
const NUMERIC_KEYS=new Set(['width','depth','height','moduleCount']);
const BOOLEAN_KEYS=new Set(['storage']);
const fail=(code)=>{throw new RangeError(code);};

/**
 * Bridge between the operator's editable concept geometry and the
 * authoritative existing prepare_spec reducer. No money or approval fields.
 * Reject, rather than clamp/normalize, invalid exact dimensions.
 */
export function buildServerSpecConfig(sourceConfig,patch={}){
 if(!sourceConfig||typeof sourceConfig!=='object'||Array.isArray(sourceConfig)||
    !patch||typeof patch!=='object'||Array.isArray(patch))fail('SERVER_SPEC_CONFIG_INVALID');
 if(Object.keys(patch).some(k=>!ALLOWED_EDIT_KEYS.has(k)))fail('SERVER_SPEC_FIELD_FORBIDDEN');
 for(const [key,value] of Object.entries(patch)){
  if(NUMERIC_KEYS.has(key)&&(!Number.isFinite(value)||!Number.isInteger(value)))fail('SERVER_SPEC_CONFIG_INVALID');
  if(BOOLEAN_KEYS.has(key)&&typeof value!=='boolean')fail('SERVER_SPEC_CONFIG_INVALID');
  if(!NUMERIC_KEYS.has(key)&&!BOOLEAN_KEYS.has(key)&&typeof value!=='string')
   fail('SERVER_SPEC_CONFIG_INVALID');
 }
 const result={...structuredClone(sourceConfig),...structuredClone(patch)};
 const normalized=normalize(result);
 if(!normalized||validate(result).length)fail('SERVER_SPEC_CONFIG_INVALID');
 // The reducer will revalidate the full commercial offer and enforce
 // factory confirmation on the exact selected configuration.
 return structuredClone(result);
}

export function getServerDemoCatalog(templates){
 if(!Array.isArray(templates)||templates.length!==5)fail('SERVER_PRESET_CATALOG_INVALID');
 const seen=new Set();
 return templates.map(item=>{
  if(!item||typeof item.id!=='string'||seen.has(item.id)||
     typeof item.name!=='string'||!item.name.trim()||
     !item.config||validate(item.config).length)fail('SERVER_PRESET_CATALOG_INVALID');
  seen.add(item.id);
  return {id:item.id,name:item.name,config:buildServerSpecConfig(item.config)};
 });
}

/** Retriable HTTP create body. Caller preserves requestId on uncertain failures. */
export function serverCreateCommand({orderId,requestId,name,config}){
 if(typeof orderId!=='string'||!/^ORD-[a-f0-9]{24}$/.test(orderId)||
    typeof requestId!=='string'||!/^REQ-[a-f0-9]{24}$/.test(requestId)||
    typeof name!=='string'||!name.trim()||name.length>120)
  fail('SERVER_CREATE_DRAFT_INVALID');
 return {orderId,requestId,type:'create',expectedVersion:0,
  payload:{projectId:orderId,name:name.trim(),config:buildServerSpecConfig(config)}};
}
