import test from 'node:test';
import assert from 'node:assert/strict';
import {initialConfig,estimate} from '../src/domain.js';
import {readProjects,writeProjects,projectStorageWarning,publicLink,configFromHash} from '../src/storage.js';
const KEY='gaber.projects.v1';
function memory(raw=null){let value=raw;globalThis.localStorage={getItem:()=>value,setItem:(k,v)=>{assert.equal(k,KEY);value=v;}};return ()=>value;}
const record=(id='p1')=>({id,name:'LINEA · вариант 1',status:'requested',createdAt:'2026-10-19T12:00:00.000Z',config:initialConfig(),estimate:estimate(initialConfig()),events:[{date:'2026-10-19',label:'Заявка создана'}]});
test('save, reload, factory update and delete preserve configuration and cost snapshots',()=>{
 memory();let projects=readProjects();const p=record();p.estimate.rows[0].source='Ставка цеха';
 projects=writeProjects([p],projects);p.config.width=320;
 projects=readProjects();assert.equal(projects[0].config.width,280);assert.equal(projects[0].estimate.rows[0].source,'Ставка цеха');
 const quote={discount:10,price:100000,margin:35,createdAt:'2026-10-19'};
 projects=writeProjects([{...projects[0],status:'approved',quote,events:[...projects[0].events,{date:'2026-10-19',label:'Предложение'}]}],projects);
 const loaded=readProjects();assert.equal(loaded[0].status,'approved');assert.deepEqual(loaded[0].quote,quote);assert.equal(loaded[0].events.length,2);
 writeProjects([],projects);assert.deepEqual(readProjects(),[]);
});
test('null or duplicate record cannot hide healthy projects or silently overwrite raw data',()=>{
 for(const invalid of [null,{...record(),config:{category:'unknown'}},record()]){
  const raw=JSON.stringify([record(),invalid]),value=memory(raw),projects=readProjects();
  assert.equal(projects.length,1);assert.ok(projectStorageWarning(projects));assert.throws(()=>writeProjects([],projects));assert.equal(value(),raw);
 }
});
test('corrupted JSON and wrong root shape fail closed on writes',()=>{
 for(const raw of ['{','{}','null']){const value=memory(raw),projects=readProjects();assert.deepEqual(projects,[]);assert.ok(projectStorageWarning(projects));assert.throws(()=>writeProjects([record()],projects));assert.equal(value(),raw);}
});
test('legacy records get safe card, date, events, image and estimate defaults',()=>{
 memory(JSON.stringify([{id:'legacy',status:'draft',config:{category:'chair'},createdAt:'bad',events:[null,{date:'bad',label:'x'}],quote:{price:Infinity},image:'https://external/image.png'}]));
 const [p]=readProjects();assert.equal(p.config.category,'chair');assert.ok(p.name);assert.ok(Number.isFinite(Date.parse(p.createdAt)));assert.deepEqual(p.events,[]);assert.equal(p.image,null);assert.equal(p.quote,undefined);assert.ok(p.estimate.rows.length);assert.ok(Number.isFinite(p.estimate.price));assert.equal(p.estimateRecovered,true);assert.match(projectStorageWarning(readProjects()),/не исходный расчёт/);
});
test('stale tab cannot erase a project saved by another tab',()=>{
 const value=memory(),a=readProjects(),b=readProjects();writeProjects([record()],a);const before=value();assert.throws(()=>writeProjects([record('p2')],b),/другой вкладке/);assert.equal(value(),before);
});
test('capacity is explicit and never truncates or evicts existing projects',()=>{
 memory();let state=readProjects();state=writeProjects(Array.from({length:100},(_,i)=>record('p'+i)),state);assert.equal(readProjects().length,100);assert.throws(()=>writeProjects([record('new'),...state],state),/100 проектов/);assert.equal(readProjects().length,100);
});
test('unavailable storage and failed writes do not report success',()=>{
 globalThis.localStorage={getItem(){throw new Error('blocked');}};const unreadable=readProjects();assert.ok(projectStorageWarning(unreadable));assert.throws(()=>writeProjects([],unreadable));
 memory();const projects=readProjects();globalThis.localStorage.setItem=()=>{throw new Error('quota');};assert.throws(()=>writeProjects([record()],projects),/quota/);assert.deepEqual(readProjects(),[]);
});
test('invalid new records and duplicate IDs are rejected before writing',()=>{
 const value=memory(),state=readProjects();for(const records of [[null],[record(),record()],[{...record(),config:{category:'x'}}]])assert.throws(()=>writeProjects(records,state));assert.equal(value(),null);
});
test('shared configuration restores all engineering options without saved project mutation',()=>{
 globalThis.location={origin:'https://example.test',pathname:'/atelier',hash:''};
 const config={...initialConfig(),layout:'right',support:'webbing',seatCore:'pocket',seatDepth:60};const link=publicLink(config);location.hash=new URL(link).hash;assert.deepEqual(configFromHash(),config);location.hash='#studio?c=broken';assert.equal(configFromHash(),null);
});

test('oversized legacy list remains readable and supports gradual deletion',()=>{
 memory(JSON.stringify(Array.from({length:102},(_,i)=>record('p'+i))));let projects=readProjects();assert.equal(projects.length,102);projects=writeProjects(projects.slice(1),projects);assert.equal(readProjects().length,101);
});
test('array and null configurations cannot be restored as default furniture',()=>{
 for(const config of [[],null]){memory(JSON.stringify([{...record(),config}]));const projects=readProjects();assert.deepEqual(projects,[]);assert.ok(projectStorageWarning(projects));}
});
