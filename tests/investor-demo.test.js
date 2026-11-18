import test from 'node:test';
import assert from 'node:assert/strict';
import {buildInvestorDemoArticles,seedInvestorDemoArticles,INVESTOR_DEMO_SCHEMA} from '../src/investorDemo.js';
import {replayOrder,appendOrderCommand,orderFinancials,orderEngineering,DEV_EXECUTION_MODE} from '../src/orderWorkflow.js';
import {readOrderWorkspace,saveOrderCommand,ORDER_STORAGE_KEY} from '../src/orderStorage.js';
import {createManufacturingPackage} from '../src/manufacturing.js';
import {validate,initialConfig} from '../src/domain.js';

const freeze={now:'2026-11-18T10:00:00.000Z'};
const scenarios=()=>buildInvestorDemoArticles(freeze);
const memory=()=>{const db=new Map();return {
 getItem:key=>db.get(key)??null,
 setItem:(key,value)=>db.set(key,value),
 removeItem:key=>db.delete(key)
};};
const byCategory=type=>scenarios().find(x=>x.article.category===type);

test('five real catalog categories have reproducible journal states and concept-only factory gates',()=>{
 const cases=scenarios();
 assert.deepEqual(cases.map(x=>x.article.category),['sofa','chairbed','bed','headboard','chair']);
 assert.deepEqual(cases.map(x=>x.state.stage),['closed','awaiting_factory','production','ready','disputed']);
 assert.equal(new Set(cases.map(x=>x.article.id)).size,5);
 for(const x of cases){
  assert.deepEqual(replayOrder(x.events),x.state);
  assert.equal(x.state.version,x.events.length);
  assert.equal(validate(x.state.sourceConfig).length,0);
  assert.equal(x.state.sourceConfig.category,x.article.category);
  assert.equal(x.state.productionRelease.allowed,false);
  assert.equal(orderEngineering(x.state).productionRelease.allowed,false);
  const manufactured=createManufacturingPackage(x.state.sourceConfig);
  assert.equal(manufactured.integrity.ok,true);
  assert.ok(manufactured.parts.length>0);
  assert.equal(orderFinancials(x.state).verifiedBankKopecks,null);
  assert.equal(x.events.filter(e=>['start','complete','quality_pass','ship','deliver','accept_delivery'].includes(e.type))
   .every(e=>e.executionMode===DEV_EXECUTION_MODE),true);
  const current=x.state.specs.at(-1);
  assert.equal(current.economics.status,'PLANNED_UNVERIFIED');
  assert.equal(current.economics.bankVerifiedKopecks,null);
  assert.equal(current.economics.earnedCommissionKopecks,null);
  assert.equal(current.economics.customerPriceKopecks,
   current.economics.factoryCostKopecks+current.economics.platformCommissionKopecks+
   current.economics.logisticsKopecks+current.economics.taxKopecks+
   current.economics.otherCostsKopecks+current.economics.plannedReserveKopecks);
 }
});

test('rejected old commercial revision and real credit transfer are explicit in NOTTE',()=>{
 const state=byCategory('bed').state, finance=orderFinancials(state);
 assert.equal(state.revisions.length,2);
 assert.equal(state.specs.length,2);
 assert.equal(state.acceptedRevisionId,'R2');
 assert.equal(state.revisions[0].config.width,180);
 assert.equal(state.revisions[1].config.width,200);
 assert.deepEqual(state.transfers.map(x=>[x.fromRevisionId,x.toRevisionId,x.amountKopecks]),[['R1','R2',6500000]]);
 assert.equal(finance.currentKopecks,16500000);
 assert.equal(finance.advanceDueKopecks,0);
 assert.equal(finance.balanceKopecks,16500000);
 assert.equal(state.stage,'production');
 assert.equal(state.quality,null);
 assert.equal(state.productionRelease.allowed,false);
});

test('LINEA full completion, CAMBIO factory wait, TELA payment gate, FORMA complaint',()=>{
 const sofa=byCategory('sofa').state;
 assert.equal(sofa.stage,'closed');
 assert.equal(orderFinancials(sofa).balanceKopecks,0);
 assert.equal(sofa.shipment.reference,'DEMO-PACK-sofa');
 assert.ok(sofa.quality.reference.startsWith('DEMO-QC-'));
 assert.equal(sofa.delivery.revisionId,'R1');
 const chairbed=byCategory('chairbed').state;
 assert.equal(chairbed.revisions.length,0);
 assert.equal(chairbed.pendingSpecId,'S1');
 assert.equal(chairbed.specs.at(-1).factoryDecision,null);
 const headboard=byCategory('headboard').state;
 assert.equal(headboard.stage,'ready');
 assert.ok(orderFinancials(headboard).balanceKopecks>0);
 assert.equal(headboard.shipment,null);
 const chair=byCategory('chair').state;
 assert.equal(chair.stage,'disputed');
 assert.equal(chair.issue.status,'open');
 assert.equal(chair.issues[0].rejections.length,1);
 assert.equal(chair.delivery.reference,'DEMO-POD-chair');
});

test('demo seeding is append-only and does not overwrite independent orders or repeat fixtures',()=>{
 const storage=memory();
 let snapshot=readOrderWorkspace(storage);
 snapshot=saveOrderCommand(storage,snapshot,'PERSONAL-1',{
  id:'PERSONAL-CREATE',at:'2026-11-18T10:00:00.000Z',role:'client',type:'create',
  payload:{projectId:'PERSONAL-1',name:'Original personal order',config:initialConfig('chair')},expectedVersion:0
 });
 const original=snapshot.orders[0].events;
 const seeded=seedInvestorDemoArticles(storage,freeze);
 assert.equal(seeded.schemaVersion,INVESTOR_DEMO_SCHEMA);
 assert.equal(seeded.created.length,5);
 assert.equal(seeded.skipped.length,0);
 assert.equal(readOrderWorkspace(storage).orders.length,6);
 assert.deepEqual(readOrderWorkspace(storage).orders.find(x=>x.id==='PERSONAL-1').events,original);
 const recorded=storage.getItem(ORDER_STORAGE_KEY);
 const second=seedInvestorDemoArticles(storage,freeze);
 assert.equal(second.created.length,0);
 assert.equal(second.skipped.length,5);
 assert.equal(storage.getItem(ORDER_STORAGE_KEY),recorded);
});

test('existing demo IDs are never overwritten; corruption blocks seeding without partial writes',()=>{
 const storage=memory();
 seedInvestorDemoArticles(storage,freeze);
 const before=readOrderWorkspace(storage);
 const first=before.orders.find(x=>x.id==='GABER-DEMO-LINEA-01');
 const later=saveOrderCommand(storage,before,first.id,{
  id:'PERSONAL-DEMO-MESSAGE',at:'2026-11-18T10:00:01.000Z',role:'client',type:'message',
  payload:{note:'Customer added a real demo note',channel:'client_partner'},expectedVersion:first.state.version,
  revisionId:first.state.revisions.at(-1).id
 });
 assert.equal(later.orders.find(x=>x.id===first.id).state.version,first.state.version+1);
 seedInvestorDemoArticles(storage,freeze);
 assert.equal(readOrderWorkspace(storage).orders.find(x=>x.id===first.id).state.version,first.state.version+1);
 storage.setItem(ORDER_STORAGE_KEY,'{BAD JSON');
 assert.throws(()=>seedInvestorDemoArticles(storage,freeze),/DEMO_STORAGE_BLOCKED/);
 assert.equal(storage.getItem(ORDER_STORAGE_KEY),'{BAD JSON');
});

test('unrealistic clock is denied before storage can change',()=>{
 const storage=memory(),raw=storage.getItem(ORDER_STORAGE_KEY);
 assert.throws(()=>seedInvestorDemoArticles(storage,{now:'not-a-date'}),/DEMO_INVALID_CLOCK/);
 assert.equal(storage.getItem(ORDER_STORAGE_KEY),raw);
});
