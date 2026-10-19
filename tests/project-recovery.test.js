import test from 'node:test';
import assert from 'node:assert/strict';
import {initialConfig,estimate} from '../src/domain.js';
import {readProjects,writeProjects,exportProjectBackup,lastRecoveryBackup,prepareProjectImport,prepareProjectRecovery,applyProjectRecovery,IMPORT_MAX_BYTES} from '../src/storage.js';
import {createManufacturingPackage} from '../src/manufacturing.js';
const KEY='gaber.projects.v1',POINTER=KEY+'.last-recovery';
function memory(raw=null){const map=new Map();if(raw!==null)map.set(KEY,raw);globalThis.localStorage={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)};return map;}
function project(id='p1',patch={}){const config={...initialConfig(),layout:'right',support:'webbing',seatCore:'pocket',...patch};return {id,name:'Сохранённый шезлонг',status:'requested',config,estimate:estimate(config),createdAt:'2026-10-19',events:[{date:'2026-10-19',label:'Заявка'}]};}
test('full backup round-trip preserves configuration, costs, sources and manufacturing links',()=>{
 const p=project();p.estimate.rows[0].source='Архивная ставка';const original=JSON.stringify([p]);memory(original);
 const backup=exportProjectBackup();assert.equal(JSON.parse(backup).raw,original);
 const map=memory(),state=readProjects(),plan=prepareProjectImport(backup,state);assert.equal(plan.added,1);assert.equal(map.has(KEY),false);
 const saved=applyProjectRecovery(plan,state);assert.equal(saved[0].estimate.rows[0].source,'Архивная ставка');assert.deepEqual(saved[0].config,p.config);
 assert.equal(JSON.parse(lastRecoveryBackup()).raw,null);
 const production=createManufacturingPackage(saved[0].config);assert.equal(production.productionRelease.allowed,false);assert.ok(production.parts.some(p=>p.sourceGroup.startsWith('CHAISE-')));
 assert.deepEqual(production,createManufacturingPackage(readProjects()[0].config));
 writeProjects([{...saved[0],status:'changes'}],saved);assert.equal(readProjects()[0].status,'changes');
});
test('repair previews removals and keeps exact corrupt raw data before replacing',()=>{
 const raw=JSON.stringify([project(),null,project()]),map=memory(raw),state=readProjects();const plan=prepareProjectRecovery(state);
 assert.equal(plan.retained,1);assert.equal(plan.rejected,2);assert.equal(map.get(KEY),raw);
 const saved=applyProjectRecovery(plan,state);assert.equal(saved.length,1);assert.equal(readProjects().length,1);assert.equal(JSON.parse(lastRecoveryBackup()).raw,raw);
 assert.throws(()=>applyProjectRecovery(plan,state));
});
test('unreadable JSON can only be reset through an explicit empty repair plan with backup',()=>{
 const raw='{broken',map=memory(raw),state=readProjects(),plan=prepareProjectRecovery(state);assert.equal(plan.rejected,null);assert.equal(plan.total,0);assert.equal(map.get(KEY),raw);
 applyProjectRecovery(plan,state);assert.equal(map.get(KEY),'[]');assert.equal(JSON.parse(lastRecoveryBackup()).raw,raw);
 assert.throws(()=>prepareProjectImport(lastRecoveryBackup(),readProjects()),/повреждённый исходный JSON/);
});
test('stale preview cannot replace projects changed by another tab',()=>{
 const map=memory(),state=readProjects(),plan=prepareProjectImport(JSON.stringify([project()]),state);
 const external=JSON.stringify([project('external')]);map.set(KEY,external);assert.throws(()=>applyProjectRecovery(plan,state),/другой вкладке/);assert.equal(map.get(KEY),external);assert.equal(map.has(POINTER),false);
});
test('backup, pointer and main-write failures preserve original projects',()=>{
 for(const fail of ['backup','pointer','main']){
  const raw=JSON.stringify([null,project()]),map=memory(raw),state=readProjects(),plan=prepareProjectRecovery(state);
  localStorage.setItem=(k,v)=>{if((fail==='backup'&&k.startsWith(KEY+'.recovery.'))||(fail==='pointer'&&k===POINTER)||(fail==='main'&&k===KEY))throw Error('quota');map.set(k,v);};
  assert.throws(()=>applyProjectRecovery(plan,state),/quota/);assert.equal(map.get(KEY),raw);
  if(fail==='main')assert.equal(JSON.parse(lastRecoveryBackup()).raw,raw);
 }
});
test('silently failed backup and concurrent change during backup both abort replacement',()=>{
 for(const mode of ['silent','concurrent']){
  const raw=JSON.stringify([null,project()]),map=memory(raw),state=readProjects(),plan=prepareProjectRecovery(state),external=JSON.stringify([project('external')]);
  localStorage.setItem=(k,v)=>{if(mode==='silent'&&k.startsWith(KEY+'.recovery.'))return;map.set(k,v);if(mode==='concurrent'&&k===POINTER)map.set(KEY,external);};
  assert.throws(()=>applyProjectRecovery(plan,state));assert.equal(map.get(KEY),mode==='silent'?raw:external);
 }
});
test('imports reject unknown formats, invalid records, duplicates and oversized files without writes',()=>{
 const raw=JSON.stringify([project()]),map=memory(raw),state=readProjects();
 for(const input of ['{','null','{}',JSON.stringify({schemaVersion:'future',raw:'[]'}),JSON.stringify([null]),JSON.stringify([project('p2'),project('p2')]),JSON.stringify([project()]),' '.repeat(IMPORT_MAX_BYTES+1)])assert.throws(()=>prepareProjectImport(input,state));
 assert.equal(map.get(KEY),raw);assert.equal(map.size,1);
});
test('imports refuse capacity overflow and refuse to obscure current corrupt data',()=>{
 let map=memory(JSON.stringify(Array.from({length:100},(_,i)=>project('p'+i)))),state=readProjects();assert.throws(()=>prepareProjectImport(JSON.stringify([project('new')]),state),/100 проектов/);assert.equal(map.size,1);
 map=memory(JSON.stringify([null,project()]));state=readProjects();assert.throws(()=>prepareProjectImport(JSON.stringify([project('new')]),state),/Сначала восстановите/);assert.equal(map.size,1);
});
test('recovery requires an observed readable baseline and ignores mutations to preview metadata',()=>{
 globalThis.localStorage={getItem(){throw Error('blocked');}};const unavailable=readProjects();assert.throws(()=>prepareProjectRecovery(unavailable));
 const map=memory(),state=readProjects(),plan=prepareProjectImport(JSON.stringify([project()]),state);plan.total=900;plan.projects=[project('injected')];
 assert.throws(()=>applyProjectRecovery({...plan},state));const saved=applyProjectRecovery(plan,state);assert.equal(saved.length,1);assert.equal(saved[0].id,'p1');assert.equal(map.has(KEY),true);
});
test('successive recovery backups stay individually intact and last pointer stays downloadable',()=>{
 const raw=JSON.stringify([null,project()]),map=memory(raw);let state=readProjects();state=applyProjectRecovery(prepareProjectRecovery(state),state);
 const firstKey=map.get(POINTER),first=map.get(firstKey);state=applyProjectRecovery(prepareProjectImport(JSON.stringify([project('p2')]),state),state);
 assert.notEqual(map.get(POINTER),firstKey);assert.equal(map.get(firstKey),first);assert.equal(JSON.parse(lastRecoveryBackup()).raw.includes('p1'),true);assert.equal(state.length,2);
});
