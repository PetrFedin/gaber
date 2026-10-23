import test from 'node:test';
import assert from 'node:assert/strict';
import {initialConfig} from '../src/domain.js';
import {FACTORY_WORKSPACE_KEY, FACTORY_WORKSPACE_SCHEMA, MAX_FACTORY_REVISIONS,
 readFactoryWorkspace, saveFactoryRevision, getFactoryRevision, matchingFactoryRevisions,
 exportFactoryRevision, exportFactoryWorkspaceRaw, parseFactoryDraftImport, sameFactoryConfig
} from '../src/factoryDraftStorage.js';
function store(){const d=new Map();return {getItem:k=>d.has(k)?d.get(k):null,
 setItem:(k,v)=>d.set(k,v),setRaw:s=>d.set(FACTORY_WORKSPACE_KEY,s)};}
const c=initialConfig(),draft=()=>({schemaVersion:'gaber-factory-cost-draft/0.4.7',
 sourceConfig:structuredClone(c),asOfDate:'2026-10-22',revisionId:'R1',
 parentRevisionId:null,quotes:[],consumption:[],workCenters:[],operations:[]});
const rec=(id='one',text=JSON.stringify(draft()))=>({id,label:'Cost '+id,
 savedAt:'2026-10-22T15:00:00.000Z',sourceConfig:structuredClone(c),text});
test('journal append, refresh, exact unfinished text and ordered history',()=>{
 const s=store();let w=readFactoryWorkspace(s);
 assert.equal(w.status,'ready');
 w=saveFactoryRevision(s,w,rec());
 w=saveFactoryRevision(s,w,rec('two','{"draft":'));
 assert.equal(readFactoryWorkspace(s).records.length,2);
 assert.equal(getFactoryRevision(readFactoryWorkspace(s),'two',c).text,'{"draft":');
 assert.deepEqual(matchingFactoryRevisions(w,c).map(x=>x.id),['two','one']);
});
test('config equality is key-order independent, not dimension independent',()=>{
 const reordered=Object.fromEntries(Object.entries(c).reverse());
 assert.equal(sameFactoryConfig(c,reordered),true);
 assert.equal(sameFactoryConfig(c,{...c,width:c.width+10}),false);
});
test('stale writes and duplicate revisions fail closed',()=>{
 const s=store(),before=readFactoryWorkspace(s),after=saveFactoryRevision(s,before,rec());
 assert.throws(()=>saveFactoryRevision(s,before,rec('other')),/STALE_WORKSPACE/);
 assert.throws(()=>saveFactoryRevision(s,after,rec()),/DUPLICATE_REVISION/);
 after.records[0].text='forged';
 assert.equal(getFactoryRevision(after,'one',c).text,JSON.stringify(draft()));
});
test('damaged or future-format workspace is downloadable and never overwritten',()=>{
 const s=store();for(const raw of ['{not JSON',JSON.stringify({schemaVersion:'future',records:[]})]){
  s.setRaw(raw);
  const w=readFactoryWorkspace(s);
  assert.equal(w.status,'corrupt');
  assert.equal(JSON.parse(exportFactoryWorkspaceRaw(w)).raw,raw);
  assert.throws(()=>saveFactoryRevision(s,w,rec()),/WORKSPACE_CORRUPT/);
  assert.equal(s.getItem(FACTORY_WORKSPACE_KEY),raw);
 }
});
test('verified local import drops any forged exported approval and costs',()=>{
 const s=store(),w=saveFactoryRevision(s,readFactoryWorkspace(s),rec());
 const payload=JSON.parse(exportFactoryRevision(getFactoryRevision(w,'one',c)));
 payload.review={totals:{actualCostRUB:1},productionRelease:{allowed:true}};
 const parsed=parseFactoryDraftImport(JSON.stringify(payload),c);
 assert.equal(parsed.productionRelease.allowed,false);
 assert.equal(parsed.draft.review,undefined);
 const legacy={kind:'GABER_FACTORY_COST_PREVIEW_NOT_APPROVED',
  draft:draft(),review:{totals:{actualCostRUB:999},productionRelease:{allowed:true}}};
 assert.equal(parseFactoryDraftImport(JSON.stringify(legacy),c).draft.review,undefined);
});
test('wrong source, invalid JSON and overlarge imports are rejected',()=>{
 assert.throws(()=>parseFactoryDraftImport(JSON.stringify(draft()),{...c,width:c.width+10}),/IMPORT_CONFIG_MISMATCH/);
 assert.throws(()=>parseFactoryDraftImport('invalid',c),/IMPORT_JSON_INVALID/);
 assert.throws(()=>parseFactoryDraftImport('x'.repeat(1024*1024+1),c),/IMPORT_TOO_LARGE/);
});
test('revision capacity does not evict historical evidence silently',()=>{
 const s=store(),records=Array.from({length:MAX_FACTORY_REVISIONS},(_,i)=>({...rec('r'+i),authority:'LOCAL_UNVERIFIED'}));
 s.setRaw(JSON.stringify({schemaVersion:FACTORY_WORKSPACE_SCHEMA,records}));
 const w=readFactoryWorkspace(s);
 assert.equal(w.status,'ready');
 assert.throws(()=>saveFactoryRevision(s,w,rec('new')),/REVISION_LIMIT/);
 assert.equal(readFactoryWorkspace(s).records.length,MAX_FACTORY_REVISIONS);
});
test('storage quota failure cannot be reported as saved',()=>{
 const s=store();s.setItem=()=>{throw new Error('Quota exceeded')};
 assert.throws(()=>saveFactoryRevision(s,readFactoryWorkspace(s),rec()),/STORAGE_WRITE_FAILED/);
});

