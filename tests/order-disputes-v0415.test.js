import test from 'node:test';
import assert from 'node:assert/strict';
import {initialConfig} from '../src/domain.js';
import {appendOrderCommand,replayOrder,orderFinancials,orderEngineering} from '../src/orderWorkflow.js';
const initial=Date.parse('2026-10-24T09:00:00Z');
function scenario(){
 let events=[],seq=0;
 function send(role,type,payload={},revision=true){
  const state=events.length?replayOrder(events):null;
  const command={id:'dispute-'+(++seq),at:new Date(initial+seq*1000).toISOString(),
   role,type,payload,expectedVersion:events.length};
  if(revision&&['confirm_spec','return_spec','offer'].includes(type)&&state?.specs?.length)command.revisionId=state.specs.at(-1).id;
  else if(revision&&state?.revisions.length)command.revisionId=state.revisions.at(-1).id;
  const result=appendOrderCommand(events,command);events=result.events;return result.state;
 }
 const config=initialConfig();
 send('client','create',{projectId:'p1',name:'Linea sofa',config},false);
 send('partner','prepare_spec',{config,customerPriceKopecks:100001,
  factoryCostKopecks:50000,platformCommissionKopecks:15000,
  logisticsKopecks:1500,taxKopecks:500,otherCostsKopecks:0,
  technicalNote:'Factory draft, joint and stitching checks',
  advanceBps:5000,dueDate:'2026-12-01',note:'Test offer'},false);
 send('factory','confirm_spec',{reference:'FACTORY-ACK',note:'Accepted concept'});
 send('partner','offer',{note:'Published after factory check'});
 send('client','accept');
 send('partner','record_payment',{amountKopecks:100001,reference:'LOCAL-DEMO-001'});
 send('factory','start');send('factory','complete');
 send('factory','quality_pass',{reference:'QC-DEMO'});
 send('factory','ship',{carrier:'DEMO',tracking:'SHIP-01',reference:'PACK-01'});
 return {send,get events(){return events;},get state(){return replayOrder(events);}};
}
test('client-to-factory issue loop supports rejection and preserves complete history',()=>{
 const s=scenario();
 s.send('client','report_issue',{note:'Packing list is missing'});
 assert.equal(s.state.stage,'disputed');
 assert.equal(s.state.issue.status,'open');
 assert.throws(()=>s.send('client','confirm_resolution'),/ISSUE_CONFIRMATION_BLOCKED/);
 assert.throws(()=>s.send('client','respond_issue',{note:'Forged response'}),/ROLE_FORBIDDEN/);
 s.send('factory','respond_issue',{note:'We will provide the signed packing list'});
 assert.equal(s.state.issue.status,'response_proposed');
 assert.throws(()=>s.send('factory','confirm_resolution'),/ROLE_FORBIDDEN/);
 s.send('client','reject_resolution',{note:'Signed document not received'});
 assert.equal(s.state.issue.status,'open');
 assert.equal(s.state.issue.rejections.length,1);
 s.send('factory','respond_issue',{note:'Signed replacement is attached in factory archive'});
 const resolved=s.send('client','confirm_resolution');
 assert.equal(resolved.stage,'shipped');
 assert.equal(resolved.issues[0].status,'resolved');
 assert.equal(resolved.issues[0].rejections[0].note,'Signed document not received');
 assert.deepEqual(replayOrder(s.events),resolved);
 assert.equal(resolved.productionRelease.allowed,false);
 assert.equal(orderEngineering(resolved).productionRelease.allowed,false);
 assert.equal(orderFinancials(resolved).verifiedBankKopecks,null);
});
test('second issue after delivery can resolve and leave customer acceptance explicit',()=>{
 const s=scenario();
 s.send('factory','deliver',{reference:'DELIVERED-LOCAL'});
 s.send('client','report_issue',{note:'Upholstery mismatch'});
 s.send('factory','respond_issue',{note:'Repair was proposed'});
 s.send('client','confirm_resolution');
 assert.equal(s.state.stage,'delivered');
 assert.equal(s.state.issues[0].status,'resolved');
 s.send('client','report_issue',{note:'Seam needs inspection'});
 assert.equal(s.state.issues.length,2);
 s.send('factory','respond_issue',{note:'Second inspection planned'});
 s.send('client','confirm_resolution');
 assert.equal(s.state.stage,'delivered');
 assert.equal(s.send('client','accept_delivery').stage,'closed');
 assert.equal(s.state.issues.filter(i=>i.status==='resolved').length,2);
});
test('open issues cannot silently close, ship or change commercial revision',()=>{
 const s=scenario();
 s.send('client','report_issue',{note:'Missing parts'});
 assert.throws(()=>s.send('client','accept_delivery'),/ACCEPTANCE_BLOCKED/);
 assert.throws(()=>s.send('factory','ship',{carrier:'X',tracking:'Y',reference:'Z'}),/SHIPMENT_BLOCKED/);
 assert.throws(()=>s.send('partner','prepare_spec',{config:initialConfig(),
  customerPriceKopecks:200000,factoryCostKopecks:50000,platformCommissionKopecks:10000,
  logisticsKopecks:1000,taxKopecks:0,otherCostsKopecks:0,
  advanceBps:5000,dueDate:'2026-12-01',technicalNote:'Late revision',note:'Invalid'},false),/SPEC_INVALID/);
 assert.equal(s.state.stage,'disputed');
 assert.equal(s.state.productionRelease.allowed,false);
});

test('only factory or operator can propose resolution, never client impersonating the respondent',()=>{
 const s=scenario();
 s.send('client','report_issue',{note:'Need delivery clarification'});
 const version=s.state.version,entries=s.events.length;
 assert.throws(()=>s.send('client','respond_issue',{note:'Customer forged operator outcome'}),/ROLE_FORBIDDEN/);
 assert.equal(s.events.length,entries);
 assert.equal(s.state.version,version);
 assert.equal(s.state.issue.status,'open');
 s.send('partner','respond_issue',{note:'GABER operator proposes a documented response'});
 assert.equal(s.state.issue.status,'response_proposed');
 assert.equal(s.send('client','confirm_resolution').stage,'shipped');
 assert.equal(s.state.productionRelease.allowed,false);
});
