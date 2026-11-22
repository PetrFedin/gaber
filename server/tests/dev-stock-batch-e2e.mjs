/** GABER DEV-only warehouse: genuine HTTP cookies + SERIALIZABLE PG17 + five
 * furniture BOMs. Does NOT claim physical warehouse authority.
 */
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {randomBytes} from 'node:crypto';
import pg from 'pg';
import {createGaberHttpServer} from '../httpServer.js';
import {wirePostgresOrderJournal} from '../orderJournalWiring.js';
import {createPostgresOrderRepository} from '../postgresOrderRepository.js';
import {createDevStockService} from '../devStockService.js';
import {seedDevStockConfig} from '../dev/seedStock.js';
import {createPgAuthStore} from '../auth/authStore.js';
import {createAuthService} from '../auth/authService.js';
import {createDevExternalAuthority} from '../devExternalAuthority.js';
import {devUsers,DEV_TENANT,DEV_FACTORY} from '../dev/seed-data.js';
import {getInvestorDemoTemplates} from '../../src/investorDemo.js';
import {initialConfig} from '../../src/domain.js';
if(process.env.NODE_ENV==='production')throw Error('DEV_STOCK_QA_PRODUCTION_FORBIDDEN');
for(const k of ['GABER_ORDERS_DATABASE_URL','GABER_AUTH_DATABASE_URL','GABER_DEV_ADMIN_DATABASE_URL'])
 if(!process.env[k])throw Error('DEV_STOCK_QA_NEEDS_'+k);
const run=randomBytes(5).toString('hex'),pool=new pg.Pool({
 connectionString:process.env.GABER_ORDERS_DATABASE_URL,max:10
});
const authPool=new pg.Pool({connectionString:process.env.GABER_AUTH_DATABASE_URL,max:3});
const adminPool=new pg.Pool({connectionString:process.env.GABER_DEV_ADMIN_DATABASE_URL,max:3});
const authService=createAuthService({store:createPgAuthStore({pool:authPool}),
 tenantId:DEV_TENANT,mfaAssumed:true});
const simulated=createDevExternalAuthority({production:false,tenantId:DEV_TENANT});
const journal=wirePostgresOrderJournal({pool,simulatedExternalAuthority:simulated,log:()=>{}});
const stock=createDevStockService({repository:createPostgresOrderRepository({pool}),enabled:true});
const server=createGaberHttpServer({journal,authService,devStockService:stock,allowedOrigins:[],
 serverInfo:{devMfaAssumed:true,devSimulatedAuthority:true}});
server.listen(0,'127.0.0.1');await once(server,'listening');
const base='http://127.0.0.1:'+server.address().port;
let tests=0;
const ck=(actual,expected,label)=>{assert.deepEqual(actual,expected,label);tests++};
const ok=(actual,label)=>{assert.ok(actual,label);tests++};
const call=async(role,method,path,body)=>{
 const r=await fetch(base+path,{method,headers:{
   ...(role?{cookie:who[role]}:{}),
   ...(body!==undefined?{'content-type':'application/json'}:{})
  },...(body!==undefined?{body:JSON.stringify(body)}:{})});
 const text=await r.json();
 return {status:r.status,data:text,cookie:r.headers.get('set-cookie')?.split(';')[0]};
};
const who={};
let seq=0;
const reqId=()=>\`DEV-STOCK-\${run}-\${++seq}\`;
const order=async(role,id)=>(await call(role,'GET','/api/v1/orders/'+id)).data.order;
const stockRead=async(role,id)=>call(role,'GET','/api/v1/orders/'+id+'/dev-stock');
const send=async(role,id,type,payload,revision)=>{
 const snapshot=await order(role,id),body={requestId:reqId(),
  expectedVersion:snapshot?.version??0,type,payload,
  ...(revision?{revisionId:revision==='current'?snapshot.revisionId:
   revision==='spec'?snapshot.factoryTask?.specId:revision}:{})};
 return call(role,'POST','/api/v1/orders/'+id+'/commands',body);
};
const stockCommand=async(role,id,type,payload,revision='current',requestId=null)=>{
 const o=await order(role,id);
 return call(role,'POST','/api/v1/orders/'+id+'/dev-stock/commands',{
  requestId:requestId??reqId(),expectedVersion:o.version,
  revisionId:revision==='current'?o.revisionId:revision,
  type,payload
 });
};
const must=async(role,id,type,payload,revision,label)=>{
 const r=await send(role,id,type,payload,revision);
 ck(r.status,201,label+' / '+JSON.stringify(r.data));return r;
};
const stockMust=async(role,id,type,payload,label)=>{
 const r=await stockCommand(role,id,type,payload);ck(r.status,201,label+' / '+JSON.stringify(r.data));return r;
};
const economics=config=>({
 config,technicalNote:'Only synthetic DEV factory stock; not approved CAD',
 customerPriceKopecks:210005,factoryCostKopecks:100001,
 platformCommissionKopecks:40001,logisticsKopecks:10000,taxKopecks:5000,
 otherCostsKopecks:0,advanceBps:5000,dueDate:'2099-02-01',note:'DEV-only'
});
const accepted=async(label,config)=>{
 const id=\`BATCH-\${label}-\${run}\`;
 await must('client',id,'create',{projectId:id,name:'DEV stock '+label,config},null,'create '+label);
 await must('partner',id,'assign_factory',{factoryId:DEV_FACTORY},null,'assign '+label);
 await must('partner',id,'prepare_spec',economics(config),null,'spec '+label);
 await must('factory',id,'confirm_spec',{reference:'ACK-'+label,note:'Concept only'},'spec','factory ACK '+label);
 await must('partner',id,'offer',{note:'Not a manufacturing approval'},'spec','offer '+label);
 await must('client',id,'accept',{},'current','consent '+label);
 return id;
};
try{
 const guest=await call(null,'POST','/api/v1/auth/register',
  {email:\`stock-\${run}@example.test\`,password:'stock-demo-safe-'+run});
 ok([200,201].includes(guest.status)&&guest.cookie,'fresh independent client server cookie');
 who.client=guest.cookie;
 for(const u of devUsers.filter(x=>['partner','factory'].includes(x.role))){
  const r=await call(null,'POST','/api/v1/auth/login',{email:u.email,password:u.password});
  ck(r.status,200,'login '+u.role);who[u.role]=r.cookie;
 }
 const articles=getInvestorDemoTemplates();ck(articles.length,5,'five original article configs');
 const categories=[];
 for(const [i,article] of articles.entries()){
  const id=await accepted('ARTICLE-'+i,article.config);
  const firstRead=await stockRead('client',id);
  ck(firstRead.status,200,'client can see own DEV warehouse');
  const plan=firstRead.data.devStock.plan;
  ck(plan.category,article.config.category,'BOM category '+article.id);
  ok(plan.lines.every(x=>x.supplierSku===null&&!x.approvedForRealPurchase),
   'Only synthetic SKU, not real supplier proof');
  ck((await stockRead('factory',id)).status,200,'Factory sees assigned order SKU');
  ck((await stockCommand('client',id,'reserve',{reference:'CLIENT-FORGE-'+i})).status,403,
   'Client cannot reserve factory material');
  const requestId=reqId();
  const o=await order('factory',id);
  const reserveBody={requestId,expectedVersion:o.version,revisionId:o.revisionId,
   type:'reserve',payload:{reference:'RES-'+i}};
  const reserved=await call('factory','POST',\`/api/v1/orders/\${id}/dev-stock/commands\`,reserveBody);
  ck(reserved.status,201,'factory locks full BOM inventory '+article.id);
  ck((await call('factory','POST',\`/api/v1/orders/\${id}/dev-stock/commands\`,reserveBody)).status,200,
   'Same ID retries are idempotent');
  ck((await call('factory','POST',\`/api/v1/orders/\${id}/dev-stock/commands\`,
   {...reserveBody,payload:{reference:'CHANGED-RES-'+i}})).status,409,
   'Different payload with identical id denied');
  ck((await stockCommand('factory',id,'ship_batch',
   {reference:'TOO-EARLY',batchId:'EARLY-'+i,
    lines:[{partRef:plan.lines[0].partRef,quantity:1}]})).status,422,
   'Cannot dispatch before DEV production and QC');
  await must('partner',id,'record_payment',
   {amountKopecks:210005,reference:'LOCAL-ONLY-'+i},'current',
   'Partner claim is NOT bank settlement');
  await must('factory',id,'start',{},'current','DEV start');
  await must('factory',id,'complete',{},'current','DEV complete');
  await must('factory',id,'quality_pass',{reference:'DEV-QC-'+i},'current','DEV QC');
  const packed=plan.lines.map(x=>({partRef:x.partRef,packedQty:x.requiredQty}));
  await must('factory',id,'record_packout',
   {reference:'PACK-'+i,note:'Concept BOM complete',lines:packed},'current','concept packout');
  const first={partRef:plan.lines[0].partRef,quantity:1};
  const rest=plan.lines.map(x=>({partRef:x.partRef,
   quantity:x.requiredQty-(x.partRef===first.partRef?1:0)}))
   .filter(x=>x.quantity>0);
  const batchOne='LOT-'+i+'-A',batchTwo='LOT-'+i+'-B';
  await stockMust('factory',id,'ship_batch',
   {reference:'SHIP-ONE-'+i,batchId:batchOne,lines:[first]},
   'First DEV-only partial batch '+article.id);
  ck((await stockCommand('factory',id,'ship_batch',
   {reference:'DUPLICATE-'+i,batchId:batchOne,lines:[first]})).status,409,
   'Duplicate batch cannot double-decrement inventory');
  ck((await stockCommand('client',id,'receive_batch',
   {reference:'BAD-CLAIM-'+i,batchId:batchOne,
   lines:[{partRef:first.partRef,receivedQty:1,damagedQty:0}]})).status,201,
   'Client separately reports receipt of batch one');
  if(rest.length){
   await stockMust('factory',id,'ship_batch',
    {reference:'SHIP-TWO-'+i,batchId:batchTwo,lines:rest},
    'Remaining distinct physical parts in second batch '+article.id);
   ck((await stockCommand('factory',id,'receive_batch',
    {reference:'FACTORY-FORGE-'+i,batchId:batchTwo,
      lines:rest.map(x=>({partRef:x.partRef,receivedQty:x.quantity,damagedQty:0}))})).status,403,
      'Factory cannot impersonate independent client receipt');
   const checkIn=rest.map(x=>({partRef:x.partRef,receivedQty:x.quantity,damagedQty:0}));
   // Alternating articles demonstrate a missing/damaged claimed line.
   if(i%2===0)checkIn[0].receivedQty--;else checkIn[0].damagedQty++;
   const second=await stockCommand('client',id,'receive_batch',
    {reference:'RECEIPT-TWO-'+i,batchId:batchTwo,lines:checkIn});
   ck(second.status,201,'Independent batch two receipt '+article.id);
   ck((await stockCommand('client',id,'receive_batch',
    {reference:'DUP-RECEIPT-'+i,batchId:batchTwo,lines:checkIn})).status,409,
    'One independent acceptance record per batch');
  }
  const current=await stockRead('client',id);
  ck(current.status,200,'Read stock ledger for client');
  const books=current.data.devStock;
  ck(books.authority,'DEV_SYNTHETIC_SELF_REPORTED_NOT_REAL_WAREHOUSE',
   'Real warehouse never asserted');
  ck(books.documents.filter(d=>d.kind==='reserve').length,1,'One full reservation');
  ck(books.documents.filter(d=>d.kind==='ship_batch').length,rest.length?2:1,
   'Partial batch documents isolated');
  ck(books.documents.filter(d=>d.kind==='receive_batch').length,rest.length?2:1,
   'Independent client receipt document per shipment');
  ck(books.reservations.map(r=>r.shippedQty).sort((a,b)=>a-b),
   books.reservations.map(r=>r.requiredQty).sort((a,b)=>a-b),
   'All concept parts moved exactly once, no overship');
  ck(books.productionRelease.allowed,false,'Warehouse ledger never releases real manufacture');
  ck((await stockRead(null,id)).status,401,'Guest cannot see stock');
  categories.push(article.config.category);
 }
 ck(categories,['sofa','chairbed','bed','headboard','chair'],
  'Five original articles have batch-specific DEV inventory movements');
 // SERIALIZABLE oversell scenario across two different orders with the same
 // distinct config/SKU and exactly one available stock copy.
 const scarceConfig=initialConfig('sofa');
 await seedDevStockConfig({pool:adminPool,tenantId:DEV_TENANT,factoryId:DEV_FACTORY,
  config:scarceConfig,copies:1});
 const a=await accepted('SCARCE-A',scarceConfig);
 const b=await accepted('SCARCE-B',scarceConfig);
 const concurrent=await Promise.all([
   stockCommand('factory',a,'reserve',{reference:'SCARCE-RES-A'}),
   stockCommand('factory',b,'reserve',{reference:'SCARCE-RES-B'})
 ]);
 ck(concurrent.map(r=>r.status).sort((x,y)=>x-y),[201,409],
  'One reservation wins; second receives no oversell even under concurrency');
 const winner=concurrent[0].status===201?a:b,loser=winner===a?b:a;
 await must('client',winner,'request_change',
  {note:'Customer withdrew original dimension, release unused synthetic stock'},
  'current','Withdraw accepted revision');
 ck((await stockCommand('partner',winner,'release',
  {reference:'RELEASE-UNUSED-'+run})).status,201,
  'Partner releases only unused stock of withdrawn revision');
 ck((await stockCommand('factory',loser,'reserve',
  {reference:'RESERVE-AFTER-RELEASE-'+run})).status,201,
  'Reallocation after release, with on-hand unchanged');
 const winnerBooks=(await stockRead('client',winner)).data.devStock;
 ck(winnerBooks.documents.filter(d=>d.kind==='release').length,1,
  'Release has own immutable movement document');
 console.log('GABER_DEV_STOCK_POSTGRES_E2E_GREEN checks='+tests+
  ' categories='+categories.join(',')+' tenant='+DEV_TENANT);
}finally{
 await new Promise(r=>server.close(r));
 await Promise.allSettled([pool.end(),authPool.end(),adminPool.end()]);
}
