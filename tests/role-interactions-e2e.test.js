import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createOrderHttpServer} from '../server/orderHttpApi.js';
import {createOrderJournalService} from '../server/orderJournalService.js';
import {admitOrderCommand} from '../server/orderCommandAdmission.js';
import {appendOrderCommand,replayOrder} from '../src/orderWorkflow.js';
import {initialConfig} from '../src/domain.js';

/**
 * Real loopback HTTP, real policy, real reducer and real hash-chained journal
 * against a SERIALIZED IN-MEMORY fake repository. NOT a PostgreSQL/browser proof.
 * Each bearer token is an independent, server-resolved test session.
 */
const now=Date.parse('2026-10-30T00:00:00Z');
const resource=Object.freeze({source:'server-repository',tenantId:'TENANT-A',orderId:'SOFA-1',
 clientId:'CUSTOMER-1',brandId:'BRAND-1',partnerIds:['PARTNER-1','PARTNER-2'],factoryId:'FACTORY-1'});
const principals={
 client:{subject:'user-client',roles:['client'],clientId:'CUSTOMER-1'},
 brand:{subject:'user-brand',roles:['brand'],brandId:'BRAND-1'},
 partner:{subject:'user-partner-one',roles:['partner'],partnerId:'PARTNER-1'},
 partner2:{subject:'user-partner-two',roles:['partner'],partnerId:'PARTNER-2'},
 factory:{subject:'user-operator',roles:['factory-operator'],factoryId:'FACTORY-1'},
 technologist:{subject:'user-technologist',roles:['factory-technologist'],factoryId:'FACTORY-1'},
 owner:{subject:'user-owner',roles:['owner'],factoryId:'FACTORY-1'},
 outsider:{subject:'user-outsider',roles:['client'],clientId:'CUSTOMER-OTHER'},
 alien:{subject:'user-alien-owner',tenantId:'TENANT-B',roles:['owner']}
};
const session=props=>({
 identitySource:'server-session',authenticated:true,tenantId:'TENANT-A',
 mfaVerified:true,sessionExpiresAtMs:now+60000,...props
});
function memoryRepository(){
 const contents=new Map(),queues=new Map(),metrics={readRows:0,commits:0};
 return {metrics,async withOrderTransaction(scope,work){
  const key=scope.tenantId+'|'+scope.orderId;
  const prior=queues.get(key)??Promise.resolve();
  let unlock;const current=new Promise(resolve=>{unlock=resolve});
  queues.set(key,prior.then(()=>current));
  await prior;
  const draft=structuredClone(contents.get(key)??{head:null,rows:[]});
  try{
   const tx={
    getResourceForUpdate:async()=>scope.tenantId==='TENANT-A'&&scope.orderId==='SOFA-1'?resource:null,
    ensureHead:async()=>{draft.head={version:0,headHash:null}},
    getHeadForUpdate:async()=>structuredClone(draft.head),
    getEvents:async()=>{metrics.readRows++;return structuredClone(draft.rows)},
    appendEvent:async row=>{draft.rows.push(structuredClone(row));},
    advanceHead:async({expectedVersion,nextVersion,headHash})=>{
     if(draft.head?.version!==expectedVersion)return false;
     draft.head={version:nextVersion,headHash};return true;
    }
   };
   const result=await work(tx);
   contents.set(key,draft);metrics.commits++;
   return result;
  }finally{unlock();}
 }};
}
async function fixture(){
 const repository=memoryRepository();
 const journal=createOrderJournalService({repository,admission:admitOrderCommand,
  reducer:{appendOrderCommand,replayOrder},clock:()=>now});
 const tokens=new Map();
 for(const [name,props] of Object.entries(principals))
  tokens.set(name,('gaber-e2e-'+name).padEnd(40,'x'));
 const sessions=new Map();
 for(const [name,token] of tokens.entries())sessions.set(token,session(principals[name]));
 const api=createOrderHttpServer({journal,resolveSession:async token=>structuredClone(sessions.get(token)??null),
  clock:()=>now});
 api.listen(0,'127.0.0.1');await once(api,'listening');
 const base='http://127.0.0.1:'+api.address().port;
 const call=async(role,path='/api/v1/orders/SOFA-1',method='GET',body)=>{
  const token=tokens.get(role);
  const headers={...(token?{authorization:'Bearer '+token}:{})};
  if(method==='POST')headers['content-type']='application/json';
  const res=await fetch(base+path,{method,headers,...(body!==undefined?{body:JSON.stringify(body)}:{})});
  return {status:res.status,body:await res.json()};
 };
 return {call,tokens,sessions,repository,async close(){await new Promise(resolve=>api.close(resolve))}};
}

test('six independent server sessions share one versioned order without role data leakage',async()=>{
 const f=await fixture();const config=initialConfig('sofa');
 let version=0,number=0;
 const send=async(role,type,payload={},revisionId,expectedVersion=version)=>{
  const requestId='E2E-'+(++number);
  const body={requestId,type,payload,expectedVersion,...(revisionId?{revisionId}:{})};
  const result=await f.call(role,'/api/v1/orders/SOFA-1/commands','POST',body);
  if(result.status===201)version=result.body.version;
  return {result,body};
 };
 try{
  const missing=await f.call('client');
  assert.equal(missing.status,404);assert.equal(missing.body.code,'ORDER_NOT_FOUND');
  const create=await send('client','create',{projectId:'SOFA-1',name:'Private sofa',config});
  assert.equal(create.result.status,201);assert.equal(version,1);
  assert.equal((await f.call('client')).body.order.stage,'requested');
  const offer=await send('brand','offer',{config,priceKopecks:120001,
   advanceBps:5000,dueDate:'2027-01-01',note:'Price including upholstery'});
  assert.equal(offer.result.status,201);assert.equal(version,2);
  assert.equal((await send('client','accept',{},'R1')).result.status,201);
  assert.equal((await send('partner','message',{note:'Private P1 schedule',partnerId:'PARTNER-1'},'R1')).result.status,201);
  assert.equal((await send('partner2','message',{note:'Private P2 schedule',partnerId:'PARTNER-2'},'R1')).result.status,201);
  assert.equal((await send('client','message',{note:'P1 confirmed delivery',partnerId:'PARTNER-1'},'R1')).result.status,201);
  assert.equal((await send('brand','message',{note:'Public brand update'},'R1')).result.status,201);
  assert.equal((await send('client','report_payment',{amountKopecks:60001,reference:'CLAIM-A'},'R1')).result.status,201);
  assert.equal((await send('factory','record_payment',{amountKopecks:60001,reference:'LOCAL-A'},'R1')).result.status,201);
  assert.equal(version,9);
  const results={};
  for(const role of ['client','brand','partner','partner2','factory','technologist','owner']){
   const response=await f.call(role);
   assert.equal(response.status,200,role+JSON.stringify(response));
   assert.equal(response.body.order.version,version);
   assert.equal(response.body.order.revisionId,'R1');
   assert.equal(response.body.order.productionRelease.allowed,false);
   results[role]=response.body.order;
  }
  assert.equal(results.owner.finance.priceKopecks,120001);
  assert.equal(results.owner.finance.currentKopecks,60001);
  assert.equal(results.owner.finance.verifiedBankKopecks,null);
  assert.equal(results.client.finance.balanceKopecks,60000);
  for(const role of ['brand','technologist','partner','partner2']){
   assert.equal('finance' in results[role],false);
   assert.equal('payments' in results[role],false);
   assert.equal('paymentClaims' in results[role],false);
  }
  assert.equal(results.technologist.config.category,'sofa');
  assert.equal('name' in results.technologist,false);
  assert.equal('config' in results.partner,false);
  assert.equal('messages' in results.partner,false);
  assert.deepEqual(results.partner.partnerThread.map(v=>v.note),
   ['Private P1 schedule','P1 confirmed delivery']);
  assert.deepEqual(results.partner2.partnerThread.map(v=>v.note),['Private P2 schedule']);
  assert.deepEqual(results.brand.messages.map(v=>v.note),['Public brand update']);
  assert.ok(results.client.messages.some(x=>x.note==='Private P1 schedule'));
  assert.ok(results.factory.messages.some(x=>x.note==='Private P2 schedule'));
  // This is a local/unverified payment record and can NEVER authorize production.
  const start=await send('factory','start',{},'R1');
  assert.equal(start.result.status,403);assert.equal(start.result.body.code,'EXTERNAL_AUTHORITY_REQUIRED');
  const ship=await send('factory','ship',{carrier:'x',tracking:'y',reference:'z'},'R1');
  assert.equal(ship.result.status,403);
  assert.equal((await f.call('owner')).body.order.version,9);
 }finally{await f.close();}
});

test('role forgery, unassigned partner thread, revocation, cross tenant and MFA fail closed',async()=>{
 const f=await fixture();const config=initialConfig();
 try{
  const create={requestId:'ONE',expectedVersion:0,type:'create',payload:{projectId:'SOFA-1',name:'Sofa',config}};
  assert.equal((await f.call('client','/api/v1/orders/SOFA-1/commands','POST',create)).status,201);
  const before=f.repository.metrics.readRows;
  for(const role of ['outsider','alien']){
   const res=await f.call(role);
   assert.equal(res.status,404,role);
   assert.equal(res.body.code,'ORDER_NOT_FOUND');
  }
  assert.equal(f.repository.metrics.readRows,before,'Unauthorized reads cannot fetch events');
  const forged=await f.call('partner','/api/v1/orders/SOFA-1/commands','POST',
   {requestId:'FORGED',expectedVersion:1,type:'message',role:'owner',
    payload:{note:'secret',partnerId:'PARTNER-1'}});
  assert.equal(forged.status,400);
  const noThread=await f.call('partner','/api/v1/orders/SOFA-1/commands','POST',
   {requestId:'NO-THREAD',expectedVersion:1,type:'message',payload:{note:'I am partner'}});
  assert.equal(noThread.status,403);
  const wrongThread=await f.call('partner','/api/v1/orders/SOFA-1/commands','POST',
   {requestId:'WRONG-THREAD',expectedVersion:1,type:'message',
    payload:{note:'I impersonate other partner',partnerId:'PARTNER-2'}});
  assert.equal(wrongThread.status,403);
  assert.equal((await f.call('technologist','/api/v1/orders/SOFA-1/commands','POST',
   {requestId:'TECH-MESSAGE',expectedVersion:1,type:'message',payload:{note:'Unauthorized write'}})).status,403);
  const operatorToken=f.tokens.get('factory'),operatorSession=f.sessions.get(operatorToken);
  f.sessions.set(operatorToken,{...operatorSession,mfaVerified:false});
  assert.equal((await f.call('factory','/api/v1/orders/SOFA-1/commands','POST',
   {requestId:'NO-MFA',expectedVersion:1,type:'offer',
    payload:{config,priceKopecks:100001,advanceBps:5000,dueDate:'2027-01-01',note:'No MFA'}})).status,403);
  const token=f.tokens.get('client');
  f.sessions.set(token,{...f.sessions.get(token),sessionExpiresAtMs:now});
  assert.equal((await f.call('client')).status,401);
  f.sessions.delete(token);
  assert.equal((await f.call('client')).status,401);
  assert.equal((await f.call('owner')).body.order.version,1);
 }finally{await f.close();}
});

test('parallel HTTP writes, retries, conflicting payloads and price revisions share one journal',async()=>{
 const f=await fixture();const config=initialConfig();
 const post=(role,body)=>f.call(role,'/api/v1/orders/SOFA-1/commands','POST',body);
 try{
  const creation={requestId:'CREATE-1',expectedVersion:0,type:'create',
   payload:{projectId:'SOFA-1',name:'Single order',config}};
  const simultaneous=await Promise.all([post('client',creation),post('client',{...creation,requestId:'CREATE-2'})]);
  assert.deepEqual(simultaneous.map(x=>x.status).sort(),[201,409]);
  assert.equal((await post('client',creation)).status,200);
  assert.equal((await post('client',{...creation,payload:{...creation.payload,name:'Forged'}})).status,409);
  assert.equal((await f.call('owner')).body.order.version,1);
  let result=await post('factory',{requestId:'OFFER-1',expectedVersion:1,type:'offer',
   payload:{config,priceKopecks:200005,advanceBps:5000,dueDate:'2027-01-01',note:'Offer revision 1'}});
  assert.equal(result.status,201);
  result=await post('client',{requestId:'ACCEPT-1',expectedVersion:2,type:'accept',payload:{},revisionId:'R1'});
  assert.equal(result.status,201);
  result=await post('client',{requestId:'CHANGE-1',expectedVersion:3,type:'request_change',
   payload:{note:'Adjust width'},revisionId:'R1'});
  assert.equal(result.status,201);
  assert.equal((await f.call('client')).body.order.acceptedRevisionId,null);
  const wider={...config,width:300};
  result=await post('brand',{requestId:'OFFER-2',expectedVersion:4,type:'offer',
   payload:{config:wider,priceKopecks:210007,advanceBps:5000,dueDate:'2027-01-01',note:'Updated offer'}});
  assert.equal(result.status,201);
  const amended=(await f.call('client')).body.order;
  assert.equal(amended.config.width,300);
  assert.equal(amended.revisionId,'R2');
  assert.equal(amended.acceptedRevisionId,null);
  assert.equal((await post('client',{requestId:'OLD-ACCEPT',expectedVersion:5,type:'accept',
   payload:{},revisionId:'R1'})).status,422);
  assert.equal((await post('partner',{requestId:'PARTNER-OFFER',expectedVersion:5,type:'offer',
   payload:{config:wider,priceKopecks:1,advanceBps:0,dueDate:'2027-01-01',note:'Unauthorized'}})).status,403);
  const concurrent=await Promise.all([
   post('client',{requestId:'MSG-A',expectedVersion:5,type:'message',payload:{note:'First'},revisionId:'R2'}),
   post('client',{requestId:'MSG-B',expectedVersion:5,type:'message',payload:{note:'Second'},revisionId:'R2'})
  ]);
  assert.deepEqual(concurrent.map(x=>x.status).sort(),[201,409]);
  assert.equal((await f.call('owner')).body.order.version,6);
  assert.equal((await f.call('owner')).body.order.productionRelease.allowed,false);
 }finally{await f.close();}
});
