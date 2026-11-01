// Actual Chromium smoke for the built, local-only GABER demo.
// This does NOT establish real multi-user login, PostgreSQL or PSP E2E.
// Node 24 built-ins only: no browser test runner, cloud service or plugin.
import assert from 'node:assert/strict';
import {spawn,spawnSync,execFileSync} from 'node:child_process';
import {mkdtemp,readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';

const base='http://127.0.0.1:4173';
const screenshots=resolve('qa/browser-smoke');
const sha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const delay=ms=>new Promise(done=>setTimeout(done,ms));
async function waitFor(probe,label,ms=20000){
 const until=Date.now()+ms,failures=[];
 while(Date.now()<until){
  try{const v=await probe();if(v)return v;}catch(e){failures.push(String(e.message??e));}
  await delay(160);
 }
 throw Error(label+' TIMEOUT '+failures.slice(-3).join(' | '));
}
function chromeExecutable(){
 for(const name of ['google-chrome','google-chrome-stable','chromium','chromium-browser']){
  const p=spawnSync('sh',['-c','command -v '+name],{encoding:'utf8'});
  if(p.status===0&&p.stdout.trim())return p.stdout.trim();
 }
 throw Error('CHROME_NOT_INSTALLED_ON_GITHUB_RUNNER');
}
let preview=null,chrome=null,ws=null,profile=null;
let commandId=0;const pending=new Map(),runtimeErrors=[];
const screenshotPath=(size,route)=>join(screenshots,size+'-'+route+'.png');
async function send(method,params={}){
 const id=++commandId;
 return new Promise((resolve,reject)=>{
  pending.set(id,{resolve,reject});
  ws.send(JSON.stringify({id,method,params}));
 });
}
async function evaluate(expression){
 const result=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
 if(result.exceptionDetails)throw Error('CHROME_JS_EXCEPTION '+JSON.stringify(result.exceptionDetails).slice(0,700));
 return result.result?.value;
}
const snapshotExpression='(() => { const w=document.documentElement.clientWidth; const e=document.getElementById("gaber-order-workspace"); return {ready:document.readyState, title:document.title, viewport:w, outerViewport:window.innerWidth, scrollWidth:document.documentElement.scrollWidth, bodyScrollWidth:document.body.scrollWidth, role:e?.getAttribute("aria-label")??null, studio:!!document.querySelector("main.studio"), h1:document.querySelector("h1")?.textContent?.trim()??"", nav:!!document.querySelector("nav[aria-label]"), error:document.querySelector("[role=alert]")?.textContent?.trim()??null}; })()';
try{
 await mkdir(screenshots,{recursive:true});
 const executable=chromeExecutable();
 preview=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','4173','--strictPort'],{stdio:'ignore'});
 await waitFor(async()=>{try{return (await fetch(base)).ok}catch{return false}},'VITE_PREVIEW_NOT_SERVING');
 profile=await mkdtemp(join(tmpdir(),'gaber-chrome-'));
 chrome=spawn(executable,['--headless=new','--no-sandbox','--disable-dev-shm-usage',
  '--disable-gpu','--remote-allow-origins=*','--remote-debugging-port=0',
  '--user-data-dir='+profile,'about:blank'],{stdio:'ignore'});
 const port=await waitFor(async()=>{
  const s=await readFile(join(profile,'DevToolsActivePort'),'utf8');
  const p=Number(s.split('\n')[0]);return Number.isInteger(p)&&p>0?p:null;
 },'CHROME_REMOTE_DEBUGGING_UNAVAILABLE');
 const list=await waitFor(async()=>{
  const v=await (await fetch('http://127.0.0.1:'+port+'/json/list')).json();
  return v.find(x=>x.type==='page'&&x.webSocketDebuggerUrl);
 },'CHROME_PAGE_NOT_AVAILABLE');
 ws=new WebSocket(list.webSocketDebuggerUrl);
 await new Promise((ok,fail)=>{
  ws.addEventListener('open',ok,{once:true});
  ws.addEventListener('error',()=>fail(Error('CHROME_WS_CONNECT_FAILED')),{once:true});
 });
 ws.addEventListener('message',event=>{
  const data=JSON.parse(String(event.data));
  if(data.method==='Runtime.exceptionThrown')runtimeErrors.push(
   JSON.stringify(data.params?.exceptionDetails??data.params).slice(0,700));
  if(data.id!==undefined&&pending.has(data.id)){
   const cb=pending.get(data.id);pending.delete(data.id);
   data.error?cb.reject(Error('CDP '+JSON.stringify(data.error))):cb.resolve(data.result);
  }
 });
 await send('Page.enable');await send('Runtime.enable');
 const routes=[
  {hash:'projects',role:'Кабинет клиента',studio:false},
  {hash:'factory',role:'Кабинет фабрики',studio:false},
  {hash:'partner',role:'Кабинет партнёра GABER',studio:false},
  {hash:'studio',role:null,studio:true}
 ];
 let checks=0,images=0;
 for(const width of [375,768,1440]){
  const height=width===375?812:width===768?1024:900;
  await send('Emulation.setDeviceMetricsOverride',
   {width,height,deviceScaleFactor:1,mobile:width<600});
  for(const route of routes){
   await send('Page.navigate',{url:base+'/#'+route.hash});
   let result;
   try{
    result=await waitFor(async()=>{
     const s=await evaluate(snapshotExpression);
     return s?.ready==='complete'&&s.nav&&
      (route.studio?s.studio:s.role?.includes(route.role))?s:null;
    },'ROUTE_NOT_RENDERED '+width+' '+route.hash);
   }catch(error){
    const last=await evaluate(snapshotExpression).catch(e=>({evalError:String(e)}));
    throw Error(error.message+' lastSnapshot='+JSON.stringify(last)+
     ' lastRuntimeErrors='+runtimeErrors.slice(-4).join(' | '));
   }
   assert.equal(result.outerViewport,width,
    'Wrong Chrome emulated outer viewport '+JSON.stringify({width,route:route.hash,result}));
   // Desktop Chrome reserves 15px for a classic vertical scrollbar:
   // html.clientWidth is the actual content viewport, not window.innerWidth.
   assert.ok(result.viewport<=width&&result.viewport>=width-20,
    'Unexpected content viewport '+JSON.stringify({width,route:route.hash,result}));
   assert.ok(result.scrollWidth<=result.viewport+4,
    'Horizontal document overflow at '+width+' '+route.hash+': '+JSON.stringify(result));
   assert.ok(result.bodyScrollWidth<=result.viewport+4,
    'Body overflow at '+width+' '+route.hash+': '+JSON.stringify(result));
   assert.ok(!result.error,
    'Unexpected error banner at '+width+' '+route.hash+': '+result.error);
   if(route.studio)assert.ok(result.studio,'Studio not rendered');
   else assert.ok(result.role.includes(route.role),'Wrong role view');
   const screen=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
   await writeFile(screenshotPath(width,route.hash),Buffer.from(screen.data,'base64'));
   checks+=5;images++;
   console.log('BROWSER_PASS '+width+' '+route.hash+
    ' role='+(result.role??'studio')+' overflow='+result.scrollWidth+'/'+result.viewport);
  }
 }
 console.log('GABER_BROWSER_SMOKE_GREEN source_sha='+sha+
  ' responsive_checks='+checks+' screenshots='+images);
 console.log('NOTICE: screenshot/route tests are on static local browser demo, NOT real authenticated multi-user E2E.');
}finally{
 for(const cb of pending.values())cb.reject(Error('CHROME_SHUTDOWN'));
 pending.clear();
 try{ws?.close();}catch{}
 if(chrome)chrome.kill('SIGTERM');
 if(preview)preview.kill('SIGTERM');
 await delay(300);
 if(profile)await rm(profile,{recursive:true,force:true});
}
