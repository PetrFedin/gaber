/**
 * Optional real-Chromium acceptance harness for the built investor demo.
 * Start a Vite preview server first; set GABER_PLAYWRIGHT_MODULE to an installed
 * Playwright ESM entrypoint if this repository has no browser dependency.
 * This test never uses real payment endpoints or production sessions.
 */
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';

const base=process.env.GABER_PREVIEW_URL ?? 'http://127.0.0.1:4188';
const importer=process.env.GABER_PLAYWRIGHT_MODULE
 ? pathToFileURL(resolve(process.env.GABER_PLAYWRIGHT_MODULE)).href:'playwright';
let playwright;
try{playwright=await import(importer);}catch(error){
 throw new Error('PLAYWRIGHT_NOT_AVAILABLE: install Playwright in QA environment or set GABER_PLAYWRIGHT_MODULE', {cause:error});
}
const launch=process.env.GABER_CHROME_PATH?{executablePath:process.env.GABER_CHROME_PATH}:{channel:'chrome'};
const browser=await playwright.chromium.launch({headless:true,...launch,
 args:['--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
const errors=[];page.on('pageerror',e=>errors.push(String(e)));
const evidence=process.env.GABER_EVIDENCE_DIR ? resolve(process.env.GABER_EVIDENCE_DIR):null;
if(evidence)await mkdir(evidence,{recursive:true});
const screenshot=async(name)=>{if(evidence)await page.screenshot({path:join(evidence,name),fullPage:true});};
const go=async(hash)=>page.goto(base+'/'+hash,{waitUntil:'networkidle',timeout:45000});
const selected=async(id)=>page.locator('.order-workspace select').first().selectOption(id);
try{
 await go('#partner');
 await page.getByRole('button',{name:'Загрузить 5 демо-артикулов'}).click();
 await page.getByText('Добавлено 5 демо-артикулов.',{exact:false}).waitFor();
 const ids=['GABER-DEMO-LINEA-01','GABER-DEMO-CAMBIO-04','GABER-DEMO-NOTTE-05','GABER-DEMO-TELA-03','GABER-DEMO-FORMA-02'];
 const options=await page.locator('.order-workspace select').first().locator('option').evaluateAll(items=>items.map(x=>x.value));
 assert.deepEqual(ids.filter(x=>options.includes(x)),ids);
 await selected('GABER-DEMO-NOTTE-05');
 await page.getByRole('button',{name:'BOM и схема сборки · этот артикул'}).click();
 await page.waitForURL(/#technical$/);
 const tech=await page.getByRole('note').filter({hasText:'GABER-DEMO-NOTTE-05'}).first().innerText();
 assert.match(tech,/GABER-DEMO-NOTTE-05/);
 assert.match(tech,/R2/);
 assert.match(await page.locator('.technical-page').innerText(),/200 см/);
 await page.getByRole('button',{name:/Пакет этого демо-заказа \+ BOM JSON/}).waitFor();
 await screenshot('01-order-linked-technical-1440.png');
 await go('#partner');await selected('GABER-DEMO-NOTTE-05');
 await page.getByRole('button',{name:'Открыть смету и нормы · этот артикул'}).click();
 await page.waitForURL(/#costing$/);
 assert.match(await page.getByRole('note').filter({hasText:'GABER-DEMO-NOTTE-05'}).first().innerText(),/GABER-DEMO-NOTTE-05/);
 assert.match(await page.getByRole('note').filter({hasText:'GABER-DEMO-NOTTE-05'}).first().innerText(),/не равны сохранённым коммерческим условиям/);
 await go('#factory');
 await selected('GABER-DEMO-LINEA-01');
 const factory=await page.locator('.order-workspace').innerText();
 assert.doesNotMatch(factory,/Комиссия GABER|Плановый резерв|Цена предложения|460\s?000,00/);
 assert.equal(await page.locator('.order-payment-progress').count(),0);
 assert.match(factory,/Стоимость изготовления/);
 await screenshot('02-factory-private-cost-1440.png');
 await go('#projects');await selected('GABER-DEMO-LINEA-01');
 const client=await page.locator('.order-workspace').innerText();
 assert.match(client,/Цена предложения/);
 assert.match(client,/460\s?000,00/);
 assert.doesNotMatch(client,/Плановый резерв|Комиссия GABER|Стоимость изготовления/);
 await selected('GABER-DEMO-CAMBIO-04');
 assert.doesNotMatch(await page.locator('.order-workspace').innerText(),/Цена предложения|170\s?000,00/);
 await selected('GABER-DEMO-FORMA-02');
 assert.match(await page.locator('.order-workspace').innerText(),/Замечание/);
 await selected('GABER-DEMO-TELA-03');
 assert.match(await page.locator('.order-workspace').innerText(),/Готов/);
 await screenshot('03-client-article-states-1440.png');
 await go('#studio');
 assert.ok(await page.locator('.scene-host canvas').count()>0,'WebGL canvas must render');
 const lighting=page.getByLabel('Освещение');
 await lighting.selectOption('cool');
 assert.equal(await lighting.inputValue(),'cool');
 await page.setViewportSize({width:375,height:812});
 await go('#partner');await selected('GABER-DEMO-NOTTE-05');
 await page.getByRole('button',{name:'BOM и схема сборки · этот артикул'}).click();
 await page.waitForURL(/#technical$/);
 assert.match(await page.getByRole('note').filter({hasText:'GABER-DEMO-NOTTE-05'}).first().innerText(),/GABER-DEMO-NOTTE-05/);
 await screenshot('04-mobile-order-linked-technical-375.png');
 const docWidth=await page.evaluate(()=>document.documentElement.scrollWidth);
 assert.ok(docWidth<=375,`unexpected mobile page overflow ${docWidth}`);
 if(errors.length)throw Error('CHROME_PAGE_ERRORS: '+errors.join(' | '));
 console.log('GABER_INVESTOR_BROWSER_GREEN: 5 fixtures; partner R2 BOM and costing; client/factory price isolation; WebGL lighting; Chrome 1440 and 375; 0 page exceptions');
}finally{await browser.close();}
