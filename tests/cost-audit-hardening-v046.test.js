import test from 'node:test';
import assert from 'node:assert/strict';
import {initialConfig,estimate} from '../src/domain.js';
import {createCostTraceability,auditCostTraceability,compareCostTraceability} from '../src/costTraceability.js';
test('Reject valid IDs linked to the wrong cost source and falsified approvals',()=>{
 const config=initialConfig(),original=createCostTraceability(config),calc=estimate(config);
 const mutations=[
  d=>{d.rows.find(r=>r.id==='fabric').linkedEntityIds=[d.designElements.find(e=>e.kind==='frame').id];},
  d=>{d.rows.find(r=>r.id==='frame').linkedEntityIds=[d.designElements.find(e=>e.kind==='soft').id];},
  d=>{d.designElements[0].approved=true;},
  d=>{d.designElements[0].productionCostRUB=100;},
  d=>{d.coverage.unpricedHardwareRefs.push('MISSING-HARDWARE');},
  d=>{d.coverage.entityCount++;},
  d=>{d.totals.demoDirectRUB++;},
  d=>{d.rows.find(r=>r.id==='fabric').hasUnmodelledBasis=false;},
  d=>{d.productionRelease.allowed=true;}
 ];
 for(const mutate of mutations){
  const doc=structuredClone(original);mutate(doc);
  assert.equal(auditCostTraceability(doc,calc).ok,false,mutate.toString());
 }
});
test('Reconcile line deltas and keep actual costs blocked after reconfiguration',()=>{
 const c=initialConfig(),other={...c,width:c.width+10,layout:'right'};
 const diff=compareCostTraceability(c,other);
 assert.ok(diff.changedRows.length>0);
 assert.equal(diff.changedRows.reduce((s,r)=>s+r.deltaRUB,0),diff.deltaCostRUB);
 assert.equal(diff.productionRelease.allowed,false);
 const updated=createCostTraceability(other);
 assert.equal(updated.totals.actualCostRUB,null);
 assert.equal(updated.productionRelease.allowed,false);
});
