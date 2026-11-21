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
import {getInvestorDemoTemplates} from '../../src/investorDemo.js';

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
const termsFor=(config,customerPriceKopecks)=>({
 config,technicalNote:'Тестовое ТЗ: каркас, обивка, наполнитель и геометрия',
 customerPriceKopecks,factoryCostKopecks:100001,
 platformCommissionKopecks:40001,logisticsKopecks:10000,
 taxKopecks:5000,otherCostsKopecks:100,advanceBps:5000,
 dueDate:'2099-02-01',note:'Только концептуальное предложение QA'
});
function mark(message){
 check.push(message);
 console.log('GABER_BROWSER_PG '+message);
}
const card=(page,id)=>page.locator('article.server-order').filter({hasText:id});
const refresh=page=>page.getByRole('button',{name:'Обновить',exact:true}).click();
async function raw(page,id){
 return page.evaluate(async orderId=>{
  const res=await fetch('/api/v1/orders/'+encodeURIComponent(orderId),{credentials:'same-origin'});
  return {status:res.status,body:await res.json()};
 },id);
}
async function stage(page,id,expected){
 let last;
 for(let i=0;i<35;i++){
  last=await raw(page,id);
  if(last.status===200&&last.body.order?.stage===expected){
   const version=last.body.order.version;
   await page.waitForFunction(({id,version})=>{
    const node=[...document.querySelectorAll('article.server-order')].find(x=>x.textContent.includes(id));
    return node && Number(node.querySelector('.server-facts dd')?.textContent?.trim())===version;
   },{id,version},{timeout:12000});
   return last.body.order;
  }
  await new Promise(resolve=>setTimeout(resolve,120));
 }
 throw Error('QA_STAGE_MISMATCH '+expected+' status='+last?.status+
  ' stage='+last?.body?.order?.stage+' code='+last?.body?.code);
}
async function command(page,id,type,payload={},revisionId=null,expected=201){
 const current=await raw(page,id);
 assert.equal(current.status,200,'Only authenticated order principals can issue commands');
 const requestId='QA-'+randomBytes(10).toString('hex');
 const answer=await page.evaluate(async args=>{
  const res=await fetch('/api/v1/orders/'+encodeURIComponent(args.id)+'/commands',{
   method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},
   body:JSON.stringify({
    requestId:args.requestId,expectedVersion:args.version,
    type:args.type,payload:args.payload,
    ...(args.revisionId?{revisionId:args.revisionId}:{})
   })
  });
  return {status:res.status,data:await res.json()};
 },{id,requestId,type,payload,revisionId,version:current.body.order.version});
 assert.equal(answer.status,expected,
  'QA_COMMAND_'+type+' returned '+answer.status+' '+JSON.stringify(answer.data));
 return answer;
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
 await command(partner,id,'assign_factory',{factoryId:DEV_FACTORY});
 await refresh(factory);
 let f=await stage(factory,id,'requested');
 assert.equal(f.orderId,id);
 mark('factory_assigned_three_cookie_sessions');
 const initial=await raw(partner,id);
 const baseConfig=initial.body.order.config;
 await command(partner,id,'prepare_spec',termsFor(baseConfig,240005));
 await refresh(factory);
 f=await stage(factory,id,'awaiting_factory');
 assert.equal(f.factoryTask.sourceConfig.width,200);
 assert.equal('offer' in f,false);
 assert.equal('economics' in f,false);
 assert.doesNotMatch(await card(factory,id).innerText(),/Комиссия GABER|Цена предложения|2\s?400,05/);
 await command(factory,id,'confirm_spec',{
  reference:'QA-R1-CONCEPT',note:'Концепция подтверждена, не допуск'
 },f.factoryTask.specId);
 await refresh(partner);
 await stage(partner,id,'factory_confirmed');
 await command(partner,id,'offer',{note:'Предложение R1'},'S1');
 await refresh(client);
 o=await stage(client,id,'offered');
 assert.equal(o.offer.revisionId,'R1');
 assert.equal(o.offer.priceKopecks,240005);
 await command(client,id,'accept',{},'R1');
 await refresh(client);
 await stage(client,id,'accepted');
 mark('R1_quote_independent_factory_and_client_consent');
 await command(client,id,'request_change',{note:'Требуется новая ширина 210 см'},'R1');
 await refresh(client);
 o=await stage(client,id,'change_requested');
 assert.equal(o.offer,null);
 const partnerCurrent=await raw(partner,id);
 assert.equal(partnerCurrent.body.order.stage,'change_requested');
 const revisedConfig={...partnerCurrent.body.order.config,width:210};
 await command(partner,id,'prepare_spec',termsFor(revisedConfig,260005));
 await refresh(factory);
 f=await stage(factory,id,'awaiting_factory');
 assert.equal(f.factoryTask.sourceConfig.width,210);
 assert.equal(f.factoryTask.specId,'S2');
 await command(factory,id,'confirm_spec',{
  reference:'QA-R2-CONCEPT',note:'Уточнённая концепция подтверждена'
 },'S2');
 await refresh(partner);
 await stage(partner,id,'factory_confirmed');
 await command(partner,id,'offer',{note:'Новая цена и ширина R2'},'S2');
 await refresh(client);
 o=await stage(client,id,'offered');
 assert.equal(o.offer.revisionId,'R2');
 assert.equal(o.config.width,210);
 assert.equal(o.offer.priceKopecks,260005);
 await command(client,id,'accept',{},'R2');
 await refresh(client);
 await stage(client,id,'accepted');
 mark('R2_geometry_price_and_separate_consent');
 await refresh(partner);
 await stage(partner,id,'accepted');
 await card(partner,id).getByRole('button',{name:'Инженерный паспорт именно этого заказа'}).click();
 await partner.waitForURL(/#technical$/);
 assert.match(await partner.getByRole('note').filter({hasText:id}).first().innerText(),/R2/);
 assert.match(await partner.locator('.technical-page').innerText(),/210 см/);
 mark('server_order_R2_to_exact_BOM');
 const held=await command(factory,id,'start',{},'R2',403);
 assert.equal(held.data.code,'EXTERNAL_AUTHORITY_REQUIRED');
 await refresh(factory);
 await stage(factory,id,'accepted');
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
 mark('database_11_immutable_events_and_factory_HOLD');

 // Matrix: 4 more physical product categories, each an isolated real
 // HTTP/PostgreSQL order with fresh journal, verified roles and concept BOM.
 const templates=getInvestorDemoTemplates().filter(x=>x.config.category!=='bed');
 assert.equal(templates.length,4);
 const matrix=[];
 for(const [i,template] of templates.entries()){
   const label='QA-'+template.id+'-'+randomBytes(3).toString('hex');
   await client.goto(base+'/#orders',{waitUntil:'networkidle'});
   await client.getByLabel('Исходная конфигурация сервера',{exact:true}).selectOption(template.id);
   await client.getByLabel('Название заказа',{exact:true}).fill(label);
   await client.getByRole('button',{name:'Создать заказ на сервере',exact:true}).click();
   const created=card(client,label);
   await created.waitFor();
   const freshId=(await created.locator('header .eyebrow').textContent()).trim();
   assert.match(freshId,/^ORD-[0-9a-f]{24}$/);
   const draft=await stage(client,freshId,'requested');
   assert.equal(draft.config.category,template.config.category);
   assert.deepEqual(draft.config,template.config);
   assert.equal(draft.offer,null);
   assert.equal(draft.finance.verifiedBankKopecks,null);
   await refresh(factory);
   assert.equal(await card(factory,freshId).count(),0);
   await refresh(partner);
   await card(partner,freshId).waitFor();
   await command(partner,freshId,'assign_factory',{factoryId:DEV_FACTORY});
   await refresh(factory);
   await card(factory,freshId).waitFor();
   const price=220005+i*10000;
   await command(partner,freshId,'prepare_spec',termsFor(template.config,price));
   await refresh(factory);
   const spec=await stage(factory,freshId,'awaiting_factory');
   assert.equal(spec.factoryTask.specId,'S1');
   assert.deepEqual(spec.factoryTask.sourceConfig,template.config);
   assert.equal(spec.factoryTask.integrity.ok,true);
   assert.equal('economics' in spec,false);
   const forbidden=await command(client,freshId,'confirm_spec',{reference:'FORGE',note:'not factory'},'S1',403);
   assert.ok(['ROLE_FORBIDDEN','PERSPECTIVE_MISMATCH'].includes(forbidden.data.code));
   await command(factory,freshId,'confirm_spec',{reference:'QA-'+template.id,note:'Concept only'},'S1');
   await command(partner,freshId,'offer',{note:'Concept article matrix'},'S1');
   await refresh(client);
   const offer=await stage(client,freshId,'offered');
   assert.equal(offer.offer.priceKopecks,price);
   await command(client,freshId,'accept',{},'R1');
   await refresh(client);
   const accepted=await stage(client,freshId,'accepted');
   assert.equal(accepted.productionRelease.allowed,false);
   const noRelease=await command(factory,freshId,'start',{},'R1',403);
   assert.equal(noRelease.data.code,'EXTERNAL_AUTHORITY_REQUIRED');
   const saved=await adminPool.query(
    'SELECT seq,command FROM gaber_orders.order_events WHERE tenant_id=$1 AND order_id=$2 ORDER BY seq',
    [DEV_TENANT,freshId]);
   assert.deepEqual(saved.rows.map(x=>x.command.type),
    ['create','assign_factory','prepare_spec','confirm_spec','offer','accept']);
   matrix.push(template.config.category);
 }
 assert.deepEqual(matrix,['sofa','chairbed','headboard','chair']);
 mark('all_five_furniture_categories_are_protected_and_immutable');
 assert.deepEqual(errors,[]);
 console.log('GABER_BROWSER_HTTP_POSTGRES_E2E_GREEN order='+id+' stages='+check.length);
}finally{
 await browser?.close();
 await new Promise(resolve=>server.close(resolve));
 await Promise.allSettled([ordersPool.end(),authPool.end(),adminPool.end()]);
}
