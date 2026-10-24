import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import React,{act} from 'react';
import {createServer} from 'vite';

const dom=new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',
 {url:'https://gaber.example.test/#operations'});
globalThis.window=dom.window;globalThis.document=dom.window.document;
globalThis.localStorage=dom.window.localStorage;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const {createRoot}=await import('react-dom/client');
const server=await createServer({optimizeDeps:{noDiscovery:true,include:[]},
 server:{middlewareMode:true},appType:'custom'});
const root=createRoot(document.getElementById('root'));
try{
 const {default:OperationsPage}=await server.ssrLoadModule('/src/OperationsPage.jsx');
 const {initialConfig}=await server.ssrLoadModule('/src/domain.js');
 const {readOrderWorkspace,saveOrderCommand,ORDER_STORAGE_KEY}=
  await server.ssrLoadModule('/src/orderStorage.js');
 const config=initialConfig(),projects=[{id:'ops-1',name:'Reference Sofa',
  status:'requested',config}];
 let workspace=readOrderWorkspace(localStorage),seq=0;
 const send=(role,type,payload={},revision=false)=>{
  const current=workspace.orders.find(o=>o.id==='ops-1')?.state;
  const command={id:'ops-event-'+(++seq),at:new Date(Date.parse('2026-10-24T10:00:00Z')+seq*1000).toISOString(),
   role,type,payload,expectedVersion:current?.version??0};
  if(revision&&current?.revisions.length)command.revisionId=current.revisions.at(-1).id;
  workspace=saveOrderCommand(localStorage,workspace,'ops-1',command);
 };
 send('client','create',{projectId:'ops-1',name:'Reference Sofa',config});
 send('factory','offer',{config,priceKopecks:200005,advanceBps:5000,
  dueDate:'2027-01-01',note:'Local demo terms'});
 send('client','accept',{},true);
 await act(async()=>root.render(React.createElement(OperationsPage,{projects})));
 assert.match(document.body.textContent,/Исполнение заказов/);
 assert.match(document.body.textContent,/Reference Sofa/);
 assert.match(document.body.textContent,/Финансовый контекст/);
 assert.match(document.body.textContent,/Подтверждённые банком поступления/);
 const click=async text=>act(async()=>{
  const element=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===text);
  assert.ok(element,'Missing '+text);element.click();
 });
 await click('Обзор партнёра · агрегаты');
 assert.doesNotMatch(document.body.textContent,/Финансовый контекст/);
 assert.doesNotMatch(document.body.textContent,/Reference Sofa/);
 assert.match(document.body.textContent,/Статусы процесса/);
 await click('Обзор владельца · локально');
 assert.match(document.body.textContent,/Reference Sofa/);
 localStorage.setItem(ORDER_STORAGE_KEY,'{broken');
 await act(async()=>window.dispatchEvent(new window.StorageEvent('storage',{key:ORDER_STORAGE_KEY})));
 assert.match(document.querySelector('[role=alert]').textContent,/Журнал недоступен/);
 assert.doesNotMatch(document.body.textContent,/Reference Sofa/);
 console.log('✓ operations DOM: owner/local analytics, partner aggregated privacy, corrupt journal fail-closed');
}finally{
 await act(async()=>root.unmount());
 await server.close();dom.window.close();
}
