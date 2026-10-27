import {createHash} from 'node:crypto';
import {authorizeGaberAction} from './accessPolicy.js';
import {projectOrderReadModel} from './orderReadModel.js';
export const ORDER_JOURNAL_SCHEMA='gaber-server-order-journal/0.4.18';
const id=v=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(v);
const deny=(code,more={})=>({accepted:false,code,...more,productionRelease:{allowed:false}});
const sha=s=>createHash('sha256').update(s).digest('hex');
const canonical=(value,depth=0)=>{
 if(depth>20)throw Error('REQUEST_TOO_DEEP');
 if(value===null||typeof value==='boolean'||typeof value==='string')return value;
 if(typeof value==='number'&&Number.isFinite(value))return value;
 if(Array.isArray(value))return value.map(v=>canonical(v,depth+1));
 if(!value||typeof value!=='object'||Object.getPrototypeOf(value)!==Object.prototype)throw Error('NON_JSON_VALUE');
 const keys=Object.keys(value).sort();
 if(keys.some(k=>['__proto__','constructor','prototype'].includes(k)))throw Error('UNSAFE_KEY');
 return Object.fromEntries(keys.map(k=>[k,canonical(value[k],depth+1)]));
};
function serialize(x){const s=JSON.stringify(canonical(x));if(Buffer.byteLength(s)>131072)throw Error('REQUEST_TOO_LARGE');return s;}
const forbidden=new Set(['start','complete','quality_pass','ship','deliver','accept_delivery']);
const hashEvent=(r,scope)=>sha(serialize({schema:ORDER_JOURNAL_SCHEMA,...scope,seq:r.seq,actorId:r.actorId,
 requestId:r.requestId,requestHash:r.requestHash,previousHash:r.previousHash,command:r.command}));
function verify(head,rows,scope,replay){
 if(!head||!Number.isSafeInteger(head.version)||!Array.isArray(rows)||rows.length!==head.version||
   head.version>500)throw Error('JOURNAL_INTEGRITY_FAILURE');
 let prev=null;
 for(let i=0;i<rows.length;i++){
  const r=rows[i];
  if(r.seq!==i+1||r.previousHash!==prev||r.command?.id!==r.requestId||
     r.command?.expectedVersion!==i||r.eventHash!==hashEvent(r,scope))throw Error('JOURNAL_INTEGRITY_FAILURE');
  prev=r.eventHash;
 }
 if(prev!==head.headHash)throw Error('JOURNAL_INTEGRITY_FAILURE');
 const events=rows.map(r=>r.command);
 const state=events.length?replay(events):null;
 if(state&&(state.version!==head.version||state.projectId!==scope.orderId))throw Error('JOURNAL_INTEGRITY_FAILURE');
 return {events,state};
}
export function createOrderJournalService({repository,admission,reducer,clock=Date.now}){
 if(typeof repository?.withOrderTransaction!=='function'||typeof admission!=='function'||
   typeof reducer?.replayOrder!=='function'||typeof reducer?.appendOrderCommand!=='function')
  throw TypeError('INVALID_JOURNAL_DEPENDENCIES');
 return {async read({principal,request}){
  if(!principal||principal.identitySource!=='server-session'||principal.authenticated!==true||
    !id(principal.tenantId)||!id(principal.subject))return deny('NO_VERIFIED_SESSION');
  if(!request||typeof request!=='object'||Array.isArray(request)||
    Object.keys(request).some(k=>k!=='orderId')||!id(request.orderId))return deny('INVALID_ORDER_REQUEST');
  // Snapshot server inputs before awaiting a connection/lock; callers cannot swap scope mid-read.
  let actor;try{actor=JSON.parse(serialize(principal));}catch{return deny('INVALID_JSON_REQUEST');}
  const scope={tenantId:actor.tenantId,orderId:request.orderId},now=clock();
  return repository.withOrderTransaction(scope,async tx=>{
   const resource=await tx.getResourceForUpdate();
   if(!resource||resource.orderId!==scope.orderId)return deny('RESOURCE_NOT_AUTHORIZED');
   const access=authorizeGaberAction({principal:actor,resource,action:'orders.read',nowMs:now});
   if(!access.allowed)return deny(access.reason);
   const head=await tx.getHeadForUpdate();
   if(!head)return deny('ORDER_MISSING');
   const {state}=verify(head,await tx.getEvents(),scope,reducer.replayOrder);
   if(!state)return deny('ORDER_MISSING');
   return {accepted:true,code:'ORDER_READ',order:projectOrderReadModel(state,access.role),
    productionRelease:{allowed:false}};
  });
 },async execute({principal,request}){
  if(!principal||principal.identitySource!=='server-session'||principal.authenticated!==true||
    !id(principal.tenantId)||!id(principal.subject))return deny('NO_VERIFIED_SESSION');
  if(!request||typeof request!=='object'||Array.isArray(request)||Object.keys(request).some(k=>
    !['orderId','requestId','expectedVersion','type','payload','revisionId'].includes(k))||
    !id(request.orderId)||!id(request.requestId)||!Number.isSafeInteger(request.expectedVersion)||
    request.expectedVersion<0||request.expectedVersion>=500||typeof request.type!=='string'||
    !request.payload||typeof request.payload!=='object'||Array.isArray(request.payload)||
    (request.revisionId!==undefined&&!id(request.revisionId)))return deny('INVALID_ORDER_REQUEST');
  let actor,input;
  try{
   actor=JSON.parse(JSON.stringify(principal));
   input=JSON.parse(serialize(request));
  }catch{return deny('INVALID_JSON_REQUEST');}
  const {orderId,requestId,type,payload,revisionId,expectedVersion}=input;
  if(type==='create'&&payload.projectId!==orderId)return deny('ORDER_PROJECT_MISMATCH');
  if(forbidden.has(type))return deny('EXTERNAL_AUTHORITY_REQUIRED');
  const now=clock();if(!Number.isSafeInteger(now)||!Number.isFinite(new Date(now).getTime())||now<=0)
   return deny('INVALID_SERVER_CLOCK');
  const scope={tenantId:actor.tenantId,orderId};
  return repository.withOrderTransaction(scope,async tx=>{
   const resource=await tx.getResourceForUpdate();
   if(!resource||resource.source!=='server-repository'||resource.tenantId!==scope.tenantId||
     resource.orderId!==orderId)return deny('RESOURCE_NOT_AUTHORIZED');
   const possible=['client','factory'].map(role=>admission({principal:actor,resource,command:{type,role},nowMs:now}));
   const accepted=possible.filter(x=>x?.allowed);
   if(accepted.length!==1)return deny(accepted.length?'AMBIGUOUS_ROLE':possible[0]?.code??'ROLE_FORBIDDEN');
   const role=accepted[0].reducerRole;
   let head=await tx.getHeadForUpdate();
   if(!head&&type!=='create')return deny('ORDER_MISSING');
   if(!head){if(expectedVersion!==0)return deny('INVALID_INITIAL_VERSION');await tx.ensureHead();head=await tx.getHeadForUpdate();}
   const rows=await tx.getEvents(),{events,state}=verify(head,rows,scope,reducer.replayOrder);
   const requestHash=sha(serialize({scope,requestId,expectedVersion,type,payload,
     revisionId:revisionId??null,actorId:actor.subject,role}));
   const prior=rows.find(x=>x.requestId===requestId);
   if(prior){
    if(prior.actorId!==actor.subject||prior.requestHash!==requestHash)return deny('IDEMPOTENCY_CONFLICT');
    return {accepted:true,code:'ALREADY_COMMITTED',version:head.version,eventSeq:prior.seq,
      stage:state?.stage??null,productionRelease:{allowed:false}};
   }
   if(expectedVersion!==head.version)return deny('STALE_ORDER_VERSION',{currentVersion:head.version});
   if(state&&now<Date.parse(state.updatedAt))return deny('SERVER_CLOCK_BEHIND_ORDER');
   const command={id:requestId,at:new Date(now).toISOString(),type,role,payload,expectedVersion};
   if(revisionId!==undefined)command.revisionId=revisionId;
   let result;
   try{result=reducer.appendOrderCommand(events,command);}
   catch(e){return deny('ORDER_TRANSITION_REJECTED',{reason:/^[A-Z0-9_]+$/.test(e.message)?e.message:'INVALID_STATE'});}
   if(result.duplicate||result.state?.version!==head.version+1)throw Error('JOURNAL_REDUCER_MISMATCH');
   const row={seq:head.version+1,actorId:actor.subject,requestId,requestHash,previousHash:head.headHash,command};
   row.eventHash=hashEvent(row,scope);
   await tx.appendEvent(row);
   if(await tx.advanceHead({expectedVersion:head.version,nextVersion:row.seq,headHash:row.eventHash})!==true)
    throw Error('ORDER_CAS_FAILURE');
   return {accepted:true,code:'ORDER_EVENT_COMMITTED',version:row.seq,eventSeq:row.seq,
     stage:result.state.stage,productionRelease:{allowed:false}};
  });
 }};
}
