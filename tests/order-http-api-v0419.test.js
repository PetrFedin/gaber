import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createOrderHttpServer} from '../server/orderHttpApi.js';

const token='a'.repeat(43),now=1000000;
const principal={identitySource:'server-session',authenticated:true,tenantId:'T1',
 subject:'U1',clientId:'C1',roles:['client'],sessionExpiresAtMs:now+5000};
let api,base,calls=[],reads=[];
test.before(async()=>{
 api=createOrderHttpServer({
  journal:{
   read:async({principal:p,request})=>{
    reads.push({principal:p,request});
    return {accepted:true,code:'ORDER_READ',
     order:{orderId:request.orderId,version:1,stage:'requested',revisionId:null,
      productionRelease:{allowed:false}}};
   },
   execute:async({principal:p,request})=>{
    calls.push({principal:p,request});
    if(request.requestId==='stale')return {accepted:false,code:'STALE_ORDER_VERSION'};
    if(request.requestId==='no-factory-directory')return {accepted:false,code:'FACTORY_DIRECTORY_UNAVAILABLE'};
    if(request.requestId==='no-factory-repository')return {accepted:false,code:'FACTORY_ASSIGNMENT_UNAVAILABLE'};
    if(request.requestId==='no-order-intake')return {accepted:false,code:'ORDER_INTAKE_UNAVAILABLE'};
    if(request.requestId==='legacy-thread')return {accepted:false,code:'LEGACY_PRIVATE_THREAD_REMOVED'};
    if(request.requestId==='forbidden-channel')return {accepted:false,code:'MESSAGE_CHANNEL_FORBIDDEN'};
    if(request.requestId==='fail')throw Error('DOWN');
    return {accepted:true,code:'ORDER_EVENT_COMMITTED',version:1,eventSeq:1,stage:'requested'};
   }
  },
  resolveSession:async x=>x===token?principal:null,clock:()=>now
 });
 api.listen(0,'127.0.0.1');await once(api,'listening');
 base='http://127.0.0.1:'+api.address().port;
});
test.after(async()=>{await new Promise(resolve=>api.close(resolve));});
test('HTTP GET runs through the single authoritative journal role projection',async()=>{
 assert.equal((await fetch(base+'/api/v1/orders/O1')).status,401);
 const res=await fetch(base+'/api/v1/orders/O1',{headers:{authorization:'Bearer '+token}});
 assert.equal(res.status,200);const body=await res.json();
 assert.equal(body.order.orderId,'O1');
 assert.equal(body.productionRelease.allowed,false);
 assert.equal(body.order.productionRelease.allowed,false);
 assert.equal(reads.at(-1).principal.subject,'U1');
 assert.deepEqual(reads.at(-1).request,{orderId:'O1'});
 assert.equal(body.order.payments,undefined);
});
test('HTTP POST derives actor from server session and forbids impersonation',async()=>{
 const send=data=>fetch(base+'/api/v1/orders/O1/commands',{method:'POST',
  headers:{authorization:'Bearer '+token,'content-type':'application/json'},
  body:JSON.stringify(data)});
 let r=await send({requestId:'c1',expectedVersion:0,type:'create',
  payload:{projectId:'O1',name:'Sofa'}});
 assert.equal(r.status,201);
 assert.equal(calls.at(-1).request.orderId,'O1');
 assert.equal(calls.at(-1).principal.subject,'U1');
 r=await send({requestId:'c2',role:'factory',expectedVersion:0,type:'offer',payload:{}});
 assert.equal(r.status,400);
 r=await send({requestId:'stale',expectedVersion:0,type:'create',payload:{}});
 assert.equal(r.status,409);
 r=await send({requestId:'legacy-thread',expectedVersion:0,type:'message',
  payload:{note:'Legacy private thread',partnerId:'P1'}});
 assert.equal(r.status,403,'Removed private thread is a permission rejection, not a transition conflict');
 r=await send({requestId:'forbidden-channel',expectedVersion:0,type:'message',payload:{note:'Injected factory channel',channel:'factory_partner'}});
 assert.equal(r.status,403,'Cross-channel messaging is an authorization failure');
 r=await send({requestId:'fail',expectedVersion:0,type:'create',payload:{}});
 assert.equal(r.status,503);
 for(const [requestId,expectedCode] of [
  ['no-factory-directory','FACTORY_DIRECTORY_UNAVAILABLE'],
  ['no-factory-repository','FACTORY_ASSIGNMENT_UNAVAILABLE'],
  ['no-order-intake','ORDER_INTAKE_UNAVAILABLE']
 ]){
  r=await send({requestId,expectedVersion:0,type:'create',payload:{}});
  assert.equal(r.status,503,'Infrastructure outage must be retryable server error');
  assert.equal((await r.json()).code,expectedCode);
 }
});
test('HTTP paths and malformed bodies fail closed',async()=>{
 const r=await fetch(base+'/api/v1/orders/O1/commands',{method:'GET',
  headers:{authorization:'Bearer '+token}});
 assert.equal(r.status,405);
 const q=await fetch(base+'/api/v1/orders/O1/commands',{method:'POST',
  headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:'{invalid'});
 assert.equal(q.status,400);
});
