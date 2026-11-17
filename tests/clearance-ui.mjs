import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import React,{act} from 'react';
import {createServer} from 'vite';

const dom=new JSDOM('<!doctype html><html><body><main id="root"></main></body></html>',{url:'https://gaber.example.test/'});
globalThis.window=dom.window;
globalThis.document=dom.window.document;
Object.defineProperty(globalThis,'navigator',{value:dom.window.navigator,configurable:true,writable:true});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const {createRoot}=await import('react-dom/client');
const vite=await createServer({optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true},appType:'custom'});
const root=createRoot(document.getElementById('root'));
try {
  const {default:ClearancePanel}=await vite.ssrLoadModule('/src/ClearancePanel.jsx');
  const {initialConfig}=await vite.ssrLoadModule('/src/domain.js');
  const {createManufacturingPackage}=await vite.ssrLoadModule('/src/manufacturing.js');
  const config=initialConfig('chairbed'), manufacturing=createManufacturingPackage(config);
  await act(async()=>root.render(React.createElement(ClearancePanel,{config,manufacturing})));
  assert.match(document.querySelector('summary').textContent,/Геометрический контроль/);
  const moving=document.querySelector('[aria-label="Первый узел для контроля зазора"]');
  const fixed=document.querySelector('[aria-label="Второй узел для контроля зазора"]');
  const button=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('Проверить оболочки'));
  assert.ok(button.disabled);
  const select=async(el,v)=>act(async()=>{
    Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype,'value').set.call(el,v);
    el.dispatchEvent(new window.Event('change',{bubbles:true}));
  });
  const refs=[...moving.options].map(x=>x.value).filter(Boolean);
  assert.ok(refs.length>2);
  await select(moving,refs[0]);await select(fixed,refs[0]);
  assert.ok(button.disabled,'same part cannot compare to itself');
  await select(fixed,refs[1]);
  assert.equal(button.disabled,false);
  await act(async()=>button.click());
  assert.match(document.querySelector('[role="status"]').textContent,/Выпуск в производство: заблокирован/);
  const zone=document.querySelector('[aria-label="Контрольная зона в миллиметрах"]');
  await act(async()=>{
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(zone,'-1');
    zone.dispatchEvent(new window.Event('input',{bubbles:true}));
    zone.dispatchEvent(new window.Event('change',{bubbles:true}));
  });
  await act(async()=>button.click());
  assert.match(document.querySelector('[role="alert"]').textContent,/CLEARANCE_INVALID_MARGIN_MM/);
  console.log('✓ clearance DOM: production refs, unique nodes, real OBB result, release HOLD and fail-closed margin');
}finally{await act(async()=>root.unmount());await vite.close();dom.window.close();}
