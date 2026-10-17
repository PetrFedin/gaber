import test from 'node:test';
import assert from 'node:assert/strict';
import {initialConfig,normalize,validate,dimensions} from '../src/domain.js';
import {getEngineeringModel,ENGINEERING_VERSION} from '../src/engineering.js';

test('all five furniture families yield positive sized frame concept parts',()=>{
  for(const category of ['sofa','chair','chairbed','bed','headboard']){
    const c=initialConfig(category),m=getEngineeringModel(c);
    assert.equal(m.schemaVersion,ENGINEERING_VERSION);
    assert.deepEqual(m.envelopeCm,dimensions(c));
    assert.ok(m.cutList.length>0);
    assert.ok(m.cutList.every(p=>p.quantity>0&&Object.values(p.sizeMm).every(n=>Number.isFinite(n)&&n>0)));
    assert.equal(m.productionRelease.allowed,false);
    assert.ok(m.productionRelease.blockingChecks.includes('LOAD_STABILITY'));
    assert.ok(m.layers.length>=2);
  }
});
test('frame cut list and envelope react deterministically to edits',()=>{
 const c=initialConfig(),a=getEngineeringModel(c);
 const b=getEngineeringModel({...c,width:320});
 assert.ok(b.geometry.moduleWidthCm>a.geometry.moduleWidthCm);
 assert.ok(b.cutList.find(p=>p.id==='FRAME-F').sizeMm.length>a.cutList.find(p=>p.id==='FRAME-F').sizeMm.length);
 assert.equal(getEngineeringModel(c).geometry.frameTopCm,a.geometry.frameTopCm);
 const tilted=getEngineeringModel({...c,backLeanDeg:18});
 assert.equal(tilted.geometry.backLeanDeg,18);
});
test('support variants and Pocket Spring change structural records',()=>{
 const c=initialConfig();
 const a=getEngineeringModel(c),b=getEngineeringModel({...c,support:'webbing',seatCore:'pocket'});
 assert.equal(a.suspension.type,'zigzag');
 assert.equal(b.suspension.type,'webbing');
 assert.ok(b.layers.some(l=>l.id==='seat-pocket'));
 assert.ok(a.layers.every(l=>l.id!=='seat-pocket'));
 assert.ok(b.geometry.seatStackMm>0);
 assert.equal(validate({...initialConfig('chairbed'),seatCore:'pocket'}).length>0,true);
});
test('old projects migrate with independent ergonomic and structure defaults',()=>{
 const previous=initialConfig();
 delete previous.seatHeight;delete previous.seatDepth;delete previous.backLeanDeg;delete previous.support;delete previous.seatCore;
 const m=normalize(previous);
 assert.ok(m);
 assert.equal(m.seatHeight,45);
 assert.equal(m.seatDepth,55);
 assert.equal(m.support,'zigzag');
 assert.equal(getEngineeringModel(m).checks.find(g=>g.id==='SEAT_ENVELOPE').status,'pass');
});
test('conflicting assembly cannot be released or exported as valid',()=>{
 assert.throws(()=>getEngineeringModel({...initialConfig(),seatHeight:300}));
 const c={...initialConfig(),seatDepth:70,depth:85};
 const g=getEngineeringModel(c);
 assert.equal(g.checks.find(x=>x.id==='SEAT_ENVELOPE').status,'review');
 assert.equal(g.productionRelease.allowed,false);
 assert.ok(g.productionRelease.blockingChecks.includes('SEAT_ENVELOPE'));
});
