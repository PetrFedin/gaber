import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import React,{act} from 'react';
import {createServer} from 'vite';

const dom=new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>',
 {url:'https://gaber.example.test/#projects'});
globalThis.window=dom.window;globalThis.document=dom.window.document;
globalThis.localStorage=dom.window.localStorage;
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const {createRoot}=await import('react-dom/client');
const server=await createServer({optimizeDeps:{noDiscovery:true,include:[]},
 server:{middlewareMode:true},appType:'custom'});
const root=createRoot(document.getElementById('root'));
try{
 const {default:Workspace}=await server.ssrLoadModule('/src/OrderWorkspace.jsx');
 const {initialConfig}=await server.ssrLoadModule('/src/domain.js');
 const {readOrderWorkspace,ORDER_STORAGE_KEY}=await server.ssrLoadModule('/src/orderStorage.js');
 const projects=[{id:'ui-project',name:'Linea sofa',status:'requested',config:initialConfig()}];
 let renders=0;
 const render=async role=>act(async()=>root.render(React.createElement(Workspace,
  {key:role+(++renders),role,projects})));
 const button=label=>{
  const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()===label);
  assert.ok(b,'Missing button: '+label);return b;
 };
 const click=async label=>act(async()=>{
  const b=button(label);assert.equal(b.disabled,false,'Disabled: '+label);b.click();
 });
 const field=label=>{
  const el=[...document.querySelectorAll('label')].find(x=>x.textContent.trim()===label);
  assert.ok(el,'Missing field: '+label);
  return el.querySelector('input,textarea,select');
 };
 const fill=async(label,value)=>act(async()=>{
  const el=field(label),proto=el.tagName==='TEXTAREA'?window.HTMLTextAreaElement.prototype:window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto,'value').set.call(el,value);
  el.dispatchEvent(new window.Event('input',{bubbles:true}));
 });
 const state=()=>readOrderWorkspace(localStorage).orders[0].state;
 const pay=async(sum,reference)=>{
  await fill('Сумма, ₽',sum);
  await fill('Номер / ссылка на платёжный документ',reference);
 };
 await render('client');await click('Создать заказ из проекта');
 assert.equal(state().stage,'requested');
 await render('partner');
 for(const [label,value] of [
  ['Цена клиенту, ₽','1200'],['Себестоимость фабрики, ₽','700'],
  ['Комиссия Габер, ₽','200'],['Логистика, ₽','50'],
  ['Налоги, ₽','50'],['Прочие расходы, ₽','0'],
  ['Плановая дата готовности','2027-01-01'],
  ['Техническое задание фабрике','Каркас, допуски, наполнитель, обивка и швы'],
  ['Описание предложения','Цена после заводского подтверждения']
 ])await fill(label,value);
 await click('Отправить ТЗ фабрике на подтверждение');
 assert.equal(state().stage,'awaiting_factory');
 assert.equal(state().specs[0].economics.platformCommissionKopecks,20000);
 await render('client');
 assert.doesNotMatch(document.body.textContent,/200,00\s*₽/);
 assert.match(document.body.textContent,/Локальное подтверждение концепт-ТЗ ещё не получено/);
 assert.doesNotMatch(document.body.textContent,/ACK-1/);
 assert.equal([...document.querySelectorAll('button')].some(b=>b.textContent==='Согласовать R1'),false);
 await render('factory');
 assert.match(document.body.textContent,/Каркас, допуски/);
 assert.doesNotMatch(document.body.textContent,/Комиссия Габер/);
 assert.doesNotMatch(document.body.textContent,/Цена клиенту, ₽/);
 await fill('Документ подтверждения фабрики','ACK-1');
 await fill('Комментарий фабрики','Концепция подтверждена, выпуск CAD ещё требуется');
 await click('Подтвердить ТЗ · локально');
 assert.equal(state().stage,'factory_confirmed');
 await render('partner');await click('Опубликовать предложение клиенту');
 assert.equal(state().stage,'offered');
 await render('client');
 const assurance=document.querySelector('.client-offer-assurance');
 assert.ok(assurance,'Client sees the exact offer acknowledgement');
 assert.match(assurance.textContent,/Концепт-ТЗ подтверждено в локальном сценарии/);
 assert.match(assurance.textContent,/ACK-1/);
 assert.match(assurance.textContent,/R1/);
 assert.match(assurance.textContent,/S1/);
 assert.match(assurance.textContent,/не подтверждает реальную фабрику, мощности, календарную дату/);
 assert.doesNotMatch(assurance.textContent,/Концепция подтверждена, выпуск CAD|1200|700|200/);
 assert.match(document.body.textContent,/Проектная дата готовности · календарь не подтверждён/);
 assert.doesNotMatch(document.body.textContent,/Производственное подтверждение конструкции ещё не получено/);
 assert.equal(button('Согласовать R1').disabled,true);
 await act(async()=>document.querySelector('.order-decision input').click());
 await click('Согласовать R1');assert.equal(state().acceptedRevisionId,'R1');
 await pay('600','CLIENT-CLAIM');await click('Сообщить об оплате');
 assert.equal(state().paymentClaims.length,1);
 await render('partner');await pay('600','LOCAL-NOT-BANK');
 await click('Добавить локальную запись оплаты');
 assert.equal(state().payments.length,1);
 assert.equal(state().productionRelease.allowed,false);
 await render('factory');
 assert.equal(document.querySelector('.order-payments'),null,'Factory cannot inspect client payment claims or operator money ledger');
 assert.doesNotMatch(document.body.textContent,/Комиссия Габер|LOCAL-NOT-BANK/);
 await click('Запустить производственный сценарий');
 assert.equal(state().stage,'production');
 await click('Передать на контроль качества');
 await fill('Акт контроля качества','QC-CONCEPT');
 await click('Зафиксировать контроль · локально');
 assert.equal(button('Зафиксировать отгрузку · локально').disabled,true);
 await render('partner');await pay('600','LOCAL-REMAINING');
 await click('Добавить локальную запись оплаты');
 await render('factory');
 await fill('Перевозчик','TEST carrier');
 await fill('Номер отправления','TRACK-1');
 await fill('Отгрузочный документ','PACK-1');
 await click('Зафиксировать отгрузку · локально');
 await fill('Подтверждение доставки','POD-1');
 await click('Зафиксировать доставку · локально');
 await render('client');await click('Принять доставленный заказ');
 assert.equal(state().stage,'closed');
 assert.equal(state().productionRelease.allowed,false);
 console.log('✓ three-role local DOM: client → partner pricing/TZ → factory consent → client offer/payment → factory QC/shipment → delivery HOLD');
 // A second local order proves that a customer-initiated change immediately
 // invalidates the old quote and factory acknowledgement in the client view.
 localStorage.removeItem(ORDER_STORAGE_KEY);
 await render('client');await click('Создать заказ из проекта');
 await render('partner');
 for(const [label,value] of [
  ['Цена клиенту, ₽','1200'],['Себестоимость фабрики, ₽','700'],
  ['Комиссия Габер, ₽','200'],['Логистика, ₽','50'],
  ['Налоги, ₽','50'],['Прочие расходы, ₽','0'],
  ['Плановая дата готовности','2027-01-01'],
  ['Техническое задание фабрике','Первичное ТЗ без утверждённого CAD'],
  ['Описание предложения','Первоначальная цена']
 ])await fill(label,value);
 await click('Отправить ТЗ фабрике на подтверждение');
 await render('factory');
 await fill('Документ подтверждения фабрики','ACK-OLD');
 await fill('Комментарий фабрики','Внутренний комментарий по старому ТЗ');
 await click('Подтвердить ТЗ · локально');
 await render('partner');await click('Опубликовать предложение клиенту');
 await render('client');await act(async()=>document.querySelector('.order-decision input').click());
 await click('Согласовать R1');
 await fill('Что необходимо скорректировать','Ширина 300 см');
 await click('Запросить корректировку');
 assert.equal(state().stage,'change_requested');
 assert.equal(state().acceptedRevisionId,null);
 assert.match(document.body.textContent,/Прежнее предложение отозвано/);
 assert.match(document.querySelector('.client-offer-assurance').textContent,/Локальное подтверждение концепт-ТЗ ещё не получено/);
 assert.doesNotMatch(document.body.textContent,/ACK-OLD|Внутренний комментарий по старому ТЗ|Цена предложения|1200,00/);
 assert.equal([...document.querySelectorAll('button')].some(b=>b.textContent.includes('Скачать полный журнал')),false);
 await render('partner');
 assert.ok([...document.querySelectorAll('button')].some(b=>b.textContent.includes('Скачать полный журнал')));
 await fill('Ширина изделия, см','300');
 await fill('Цена клиенту, ₽','1300');
 await click('Отправить ТЗ фабрике на подтверждение');
 assert.equal(state().stage,'awaiting_factory');
 await render('client');
 assert.doesNotMatch(document.body.textContent,/1300,00|1200,00|Цена предложения|ACK-OLD/);
 await render('factory');
 assert.equal([...document.querySelectorAll('button')].some(b=>b.textContent.includes('Скачать полный журнал')),false);
 await fill('Документ подтверждения фабрики','ACK-NEW');
 await fill('Комментарий фабрики','Новое ТЗ проверено');
 await click('Подтвердить ТЗ · локально');
 await render('client');
 assert.doesNotMatch(document.body.textContent,/Цена предложения|ACK-NEW/);
 await render('partner');await click('Опубликовать предложение клиенту');
 await render('client');
 assert.match(document.body.textContent,/1300,00/);
 assert.match(document.querySelector('.client-offer-assurance').textContent,/ACK-NEW/);
 assert.equal(button('Согласовать R2').disabled,true);
 assert.equal(state().productionRelease.allowed,false);
 console.log('✓ three-role quote lifecycle: stale R1 fully revoked, S2 factory-reviewed, only partner publishes R2');
 localStorage.setItem(ORDER_STORAGE_KEY,'{corrupt');
 await render('partner');
 assert.match(document.querySelector('[role=alert]').textContent,/Запись заблокирована/);
 assert.equal([...document.querySelectorAll('button')].some(b=>b.textContent==='Отправить ТЗ фабрике на подтверждение'),false);
 console.log('✓ corrupted local order journal blocks all partner writes');
}finally{
 await act(async()=>root.unmount());await server.close();dom.window.close();
}
