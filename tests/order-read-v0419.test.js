import test from 'node:test';
import assert from 'node:assert/strict';
import {createOrderJournalService} from '../server/orderJournalService.js';
import {admitOrderCommand} from '../server/orderCommandAdmission.js';
import {appendOrderCommand,replayOrder} from '../src/orderWorkflow.js';
import {initialConfig} from '../src/domain.js';
import {orderMoney} from '../src/orderMoney.js';

const now=Date.parse('2026-10-27T15:00:00Z');
const resource={source:'server-repository',tenantId:'T1',orderId:'O1',
 clientId:'C1',factoryId:'F1',brandId:'B1',partnerIds:['P1']};
const principal=role=>({identitySource:'server-session',authenticated:true,
 subject:'user-'+role,tenantId:'T1',roles:[role],clientId:'C1',factoryId:'F1',
 brandId:'B1',partnerId:'P1',mfaVerified:true,sessionExpiresAtMs:now+60000});
function fixture(){
 let head=null,rows=[],reads=0;
 const repository={async withOrderTransaction(scope,work){
  const draft={head:structuredClone(head),rows:structuredClone(rows)};
  const result=await work({
   getResourceForUpdate:async()=>scope.tenantId==='T1'&&scope.orderId==='O1'?resource:null,
   getHeadForUpdate:async()=>draft.head,
   getEvents:async()=>{reads++;return structuredClone(draft.rows)},
   ensureHead:async()=>{draft.head={version:0,headHash:null}},
   appendEvent:async r=>draft.rows.push(structuredClone(r)),
   advanceHead:async({expectedVersion,nextVersion,headHash})=>{
    if(draft.head.version!==expectedVersion)return false;
    draft.head={version:nextVersion,headHash};return true;
   }
  });
  head=draft.head;rows=draft.rows;return result;
 }};
 const service=createOrderJournalService({repository,admission:admitOrderCommand,
  reducer:{appendOrderCommand,replayOrder},clock:()=>now});
 let n=0;
 const send=(role,type,payload={},revisionId)=>service.execute({principal:principal(role),
  request:{orderId:'O1',requestId:'event-'+(++n),expectedVersion:head?.version??0,
   type,payload,...(revisionId?{revisionId}:{})}});
 const read=role=>service.read({principal:principal(role),request:{orderId:'O1'}});
 return {service,send,read,get rows(){return rows},get reads(){return reads}};
}
async function populated(){
 const f=fixture(),config=initialConfig();
 for(const result of [
  await f.send('client','create',{projectId:'O1',name:'Private sofa',config}),
  await f.send('factory-operator','offer',{config,priceKopecks:200005,
   advanceBps:5000,dueDate:'2027-01-01',note:'Shared offer'}),
  await f.send('client','accept',{},'R1'),
  await f.send('client','report_payment',{amountKopecks:100003,reference:'Client claim'},'R1'),
  await f.send('factory-operator','record_payment',{amountKopecks:100003,reference:'Local record'},'R1'),
  await f.send('client','message',{note:'Shared customer note'},'R1')
 ])assert.equal(result.accepted,true,JSON.stringify(result));
 return f;
}
test('real reducer + real admission: client and factory read one revision and exact balances',async()=>{
 const f=await populated();
 for(const role of ['client','factory-operator','owner']){
  const r=await f.read(role);assert.equal(r.code,'ORDER_READ');
  assert.equal(r.order.version,6);assert.equal(r.order.revisionId,'R1');
  assert.equal(r.order.finance.priceKopecks,200005);
  assert.equal(r.order.finance.advanceKopecks,100003);
  assert.equal(r.order.finance.balanceKopecks,100002);
  assert.equal(r.order.finance.verifiedBankKopecks,null);
  assert.equal(r.order.productionRelease.allowed,false);
  assert.equal(r.order.messages[0].note,'Shared customer note');
  assert.equal(r.order.events,undefined);assert.equal(r.order.actorId,undefined);
 }
});
test('all six roles have explicit DTOs: partner progress, technologist geometry, brand terms',async()=>{
 const f=await populated();
 const partner=(await f.read('partner')).order;
 for(const key of ['name','config','offer','finance','payments','paymentClaims','messages','issue'])
  assert.equal(Object.hasOwn(partner,key),false,key);
 assert.equal(partner.stage,'accepted');
 const tech=(await f.read('factory-technologist')).order;
 assert.equal(tech.config.category,'sofa');
 for(const key of ['name','offer','finance','payments','messages'])assert.equal(Object.hasOwn(tech,key),false,key);
 const brand=(await f.read('brand')).order;
 assert.equal(brand.offer.priceKopecks,200005);
 for(const key of ['finance','payments','paymentClaims'])assert.equal(Object.hasOwn(brand,key),false,key);
});
test('other members, tenants, expired or forged sessions cannot fetch journal rows',async()=>{
 const f=await populated(),before=f.reads;
 for(const p of [
  {...principal('client'),clientId:'C2'},
  {...principal('factory-operator'),factoryId:'F2'},
  {...principal('factory-technologist'),factoryId:'F2'},
  {...principal('brand'),brandId:'B2'},
  {...principal('partner'),partnerId:'P2'},
  {...principal('owner'),tenantId:'T2'},
  {...principal('owner'),sessionExpiresAtMs:now},
  {...principal('owner'),identitySource:'browser-state'}
 ]){
  const r=await f.service.read({principal:p,request:{orderId:'O1'}});
  assert.equal(r.accepted,false);assert.equal(r.order,undefined);
 }
 assert.equal(f.reads,before,'No event query before authorization');
});
test('read rejects role/scope overrides and does not create a missing head',async()=>{
 const f=fixture();
 assert.equal((await f.read('client')).code,'ORDER_MISSING');
 assert.equal(f.reads,0);
 for(const extra of [{role:'owner'},{tenantId:'T2'},{includePayments:true}]){
  const r=await f.service.read({principal:principal('client'),request:{orderId:'O1',...extra}});
  assert.equal(r.code,'INVALID_ORDER_REQUEST');
 }
});
test('tampered event chain prevents read for every role',async()=>{
 const f=await populated();f.rows[0].command.payload.name='Tampered';
 for(const role of ['client','brand','partner','factory-operator','factory-technologist','owner'])
  await assert.rejects(f.read(role),/JOURNAL_INTEGRITY_FAILURE/);
});
test('read projection mutations cannot alter stored events or later reads',async()=>{
 const f=await populated(),r=await f.read('client');
 r.order.config.width=999;r.order.messages[0].note='Altered';
 const next=(await f.read('client')).order;
 assert.notEqual(next.config.width,999);assert.equal(next.messages[0].note,'Shared customer note');
 assert.equal(next.version,6);
});
test('real journal rejects stale revisions, expired command and external production',async()=>{
 const f=await populated();
 const stale=await f.service.execute({principal:principal('client'),request:{orderId:'O1',
  requestId:'stale',expectedVersion:5,type:'message',payload:{note:'Old tab'},revisionId:'R1'}});
 assert.equal(stale.code,'STALE_ORDER_VERSION');
 assert.equal((await f.send('factory-operator','start',{},'R1')).code,'EXTERNAL_AUTHORITY_REQUIRED');
 const expired=await f.service.execute({principal:{...principal('client'),sessionExpiresAtMs:now},
  request:{orderId:'O1',requestId:'expired',expectedVersion:6,type:'message',payload:{note:'Expired'},revisionId:'R1'}});
 assert.equal(expired.accepted,false);assert.equal(f.rows.length,6);
});
test('order money preserves kopecks including odd advance and rejects invalid numeric inputs',()=>{
 const normalize=s=>s.replace(/[\s\u00a0\u202f]/g,'');
 assert.equal(normalize(orderMoney(200005)),'2000,05₽');
 assert.equal(normalize(orderMoney(100003)),'1000,03₽');
 assert.equal(normalize(orderMoney(0)),'0,00₽');
 assert.equal(normalize(orderMoney(Number.MAX_SAFE_INTEGER)),'90071992547409,91₽');
 for(const n of [-1,1.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1])
  assert.throws(()=>orderMoney(n),/INVALID_MONEY_KOPECKS/);
});
