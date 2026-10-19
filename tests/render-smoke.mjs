import assert from 'node:assert/strict';
import {createServer} from 'vite';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const server=await createServer({optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true},appType:'custom'});
try{
 const {default:TechnicalPage}=await server.ssrLoadModule('/src/TechnicalPage.jsx');
 const {default:CostingPage}=await server.ssrLoadModule('/src/CostingPage.jsx');
 const {default:Panel}=await server.ssrLoadModule('/src/ConfiguratorPanel.jsx');
 const {families,initialConfig}=await server.ssrLoadModule('/src/domain.js');
 const {defaultProfile}=await server.ssrLoadModule('/src/costing.js');
 let n=0;
 for(const f of families){const c=initialConfig(f.id);for(const [Component,props] of [[TechnicalPage,{config:c}],[CostingPage,{config:c,profile:defaultProfile(),onChange(){}}],...['composition','dimensions','fabric','details','room','technical'].map(step=>[Panel,{config:c,step,change(){},start(){}}])]){const html=renderToStaticMarkup(React.createElement(Component,props));assert.ok(html.length>100);assert.ok(!html.includes('NaN'));n++;}}
 for(const layout of ['left','right']){
   const c={...initialConfig('sofa'),layout,support:layout==='right'?'webbing':'zigzag',legs:layout==='right'?'none':'wood'};
   for(const [Component,props] of [
     [TechnicalPage,{config:c}],
     [CostingPage,{config:c,profile:defaultProfile(),onChange(){}}],
     [Panel,{config:c,step:'technical',change(){},start(){}}]
   ]){
     const html=renderToStaticMarkup(React.createElement(Component,props));
     assert.ok(html.length>100);
     assert.ok(!html.includes('NaN'));
     if(Component===TechnicalPage){
       assert.match(html,/GABER_PART:CHAISE-F-001/);
       assert.match(html,/GABER_SUPPORT:CHAISE:/);
       assert.match(html,/GABER_SOFT:CHAISE:/);
       assert.match(html,/Блокирует выпуск/);
     }
     n++;
   }
 }
 const {default:App}=await server.ssrLoadModule('/src/App.jsx');
 const originalLocation=globalThis.location,originalStorage=globalThis.localStorage;
 try{
   const legacy={id:'legacy',status:'requested',config:{category:'chair'}};
   for(const route of ['projects','factory'])for(const raw of ['{',JSON.stringify([null,legacy]),JSON.stringify([legacy])]){
     globalThis.location={hash:'#'+route,origin:'https://example.test',pathname:'/'};
     globalThis.localStorage={getItem:key=>key==='gaber.projects.v1'?raw:null};
     const html=renderToStaticMarkup(React.createElement(App));
     assert.ok(!html.includes('NaN'));
     assert.match(html,/role="alert"/);
     if(raw!=='{')assert.match(html,/Восстановленный проект/);
     if(raw==='{')assert.match(html,/сохранение заблокировано/);
     n++;
   }
 }finally{globalThis.location=originalLocation;globalThis.localStorage=originalStorage;}
 console.log(`✓ ${n} server-render smoke scenarios: five categories, six panels, economics and technical pages`);
}finally{await server.close();}

