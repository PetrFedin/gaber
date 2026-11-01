import test from 'node:test';
import assert from 'node:assert/strict';
import {createOrderJournalService} from '../server/orderJournalService.js';
import {admitOrderCommand} from '../server/orderCommandAdmission.js';
import {appendOrderCommand,replayOrder} from '../src/orderWorkflow.js';
import {initialConfig} from '../src/domain.js';

const now=Date.parse('2026-10-30T01:00:00Z');
const resource={source:'server-repository',tenantId:'T1',orderId:'O1',
 clientId:'C1',factoryId:'F1'};
const principal=role=>({identitySource:'server-session',authenticated:true,
 tenantId:'T1',subject:'U-'+role,roles:[role],clientId:'C1',factoryId:'F1',
 sessionExpiresAtMs:now+60000,mfaVerified:true});
const spec=config=>({config,customerPriceKopecks:200005,factoryCostKopecks:100001,
 platformCommissionKopecks:40001,logisticsKopecks:10000,taxKopecks:5000,
 otherCostsKopecks:0,technicalNote:'Assembly drawings, frame, foam, upholstery',
 advanceBps:5000,dueDate:'2027-02-01',note:'Factory-reviewed proposal'});
function fixture(){
 let head=null,rows=[],readCount=0,n=0;
 const repository={async withOrderTransaction(scope,work){
  const draft={head:structuredClone(head),rows:structuredClone(rows)};
  const result=await work({
   getResourceForUpdate:async()=>scope.tenantId==='T1'&&scope.orderId==='O1'?resource:null,
   isFactoryApproved:async({factoryId})=>scope.tenantId==='T1'&&factoryId==='F1',
   getHeadForUpdate:async()=>draft.head,
   getEvents:async()=>{readCount++;return structuredClone(draft.rows)},
   ensureHead:async()=>{draft.head={version:0,headHash:null}},
   appendEvent:async x=>draft.rows.push(structuredClone(x)),
   advanceHead:async({expectedVersion,nextVersion,headHash})=>{
    if(draft.head.version!==expectedVersion)return false;
    draft.head={version:nextVersion,headHash};return true;
   }
  });
  head=draft.head;rows=draft.rows;return result;
 }};
 const service=createOrderJournalService({repository,admission:admitOrderCommand,
  reducer:{appendOrderCommand,replayOrder},clock:()=>now});
 const send=(role,type,payload={},revisionId)=>service.execute({
  principal:principal(role),request:{orderId:'O1',requestId:'E'+(++n),
   expectedVersion:head?.version??0,type,payload,...(revisionId?{revisionId}:{})}
 });
 const read=role=>service.read({principal:principal(role),request:{orderId:'O1'}});
 return {send,read,service,get rows(){return rows},get reads(){return readCount}};
}
async function seeded(){
 const f=fixture(),config=initialConfig();
 for(const r of [
  await f.send('client','create',{projectId:'O1',name:'Private sofa',config}),
  await f.send('partner','prepare_spec',spec(config)),
  await f.send('factory','confirm_spec',{reference:'FACTORY-ACK',note:'Draft checked'},'S1'),
  await f.send('partner','offer',{note:'Client price after confirmation'},'S1'),
  await f.send('client','accept',{},'R1'),
  await f.send('client','report_payment',{amountKopecks:100003,reference:'Claim'},'R1'),
  await f.send('partner','record_payment',{amountKopecks:100003,reference:'Local record'},'R1'),
  await f.send('factory','message',{note:'Fabric test pending'},'R1')
 ])assert.equal(r.accepted,true,JSON.stringify(r));
 return f;
}
test('three role DTOs reference one order but isolate factory cost and partner commission',async()=>{
 const f=await seeded();
 const client=(await f.read('client')).order;
 const factory=(await f.read('factory')).order;
 const partner=(await f.read('partner')).order;
 for(const dto of [client,factory,partner]){
  assert.equal(dto.version,8);assert.equal(dto.revisionId,'R1');
  assert.equal(dto.stage,'accepted');assert.equal(dto.productionRelease.allowed,false);
 }
 assert.equal(client.offer.priceKopecks,200005);
 assert.equal(client.finance.advanceKopecks,100003);
 assert.equal(client.finance.balanceKopecks,100002);
 assert.equal(client.finance.verifiedBankKopecks,null);
 for(const field of ['economics','proposals','factoryTask','payments','operatorScope'])
  assert.equal(Object.hasOwn(client,field),false,field);
 assert.equal(factory.factoryTask.factoryCostKopecks,100001);
 assert.equal(factory.factoryTask.technicalNote,'Assembly drawings, frame, foam, upholstery');
 assert.ok(factory.factoryTask.parts.length>0);
 assert.equal(factory.factoryTask.productionRelease.allowed,false);
 for(const field of ['offer','economics','proposals','finance','payments','paymentClaims'])
  assert.equal(Object.hasOwn(factory,field),false,field);
 assert.equal(partner.economics.platformCommissionKopecks,40001);
 assert.equal(partner.economics.customerPriceKopecks,200005);
 assert.equal(partner.economics.factoryCostKopecks,100001);
 assert.equal(partner.payments[0].authority,'LOCAL_UNVERIFIED_RECORD');
 assert.equal(partner.finance.verifiedBankKopecks,null);
 assert.equal(partner.operatorScope,'TENANT_OPERATIONS');
 assert.equal(partner.messages[0].note,'Fabric test pending');
});
test('wrong client/factory/tenant, legacy roles and expired session cannot fetch events',async()=>{
 const f=await seeded(),before=f.reads;
 for(const actor of [
  {...principal('client'),clientId:'C2'},
  {...principal('factory'),factoryId:'F2'},
  {...principal('partner'),tenantId:'T2'},
  {...principal('partner'),roles:['partner','client']},
  {...principal('partner'),roles:['owner']},
  {...principal('partner'),sessionExpiresAtMs:now},
  {...principal('partner'),identitySource:'browser-state'}
 ]){
  const r=await f.service.read({principal:actor,request:{orderId:'O1'}});
  assert.equal(r.accepted,false);assert.equal(r.order,undefined);
 }
 assert.equal(f.reads,before,'events must be fetched only after membership check');
});
test('client cannot forge partner finance or factory approval through server command',async()=>{
 const f=await seeded();
 const read=(await f.read('partner')).order;
 assert.equal(read.version,8);
 const forge=await f.send('client','prepare_spec',spec(initialConfig()));
 assert.equal(forge.accepted,false);
 const factoryWrites=await f.send('factory','record_payment',{amountKopecks:1,reference:'fake'},'R1');
 assert.equal(factoryWrites.accepted,false);
 const premature=await f.send('factory','start',{},'R1');
 assert.equal(premature.code,'EXTERNAL_AUTHORITY_REQUIRED');
 const stale=await f.service.execute({principal:principal('client'),request:{
  orderId:'O1',requestId:'stale',expectedVersion:7,type:'accept',payload:{},revisionId:'R1'
 }});
 assert.equal(stale.code,'STALE_ORDER_VERSION');
 assert.equal((await f.read('partner')).order.version,8);
});
test('mutating an authorized DTO cannot affect immutable journal',async()=>{
 const f=await seeded(),first=(await f.read('partner')).order;
 first.economics.factoryCostKopecks=999;
 first.factoryTask.parts[0].nominalSizeMm.length=999;
 first.messages[0].note='Forged';
 const again=(await f.read('partner')).order;
 assert.equal(again.economics.factoryCostKopecks,100001);
 assert.equal(again.messages[0].note,'Fabric test pending');
});
test('tampering an event defeats all three role projections',async()=>{
 const f=await seeded();f.rows[1].command.payload.customerPriceKopecks=1;
 for(const role of ['client','factory','partner'])
  await assert.rejects(f.read(role),/JOURNAL_INTEGRITY_FAILURE/);
});
test('an unavailable order or forbidden requested fields cannot create read results',async()=>{
 const f=fixture();
 assert.equal((await f.read('client')).code,'ORDER_MISSING');
 for(const field of ['role','includeEconomics','actorId']){
  const result=await f.service.read({principal:principal('client'),request:{orderId:'O1',[field]:'partner'}});
  assert.equal(result.code,'INVALID_ORDER_REQUEST');
 }
});

test('client-facing price and due date are revoked until S2 is published as R2',async()=>{
 const f=await seeded();
 const before=(await f.read('client')).order;
 assert.equal(before.offer.priceKopecks,200005);
 assert.equal(before.offerStatus,'PUBLISHED_CONCEPT');
 let result=await f.send('client','request_change',{note:'Wider model'},'R1');
 assert.equal(result.accepted,true);
 let client=(await f.read('client')).order;
 assert.equal(client.stage,'change_requested');
 assert.equal(client.revisionId,null);
 assert.equal(client.dueDate,null);
 assert.equal(client.offer,null);
 assert.equal(client.offerStatus,'AWAITING_NEW_CONFIRMED_OFFER');
 assert.equal(client.finance.customerPriceKopecks,null);
 assert.equal(client.finance.advanceDueKopecks,null);
 assert.equal(client.finance.balanceKopecks,null);
 assert.equal(client.acceptedRevisionId,null);
 assert.equal(client.configurationStatus,'HISTORICAL_OR_ORIGINAL_UNPRICED');
 assert.equal(JSON.stringify(client).includes('40001'),false);
 const config={...initialConfig(),width:300};
 result=await f.send('partner','prepare_spec',spec(config));assert.equal(result.accepted,true);
 client=(await f.read('client')).order;
 assert.equal(client.stage,'awaiting_factory');
 assert.equal(client.offer,null);
 assert.equal(client.config.width,initialConfig().width,
  'Unpublished factory design must not be shown as current customer configuration');
 const factory=(await f.read('factory')).order;
 assert.equal(factory.factoryTask.specId,'S2');
 assert.equal(factory.factoryTask.sourceConfig.width,300);
 const partner=(await f.read('partner')).order;
 assert.equal(partner.economics.platformCommissionKopecks,40001);
 result=await f.send('factory','confirm_spec',{reference:'ACK-S2',note:'Concept checked'},'S2');
 assert.equal(result.accepted,true);
 client=(await f.read('client')).order;
 assert.equal(client.offer,null,'Factory confirmation alone does not republish a price');
 result=await f.send('partner','offer',{note:'New approved quote'},'S2');
 assert.equal(result.accepted,true);
 client=(await f.read('client')).order;
 assert.equal(client.revisionId,'R2');
 assert.equal(client.offerStatus,'PUBLISHED_CONCEPT');
 assert.equal(client.offer.priceKopecks,200005);
 assert.equal(client.config.width,300);
 assert.equal(client.acceptedRevisionId,null,'Client must consent to R2 separately');
});

test('operator sees both bilateral dialogues; client and factory never receive the other private channel',async()=>{
 const f=await seeded();
 for(const [role,note,channel] of [
  ['client','Customer private fabric request','client_partner'],
  ['factory','Factory supplier cost issue','factory_partner'],
  ['partner','Private reply to factory','factory_partner'],
  ['partner','Private reply to customer','client_partner'],
  ['partner','Three-way delivery update','shared']
 ]){
  const r=await f.send(role,'message',{note,channel},'R1');
  assert.equal(r.accepted,true,JSON.stringify(r));
 }
 const client=(await f.read('client')).order;
 const factory=(await f.read('factory')).order;
 const partner=(await f.read('partner')).order;
 assert.deepEqual(client.messages.map(x=>x.note),[
  'Fabric test pending','Customer private fabric request',
  'Private reply to customer','Three-way delivery update'
 ]);
 assert.deepEqual(factory.messages.map(x=>x.note),[
  'Fabric test pending','Factory supplier cost issue',
  'Private reply to factory','Three-way delivery update'
 ]);
 assert.deepEqual(partner.messages.map(x=>x.note),[
  'Fabric test pending','Customer private fabric request',
  'Factory supplier cost issue','Private reply to factory',
  'Private reply to customer','Three-way delivery update'
 ]);
 assert.equal(JSON.stringify(client).includes('Factory supplier cost issue'),false);
 assert.equal(JSON.stringify(factory).includes('Customer private fabric request'),false);
 assert.equal(client.productionRelease.allowed,false);
 assert.equal(factory.productionRelease.allowed,false);
});
