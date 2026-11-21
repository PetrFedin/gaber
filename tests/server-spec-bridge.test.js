import test from 'node:test';
import assert from 'node:assert/strict';
import {initialConfig,validate} from '../src/domain.js';
import {getInvestorDemoTemplates} from '../src/investorDemo.js';
import {buildServerSpecConfig,getServerDemoCatalog,serverCreateCommand} from '../src/serverSpecBridge.js';

test('all five existing investor product definitions become safe fresh server drafts, not existing order states',()=>{
 const list=getServerDemoCatalog(getInvestorDemoTemplates());
 assert.deepEqual(list.map(x=>x.config.category),['sofa','chairbed','bed','headboard','chair']);
 assert.equal(list.find(x=>x.config.category==='bed').config.width,200);
 assert.equal(list.find(x=>x.config.category==='chairbed').config.mechanism,'fold');
 for(const x of list){
  assert.equal(validate(x.config).length,0);
  assert.deepEqual(Object.keys(x),['id','name','config']);
  assert.equal('payments' in x,false);
  assert.equal('events' in x,false);
  assert.equal('status' in x,false);
  assert.equal('priceKopecks' in x,false);
 }
});

test('partner may change an existing concept sofa to a different exact factory-reviewed geometry',()=>{
 const original=initialConfig('sofa');
 const edited=buildServerSpecConfig(original,{width:300,fabric:'linen',color:'cream',moduleCount:4});
 assert.equal(edited.width,300);
 assert.equal(edited.fabric,'linen');
 assert.equal(edited.moduleCount,4);
 assert.equal(original.width,280);
 assert.equal(validate(edited).length,0);
});

test('malformed configurations and invented approval/financial fields fail closed',()=>{
 const c=initialConfig();
 for(const patch of [
  {width:305},{width:10000},{width:'300'},{width:NaN},
  {width:null},{mechanism:'webxr-approved'},{storage:'true'},
  {priceKopecks:1},{productionRelease:{allowed:true}},
  {materialSupplierApproved:true},{factoryCostKopecks:1},{category:'headboard'}
 ])assert.throws(()=>buildServerSpecConfig(c,patch),/SERVER_SPEC_(FIELD_FORBIDDEN|CONFIG_INVALID)/);
 assert.throws(()=>buildServerSpecConfig({},{}),/SERVER_SPEC_CONFIG_INVALID/);
 assert.throws(()=>buildServerSpecConfig({...c,authority:'FACTORY_APPROVED'},{}),/SERVER_SPEC_CONFIG_INVALID/);
 assert.throws(()=>buildServerSpecConfig({...c,unitCostRUB:0},{}),/SERVER_SPEC_CONFIG_INVALID/);
});

test('invalid mechanical options are blocked against the catalog constraint matrix',()=>{
 const chair=initialConfig('chairbed');
 assert.throws(()=>buildServerSpecConfig(chair,{mechanism:'none'}),/SERVER_SPEC_CONFIG_INVALID/);
 const bed=initialConfig('bed');
 assert.throws(()=>buildServerSpecConfig(bed,{mechanism:'recliner'}),/SERVER_SPEC_CONFIG_INVALID/);
 assert.throws(()=>getServerDemoCatalog([]),/SERVER_PRESET_CATALOG_INVALID/);
});

test('create command copies only safe source config and is stable across unknown-response retries',()=>{
 const c=initialConfig('sofa');
 const args={orderId:'ORD-'+'a'.repeat(24),requestId:'REQ-'+'b'.repeat(24),
  name:' New client request ',config:c};
 const a=serverCreateCommand(args);
 const b=serverCreateCommand(args);
 assert.deepEqual(a,b);
 assert.equal(a.expectedVersion,0);
 assert.equal(a.type,'create');
 assert.equal(a.payload.name,'New client request');
 assert.deepEqual(Object.keys(a.payload),['projectId','name','config']);
 a.payload.config.width=300;
 assert.equal(c.width,280);
 assert.throws(()=>serverCreateCommand({...args,orderId:'GABER-DEMO-LINEA-01'}),/SERVER_CREATE_DRAFT_INVALID/);
 assert.throws(()=>serverCreateCommand({...args,requestId:'not-uuid'}),/SERVER_CREATE_DRAFT_INVALID/);
});
