import test from 'node:test';
import assert from 'node:assert/strict';
import {initialConfig} from '../src/domain.js';
import {appendOrderCommand,replayOrder,SERVER_FULFILLMENT_POLICY} from '../src/orderWorkflow.js';
import {getConceptPackoutPlan} from '../src/fulfillmentInspection.js';

function makeScenario(mandatory=true){
 const events=[],config=initialConfig('sofa');
 const send=(role,type,payload={},revisionId=null,extra={})=>{
  const command={id:'QA-MANDATORY-'+(events.length+1),at:'2026-11-22T12:00:00.000Z',
   role,type,payload,expectedVersion:events.length,
   ...(revisionId?{revisionId}:{}),...extra};
  const result=appendOrderCommand(events,command);
  events.splice(0,events.length,...result.events);
  return result.state;
 };
 send('client','create',{projectId:'QA-MANDATORY-SOFA',name:'Sofa test',config},null,
  mandatory?{fulfillmentPolicy:SERVER_FULFILLMENT_POLICY}:{});
 send('partner','assign_factory',{factoryId:'QA-FACTORY'});
 send('partner','prepare_spec',{
  config,technicalNote:'Concept QA frame, foam, textile, fittings',
  customerPriceKopecks:210005,factoryCostKopecks:100001,
  platformCommissionKopecks:40001,logisticsKopecks:10000,
  taxKopecks:5000,otherCostsKopecks:0,advanceBps:5000,
  dueDate:'2099-02-01',note:'Only design concept QA'
 });
 send('factory','confirm_spec',{reference:'QA-CONCEPT',note:'Concept only'},'S1');
 send('partner','offer',{note:'Proposed price pending confirmation'},'S1');
 send('client','accept',{},'R1');
 send('partner','record_payment',{amountKopecks:210005,reference:'UNVERIFIED-LOCAL-QA'},'R1');
 send('factory','start',{},'R1');
 send('factory','complete',{},'R1');
 send('factory','quality_pass',{reference:'QC-SELF-CLAIM-QA'},'R1');
 return {send,events,config,get state(){return replayOrder(events);}};
}
test('new server order must include independent recorded factory packing before ship',()=>{
 const f=makeScenario(true);
 assert.equal(f.state.fulfillmentPolicy,SERVER_FULFILLMENT_POLICY);
 assert.throws(()=>f.send('factory','ship',{carrier:'Demo',tracking:'T1',reference:'S1'},'R1'),
  /SHIPMENT_BLOCKED/);
 const plan=getConceptPackoutPlan(f.config);
 const packed=plan.lines.map(x=>({partRef:x.partRef,packedQty:x.expectedQty}));
 const result=f.send('factory','record_packout',{reference:'PACK-CHECK',note:'All projected pieces',lines:packed},'R1');
 assert.equal(result.packout.complete,true);
 assert.equal(f.send('factory','ship',{carrier:'Demo',tracking:'T1',reference:'S1'},'R1').stage,'shipped');
 f.send('factory','deliver',{reference:'POD-CLAIM'},'R1');
 assert.throws(()=>f.send('client','accept_delivery',{},'R1'),/ACCEPTANCE_BLOCKED/);
 const receipt=packed.map(x=>({partRef:x.partRef,receivedQty:x.packedQty,damagedQty:0}));
 assert.equal(f.send('client','record_receipt',{reference:'RECEIPT-CHECK',note:'Claimed delivered',lines:receipt},'R1').receipt.status,
  'matched_unverified');
 assert.equal(f.send('client','accept_delivery',{},'R1').stage,'closed');
 assert.equal(f.state.productionRelease.allowed,false);
});
test('legacy journals replay unchanged but cannot fake fulfillment marker on non-create actions',()=>{
 const f=makeScenario(false);
 assert.equal(f.state.fulfillmentPolicy,null);
 assert.equal(f.send('factory','ship',{carrier:'DEV',tracking:'OLD',reference:'OLD'},'R1').stage,'shipped');
 f.send('factory','deliver',{reference:'OLD-DELIVER'},'R1');
 assert.equal(f.send('client','accept_delivery',{},'R1').stage,'closed');
 const events=structuredClone(f.events);
 assert.deepEqual(replayOrder(events),f.state,'Legacy stored event list replays without migration');
 const forbidden={id:'FORGED-POLICY',at:'2026-11-22T12:00:00.000Z',role:'client',
  type:'message',payload:{channel:'shared',note:'No'},revisionId:'R1',
  expectedVersion:events.length,fulfillmentPolicy:SERVER_FULFILLMENT_POLICY};
 assert.throws(()=>appendOrderCommand(events,forbidden),/COMMAND_INVALID/);
 const illegalCreate={id:'NEW',at:'2026-11-22T12:00:00.000Z',role:'client',
  type:'create',payload:{projectId:'NEW',name:'Fake',config:initialConfig()},expectedVersion:0,
  fulfillmentPolicy:'BYPASS_REQUIRED_RECEIPT'};
 assert.throws(()=>appendOrderCommand([],illegalCreate),/COMMAND_INVALID/);
});
test('a shortage and accepted correction plan still require independent rereceipt',()=>{
 const f=makeScenario(true),plan=getConceptPackoutPlan(f.config);
 const packed=plan.lines.map(x=>({partRef:x.partRef,packedQty:x.expectedQty}));
 f.send('factory','record_packout',{reference:'PACK',note:'Full',lines:packed},'R1');
 f.send('factory','ship',{carrier:'Demo',tracking:'TRK',reference:'SHIP'},'R1');
 f.send('factory','deliver',{reference:'POD'},'R1');
 const receipt=packed.map(x=>({partRef:x.partRef,receivedQty:x.packedQty,damagedQty:0}));
 receipt[0].receivedQty--;
 f.send('client','record_receipt',{reference:'RECEIPT1',note:'Missing item',lines:receipt},'R1');
 assert.equal(f.state.stage,'disputed');
 f.send('partner','respond_issue',{note:'Replace missing',
   corrections:[{partRef:receipt[0].partRef,kind:'replace',quantity:1}]},'R1');
 f.send('client','confirm_resolution',{},'R1');
 assert.equal(f.state.stage,'delivered');
 assert.equal(f.state.receipt.status,'correction_pending_reinspection');
 assert.throws(()=>f.send('client','accept_delivery',{},'R1'),/ACCEPTANCE_BLOCKED/);
 receipt[0].receivedQty++;
 f.send('client','record_receipt',{reference:'RECEIPT2',note:'Rechecked',lines:receipt},'R1');
 assert.equal(f.state.issues.length,1);
 assert.equal(f.state.issues[0].reinspectionReceiptId,'RC2');
 assert.equal(f.state.issues[0].reinspectionOutcome,'REPORTED_MATCH_UNVERIFIED');
 assert.equal(f.state.issues[0].status,'reinspected_matched_unverified');
 assert.equal(f.state.receipts.length,2);
 assert.equal(f.send('client','accept_delivery',{},'R1').stage,'closed');
});

test('quality complaint after matched receipt still invalidates closure until customer reinspection',()=>{
 const f=makeScenario(true),plan=getConceptPackoutPlan(f.config);
 const packed=plan.lines.map(x=>({partRef:x.partRef,packedQty:x.expectedQty}));
 const receipt=packed.map(x=>({partRef:x.partRef,receivedQty:x.packedQty,damagedQty:0}));
 f.send('factory','record_packout',{reference:'PACK-Q',note:'Concept packing',lines:packed},'R1');
 f.send('factory','ship',{carrier:'Demo',tracking:'Q-TRK',reference:'SHIP-Q'},'R1');
 f.send('factory','deliver',{reference:'POD-Q'},'R1');
 f.send('client','record_receipt',{reference:'RECEIPT-Q1',note:'No missing groups',lines:receipt},'R1');
 assert.equal(f.state.receipt.status,'matched_unverified');
 f.send('client','report_issue',{note:'Visible upholstery seam defect after unpacking'},'R1');
 assert.equal(f.state.issue.requiresReinspection,true);
 f.send('factory','respond_issue',{note:'Offer a new upholstery repair inspection'},'R1');
 f.send('client','confirm_resolution',{},'R1');
 assert.equal(f.state.stage,'delivered');
 assert.equal(f.state.issue.status,'resolved_pending_reinspection');
 assert.equal(f.state.receipt.status,'correction_pending_reinspection');
 assert.throws(()=>f.send('client','accept_delivery',{},'R1'),/ACCEPTANCE_BLOCKED/);
 f.send('client','record_receipt',{reference:'RECEIPT-Q2',note:'Second independent inspection',lines:receipt},'R1');
 assert.equal(f.state.issues[0].reinspectionReceiptId,'RC2');
 assert.equal(f.state.issues[0].status,'reinspected_matched_unverified');
 assert.equal(f.state.issues[0].reinspectionAt,'2026-11-22T12:00:00.000Z');
 assert.equal(f.send('client','accept_delivery',{},'R1').stage,'closed');
});

test('failed reinspection preserves the original dispute and creates a distinct follow-up issue',()=>{
 const f=makeScenario(true),plan=getConceptPackoutPlan(f.config);
 const packed=plan.lines.map(x=>({partRef:x.partRef,packedQty:x.expectedQty}));
 f.send('factory','record_packout',{reference:'PACK-1',note:'Concept packing',lines:packed},'R1');
 f.send('factory','ship',{carrier:'Demo',tracking:'T-1',reference:'SHIP-1'},'R1');
 f.send('factory','deliver',{reference:'POD-1'},'R1');
 const missing=packed.map(x=>({partRef:x.partRef,receivedQty:x.packedQty,damagedQty:0}));
 missing[0].receivedQty--;
 f.send('client','record_receipt',{reference:'RECEIPT-1',note:'Missing',lines:missing},'R1');
 const fix=[{partRef:missing[0].partRef,kind:'replace',quantity:1}];
 f.send('partner','respond_issue',{note:'Replacement plan only',corrections:fix},'R1');
 f.send('client','confirm_resolution',{},'R1');
 f.send('client','record_receipt',{reference:'RECEIPT-2',note:'Still missing',lines:missing},'R1');
 assert.equal(f.state.stage,'disputed');
 assert.equal(f.state.receipts.length,2);
 assert.equal(f.state.issues.length,2);
 assert.equal(f.state.issues[0].reinspectionReceiptId,'RC2');
 assert.equal(f.state.issues[0].reinspectionOutcome,'REPORTED_DISCREPANCY');
 assert.equal(f.state.issues[0].status,'reinspected_still_disputed');
 assert.equal(f.state.issues[1].receiptId,'RC2');
 assert.equal(f.state.issues[1].status,'open');
 assert.throws(()=>f.send('client','accept_delivery',{},'R1'),/ACCEPTANCE_BLOCKED/);
});
