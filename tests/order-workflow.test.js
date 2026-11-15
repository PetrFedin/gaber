import test from 'node:test';
import assert from 'node:assert/strict';
import {initialConfig} from '../src/domain.js';
import {appendOrderCommand,replayOrder,orderFinancials,orderEngineering} from '../src/orderWorkflow.js';
import {ORDER_STORAGE_KEY,readOrderWorkspace,saveOrderCommand,exportOrderWorkspace} from '../src/orderStorage.js';

const cm={logisticsKopecks:1000,taxKopecks:500,otherCostsKopecks:250};
function scenario(){
 let events=[],seq=0;
 const cfg=initialConfig();
 const command=(role,type,payload={},overrides={})=>{
  const state=events.length?replayOrder(events):null;
  const id=['confirm_spec','return_spec','offer'].includes(type)
   ?state?.specs?.at(-1)?.id:state?.revisions.at(-1)?.id;
  return {id:'evt-'+(++seq),role,type,payload,at:'2026-10-30T00:00:00.000Z',
   expectedVersion:events.length,...(id&&type!=='prepare_spec'?{revisionId:id}:{}),...overrides};
 };
 const send=(role,type,payload={},overrides={})=>{
  const cmd=command(role,type,payload,overrides);
  const result=appendOrderCommand(events,cmd);
  events=result.events;return result.state;
 };
 send('client','create',{projectId:'p1',name:'Linea',config:cfg});
 const prepare=(priceKopecks=100001,config=cfg)=>send('partner','prepare_spec',{
  config,technicalNote:'Frame, joints, foam, textile, fittings and checks',
  customerPriceKopecks:priceKopecks,factoryCostKopecks:40000,
  platformCommissionKopecks:20000,...cm,advanceBps:5000,
  dueDate:'2027-02-01',note:'Factory documentation for quote'
 });
 const confirm=()=>send('factory','confirm_spec',{reference:'FACTORY-ACK',note:'Concept reviewed'});
 const offer=(priceKopecks=100001,config=cfg)=>{
  prepare(priceKopecks,config);confirm();
  return send('partner','offer',{note:'Customer offer after factory confirmation'});
 };
 const ready=()=>{
  offer();send('client','accept');
  send('partner','record_payment',{amountKopecks:100001,reference:'LOCAL-UNVERIFIED'});
  send('factory','start');send('factory','complete');
  return send('factory','quality_pass',{reference:'QC-LOCAL'});
 };
 return {send,command,offer,prepare,confirm,ready,
  get events(){return events},get state(){return replayOrder(events)}};
}
test('three-party protocol cannot publish before factory acknowledgement',()=>{
 const s=scenario();s.prepare();
 assert.equal(s.state.stage,'awaiting_factory');
 assert.equal(s.state.specs.length,1);
 assert.equal(s.state.specs[0].economics.platformCommissionKopecks,20000);
 assert.throws(()=>s.send('partner','offer',{note:'premature'}),/OFFER_INVALID/);
 assert.throws(()=>s.send('client','confirm_spec',{reference:'fake',note:'fake'}),/ROLE_FORBIDDEN/);
 s.send('factory','return_spec',{note:'Need better fastener drawings'});
 assert.equal(s.state.stage,'factory_changes');
 assert.throws(()=>s.send('partner','offer',{note:'after rejection'}),/OFFER_INVALID/);
 s.prepare(105001);s.confirm();s.send('partner','offer',{note:'Approved'});
 assert.equal(s.state.revisions[0].specId,'S2');
 assert.equal(s.state.stage,'offered');
 assert.equal(s.state.productionRelease.allowed,false);
});
test('final price, manufacturing cost and platform fee are not conflated',()=>{
 const s=scenario();s.offer(123457);
 const quote=s.state.specs[0].economics;
 assert.equal(quote.factoryCostKopecks,40000);
 assert.equal(quote.platformCommissionKopecks,20000);
 assert.equal(quote.plannedReserveKopecks,61707);
 assert.equal(s.state.revisions[0].priceKopecks,123457);
 assert.equal(quote.bankVerifiedKopecks,null);
 assert.equal(quote.earnedCommissionKopecks,null);
 assert.throws(()=>s.send('factory','record_payment',{amountKopecks:1,reference:'unauthorized'}),/ROLE_FORBIDDEN/);
 assert.throws(()=>s.send('client','prepare_spec',{}),/ROLE_FORBIDDEN/);
});
test('client claims do not fund order; advance is rounded up by one kopeck',()=>{
 const s=scenario();s.offer();s.send('client','accept');
 s.send('client','report_payment',{amountKopecks:100001,reference:'CLAIM'});
 assert.equal(orderFinancials(s.state).advanceKopecks,50001);
 assert.equal(orderFinancials(s.state).currentKopecks,0);
 assert.throws(()=>s.send('factory','start'),/START_BLOCKED/);
 s.send('partner','record_payment',{amountKopecks:50000,reference:'LOCAL-A'});
 assert.throws(()=>s.send('factory','start'),/START_BLOCKED/);
 s.send('partner','record_payment',{amountKopecks:1,reference:'LOCAL-B'});
 assert.equal(s.send('factory','start').stage,'production');
 assert.equal(s.state.productionRelease.allowed,false);
});
test('revision amendments reset customer consent and require explicit credit transfer',()=>{
 const s=scenario();s.offer();s.send('client','accept');
 s.send('partner','record_payment',{amountKopecks:60000,reference:'OLD-LOCAL'});
 s.send('client','request_change',{note:'Width 300'});
 s.offer(120000,{...initialConfig(),width:300});
 assert.equal(s.state.acceptedRevisionId,null);
 assert.equal(s.state.revisions[0].config.width,280);
 assert.equal(s.state.revisions[1].config.width,300);
 assert.throws(()=>s.send('client','accept',{}, {revisionId:'R1'}),/REVISION_MISMATCH/);
 s.send('client','accept');
 assert.equal(orderFinancials(s.state).currentKopecks,0);
 assert.throws(()=>s.send('partner','allocate_credit',{fromRevisionId:'R1',amountKopecks:60000}),/ROLE_FORBIDDEN/);
 s.send('client','allocate_credit',{fromRevisionId:'R1',amountKopecks:60000});
 assert.equal(orderFinancials(s.state).currentKopecks,60000);
 assert.equal(orderFinancials(s.state).priorCredits.length,0);
 assert.equal(s.state.acceptedRevisionId,'R2');
});
test('production local simulation retains QC, shipment, customer acceptance and disputes',()=>{
 const s=scenario();s.ready();
 s.send('factory','ship',{carrier:'DEMO',tracking:'TRACK',reference:'PACK'});
 s.send('factory','deliver',{reference:'POD'});
 s.send('client','report_issue',{note:'Check upholstery seam'});
 assert.equal(s.state.stage,'disputed');
 assert.throws(()=>s.send('client','accept_delivery'),/ACCEPTANCE_BLOCKED/);
 s.send('factory','respond_issue',{note:'First repair attempt'});
 s.send('client','reject_resolution',{note:'Need real inspection'});
 s.send('partner','respond_issue',{note:'Partner organized second inspection'});
 s.send('client','confirm_resolution');
 assert.equal(s.state.stage,'delivered');
 assert.equal(s.send('client','accept_delivery').stage,'closed');
 assert.equal(s.state.issues[0].rejections.length,1);
 assert.equal(orderEngineering(s.state).productionRelease.allowed,false);
 assert.equal(orderFinancials(s.state).verifiedBankKopecks,null);
});
test('duplicate, forged and stale commands never overwrite existing journal',()=>{
 const s=scenario();s.offer();const last=s.events.at(-1);
 assert.equal(appendOrderCommand(s.events,last).duplicate,true);
 assert.throws(()=>appendOrderCommand(s.events,{...last,payload:{note:'forged'}}),/COMMAND_CONFLICT/);
 const stale=s.command('client','accept');s.send('client','accept');
 assert.throws(()=>appendOrderCommand(s.events,stale),/STALE_ORDER/);
 assert.throws(()=>s.send('partner','record_payment',{amountKopecks:100002,reference:'too-much'}),/PAYMENT_EXCEEDS_BALANCE/);
});
function memory(){const values=new Map();return {getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};}
test('same local order reloads, detects stale writes and protects corrupt storage',()=>{
 const s=scenario(),store=memory(),original=readOrderWorkspace(store);
 const first=saveOrderCommand(store,original,'p1',s.events[0]);
 first.orders[0].events[0].payload.name='FORGED';
 assert.equal(readOrderWorkspace(store).orders[0].state.name,'Linea');
 s.prepare();const after=saveOrderCommand(store,first,'p1',s.events[1]);
 assert.equal(after.orders[0].state.stage,'awaiting_factory');
 assert.throws(()=>saveOrderCommand(store,original,'p1',s.events[1]),/STALE_WORKSPACE/);
 store.setItem(ORDER_STORAGE_KEY,'{broken');
 assert.equal(readOrderWorkspace(store).status,'blocked');
 assert.equal(JSON.parse(exportOrderWorkspace(store)).raw,'{broken');
});

test('the immutable reducer rejects a forged bilateral channel even without HTTP admission',()=>{
 const x=scenario();
 x.send('client','message',{note:'Private client note',channel:'client_partner'});
 x.send('factory','message',{note:'Private factory note',channel:'factory_partner'});
 x.send('partner','message',{note:'Reply to client',channel:'client_partner'});
 x.send('partner','message',{note:'Reply to factory',channel:'factory_partner'});
 x.send('partner','message',{note:'Shared update',channel:'shared'});
 assert.deepEqual(x.state.messages.map(m=>m.channel),[
  'client_partner','factory_partner','client_partner','factory_partner','shared'
 ]);
 const before=x.events.length;
 for(const [role,channel] of [
  ['client','factory_partner'],['factory','client_partner'],
  ['partner','unknown'],['client',null],['factory','client_factory']
 ]){
  assert.throws(()=>x.send(role,'message',{note:'Spoofed',channel}),/MESSAGE_CHANNEL_FORBIDDEN/);
  assert.equal(x.events.length,before,'Blocked message must not create an event');
 }
 x.send('client','message',{note:'Legacy shared message'});
 assert.equal(x.state.messages.at(-1).channel,'shared');
 assert.equal(x.state.productionRelease.allowed,false);
});

test('factory assignment is a single immutable operator event, never a customer selection',()=>{
 const s=scenario();
 assert.equal(s.state.assignedFactoryId,null);
 assert.throws(()=>s.send('client','assign_factory',{factoryId:'F1'}),/ROLE_FORBIDDEN/);
 assert.throws(()=>s.send('factory','assign_factory',{factoryId:'F1'}),/ROLE_FORBIDDEN/);
 assert.throws(()=>s.send('partner','assign_factory',{factoryId:'not valid id'}),/FACTORY_ASSIGNMENT_INVALID/);
 const version=s.state.version;
 s.send('partner','assign_factory',{factoryId:'FACTORY-A'});
 assert.equal(s.state.version,version+1);
 assert.equal(s.state.assignedFactoryId,'FACTORY-A');
 assert.throws(()=>s.send('partner','assign_factory',{factoryId:'FACTORY-B'}),/FACTORY_ASSIGNMENT_INVALID/);
 s.offer();
 assert.equal(s.state.assignedFactoryId,'FACTORY-A');
 assert.equal(s.state.productionRelease.allowed,false);
});

test('DEV provenance survives reducer replay without allowing arbitrary labels',()=>{
 const s=scenario();
 s.offer();
 s.send('client','accept');
 s.send('partner','record_payment',{amountKopecks:50001,reference:'LOCAL-DEV'});
 assert.throws(()=>s.send('client','message',{note:'hello'}, {executionMode:'DEV_SIMULATED_EXTERNAL_AUTHORITY'}),/COMMAND_INVALID/);
 assert.throws(()=>s.send('factory','start',{}, {executionMode:'BANK_CONFIRMED'}),/COMMAND_INVALID/);
 const state=s.send('factory','start',{}, {executionMode:'DEV_SIMULATED_EXTERNAL_AUTHORITY'});
 assert.equal(state.stage,'production');
 assert.equal(s.events.at(-1).executionMode,'DEV_SIMULATED_EXTERNAL_AUTHORITY');
 assert.equal(replayOrder(s.events).stage,'production');
});
