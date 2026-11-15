import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import React,{act} from 'react';
import {createServer} from 'vite';

const RealDate=globalThis.Date,oldTZ=process.env.TZ;
process.env.TZ='Europe/Moscow';
const fixed=RealDate.parse('2026-10-26T21:30:00Z'); // 27 October locally, 26 October UTC.
globalThis.Date=class extends RealDate{
 constructor(...args){super(...(args.length?args:[fixed]));}
 static now(){return fixed;}
};
const dom=new JSDOM('<!doctype html><div id="root"></div>',{url:'https://gaber.example.test/#projects'});
globalThis.window=dom.window;globalThis.document=dom.window.document;
globalThis.localStorage=dom.window.localStorage;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const {createRoot}=await import('react-dom/client');
const root=createRoot(document.getElementById('root'));
const server=await createServer({optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true},appType:'custom'});
try{
 const {default:OrderWorkspace}=await server.ssrLoadModule('/src/OrderWorkspace.jsx');
 const {default:OperationsPage}=await server.ssrLoadModule('/src/OperationsPage.jsx');
 const {initialConfig}=await server.ssrLoadModule('/src/domain.js');
 const {readOrderWorkspace,saveOrderCommand}=await server.ssrLoadModule('/src/orderStorage.js');
 const config=initialConfig(),projects=[{id:'exact',name:'Exact kopecks',status:'requested',config}];
 let ws=readOrderWorkspace(localStorage),n=0;
 const send=(role,type,payload,revisionId)=>{
  const event={id:'event-'+(++n),at:'2026-10-24T12:00:00.000Z',role,type,payload,
   expectedVersion:n-1,...(revisionId?{revisionId}:{})};
  ws=saveOrderCommand(localStorage,ws,'exact',event);
 };
 send('client','create',{projectId:'exact',name:'Exact kopecks',config});
 send('partner','assign_factory',{factoryId:'FACTORY-1'});
 send('partner','prepare_spec',{config,customerPriceKopecks:200005,
  factoryCostKopecks:90000,platformCommissionKopecks:50000,logisticsKopecks:10000,
  taxKopecks:5000,otherCostsKopecks:0,advanceBps:5000,dueDate:'2026-10-26',
  technicalNote:'Exact cost and BOM',note:'Exact factory proposal'});
 send('factory','confirm_spec',{reference:'FACTORY-OK',note:'Checked concept'},'S1');
 send('partner','offer',{note:'Exact offer'},'S1');
 send('client','accept',{},'R1');
 send('partner','record_payment',{amountKopecks:100003,reference:'Local exact payment'},'R1');
 await act(async()=>root.render(React.createElement(OrderWorkspace,{projects,role:'client'})));
 // The client assurance panel has a separate .order-ledger for revision IDs,
 // factory ACK reference and date. Test the direct commercial ledger instead.
 const values=[...document.querySelectorAll('.order-columns > div:first-child > dl.order-ledger dd')]
  .map(e=>e.textContent.replace(/\s/g,''));
 assert.deepEqual(values.slice(0,5),['2000,05₽','1000,03₽','1000,03₽','0,00₽','1000,02₽']);
 await act(async()=>root.render(React.createElement(OperationsPage,{projects})));
 const overdue=()=>[...document.querySelectorAll('.gaber-operations-kpis article')]
  .find(e=>e.querySelector('small').textContent==='Просрочка срока').querySelector('strong').textContent;
 assert.equal(overdue(),'1');
 await act(async()=>[...document.querySelectorAll('button')].find(e=>e.textContent.trim()==='Обновить журнал').click());
 assert.equal(overdue(),'1','Refresh must keep Moscow calendar date at UTC date boundary');
 console.log('✓ DOM exact kopecks and consistent local overdue date before/after refresh');
}finally{
 await act(async()=>root.unmount());await server.close();dom.window.close();
 globalThis.Date=RealDate;if(oldTZ===undefined)delete process.env.TZ;else process.env.TZ=oldTZ;
}
