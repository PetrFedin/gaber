import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import React,{act} from 'react';
import {createServer} from 'vite';
const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://example.test/'});
globalThis.window=dom.window;globalThis.document=dom.window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
globalThis.localStorage=dom.window.localStorage;
const {createRoot}=await import('react-dom/client');
const server=await createServer({optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true},appType:'custom'});
const root=createRoot(document.getElementById('root'));
try{
 const {default:Tools}=await server.ssrLoadModule('/src/ProjectStorageTools.jsx');
 const storage=await server.ssrLoadModule('/src/storage.js');
 const {initialConfig,estimate}=await server.ssrLoadModule('/src/domain.js');
 const key='gaber.projects.v1',downloads=[];let projects,saved=0;
 const record=id=>({id,name:'LINEA',status:'requested',config:initialConfig(),estimate:estimate(initialConfig()),createdAt:'2026-10-19',events:[]});
 function render(){root.render(React.createElement(Tools,{projects,onSaved:next=>{projects=next;saved++;render();},onDownload:(name,content)=>downloads.push({name,content})}));}
 const button=label=>{const match=[...document.querySelectorAll('button')].find(b=>b.textContent===label);assert.ok(match,label);return match;};
 async function click(label){await act(async()=>button(label).click());}
 async function file(raw,opts={}){
  const input=document.querySelector('input[type=file]');
  Object.defineProperty(input,'files',{configurable:true,value:[{size:Buffer.byteLength(raw),text:async()=>raw,...opts}]});
  await act(async()=>{input.dispatchEvent(new dom.window.Event('change',{bubbles:true}));});
 }
 const raw=JSON.stringify([record('p1'),null]);localStorage.setItem(key,raw);projects=storage.readProjects();await act(async()=>render());
 await click('Скачать все проекты');assert.equal(JSON.parse(downloads.at(-1).content).raw,raw);
 await click('Проверить восстановление');assert.match(document.body.textContent,/Итого: 1/);assert.match(document.body.textContent,/исключены записи: 1/);
 await click('Отмена');assert.equal(localStorage.getItem(key),raw);assert.equal(saved,0);
 await click('Проверить восстановление');await click('Применить с резервной копией');assert.equal(saved,1);assert.equal(JSON.parse(localStorage.getItem(key)).length,1);
 await click('Скачать копию до восстановления');assert.equal(JSON.parse(downloads.at(-1).content).raw,raw);
 await file(JSON.stringify([record('p2')]));assert.match(document.body.textContent,/Добавятся: 1/);assert.equal(projects.length,1);
 await click('Применить с резервной копией');assert.equal(projects.length,2);assert.equal(saved,2);
 await file(JSON.stringify([record('p2')]));assert.match(document.body.textContent,/ID проекта уже существует/);assert.equal(saved,2);
 await file('{bad');assert.match(document.body.textContent,/корректный JSON/);assert.equal(projects.length,2);
 await file(JSON.stringify([record('p3')]),{size:storage.IMPORT_MAX_BYTES+1});assert.match(document.body.textContent,/превышает 10 МБ/);
 await file(JSON.stringify([record('p3')]));const external=JSON.stringify([record('outside')]);localStorage.setItem(key,external);
 await click('Применить с резервной копией');assert.match(document.body.textContent,/другой вкладке/);assert.equal(localStorage.getItem(key),external);assert.equal(saved,2);
 // Invalidate a checked preview when parent project state is refreshed.
 projects=storage.readProjects();await act(async()=>render());await file(JSON.stringify([record('p4')]));
 projects=storage.readProjects();await act(async()=>render());assert.equal([...document.querySelectorAll('button')].some(b=>b.textContent==='Применить с резервной копией'),false);
 // A late file read must not revive a cancelled/replaced preview.
 let release;const pending=new Promise(resolve=>{release=resolve;});
 const input=document.querySelector('input[type=file]');Object.defineProperty(input,'files',{configurable:true,value:[{size:10,text:()=>pending}]});
 await act(async()=>input.dispatchEvent(new dom.window.Event('change',{bubbles:true})));
 await file(JSON.stringify([record('latest')]));
 await act(async()=>release(JSON.stringify([record('late')])));
 assert.match(document.body.textContent,/Файл проверен/);
 await click('Применить с резервной копией');assert.ok(projects.some(p=>p.id==='latest'));assert.ok(!projects.some(p=>p.id==='late'));
 console.log('✓ DOM interactions: raw export, repair preview/cancel/apply, backup download, import/apply, duplicate/JSON/size rejection, stale-write refusal, preview invalidation and late file reads');
}finally{await act(async()=>root.unmount());await server.close();dom.window.close();}
