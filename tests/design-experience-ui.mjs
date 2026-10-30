import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import React,{act,useState} from 'react';
import {createServer} from 'vite';

const dom=new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',{url:'https://gaber.example.test/'});
globalThis.window=dom.window;globalThis.document=dom.window.document;
globalThis.navigator=dom.window.navigator;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const {createRoot}=await import('react-dom/client');
const server=await createServer({optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true},appType:'custom'});
const root=createRoot(document.getElementById('root'));
try{
 const {default:DesignExperience}=await server.ssrLoadModule('/src/DesignExperience.jsx');
 const {default:ConfiguratorPanel}=await server.ssrLoadModule('/src/ConfiguratorPanel.jsx');
 const {initialConfig}=await server.ssrLoadModule('/src/domain.js');
 function Harness(){
  const [config,setConfig]=useState(()=>initialConfig());
  const [inspection,setInspection]=useState(false);
  const [explosion,setExplosion]=useState(0);
  const [autoRotate,setAutoRotate]=useState(false);
  const [selectedPart,setSelectedPart]=useState(null);
  return React.createElement(React.Fragment,null,
   React.createElement(DesignExperience,{config,inspection,explosion,autoRotate,reducedMotion:false,selectedPart,
    onAutoRotateChange:setAutoRotate,onInspectionChange:setInspection,onExplosionChange:setExplosion,onSelectPart:setSelectedPart}),
   React.createElement(ConfiguratorPanel,{config,step:'details',change:patch=>setConfig(old=>({...old,...patch})),start:()=>{},onTechnical:()=>{},onCosting:()=>{}}));
 }
 await act(async()=>root.render(React.createElement(Harness)));
 const button=label=>{const el=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()===label);assert.ok(el,'Missing button: '+label);return el;};
 const click=async label=>act(async()=>button(label).click());
 const select=async(label,value)=>act(async()=>{const el=document.querySelector(`[aria-label="${label}"]`);assert.ok(el,'Missing select: '+label);Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype,'value').set.call(el,value);el.dispatchEvent(new window.Event('change',{bubbles:true}));});
 await click('Обзор 360°');assert.equal(button('Остановить 360°').getAttribute('aria-pressed'),'true');
 await click('Остановить 360°');assert.ok(button('Обзор 360°'));
 await click('Разобрать');assert.equal(document.querySelector('[aria-label="Разнесение элементов"]').value,'100');
 await select('Описание элемента','seat');
 assert.match(document.querySelector('.design-part-card').textContent,/Сиденье/);
 assert.match(document.querySelector('.design-part-card').textContent,/Многослойный ППУ/);
 await select('Сердечник сиденья','pocket');
 assert.match(document.querySelector('.design-part-card').textContent,/Pocket Spring/);
 await act(async()=>{const input=document.querySelector('[aria-label="Разнесение элементов"]');Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(input,'45');input.dispatchEvent(new window.Event('input',{bubbles:true}));input.dispatchEvent(new window.Event('change',{bubbles:true}));});
 assert.equal(document.querySelector('.design-explosion-control output').textContent,'45%');
 await click('Собрать');assert.equal(document.querySelector('[aria-label="Разнесение элементов"]').value,'0');
 await act(async()=>document.querySelector('[aria-label="Закрыть описание детали"]').click());
 assert.equal(document.querySelector('.design-part-card'),null);
 await click('Обивка');assert.equal(document.querySelector('[aria-label="Разнесение элементов"]'),null);
 const toggle=label=>{const el=[...document.querySelectorAll('label.option-toggle')].find(x=>x.textContent.trim()===label)?.querySelector('input');assert.ok(el,'Missing toggle: '+label);return el;};
 await act(async()=>toggle('Встроенная зарядка USB').click());
 await act(async()=>toggle('Встроенные светильники').click());
 await select('Подлокотники','none');
 assert.equal(toggle('Встроенная зарядка USB').checked,false);
 assert.equal(toggle('Встроенная зарядка USB').disabled,true);
 assert.equal(toggle('Встроенные светильники').checked,false);
 assert.equal(toggle('Встроенные светильники').disabled,true);
 await select('Чехлы','removable');
 await select('Подлокотники','rounded');
 await act(async()=>toggle('Встроенная зарядка USB').click());
 assert.match(document.querySelector('.design-advisories').textContent,/съёмн|чехл|сервис/i);
 console.log('✓ design DOM: 360°, explode/assemble, slider, dynamic part details, arm/electrics guard and advisories');
}finally{await act(async()=>root.unmount());await server.close();dom.window.close();}
