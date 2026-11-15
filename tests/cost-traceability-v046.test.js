import test from 'node:test';
import assert from 'node:assert/strict';
import {families,initialConfig,estimate} from '../src/domain.js';
import {defaultProfile} from '../src/costing.js';
import {createCostTraceability,auditCostTraceability,compareCostTraceability} from '../src/costTraceability.js';

test('v0.4.6: linked demo costs balance for five furniture families, sizes and chassis',()=>{
  let count=0;
  const verify=c=>{
    const ledger=createCostTraceability(c),e=estimate(c);
    assert.equal(ledger.audit.ok,true,JSON.stringify(ledger.audit.issues));
    assert.equal(auditCostTraceability(ledger,e).ok,true);
    assert.equal(ledger.totals.demoCostRUB,e.cost);
    assert.equal(ledger.totals.demoRowTotalRUB,e.cost);
    assert.ok(ledger.rows.every(r=>r.linkedEntityIds.length>0));
    assert.ok(ledger.designElements.length>0);
    assert.equal(ledger.totals.actualCostRUB,null);
    assert.equal(ledger.productionRelease.allowed,false);
    count++;
  };
  for(const f of families)for(const width of [f.min,f.max])verify({...initialConfig(f.id),width});
  for(const width of [220,230,240,250,260,270,280,290,300,310,320,330,340,350,360])
    for(const moduleCount of [2,3,4,5])for(const arm of ['slim','rounded','none'])
      verify({...initialConfig(),width,moduleCount,arm});
  for(const layout of ['left','right','straight'])for(const moduleCount of [2,3,4,5])
    for(const legs of ['wood','black','none'])for(const seatCore of ['foam','pocket'])
      verify({...initialConfig(),layout,moduleCount,legs,seatCore});
  assert.equal(count,262);
});
test('v0.4.6: cost profiles and configuration edits produce auditable deltas',()=>{
  const c=initialConfig(),profile=defaultProfile(),next={...c,width:c.width+10,layout:'left'};
  const prior=createCostTraceability(c,profile),changed=createCostTraceability(next,profile);
  const diff=compareCostTraceability(c,next,profile);
  assert.equal(diff.deltaCostRUB,changed.totals.demoCostRUB-prior.totals.demoCostRUB);
  assert.ok(diff.addedEntityIds.length>0);
  assert.ok(diff.changedRows.length>0);
  const raised=structuredClone(profile);raised.rates.frame+=100;
  const priceDiff=compareCostTraceability(c,c,profile,raised);
  assert.notEqual(priceDiff.deltaCostRUB,0);
  assert.equal(diff.productionRelease.allowed,false);
  assert.equal(createCostTraceability(c,profile).totals.demoCostRUB,prior.totals.demoCostRUB);
});
test('v0.4.6: corrupted sources, links, totals and unauthorized real costs fail closed',()=>{
  const c=initialConfig(),quote=estimate(c),original=createCostTraceability(c);
  const bad=[
    l=>{l.rows[0].linkedEntityIds=['UNKNOWN'];},
    l=>{l.rows[0].demoAmountRUB++;},
    l=>{l.productionRelease.allowed=true;},
    l=>{l.rows[0].realTotalCostRUB=100;},
    l=>{l.designElements.push(structuredClone(l.designElements[0]));},
    l=>{l.totals.demoRowTotalRUB+=100;}
  ];
  for(const mutate of bad){
    const copy=structuredClone(original);mutate(copy);
    assert.equal(auditCostTraceability(copy,quote).ok,false);
  }
});
test('v0.4.6: support, upholstery and chaise hardware cannot disappear silently',()=>{
  const config={...initialConfig(),layout:'left',legs:'wood',pillows:2};
  const doc=createCostTraceability(config);
  assert.ok(doc.coverage.unpricedHardwareRefs.includes('HARDWARE:chaiseFoot'));
  assert.ok(doc.rows.some(r=>r.id==='fabric'&&r.hasUnmodelledBasis));
  assert.ok(doc.designElements.some(e=>e.kind==='unmodelled-layer'&&e.layerId==='pillow-fill'));
  assert.ok(doc.coverage.rowsWithUnmodelledBasis.length>0);
  assert.equal(doc.productionRelease.allowed,false);
});
