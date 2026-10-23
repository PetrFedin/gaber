import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import React,{act} from 'react';
import {createServer} from 'vite';

const dom=new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',{
 url:'https://gaber.example.test/#costing'
});
globalThis.window=dom.window;
globalThis.document=dom.window.document;
globalThis.localStorage=dom.window.localStorage;
globalThis.sessionStorage=dom.window.sessionStorage;
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const {createRoot}=await import('react-dom/client');
const server=await createServer({
 optimizeDeps:{noDiscovery:true,include:[]},
 server:{middlewareMode:true},appType:'custom'
});
const root=createRoot(document.getElementById('root'));
try{
 const {default:Panel}=await server.ssrLoadModule('/src/FactoryCostDraftPanel.jsx');
 const {initialConfig}=await server.ssrLoadModule('/src/domain.js');
 const {emptyFactoryCostDraft}=await server.ssrLoadModule('/src/factoryCosting.js');
 const {writeFactoryScratch}=await server.ssrLoadModule('/src/factoryScratch.js');
 const first=initialConfig('sofa'),second={...initialConfig('sofa'),width:300};
 const a=emptyFactoryCostDraft(first,'2026-10-23','A-ONLY');
 const b=emptyFactoryCostDraft(second,'2026-10-23','B-ONLY');
 writeFactoryScratch(first,JSON.stringify(a,null,2));
 writeFactoryScratch(second,JSON.stringify(b,null,2));
 const render=async config=>act(async()=>{
  root.render(React.createElement(Panel,{config}));
 });
 const raw=()=>document.querySelector('.gaber-raw-editor textarea')?.value;
 await render(first);
 assert.match(raw(),/A-ONLY/);
 assert.doesNotMatch(raw(),/B-ONLY/);
 assert.match(document.body.textContent,/Восстановлен незаписанный текст/);
 assert.match(document.body.textContent,/Цены материалов/);
 await render(second);
 assert.match(raw(),/B-ONLY/);
 assert.doesNotMatch(raw(),/A-ONLY/);
 await render(first);
 assert.match(raw(),/A-ONLY/);
 assert.doesNotMatch(raw(),/B-ONLY/);
 console.log('✓ DOM factory editor: keyed configuration switch, per-product scratch and revision warning');
 const storage=await server.ssrLoadModule('/src/factoryDraftStorage.js');
 const {default:Workspace}=await server.ssrLoadModule('/src/FactoryDraftWorkspace.jsx');
 storage.saveFactoryRevision(localStorage,storage.readFactoryWorkspace(localStorage),{
  id:'bridge-baseline',label:'Baseline',savedAt:'2026-10-23T15:00:00.000Z',
  sourceConfig:first,text:JSON.stringify(a)
 });
 await act(async()=>root.render(React.createElement(Workspace,{
  config:first,text:JSON.stringify(a),onChange(){},onMessage(){}
 })));
 const compareButton=[...document.querySelectorAll('button')].find(x=>x.textContent==='Сравнить с текущим');
 assert.ok(compareButton);
 await act(async()=>compareButton.click());
 assert.match(document.body.textContent,/Причины изменения затрат/);
 assert.match(document.body.textContent,/Факторы согласованы с общим изменением/);
 assert.equal(document.querySelectorAll('.gaber-variance dl>div').length,7);
 console.log('✓ DOM revision comparison: factor bridge, seven drivers and reconciliation status');

}finally{
 await act(async()=>root.unmount());
 await server.close();
 dom.window.close();
}

