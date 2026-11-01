import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createOrderHttpServer} from '../server/orderHttpApi.js';
import {createOrderJournalService} from '../server/orderJournalService.js';
import {admitOrderCommand} from '../server/orderCommandAdmission.js';
import {appendOrderCommand,replayOrder} from '../src/orderWorkflow.js';
import {initialConfig} from '../src/domain.js';

const now=Date.parse('2026-10-31T11:00:00.000Z');
const tenant='TENANT-A',orderId='CUSTOM-001';
const users={
 client:{subject:'BUYER-1',clientId:'BUYER-1',roles:['client']},
 customerTwo:{subject:'BUYER-2',clientId:'BUYER-2',roles:['client']},
 factory:{subject:'FACTORY-U1',factoryId:'FACTORY-A',roles:['factory']},
 factoryTwo:{subject:'FACTORY-U2',factoryId:'FACTORY-B',roles:['factory']},
 partner:{subject:'GABER-OWNER',roles:['partner']},
 foreign:{subject:'FOREIGN-GABER',tenantId:'TENANT-B',roles:['partner']}
};
const clone=x=>structuredClone(x);
/**
 * Rollback-capable one-order in-memory transaction for API contract tests.
 * Actual PostgreSQL serializability/RLS is NOT established by this fixture.
 */
function repository(){
 let doc={resource:null,factory:null,head:null,events:[]},calls=0;
 const roster=new Map([['FACTORY-A','approved'],['FACTORY-B','approved'],
  ['FACTORY-PAUSED','suspended']]);
 let mutex=Promise.resolve();
 return {
  get snapshot(){return clone(doc)},get commits(){return calls},
  setFactoryStatus:(factoryId,status)=>roster.set(factoryId,status),
  async withOrderTransaction(scope,fn){
   let release;const gate=new Promise(resolve=>{release=resolve});
   const previous=mutex;mutex=previous.then(()=>gate);await previous;
   const draft=clone(doc);
   try{
    const tx={
     getResourceForUpdate:async()=>{
      if(scope.tenantId!==tenant||scope.orderId!==orderId||!draft.resource)return null;
      return {...draft.resource,factoryId:draft.factory?.factoryId??draft.resource.factoryId};
     },
     createResource:async({clientId})=>{
      if(scope.tenantId!==tenant||scope.orderId!==orderId||draft.resource)return false;
      draft.resource={source:'server-repository',tenantId:tenant,orderId,
       clientId,factoryId:null};return true;
     },
     isFactoryApproved:async({factoryId})=>
      scope.tenantId===tenant&&scope.orderId===orderId&&roster.get(factoryId)==='approved',
     assignFactory:async({factoryId,assignedBy})=>{
      if(!draft.resource||draft.factory)return false;
      draft.factory={factoryId,assignedBy};return true;
     },
     getHeadForUpdate:async()=>draft.head,
     ensureHead:async()=>{draft.head={version:0,headHash:null}},
     getEvents:async()=>clone(draft.events),
     appendEvent:async row=>{draft.events.push(clone(row))},
     advanceHead:async({expectedVersion,nextVersion,headHash})=>{
      if(draft.head.version!==expectedVersion)return false;
      draft.head={version:nextVersion,headHash};return true;
     }
    };
    const result=await fn(tx);doc=draft;calls++;return result;
   }finally{release()}
  }
 };
}
const sessions={};
for(const [key,user] of Object.entries(users)){
 const token=('integration-session-'+key).padEnd(42,'x');
 sessions[key]={token,principal:{identitySource:'server-session',authenticated:true,
  tenantId:tenant,sessionExpiresAtMs:now+60000,mfaVerified:true,...user}};
}
async function start(){
 const db=repository();
 const journal=createOrderJournalService({repository:db,admission:admitOrderCommand,
  reducer:{replayOrder,appendOrderCommand},clock:()=>now});
 const api=createOrderHttpServer({journal,clock:()=>now,
  resolveSession:async token=>{
   const found=Object.values(sessions).find(entry=>entry.token===token);
   return found?clone(found.principal):null;
  }});
 api.listen(0,'127.0.0.1');await once(api,'listening');
 const base='http://127.0.0.1:'+api.address().port;
 const send=async(role,type,payload,version,requestId,revisionId)=>{
  const req={requestId,expectedVersion:version,type,payload,...(revisionId?{revisionId}:{})};
  const result=await fetch(base+'/api/v1/orders/'+orderId+'/commands',{
   method:'POST',headers:{authorization:'Bearer '+sessions[role].token,
    'content-type':'application/json'},body:JSON.stringify(req)});
  return {status:result.status,body:await result.json()};
 };
 const read=async role=>{
  const result=await fetch(base+'/api/v1/orders/'+orderId,{
   headers:{authorization:'Bearer '+sessions[role].token}});
  return {status:result.status,body:await result.json()};
 };
 return {db,send,read,close:()=>new Promise(done=>api.close(done))};
}
const spec=config=>({config,technicalNote:'Frame, foam, stitching, fittings, dimensional tolerances',
 customerPriceKopecks:210005,factoryCostKopecks:100001,
 platformCommissionKopecks:40001,logisticsKopecks:10000,taxKopecks:5000,
 otherCostsKopecks:0,advanceBps:5000,dueDate:'2027-02-01',
 note:'Customer proposal after factory acknowledgement'});

test('new customer request provisions tenant resource atomically, operator assigns one factory',async()=>{
 const f=await start(),cfg=initialConfig();
 try{
  assert.equal((await f.read('client')).status,404);
  assert.equal((await f.send('client','create',
   {projectId:orderId,name:'Private Sofa',config:cfg},0,'C-1')).status,201);
  assert.equal(f.db.snapshot.resource.clientId,'BUYER-1');
  assert.equal(f.db.snapshot.factory,null);
  assert.equal(f.db.snapshot.head.version,1);
  assert.equal((await f.read('customerTwo')).status,404);
  assert.equal((await f.read('foreign')).status,404);
  assert.equal((await f.read('factory')).status,404,'Factory has not been assigned');
  assert.equal((await f.send('client','assign_factory',
   {factoryId:'FACTORY-A'},1,'FORGED-ASSIGN')).status,403);
  assert.equal((await f.send('partner','prepare_spec',spec(cfg),1,'UNASSIGNED-SPEC')).status,409);
  assert.equal((await f.send('partner','assign_factory',
   {factoryId:'NON-EXISTENT'},1,'UNVERIFIED-ASSIGN')).status,403);
  assert.equal((await f.send('partner','assign_factory',
   {factoryId:'FACTORY-PAUSED'},1,'SUSPENDED-ASSIGN')).status,403);
  assert.equal(f.db.snapshot.events.length,1);
  assert.equal((await f.send('partner','assign_factory',
   {factoryId:'FACTORY-A'},1,'ASSIGN-1')).status,201);
  assert.deepEqual(f.db.snapshot.factory,{factoryId:'FACTORY-A',assignedBy:'GABER-OWNER'});
  assert.equal((await f.read('factory')).status,200);
  assert.equal((await f.read('factoryTwo')).status,404);
  const repeat=await f.send('partner','assign_factory',{factoryId:'FACTORY-A'},1,'ASSIGN-1');
  assert.equal(repeat.status,200);
  assert.equal((await f.send('partner','assign_factory',
   {factoryId:'FACTORY-B'},2,'ASSIGN-2')).status,422);
  assert.equal(f.db.snapshot.factory.factoryId,'FACTORY-A');
  assert.equal((await f.send('partner','prepare_spec',spec(cfg),2,'SPEC-1')).status,201);
  assert.equal((await f.read('factory')).body.order.factoryTask.factoryCostKopecks,100001);
  assert.equal((await f.read('factory')).body.order.offer,undefined);
  assert.equal((await f.send('factory','confirm_spec',
   {reference:'ACK-A',note:'Factory concept reviewed'},3,'ACK-1','S1')).status,201);
  f.db.setFactoryStatus('FACTORY-A','suspended');
  assert.equal((await f.send('partner','offer',{note:'No quote for revoked factory'},
   4,'OFFER-REVOKED','S1')).status,403);
  assert.equal((await f.read('factory')).status,404);
  assert.equal(f.db.snapshot.events.length,4);
  f.db.setFactoryStatus('FACTORY-A','approved');
  assert.equal((await f.send('partner','offer',{note:'Final client quote'},4,'OFFER-1','S1')).status,201);
  assert.equal((await f.send('client','accept',{},5,'ACCEPT-1','R1')).status,201);
  assert.equal((await f.send('client','report_payment',
   {amountKopecks:105003,reference:'CLIENT-CLAIM'},6,'CLAIM-1','R1')).status,201);
  assert.equal((await f.send('partner','record_payment',
   {amountKopecks:105003,reference:'LOCAL-UNVERIFIED'},7,'RECORD-1','R1')).status,201);
  const client=(await f.read('client')).body.order;
  const partner=(await f.read('partner')).body.order;
  assert.equal(client.offer.priceKopecks,210005);
  assert.equal(client.finance.verifiedBankKopecks,null);
  assert.equal(partner.economics.platformCommissionKopecks,40001);
  assert.equal(partner.assignedFactoryId,'FACTORY-A');
  assert.equal(client.economics,undefined);
  assert.equal(partner.productionRelease.allowed,false);
  assert.equal(f.db.snapshot.events.length,8);
  f.db.setFactoryStatus('FACTORY-A','suspended');
  assert.equal((await f.read('factory')).status,404,
   'Suspended factory loses access to previously assigned order');
  assert.equal((await f.send('factory','message',
   {note:'Revoked factory should not write',channel:'factory_partner'},8,
   'REVOKED-WRITE','R1')).status,404);
  assert.equal((await f.read('partner')).status,200);
  assert.equal((await f.read('client')).status,200);
  assert.equal(f.db.snapshot.events.length,8,
   'Suspension must not erase or append immutable history');
 }finally{await f.close()}
});
test('invalid first event does not leave orphan resource, head, or assignment',async()=>{
 const f=await start();
 try{
  const invalid=await f.send('client','create',
   {projectId:orderId,name:'Bad Sofa'},0,'INVALID-CREATE');
  assert.equal(invalid.status,422);
  assert.equal(f.db.snapshot.resource,null);
  assert.equal(f.db.snapshot.head,null);
  assert.equal(f.db.snapshot.events.length,0);
  assert.equal((await f.read('client')).status,404);
 }finally{await f.close()}
});
test('simultaneous first create requests and factory assignments are exactly-once',async()=>{
 const f=await start(),cfg=initialConfig();
 try{
  const a=await Promise.all([
   f.send('client','create',{projectId:orderId,name:'Sofa',config:cfg},0,'C-1'),
   f.send('client','create',{projectId:orderId,name:'Sofa',config:cfg},0,'C-2')
  ]);
  assert.deepEqual(a.map(x=>x.status).sort(),[201,409]);
  assert.equal(f.db.snapshot.events.length,1);
  const b=await Promise.all([
   f.send('partner','assign_factory',{factoryId:'FACTORY-A'},1,'A-1'),
   f.send('partner','assign_factory',{factoryId:'FACTORY-B'},1,'A-2')
  ]);
  assert.deepEqual(b.map(x=>x.status).sort(),[201,409]);
  assert.equal(f.db.snapshot.events.length,2);
  assert.equal(f.db.snapshot.factory.factoryId=== 'FACTORY-A' ||
   f.db.snapshot.factory.factoryId==='FACTORY-B',true);
  assert.equal((await f.read('factory')).status,
   f.db.snapshot.factory.factoryId==='FACTORY-A'?200:404);
  assert.equal((await f.read('factoryTwo')).status,
   f.db.snapshot.factory.factoryId==='FACTORY-B'?200:404);
 }finally{await f.close()}
});
