/** Real Chrome -> 3 cookie sessions -> HTTP -> PostgreSQL 17 / RLS.
 * Run ONLY on disposable staging. No actual payments, manufacturing or approvals.
 */
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {randomBytes} from 'node:crypto';
import pg from 'pg';
import {createGaberHttpServer} from '../httpServer.js';
import {wirePostgresOrderJournal} from '../orderJournalWiring.js';
import {createPgAuthStore} from '../auth/authStore.js';
import {createAuthService} from '../auth/authService.js';
import {devUsers,DEV_TENANT,DEV_FACTORY} from '../dev/seed-data.js';

if(process.env.NODE_ENV==='production')throw Error('QA_PRODUCTION_FORBIDDEN');
for(const k of ['GABER_ORDERS_DATABASE_URL','GABER_AUTH_DATABASE_URL','GABER_DEV_ADMIN_DATABASE_URL']){
 if(!process.env[k])throw Error('QA_REQUIRES_DISPOSABLE_'+k);
}
const require=createRequire(import.meta.url);
const {chromium}=require('playwright');
const {Pool}=pg;
const ordersPool=new Pool({connectionString:process.env.GABER_ORDERS_DATABASE_URL,max:6});
const authPool=new Pool({connectionString:process.env.GABER_AUTH_DATABASE_URL,max:4});
const adminPool=new Pool({connectionString:process.env.GABER_DEV_ADMIN_DATABASE_URL,max:2});
const origins=[];
const server=createGaberHttpServer({
 journal:wirePostgresOrderJournal({pool:ordersPool}),
 authService:createAuthService({store:createPgAuthStore({pool:authPool}),tenantId:DEV_TENANT,mfaAssumed:true}),
 allowedOrigins:origins,serverInfo:{devMfaAssumed:true,devSimulatedAuthority:false},
 staticDir:fileURLToPath(new URL('../../dist/',import.meta.url)),
 secureCookie:false
});
let browser;
const check=[],errors=[];
const name='QA-R2-'+randomBytes(5).toString('hex');
const terms={
 'Техническое задание':'Концептуальное ТЗ: каркас, наполнение, обивка',
 'Цена клиенту, ₽':'2400,05','Стоимость у фабрики, ₽':'1000,01',
 'Комиссия GABER, ₽':'400,01','Логистика, ₽':'100',
 'Налоги, ₽':'50','Прочие затраты, ₽':'1',
 'Аванс, % от цены':'50','Срок (ГГГГ-ММ-ДД)':'2099-02-01',
 'Комментарий к предложению':'QA концептуальное предложение'
};
function mark(x){check.push(x);console.log('GABER_BROWSER_PG '+x);}
const card=(page,id)=>page.locator('article.server-order').filter({hasText:id});
const refresh=page=>page.getByRole('button',{name:'Обновить',exact:true}).click();
async function execute(page,id,action,fields={}){
 const form=card(page,id).locator('form.server-action').filter({
  has:page.getByRole('button',{name:action,exact:true})
 });
 await form.waitFor();
 const entries=Object.entries(fields);
 // A server-driven rerender may replace inputs just as automated typing
 // starts. Verify the DOM draft survives before allowing form submission.
 // Unlike a naive click, this never sends an accidentally empty price.
 let stable=false;
 for(let attempt=0;attempt<4;attempt++){
  for(const [label,value] of entries){
   const input=form.getByLabel(label,{exact:true});
   if(await input.inputValue()!==String(value))await input.fill(String(value));
  }
  await page.waitForTimeout(80);
  const actual=await Promise.all(entries.map(async ([label])=>
   form.getByLabel(label,{exact:true}).inputValue()));
  stable=entries.every(([label,value],i)=>actual[i]===String(value));
  if(stable)break;
  if(attempt===3)throw Error('QA_FORM_DRAFT_LOST '+JSON.stringify(
   entries.filter(([label,value],i)=>actual[i]!==String(value)).map(x=>x[0])));
 }
 if(!stable)throw Error('QA_FORM_NOT_STABLE');
 await form.getByRole('button',{name:action,exact:true}).click();
}
async function raw(page,id){
 return page.evaluate(async orderId=>{
  const res=await fetch('/api/v1/orders/'+encodeURIComponent(orderId),{credentials:'same-origin'});
  return {status:res.status,body:await res.json()};
 },id);
}
async function stage(page,id,expected){
 let last;
 for(let i=0;i<30;i++){
  last=await raw(page,id);
  if(last.status===200 && last.body.order?.stage===expected){
   const version=last.body.order.version;
   // HTTP may have committed before React's async refresh finishes. A
   // subsequent button must use the exact current version, not stale props.
   await page.waitForFunction(({orderId,version})=>{
    const root=[...document.querySelectorAll('article.server-order')].find(node=>node.textContent.includes(orderId));
    const displayed=Number(root?.querySelector('.server-facts dd')?.textContent?.trim());
    return root && displayed===version;
   },{orderId:id,version},{timeout:10000});
   return last.body.order;
  }
  await new Promise(resolve=>setTimeout(resolve,120));
 }
 const alerts=await page.locator('[role="alert"]').allTextContents();
 throw Error('ORDER_STAGE_NOT_REACHED '+id+' '+expected+' actual='+last?.body?.order?.stage+
  ' version='+last?.body?.order?.version+' code='+last?.body?.code+' alerts='+JSON.stringify(alerts));
}
try{
 server.listen(0,'127.0.0.1');
 await once(server,'listening');
 const base='http://127.0.0.1:'+server.address().port;
 origins.push(base);
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const pages={};
 for(const role of ['client','partner','factory']){
  const context=await browser.newContext({viewport:{width:1280,height:900}});
  const page=await context.newPage();pages[role]=page;
  page.on('pageerror',e=>errors.push(role+': '+String(e)));
  await page.goto(base+'/#orders',{waitUntil:'networkidle'});
  const user=devUsers.find(x=>x.role===role);
  await page.getByLabel('Почта',{exact:true}).fill(user.email);
  await page.getByLabel('Пароль',{exact:true}).fill(user.password);
  await page.getByRole('button',{name:'Войти',exact:true}).click();
  await page.getByText(user.email,{exact:false}).first().waitFor();
 }
 const client=pages.client,partner=pages.partner,factory=pages.factory;
 await client.getByLabel('Исходная конфигурация сервера',{exact:true}).selectOption('GABER-DEMO-NOTTE-05');
 await client.getByLabel('Название заказа',{exact:true}).fill(name);
 await client.getByRole('button',{name:'Создать заказ на сервере'}).click();
 const row=client.locator('article.server-order').filter({hasText:name});
 await row.waitFor();
 // CSS uppercases visible text; read raw order ID, not text-transform output.
 const id=(await row.locator('header .eyebrow').textContent()).trim();
 assert.match(id,/^ORD-[0-9a-f]{24}$/);
 let o=await stage(client,id,'requested');
 assert.equal(o.config.category,'bed');assert.equal(o.config.width,200);
 assert.equal(o.offer,null);assert.equal(o.revisionId,null);
 assert.equal(o.productionRelease.allowed,false);
 mark('client_new_product_template_server_order');
 await refresh(factory);
 assert.equal(await card(factory,id).count(),0);
 await refresh(partner);await card(partner,id).waitFor();
 await execute(partner,id,'Назначить фабрику',{'Код фабрики из реестра':DEV_FACTORY});
 await refresh(factory);await card(factory,id).waitFor();
 mark('three_independent_cookie_sessions_and_factory_assignment');
 await execute(partner,id,'Подготовить ТЗ и расчёт',terms);
 await refresh(factory); // A different browser session never auto-refreshes its DOM.
 o=await stage(factory,id,'awaiting_factory');
 assert.equal(o.factoryTask.sourceConfig.width,200);
 assert.equal('offer' in o,false);
 assert.equal('economics' in o,false);
 assert.doesNotMatch(await card(factory,id).innerText(),/Комиссия GABER|Цена предложения|2\s?400,05/);
 await execute(factory,id,'Подтвердить ТЗ',{
  'Номер подтверждения':'QA-ACK-R1','Комментарий':'Только концептуальная проверка'
 });
 await refresh(partner);
 await execute(partner,id,'Опубликовать предложение клиенту',{'Комментарий клиенту':'Предложение R1'});
 await refresh(client);
 o=await stage(client,id,'offered');
 assert.equal(o.offer.revisionId,'R1');assert.equal(o.offer.priceKopecks,240005);
 await card(client,id).getByRole('button',{name:'Принять предложение',exact:true}).click();
 await stage(client,id,'accepted');
 mark('R1_factory_confirmed_client_accepted');
 await execute(client,id,'Запросить изменение',{'Что необходимо изменить':'Новая ширина кровати 210 см'});
 o=await stage(client,id,'change_requested');
 assert.equal(o.offer,null);
 await refresh(partner);
 const edit={'Ширина, см':'210',...terms,'Цена клиенту, ₽':'2600,05'};
 await execute(partner,id,'Подготовить ТЗ и расчёт',edit);
 const revised=await raw(partner,id);
 if(revised.body?.order?.stage!=='awaiting_factory'){
  const alerts=await partner.locator('[role="alert"]').allTextContents();
  throw Error('R2_SPEC_NOT_COMMITTED status='+revised.status+' stage='+revised.body?.order?.stage+
   ' error='+JSON.stringify(alerts)+' version='+revised.body?.order?.version);
 }
 await refresh(factory);
 o=await stage(factory,id,'awaiting_factory');
 assert.equal(o.factoryTask.sourceConfig.width,210);
 await execute(factory,id,'Подтвердить ТЗ',{
  'Номер подтверждения':'QA-ACK-R2','Комментарий':'Новое концептуальное ТЗ'
 });
 await refresh(partner);
 await execute(partner,id,'Опубликовать предложение клиенту',{'Комментарий клиенту':'Предложение R2'});
 await refresh(client);
 o=await stage(client,id,'offered');
 assert.equal(o.offer.revisionId,'R2');assert.equal(o.config.width,210);
 assert.equal(o.offer.priceKopecks,260005);
 await card(client,id).getByRole('button',{name:'Принять предложение',exact:true}).click();
 await stage(client,id,'accepted');
 mark('R2_revised_geometry_independent_approvals');
 await refresh(partner);
 await card(partner,id).getByRole('button',{name:'Инженерный паспорт именно этого заказа'}).click();
 await partner.waitForURL(/#technical$/);
 const text=await partner.getByRole('note').filter({hasText:id}).first().innerText();
 assert.match(text,/R2/);
 assert.match(await partner.locator('.technical-page').innerText(),/210 см/);
 mark('R2_server_order_link_to_exact_concept_BOM');
 await refresh(factory);
 assert.equal(await card(factory,id).getByRole('button',{name:'Начать производство'}).count(),0);
 assert.match(await card(factory,id).innerText(),/PRODUCTION HOLD/);
 const query=await adminPool.query(
  'SELECT seq,command FROM gaber_orders.order_events WHERE tenant_id=$1 AND order_id=$2 ORDER BY seq',
  [DEV_TENANT,id]
 );
 assert.equal(query.rows.length,11);
 assert.equal(query.rows[7].command.type,'prepare_spec');
 assert.equal(query.rows[7].command.payload.config.width,210);
 assert.equal(query.rows.at(-1).command.type,'accept');
 assert.ok(query.rows.every(x=>x.command.type!=='start'));
 assert.deepEqual(errors,[]);
 mark('database_11_immutable_events_and_factory_HOLD');
 console.log('GABER_BROWSER_HTTP_POSTGRES_E2E_GREEN order='+id+' stages='+check.length);
}finally{
 await browser?.close();
 await new Promise(resolve=>server.close(resolve));
 await Promise.allSettled([ordersPool.end(),authPool.end(),adminPool.end()]);
}
