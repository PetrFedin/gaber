import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createOrderHttpServer} from '../server/orderHttpApi.js';
import {createOrderJournalService} from '../server/orderJournalService.js';
import {admitOrderCommand} from '../server/orderCommandAdmission.js';
import {appendOrderCommand,replayOrder} from '../src/orderWorkflow.js';
import {initialConfig} from '../src/domain.js';

const now=Date.parse('2026-10-30T00:00:00Z');
const resource={source:'server-repository',tenantId:'GABER-TENANT',orderId:'ORDER1',
 clientId:'CUSTOMER1',factoryId:'FACTORY1'};
const identities={
 client:{subject:'USER-CLIENT',roles:['client'],clientId:'CUSTOMER1'},
 factory:{subject:'USER-FACTORY',roles:['factory'],factoryId:'FACTORY1'},
 partner:{subject:'USER-OPERATOR',roles:['partner']},
 stranger:{subject:'USER-STRANGER',roles:['client'],clientId:'OTHER'},
 otherFactory:{subject:'USER-OTHER-FACTORY',roles:['factory'],factoryId:'OTHER'},
 otherTenant:{subject:'USER-OTHER-TENANT',roles:['partner'],tenantId:'OTHER-TENANT'}
};
const terms=config=>({config,technicalNote:'Каркас, наполнитель, обивка, швы, допуски и маршруты',
 customerPriceKopecks:200005,factoryCostKopecks:90001,
 platformCommissionKopecks:30001,logisticsKopecks:10000,taxKopecks:5000,
 otherCostsKopecks:3000,advanceBps:5000,dueDate:'2027-02-01',
 note:'Предложение Габер после подтверждения фабрики'});
function memoryRepository(){
 const map=new Map(),locks=new Map(),metrics={eventReads:0};
 return {metrics,async withOrderTransaction(scope,work){
  const key=scope.tenantId+'|'+scope.orderId,prior=locks.get(key)??Promise.resolve();
  let unlock;const next=new Promise(resolve=>{unlock=resolve});
  locks.set(key,prior.then(()=>next));
  await prior;
  const draft=structuredClone(map.get(key)??{head:null,rows:[]});
  try{
   const tx={
    getResourceForUpdate:async()=>scope.tenantId==='GABER-TENANT'&&scope.orderId==='ORDER1'?resource:null,
    isFactoryApproved:async({factoryId})=>scope.tenantId==='GABER-TENANT'&&factoryId==='FACTORY1',
    getHeadForUpdate:async()=>structuredClone(draft.head),
    getEvents:async()=>{metrics.eventReads++;return structuredClone(draft.rows)},
    ensureHead:async()=>{draft.head={version:0,headHash:null}},
    appendEvent:async r=>draft.rows.push(structuredClone(r)),
    advanceHead:async({expectedVersion,nextVersion,headHash})=>{
     if(draft.head.version!==expectedVersion)return false;
     draft.head={version:nextVersion,headHash};return true;
    }
   };
   const result=await work(tx);map.set(key,draft);return result;
  }finally{unlock();}
 }};
}
async function boot(){
 const repository=memoryRepository(),journal=createOrderJournalService({
  repository,admission:admitOrderCommand,reducer:{appendOrderCommand,replayOrder},clock:()=>now
 });
 const tokens=new Map(),sessions=new Map();
 for(const [name,user] of Object.entries(identities)){
  const token=('test-gaber-'+name).padEnd(43,'x');
  tokens.set(name,token);
  sessions.set(token,{identitySource:'server-session',authenticated:true,
   tenantId:'GABER-TENANT',sessionExpiresAtMs:now+60000,mfaVerified:true,...user});
 }
 const api=createOrderHttpServer({journal,clock:()=>now,
  resolveSession:async token=>structuredClone(sessions.get(token)??null)});
 api.listen(0,'127.0.0.1');await once(api,'listening');
 const base='http://127.0.0.1:'+api.address().port;
 const request=async(role,method='GET',payload,url='/api/v1/orders/ORDER1')=>{
  const headers={...(tokens.has(role)?{authorization:'Bearer '+tokens.get(role)}:{})};
  if(method==='POST')headers['content-type']='application/json';
  const res=await fetch(base+url,{method,headers,
   ...(payload!==undefined?{body:JSON.stringify(payload)}:{})});
  return {status:res.status,data:await res.json()};
 };
 return {request,sessions,tokens,repository,close:()=>new Promise(done=>api.close(done))};
}
const post=(f,role,request)=>f.request(role,'POST',request,'/api/v1/orders/ORDER1/commands');
const command=(id,expectedVersion,type,payload,revisionId)=>({
 requestId:id,expectedVersion,type,payload,...(revisionId?{revisionId}:{})
});
test('customer request -> partner costing/TZ -> factory confirm -> customer quote/payment',async()=>{
 const f=await boot(),config=initialConfig();
 try{
  assert.equal((await f.request('client')).status,404);
  assert.equal((await post(f,'client',command('create',0,'create',{projectId:'ORDER1',name:'Sofa',config}))).status,201);
  assert.equal((await post(f,'partner',command('spec',1,'prepare_spec',terms(config)))).status,201);
  const pending=(await f.request('factory')).data.order;
  assert.equal(pending.stage,'awaiting_factory');
  assert.equal(pending.factoryTask.factoryCostKopecks,90001);
  assert.ok(pending.factoryTask.parts.length>0);
  assert.equal('economics' in pending,false);
  assert.equal('offer' in pending,false);
  assert.equal((await post(f,'partner',command('early',2,'offer',{note:'Premature'},'S1'))).status,422);
  assert.equal((await post(f,'factory',command('factoryOK',2,'confirm_spec',{reference:'FACTORY-QC',note:'Checked'},'S1'))).status,201);
  assert.equal((await post(f,'partner',command('published',3,'offer',{note:'Final quote'},'S1'))).status,201);
  assert.equal((await post(f,'client',command('accept',4,'accept',{},'R1'))).status,201);
  assert.equal((await post(f,'client',command('client-claim',5,'report_payment',{amountKopecks:100003,reference:'CLAIM'},'R1'))).status,201);
  assert.equal((await post(f,'partner',command('local-money',6,'record_payment',{amountKopecks:100003,reference:'LOCAL'},'R1'))).status,201);
  const client=(await f.request('client')).data.order;
  const factory=(await f.request('factory')).data.order;
  const partner=(await f.request('partner')).data.order;
  for(const o of [client,factory,partner]){assert.equal(o.version,7);assert.equal(o.productionRelease.allowed,false);}
  assert.equal(client.offer.priceKopecks,200005);
  assert.equal(client.finance.advanceKopecks,100003);
  assert.equal('factoryTask' in client,false);assert.equal('economics' in client,false);
  assert.equal(factory.factoryTask.factoryCostKopecks,90001);
  assert.equal('offer' in factory,false);assert.equal('finance' in factory,false);
  assert.equal('economics' in factory,false);
  assert.equal(partner.economics.platformCommissionKopecks,30001);
  assert.equal(partner.economics.plannedReserveKopecks,62003);
  assert.equal(partner.finance.verifiedBankKopecks,null);
  assert.equal((await post(f,'factory',command('start',7,'start',{},'R1'))).status,403);
  assert.equal((await f.request('partner')).data.order.version,7);
 }finally{await f.close()}
});
test('factory reject -> partner correction -> new factory decision -> client agreement',async()=>{
 const f=await boot(),cfg=initialConfig();
 try{
  assert.equal((await post(f,'client',command('c',0,'create',{projectId:'ORDER1',name:'Sofa',config:cfg}))).status,201);
  assert.equal((await post(f,'partner',command('s1',1,'prepare_spec',terms(cfg)))).status,201);
  assert.equal((await post(f,'factory',command('return',2,'return_spec',{note:'Change foam density'},'S1'))).status,201);
  assert.equal((await f.request('partner')).data.order.stage,'factory_changes');
  assert.equal((await post(f,'partner',command('skip',3,'offer',{note:'Not accepted'},'S1'))).status,422);
  const revised={...terms({...cfg,width:300}),customerPriceKopecks:250005};
  assert.equal((await post(f,'partner',command('s2',3,'prepare_spec',revised))).status,201);
  assert.equal((await post(f,'factory',command('ok',4,'confirm_spec',{reference:'REV-2',note:'Checked'},'S2'))).status,201);
  assert.equal((await post(f,'partner',command('offer',5,'offer',{note:'After factory check'},'S2'))).status,201);
  assert.equal((await post(f,'client',command('old',6,'accept',{},'R0'))).status,422);
  assert.equal((await post(f,'client',command('yes',6,'accept',{},'R1'))).status,201);
  assert.equal((await f.request('client')).data.order.offer.priceKopecks,250005);
 }finally{await f.close()}
});
test('cross-tenant/customer/factory, stale sessions, forged role, MFA and race rejected',async()=>{
 const f=await boot(),cfg=initialConfig();
 try{
  const create=command('initial',0,'create',{projectId:'ORDER1',name:'Sofa',config:cfg});
  const both=await Promise.all([post(f,'client',create),post(f,'client',{...create,requestId:'other'} )]);
  assert.deepEqual(both.map(x=>x.status).sort(),[201,409]);
  assert.equal((await post(f,'client',create)).status,200);
  assert.equal((await post(f,'client',{...create,payload:{...create.payload,name:'Forged'}})).status,409);
  const reads=f.repository.metrics.eventReads;
  for(const role of ['stranger','otherFactory','otherTenant'])
   assert.equal((await f.request(role)).status,404);
  assert.equal(reads,f.repository.metrics.eventReads);
  assert.equal((await post(f,'factory',command('steal',1,'prepare_spec',terms(cfg)))).status,403);
  assert.equal((await post(f,'client',{...command('forge',1,'prepare_spec',terms(cfg)),role:'partner'})).status,400);
  assert.equal((await post(f,'partner',command('old-thread',1,'message',{note:'Should fail',partnerId:'P1'}))).status,403);
  const partnerToken=f.tokens.get('partner');
  f.sessions.set(partnerToken,{...f.sessions.get(partnerToken),mfaVerified:false});
  assert.equal((await post(f,'partner',command('no-mfa',1,'prepare_spec',terms(cfg)))).status,403);
  f.sessions.set(partnerToken,{...f.sessions.get(partnerToken),sessionExpiresAtMs:now});
  assert.equal((await f.request('partner')).status,401);
  assert.equal((await f.request('client')).data.order.version,1);
 }finally{await f.close()}
});

test('real loopback three-role HTTP hides old price during change, partner repricing and factory review',async()=>{
 const f=await boot(),cfg=initialConfig();
 try{
  const c=command;
  assert.equal((await post(f,'client',c('reprice-create',0,'create',{projectId:'ORDER1',name:'Custom Sofa',config:cfg}))).status,201);
  assert.equal((await post(f,'partner',c('reprice-spec1',1,'prepare_spec',terms(cfg)))).status,201);
  assert.equal((await post(f,'factory',c('reprice-confirm1',2,'confirm_spec',{reference:'ACK-1',note:'Review'},'S1'))).status,201);
  assert.equal((await post(f,'partner',c('reprice-offer1',3,'offer',{note:'Published R1'},'S1'))).status,201);
  assert.equal((await post(f,'client',c('reprice-accept1',4,'accept',{},'R1'))).status,201);
  let result=await f.request('client');
  assert.equal(result.data.order.offer.priceKopecks,200005);
  assert.equal(result.data.order.offerStatus,'PUBLISHED_CONCEPT');
  assert.equal((await post(f,'client',c('reprice-change1',5,'request_change',{note:'Increase width'},'R1'))).status,201);
  result=await f.request('client');
  assert.equal(result.data.order.offer,null);
  assert.equal(result.data.order.finance.customerPriceKopecks,null);
  assert.equal(result.data.order.dueDate,null);
  assert.equal(result.data.order.offerStatus,'AWAITING_NEW_CONFIRMED_OFFER');
  assert.equal(result.data.order.acceptedRevisionId,null);
  const newSpec={...terms({...cfg,width:300}),customerPriceKopecks:250005};
  assert.equal((await post(f,'partner',c('reprice-spec2',6,'prepare_spec',newSpec))).status,201);
  result=await f.request('client');
  assert.equal(result.data.order.config.width,cfg.width);
  assert.equal(result.data.order.offer,null);
  const factory=(await f.request('factory')).data.order;
  assert.equal(factory.factoryTask.specId,'S2');
  assert.equal(factory.factoryTask.sourceConfig.width,300);
  assert.equal(factory.factoryTask.factoryCostKopecks,90001);
  assert.equal(factory.offer,undefined);
  assert.equal(factory.economics,undefined);
  assert.equal((await post(f,'factory',c('reprice-confirm2',7,'confirm_spec',{reference:'ACK-2',note:'Concept checked'},'S2'))).status,201);
  assert.equal((await f.request('client')).data.order.offer,null,
   'Customer price requires explicit partner publication after factory acknowledgement');
  assert.equal((await post(f,'partner',c('reprice-offer2',8,'offer',{note:'New quote'},'S2'))).status,201);
  result=await f.request('client');
  assert.equal(result.data.order.revisionId,'R2');
  assert.equal(result.data.order.offer.priceKopecks,250005);
  assert.equal(result.data.order.config.width,300);
  assert.equal(result.data.order.acceptedRevisionId,null);
  assert.equal((await post(f,'client',c('reprice-old-accept',9,'accept',{},'R1'))).status,422);
  assert.equal((await post(f,'client',c('reprice-new-accept',9,'accept',{},'R2'))).status,201);
  assert.equal((await f.request('partner')).data.order.economics.platformCommissionKopecks,30001);
 }finally{await f.close()}
});

test('loopback HTTP routes bilateral client/factory conversations only through partner',async()=>{
 const f=await boot(),cfg=initialConfig();
 try{
  assert.equal((await post(f,'client',command('channel-create',0,'create',{
   projectId:'ORDER1',name:'Channel test sofa',config:cfg
  }))).status,201);
  const events=[
   ['client','client_partner','Client private request'],
   ['factory','factory_partner','Factory internal quote'],
   ['partner','factory_partner','Partner reply to factory'],
   ['partner','client_partner','Partner reply to client'],
   ['partner','shared','All-party production update']
  ];
  for(let i=0;i<events.length;i++){
   const [actor,channel,note]=events[i];
   assert.equal((await post(f,actor,command('channel-'+i,i+1,'message',{note,channel}))).status,201);
  }
  const client=(await f.request('client')).data.order;
  const factory=(await f.request('factory')).data.order;
  const partner=(await f.request('partner')).data.order;
  assert.equal(client.version,6);assert.equal(factory.version,6);assert.equal(partner.version,6);
  assert.deepEqual(client.messages.map(m=>m.note),[
   'Client private request','Partner reply to client','All-party production update'
  ]);
  assert.deepEqual(factory.messages.map(m=>m.note),[
   'Factory internal quote','Partner reply to factory','All-party production update'
  ]);
  assert.deepEqual(partner.messages.map(m=>m.note),events.map(v=>v[2]));
  assert.equal(JSON.stringify(client).includes('Factory internal quote'),false);
  assert.equal(JSON.stringify(factory).includes('Client private request'),false);
  assert.equal((await post(f,'client',command('channel-forgery-c',6,'message',{
   note:'Read factory notes',channel:'factory_partner'
  }))).status,403);
  assert.equal((await post(f,'factory',command('channel-forgery-f',6,'message',{
   note:'Read customer notes',channel:'client_partner'
  }))).status,403);
  assert.equal((await post(f,'partner',command('channel-invalid',6,'message',{
   note:'Unknown',channel:'private-admin'
  }))).status,403);
  assert.equal((await f.request('otherTenant')).status,404);
  assert.equal((await f.request('partner')).data.order.version,6);
 }finally{await f.close()}
});
