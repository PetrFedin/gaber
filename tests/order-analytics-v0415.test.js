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
  if(revision&&['confirm_spec','return_spec','offer'].includes(type)&&state?.specs?.length)command.revisionId=state.specs.at(-1).id;
  else if(revision&&state?.revisions.length)command.revisionId=state.revisions.at(-1).id;
  events=appendOrderCommand(events,command).events;
 };
 const c=initialConfig();
 send('client','create',{projectId:'p-1',name:'Sofa',config:c},false);
 send('partner','assign_factory',{factoryId:'FACTORY-1'},false);
 send('partner','prepare_spec',{config:c,customerPriceKopecks:205005,
  factoryCostKopecks:100000,platformCommissionKopecks:40000,logisticsKopecks:10000,
  taxKopecks:5000,otherCostsKopecks:0,technicalNote:'Test CAD and BOM',advanceBps:4000,
  dueDate:'2026-10-25',note:'Demo quote'},false);
 send('factory','confirm_spec',{note:'Concept approved',reference:'FACTORY-R1'},true);
 send('partner','offer',{note:'Client quote after factory review'},true);
 send('client','accept');
 send('partner','record_payment',{amountKopecks:82002,reference:'Local record'});
 return {status:'ready',orders:[{id:'p-1',state:replayOrder(events)}]};
}
test('portfolio reconciles kopecks, due dates, linked projects and pending actors',()=>{
 const r=analyzeOrderPortfolio(fixture(),
  [{id:'p-1',status:'requested'},{id:'not-linked',status:'requested'}],'2026-10-26');
 assert.equal(r.schemaVersion,ORDER_PORTFOLIO_SCHEMA);
 assert.equal(r.metrics.orders,1);assert.equal(r.metrics.overdue,1);
 assert.equal(r.metrics.awaitingFactory,1);
 assert.equal(r.totals.plannedFactoryCostKopecks,100000);
 assert.equal(r.totals.plannedPlatformCommissionKopecks,40000);
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

test('reprice pending removes stale price from current portfolio without losing local credits',()=>{
 const workspace=fixture();
 const order=workspace.orders[0].state;
 assert.equal(order.revisions.at(-1).priceKopecks,205005);
 assert.equal(order.payments.at(-1).amountKopecks,82002);
 order.stage='change_requested';order.acceptedRevisionId=null;
 let result=analyzeOrderPortfolio(workspace,[{id:'p-1',status:'requested'}],'2026-10-26');
 assert.equal(result.totals.offeredKopecks,0);
 assert.equal(result.totals.locallyRecordedCurrentKopecks,0);
 assert.equal(result.totals.pendingRequoteLocalKopecks,82002);
 assert.equal(result.rows[0].priceKopecks,null);
 assert.equal(result.rows[0].balanceKopecks,null);
 assert.equal(result.rows[0].dueDate,null);
 assert.equal(result.rows[0].revisionId,null);
 assert.equal(result.rows[0].actionOwner,'partner');
 assert.equal(result.rows[0].overdue,false);
 order.stage='awaiting_factory';
 order.specs.push({
  id:'S2',status:'awaiting_factory',config:order.revisions.at(-1).config,
  dueDate:'2027-02-01',factoryDecision:null
 });
 result=analyzeOrderPortfolio(workspace,[{id:'p-1',status:'requested'}],'2026-10-26');
 assert.equal(result.rows[0].dueDate,'2027-02-01');
 assert.equal(result.rows[0].dueDateAuthority,'DRAFT_UNCONFIRMED');
 assert.equal(result.rows[0].actionOwner,'factory');
 assert.equal(result.totals.offeredKopecks,0);
 assert.equal(result.totals.pendingRequoteLocalKopecks,82002);
});

test('unassigned factory never receives an actionable technical review in operator queue',()=>{
 const workspace=fixture();
 const order=workspace.orders[0].state;
 order.assignedFactoryId=null;
 order.stage='awaiting_factory';
 const report=analyzeOrderPortfolio(workspace,[],'2026-10-26');
 assert.equal(report.rows[0].actionOwner,'partner');
 assert.match(report.rows[0].nextAction,/Назначить/);
 assert.equal(report.metrics.awaitingFactory,0);
 assert.equal(report.metrics.awaitingPartner,1);
 assert.equal(report.rows[0].assignedFactoryId,null);
});
