import {createHash} from 'node:crypto';
import {authorizeGaberAction} from './accessPolicy.js';
import {projectOrderReadModel} from './orderReadModel.js';
import {DEV_EXECUTION_MODE,SERVER_FULFILLMENT_POLICY} from '../src/orderWorkflow.js';
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
export function verifyOrderJournalSnapshot(head,rows,scope,replay){
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
export function createOrderJournalService({repository,admission,reducer,clock=Date.now,simulatedExternalAuthority=null}){
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
   // Even a formerly assigned factory loses access when its verified
   // organisation is suspended. Do not read the event history before this
   // check; the operator and customer retain their own lawful access.
   if(access.role==='factory'){
    if(typeof tx.isFactoryApproved!=='function')return deny('FACTORY_DIRECTORY_UNAVAILABLE');
    if(await tx.isFactoryApproved({factoryId:resource.factoryId})!==true)
     return deny('RESOURCE_MEMBERSHIP_DENIED');
   }
   const head=await tx.getHeadForUpdate();
   if(!head)return deny('ORDER_MISSING');
   const rows=await tx.getEvents(),{state}=verifyOrderJournalSnapshot(head,rows,scope,reducer.replayOrder);
   if(!state)return deny('ORDER_MISSING');
   const order=projectOrderReadModel(state,access.role);
   // Provenance is kept inside the hash-chained event command. Never
   // upgrade unmarked historical events to genuine production evidence.
   const external=rows.filter(r=>forbidden.has(r.command?.type));
   if(external.length){
    const marked=external.filter(r=>r.command.executionMode===DEV_EXECUTION_MODE).length;
    const provenance=marked===external.length?DEV_EXECUTION_MODE:'UNVERIFIED_LEGACY_EXTERNAL_EVENTS';
    order.authority=provenance;
    order.externalExecution={provenance,eventCount:external.length,markedEventCount:marked};
   }
   return {accepted:true,code:'ORDER_READ',order,productionRelease:{allowed:false}};
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
  if(forbidden.has(type)&&!simulatedExternalAuthority?.commandTypes?.has(type))return deny('EXTERNAL_AUTHORITY_REQUIRED');
  const now=clock();if(!Number.isSafeInteger(now)||!Number.isFinite(new Date(now).getTime())||now<=0)
   return deny('INVALID_SERVER_CLOCK');
  const scope={tenantId:actor.tenantId,orderId};
  return repository.withOrderTransaction(scope,async tx=>{
   let resource=await tx.getResourceForUpdate(),needsResource=false;
   // An authenticated customer may submit a NEW order without a manually
   // preseeded order_resources row. Construct the access scope exclusively
   // from the verified session; never accept a clientId/tenantId in payload.
   // The row is persisted only AFTER the reducer validates the create event.
   if(!resource&&type==='create'){
    resource={source:'server-repository',tenantId:scope.tenantId,orderId,
     clientId:actor.clientId,factoryId:null};
    needsResource=true;
   }
   if(!resource||resource.source!=='server-repository'||resource.tenantId!==scope.tenantId||
     resource.orderId!==orderId)return deny('RESOURCE_NOT_AUTHORIZED');
   // The verifier has already authenticated one server-held actor. Resolve
   // exactly THAT role: trying candidate roles and returning possible[0]
   // hides the real authorization reason for factory/partner principals.
   // It also makes the result depend on the ordering of role constants.
   if(!Array.isArray(actor.roles)||actor.roles.length!==1||
      !['client','factory','partner'].includes(actor.roles[0]))
    return deny('NO_VERIFIED_SESSION');
   const role=actor.roles[0];
   const verdict=admission({principal:actor,resource,command:{type,role,payload},nowMs:now,
     externalGrants:simulatedExternalAuthority?.grants??null});
   if(!verdict?.allowed)return deny(verdict?.code??'ROLE_FORBIDDEN');
   if(verdict.reducerRole!==role)return deny('UNTRUSTED_COMMAND_ROLE');
   if(role==='factory'){
    if(typeof tx.isFactoryApproved!=='function')return deny('FACTORY_DIRECTORY_UNAVAILABLE');
    if(await tx.isFactoryApproved({factoryId:resource.factoryId})!==true)
     return deny('RESOURCE_MEMBERSHIP_DENIED');
   }
   // The partner cannot submit a new production task or publish a quote
   // for an unassigned, unverified or since-suspended factory.
   if(type==='prepare_spec'||type==='offer'){
    if(resource.factoryId==null)return deny('FACTORY_ASSIGNMENT_REQUIRED');
    if(typeof tx.isFactoryApproved!=='function')
     return deny('FACTORY_DIRECTORY_UNAVAILABLE');
    if(await tx.isFactoryApproved({factoryId:resource.factoryId})!==true)
     return deny('FACTORY_NOT_APPROVED');
   }
   let head=await tx.getHeadForUpdate();
   if(!head&&type!=='create')return deny('ORDER_MISSING');
   const firstWrite=!head;
   if(!head){if(expectedVersion!==0)return deny('INVALID_INITIAL_VERSION');head={version:0,headHash:null};}
   const rows=await tx.getEvents(),{events,state}=verifyOrderJournalSnapshot(head,rows,scope,reducer.replayOrder);
   const requestHash=sha(serialize({scope,requestId,expectedVersion,type,payload,
     revisionId:revisionId??null,actorId:actor.subject,role}));
   const prior=rows.find(x=>x.requestId===requestId);
   if(prior){
    if(prior.actorId!==actor.subject||prior.requestHash!==requestHash)return deny('IDEMPOTENCY_CONFLICT');
    return {accepted:true,code:'ALREADY_COMMITTED',version:head.version,eventSeq:prior.seq,
      stage:state?.stage??null,productionRelease:{allowed:false}};
   }
   if(expectedVersion!==head.version)return deny('STALE_ORDER_VERSION',{currentVersion:head.version});
   if(type==='assign_factory'&&resource.factoryId!=null)return deny('FACTORY_ALREADY_ASSIGNED');
   if(state&&now<Date.parse(state.updatedAt))return deny('SERVER_CLOCK_BEHIND_ORDER');
   const command={id:requestId,at:new Date(now).toISOString(),type,role,payload,expectedVersion};
   if(revisionId!==undefined)command.revisionId=revisionId;
   // Only the trusted server can stamp the mandatory fulfillment protocol.
   // The HTTP body does not accept this field; historical events stay unchanged.
   if(type==='create')command.fulfillmentPolicy=SERVER_FULFILLMENT_POLICY;
   // Only a trusted DEV server may stamp this value. Requests containing
   // executionMode are rejected by the command input schema above.
   if(forbidden.has(type))command.executionMode=DEV_EXECUTION_MODE;
   let result;
   try{result=reducer.appendOrderCommand(events,command);}
   catch(e){return deny('ORDER_TRANSITION_REJECTED',{reason:/^[A-Z0-9_]+$/.test(e.message)?e.message:'INVALID_STATE'});}
   if(result.duplicate||result.state?.version!==head.version+1)throw Error('JOURNAL_REDUCER_MISMATCH');
   const row={seq:head.version+1,actorId:actor.subject,requestId,requestHash,previousHash:head.headHash,command};
   row.eventHash=hashEvent(row,scope);
   // These membership changes and the order event MUST commit in one
   // SERIALIZABLE transaction; a failed event must not leave an orphan row.
   if(needsResource){
    if(typeof tx.createResource!=='function')return deny('ORDER_INTAKE_UNAVAILABLE');
    if(await tx.createResource({clientId:actor.clientId})!==true)
     return deny('RESOURCE_NOT_AUTHORIZED');
    const created=await tx.getResourceForUpdate();
    if(!created||created.tenantId!==scope.tenantId||
       created.orderId!==orderId||created.clientId!==actor.clientId||
       created.factoryId!=null)throw Error('ORDER_INTAKE_INTEGRITY_FAILURE');
   }
   if(type==='assign_factory'){
    // A factory ID from an operator form is NOT proof that this organization
    // belongs to the tenant and is approved. Inspect the authoritative
    // directory under this same serializable transaction and lock the roster
    // row until the immutable order assignment is committed.
    if(typeof tx.isFactoryApproved!=='function')
     return deny('FACTORY_DIRECTORY_UNAVAILABLE');
    if(await tx.isFactoryApproved({factoryId:payload.factoryId})!==true)
     return deny('FACTORY_NOT_APPROVED');
    if(typeof tx.assignFactory!=='function')return deny('FACTORY_ASSIGNMENT_UNAVAILABLE');
    if(await tx.assignFactory({factoryId:payload.factoryId,assignedBy:actor.subject})!==true)
     return deny('FACTORY_ALREADY_ASSIGNED');
   }
   if(firstWrite){
    await tx.ensureHead();
    const stored=await tx.getHeadForUpdate();
    if(!stored||stored.version!==0||stored.headHash!==null)throw Error('INITIAL_HEAD_CONFLICT');
   }
   await tx.appendEvent(row);
   if(await tx.advanceHead({expectedVersion:head.version,nextVersion:row.seq,headHash:row.eventHash})!==true)
    throw Error('ORDER_CAS_FAILURE');
   return {accepted:true,code:'ORDER_EVENT_COMMITTED',version:row.seq,eventSeq:row.seq,
     stage:result.state.stage,productionRelease:{allowed:false}};
  });
 }};
}
