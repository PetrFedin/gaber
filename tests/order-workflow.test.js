import test from 'node:test';
import assert from 'node:assert/strict';
import {initialConfig} from '../src/domain.js';
import {appendOrderCommand,replayOrder,orderFinancials,orderEngineering} from '../src/orderWorkflow.js';
import {ORDER_STORAGE_KEY,readOrderWorkspace,saveOrderCommand,exportOrderWorkspace} from '../src/orderStorage.js';

function scenario(){
 let events=[],seq=0;
 const command=(role,type,payload={},overrides={})=>({id:'e'+(++seq),role,type,payload,at:'2026-10-23T17:00:00.000Z',expectedVersion:events.length,
  ...(events.length&&replayOrder(events).revisions.length&&type!=='offer'?{revisionId:replayOrder(events).revisions.at(-1).id}:{}),...overrides});
 const send=(role,type,payload={},overrides={})=>{
  const c=command(role,type,payload,overrides),result=appendOrderCommand(events,c);events=result.events;return result.state;
 };
 send('client','create',{projectId:'p1',name:'Sofa',config:initialConfig()});
 const offer=(priceKopecks=100001,advanceBps=5000,config=initialConfig())=>send('factory','offer',{config,priceKopecks,advanceBps,dueDate:'2026-12-01',note:'TEST proposal'});
 const ready=()=>{offer();send('client','accept');send('factory','record_payment',{amountKopecks:100001,reference:'BANK-LOCAL-1'});send('factory','start');send('factory','complete');return send('factory','quality_pass',{reference:'QC-LOCAL'});};
 return {send,command,offer,ready,get events(){return events;},get state(){return replayOrder(events);}};
}
test('full two-party local order lifecycle and reload preserve engineering HOLD',()=>{
 const a=scenario();a.ready();
 a.send('factory','ship',{carrier:'TEST carrier',tracking:'TEST shipment',reference:'TEST packing list'});
 a.send('factory','deliver',{reference:'TEST delivery'});
 const result=a.send('client','accept_delivery');
 assert.equal(result.stage,'closed');assert.deepEqual(replayOrder(a.events),result);
 assert.equal(result.productionRelease.allowed,false);
 assert.equal(orderEngineering(result).productionRelease.allowed,false);
 assert.equal(orderEngineering(result).integrityOk,true);
 assert.equal(orderFinancials(result).verifiedBankKopecks,null);
});
test('client claims never fund the order or allow start; advance rounds up exactly',()=>{
 const a=scenario();a.offer();a.send('client','accept');
 a.send('client','report_payment',{amountKopecks:100001,reference:'CLIENT-CLAIM'});
 assert.equal(orderFinancials(a.state).advanceKopecks,50001);
 assert.equal(orderFinancials(a.state).currentKopecks,0);
 assert.throws(()=>a.send('factory','start'),/START_BLOCKED/);
 a.send('factory','record_payment',{amountKopecks:50000,reference:'ONE'});
 assert.throws(()=>a.send('factory','start'),/START_BLOCKED/);
 a.send('factory','record_payment',{amountKopecks:1,reference:'TWO'});
 assert.equal(a.send('factory','start').stage,'production');
});
test('amendment resets consent and needs explicit allocation of prior funds',()=>{
 const a=scenario();a.offer();a.send('client','accept');
 a.send('factory','record_payment',{amountKopecks:60000,reference:'OLD-ADVANCE'});
 a.send('client','request_change',{note:'Wider sofa'});
 a.offer(120000,5000,{...initialConfig(),width:300});
 assert.equal(a.state.acceptedRevisionId,null);
 assert.equal(a.state.revisions[0].config.width,280);
 assert.equal(orderEngineering(a.state).config.width,300);
 assert.equal(orderFinancials(a.state).currentKopecks,0);
 assert.throws(()=>a.send('factory','start'),/START_BLOCKED/);
 a.send('client','accept');
 assert.throws(()=>a.send('factory','allocate_credit',{fromRevisionId:'R1',amountKopecks:60000}),/ROLE_FORBIDDEN/);
 a.send('client','allocate_credit',{fromRevisionId:'R1',amountKopecks:60000});
 const f=orderFinancials(a.state);
 assert.equal(f.currentKopecks,60000);assert.equal(f.totalRecordedKopecks,60000);assert.equal(f.priorCredits.length,0);
 assert.throws(()=>a.send('client','allocate_credit',{fromRevisionId:'R1',amountKopecks:1}),/CREDIT_INVALID/);
 assert.equal(a.send('factory','start').stage,'production');
});
test('old revisions and stale commands cannot approve replacement terms',()=>{
 const a=scenario();a.offer();const stale=a.command('client','accept');a.offer(110000);
 assert.throws(()=>appendOrderCommand(a.events,stale),/STALE_ORDER/);
 assert.throws(()=>a.send('client','accept',{}, {revisionId:'R1'}),/REVISION_MISMATCH/);
 assert.throws(()=>a.send('factory','accept'),/ROLE_FORBIDDEN/);
});
test('production blocks late amendments; shipment needs QC and full balance',()=>{
 const a=scenario();a.offer();a.send('client','accept');
 a.send('factory','record_payment',{amountKopecks:50001,reference:'ADVANCE'});a.send('factory','start');
 assert.throws(()=>a.offer(),/OFFER_INVALID/);
 assert.throws(()=>a.send('client','request_change',{note:'Too late'}),/CHANGE_FORBIDDEN/);
 assert.throws(()=>a.send('factory','ship',{carrier:'c',tracking:'t',reference:'r'}),/SHIPMENT_BLOCKED/);
 a.send('factory','complete');a.send('factory','quality_pass',{reference:'QC'});
 assert.throws(()=>a.send('factory','ship',{carrier:'c',tracking:'t',reference:'r'}),/SHIPMENT_BLOCKED/);
 a.send('factory','record_payment',{amountKopecks:50000,reference:'FINAL'});
 assert.equal(a.send('factory','ship',{carrier:'c',tracking:'t',reference:'r'}).stage,'shipped');
});
test('duplicate references and overpayment are rejected across the journal',()=>{
 const a=scenario();a.offer();a.send('client','accept');
 a.send('factory','record_payment',{amountKopecks:50000,reference:' Bank-1 '});
 assert.throws(()=>a.send('factory','record_payment',{amountKopecks:1,reference:'bank-1'}),/PAYMENT_DUPLICATE/);
 assert.throws(()=>a.send('factory','record_payment',{amountKopecks:50002,reference:'bank-2'}),/PAYMENT_EXCEEDS_BALANCE/);
});
test('idempotency retries are harmless; reused command IDs with changed data fail',()=>{
 const a=scenario();a.offer();const last=a.events.at(-1);
 const retry=appendOrderCommand(a.events,last);assert.equal(retry.duplicate,true);assert.equal(retry.events.length,2);
 assert.throws(()=>appendOrderCommand(a.events,{...last,payload:{...last.payload,note:'changed'}}),/COMMAND_CONFLICT/);
});
test('delivery does not mean client acceptance; an issue cannot silently close',()=>{
 const a=scenario();a.ready();a.send('factory','ship',{carrier:'c',tracking:'t',reference:'r'});
 a.send('factory','deliver',{reference:'POD'});assert.equal(a.state.stage,'delivered');
 a.send('client','report_issue',{note:'Damaged seam'});
 assert.equal(a.state.stage,'disputed');assert.throws(()=>a.send('client','accept_delivery'),/ACCEPTANCE_BLOCKED/);
 assert.throws(()=>a.send('factory','deliver',{reference:'overwrite'}),/DELIVERY_BLOCKED/);
});
test('shared messages retain author and revision; bad config and chronology fail',()=>{
 const a=scenario();a.send('client','message',{note:'Can you clarify?'});a.offer();a.send('factory','message',{note:'Updated details'});
 assert.equal(a.state.messages[0].revisionId,null);assert.equal(a.state.messages[1].revisionId,'R1');
 assert.throws(()=>a.send('factory','offer',{config:{...initialConfig(),width:-1},priceKopecks:100,advanceBps:0,dueDate:'2026-12-01',note:'bad'}),/CONFIG_INVALID/);
 assert.throws(()=>a.send('client','accept',{}, {at:'2026-10-22T17:00:00.000Z'}),/TIME_REVERSED/);
});
function memory(){const values=new Map();return {getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};}
test('one journal reloads into both cabinets and refuses stale writers',()=>{
 const a=scenario(),store=memory(),old=readOrderWorkspace(store);
 const saved=saveOrderCommand(store,old,'p1',a.events[0]);
 saved.orders[0].state.stage='closed';saved.orders[0].events[0].payload.name='forged';
 const offer=a.offer();const updated=saveOrderCommand(store,saved,'p1',a.events[1]);
 assert.equal(updated.orders[0].state.stage,offer.stage);assert.equal(updated.orders[0].state.name,'Sofa');
 assert.throws(()=>saveOrderCommand(store,old,'p1',a.events[1]),/STALE_WORKSPACE/);
 assert.deepEqual(readOrderWorkspace(store).orders,updated.orders);
});
test('malformed storage is exported exactly and never overwritten',()=>{
 const store=memory();store.setItem(ORDER_STORAGE_KEY,'{broken');const s=readOrderWorkspace(store);
 assert.equal(s.status,'blocked');assert.equal(JSON.parse(exportOrderWorkspace(store)).raw,'{broken');
 assert.throws(()=>saveOrderCommand(store,s,'p1',scenario().events[0]),/ORDER_STORAGE_BLOCKED/);
 assert.equal(store.getItem(ORDER_STORAGE_KEY),'{broken');
});
test('storage quota/readback errors do not report success',()=>{
 const a=scenario(),store=memory(),s=readOrderWorkspace(store);
 store.setItem=()=>{throw Error('quota');};assert.throws(()=>saveOrderCommand(store,s,'p1',a.events[0]),/quota/);
 const wrong=memory(),w=readOrderWorkspace(wrong);wrong.setItem=()=>{};
 assert.throws(()=>saveOrderCommand(wrong,w,'p1',a.events[0]),/ORDER_STORAGE_VERIFY_FAILED/);
});
test('order IDs and injected payload fields cannot cross link another project',()=>{
 const a=scenario(),store=memory();
 assert.throws(()=>saveOrderCommand(store,readOrderWorkspace(store),'other',a.events[0]),/ORDER_ID_MISMATCH/);
 assert.throws(()=>a.send('client','message',{note:'hello',approved:true}),/COMMAND_INVALID/);
});
