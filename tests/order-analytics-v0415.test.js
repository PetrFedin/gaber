import test from 'node:test';
import assert from 'node:assert/strict';
import {initialConfig} from '../src/domain.js';
import {appendOrderCommand,replayOrder} from '../src/orderWorkflow.js';
import {analyzeOrderPortfolio,ORDER_PORTFOLIO_SCHEMA} from '../src/orderAnalytics.js';
function fixture(){
 let events=[],id=0;
 const send=(role,type,payload={},revision=true)=>{
  const state=events.length?replayOrder(events):null;
  const command={id:'analytics-'+(++id),at:new Date(Date.parse('2026-10-24T10:00:00Z')+id*1000).toISOString(),
   role,type,payload,expectedVersion:events.length};
  if(revision&&state?.revisions.length)command.revisionId=state.revisions.at(-1).id;
  events=appendOrderCommand(events,command).events;
 };
 const c=initialConfig();
 send('client','create',{projectId:'p-1',name:'Sofa',config:c},false);
 send('factory','offer',{config:c,priceKopecks:205005,advanceBps:4000,
   dueDate:'2026-10-25',note:'Demo quote'},false);
 send('client','accept');
 send('factory','record_payment',{amountKopecks:82002,reference:'Local record'});
 return {status:'ready',orders:[{id:'p-1',state:replayOrder(events)}]};
}
test('portfolio reconciles kopecks, due dates, linked projects and pending actors',()=>{
 const r=analyzeOrderPortfolio(fixture(),
  [{id:'p-1',status:'requested'},{id:'not-linked',status:'requested'}],'2026-10-26');
 assert.equal(r.schemaVersion,ORDER_PORTFOLIO_SCHEMA);
 assert.equal(r.metrics.orders,1);assert.equal(r.metrics.overdue,1);
 assert.equal(r.metrics.awaitingFactory,1);
 assert.equal(r.metrics.unlinkedSubmittedProjects,1);
 assert.equal(r.metrics.financialReconciliationFailures,0);
 assert.equal(r.totals.offeredKopecks,205005);
 assert.equal(r.totals.locallyRecordedCurrentKopecks,82002);
 assert.equal(r.totals.bankVerifiedKopecks,null);
 assert.equal(r.totals.actualRevenueKopecks,null);
 assert.equal(r.rows[0].productionRelease.allowed,false);
});
test('blocked corrupted journal never gets financial or order statistics',()=>{
 const r=analyzeOrderPortfolio({status:'blocked',orders:[]},[],'2026-10-26');
 assert.equal(r.status,'blocked');assert.equal(r.totals,undefined);
 assert.equal(r.productionRelease.allowed,false);
});
test('invalid analytics dates cannot quietly change overdue flags',()=>{
 assert.throws(()=>analyzeOrderPortfolio(fixture(),[],'2026-02-31'),/INVALID_ANALYTICS_DATE/);
 assert.throws(()=>analyzeOrderPortfolio(fixture(),[],'not-a-date'),/INVALID_ANALYTICS_DATE/);
});
test('missing project is not silently presented as a valid client relationship',()=>{
 const report=analyzeOrderPortfolio(fixture(),[],'2026-10-26');
 assert.deepEqual(report.ordersWithoutProjects,['p-1']);
 assert.equal(report.metrics.ordersMissingProject,1);
 assert.equal(report.tenantScope,'not-implemented-locally');
});
