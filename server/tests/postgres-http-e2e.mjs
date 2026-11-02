/**
 * Actual HTTP -> authenticated(test-only)-session resolver -> journal service
 * -> node-postgres Pool -> PostgreSQL 17 RLS, serializable transaction and DTO.
 * Three distinct simulated server sessions are TEST FIXTURES, not real login.
 * Never connect this test to production databases or real organisations.
 */
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {randomBytes} from 'node:crypto';
import pg from 'pg';
import {createOrderHttpServer} from '../orderHttpApi.js';
import {wirePostgresOrderJournal} from '../orderJournalWiring.js';
import {initialConfig} from '../../src/domain.js';

const {Pool}=pg;
const now=Date.parse('2026-11-01T16:00:00.000Z');
const host='127.0.0.1',port=5432,database='gaber_staging';
const clientPool=new Pool({host,port,database,user:'gaber_http_ci',
 password:'gaber_http_disposable_only',max:12,connectionTimeoutMillis:5000});
const adminPool=new Pool({host,port,database,user:'postgres',
 password:process.env.GABER_TEST_PG_PASSWORD,max:3,connectionTimeoutMillis:5000});
const id='ORDER-PG-001',tenantA='TENANT-API-A',tenantB='TENANT-API-B';
const principals={
 client:{subject:'BUYER-A',clientId:'BUYER-A',roles:['client'],tenantId:tenantA},
 otherClient:{subject:'OTHER-BUYER-A',clientId:'OTHER-BUYER-A',roles:['client'],tenantId:tenantA},
 partner:{subject:'GABER-A',roles:['partner'],tenantId:tenantA},
 factory:{subject:'FACTORY-USER-A',factoryId:'FAB-A',roles:['factory'],tenantId:tenantA},
 otherFactory:{subject:'FACTORY-USER-OTHER',factoryId:'FAB-OTHER',roles:['factory'],tenantId:tenantA},
 clientB:{subject:'BUYER-B',clientId:'BUYER-B',roles:['client'],tenantId:tenantB},
 partnerB:{subject:'GABER-B',roles:['partner'],tenantId:tenantB},
 factoryB:{subject:'FACTORY-USER-B',factoryId:'FAB-A',roles:['factory'],tenantId:tenantB}
};
const tokens=new Map(),users={};
for(const [key,data] of Object.entries(principals)){
 const token=randomBytes(36).toString('base64url');
 users[key]=token;
 tokens.set(token,{...data,identitySource:'server-session',
  authenticated:true,mfaVerified:true,sessionExpiresAtMs:now+60_000});
}
const spec=(config,price=210005)=>({
 config,technicalNote:'Verified concept: frame foam sewing and fasteners',
 customerPriceKopecks:price,factoryCostKopecks:100001,
 platformCommissionKopecks:40001,logisticsKopecks:10000,
 taxKopecks:5000,otherCostsKopecks:0,advanceBps:5000,
 dueDate:'2027-02-01',note:'Price after factory review'
});
let api,base,checks=0,lastRequest=null;
function check(actual,expected,label){
 assert.deepEqual(actual,expected,label+' lastHttp='+JSON.stringify(lastRequest));checks++;
}
function ok(actual,label){assert.ok(actual,label);checks++;}
const request=async(role,method,url,body)=>{
 const response=await fetch(base+url,{method,headers:{
  ...(users[role]?{authorization:'Bearer '+users[role]}:{}),
  ...(method==='POST'?{'content-type':'application/json'}:{})
 },...(body!==undefined?{body:JSON.stringify(body)}:{})});
 const bodyResult=await response.json();
 lastRequest={role,method,url,status:response.status,code:bodyResult?.code??null};
 return {status:response.status,body:bodyResult};
};
const read=(role,orderId=id)=>request(role,'GET','/api/v1/orders/'+orderId);
const send=(role,type,payload,expectedVersion,requestId,revisionId,orderId=id)=>request(
 role,'POST','/api/v1/orders/'+orderId+'/commands',
 {requestId,expectedVersion,type,payload,...(revisionId?{revisionId}:{})});
async function rows(tenant,orderId=id){
 const client=await clientPool.connect();
 try{
  await client.query('BEGIN');
  await client.query("SELECT set_config('app.tenant_id',$1,true)",[tenant]);
  const q=await client.query('SELECT seq,command FROM gaber_orders.order_events WHERE tenant_id=$1 AND order_id=$2 ORDER BY seq',[tenant,orderId]);
  await client.query('COMMIT');
  return q.rows;
 }catch(e){await client.query('ROLLBACK');throw e}
 finally{client.release()}
}
async function main(){
 const resolveTestSession=async token=>tokens.has(token)?structuredClone(tokens.get(token)):null;
 const journal=wirePostgresOrderJournal({pool:clientPool,clock:()=>now});
 api=createOrderHttpServer({journal,resolveSession:resolveTestSession,clock:()=>now});
 api.listen(0,'127.0.0.1');await once(api,'listening');
 base='http://127.0.0.1:'+api.address().port;
 const cfg=initialConfig();
 check((await read('client')).status,404,'Unknown order returns 404');
 check((await read('partner')).status,404,'Partner cannot read missing order');
 check((await read('otherClient')).status,404,'Other client cannot read order');
 check((await read('no-token')).status,401,'No bearer token');
 const created={projectId:id,name:'Private Sofa A',config:cfg};
 check((await send('client','create',created,0,'C-A-1')).status,201,
  'Real PostgreSQL inserts atomic tenant order and first event');
 check((await send('client','create',created,0,'C-A-1')).status,200,
  'Identical request ID retries return idempotent 200');
 check((await rows(tenantA)).length,1,'Idempotent request inserted once');
 check((await send('client','create',{...created,name:'Same key different request'},0,'C-A-1')).status,409,
  'Same requestId with changed payload fails with idempotency conflict');
 check((await request('client','POST','/api/v1/orders/'+id+'/commands',{
  requestId:'BODY-ROLE-FORGERY',expectedVersion:1,type:'assign_factory',
  role:'partner',payload:{factoryId:'FAB-A'}
 })).status,400,'Client cannot override session role through JSON');
 check((await read('otherClient')).status,404,'Separate client cannot read private order');
 check((await read('factory')).status,404,'Unassigned factory cannot read order');
 check((await send('client','assign_factory',{factoryId:'FAB-A'},1,'FORGED-ASSIGN')).status,403,
  'Client cannot assume partner authority');
 check((await send('partner','prepare_spec',spec(cfg),1,'SPEC-UNASSIGNED')).status,409,
  'Partner cannot issue factory specification before assignment');
 tokens.get(users.partner).mfaVerified=false;
 check((await send('partner','assign_factory',{factoryId:'FAB-A'},1,'ASSIGN-NO-MFA')).status,403,
  'Partner assigning an organisation must pass MFA');
 tokens.get(users.partner).mfaVerified=true;
 check((await send('partner','assign_factory',{factoryId:'FAB-B-ONLY'},1,'FOREIGN-ROSTER')).status,403,
  'Partner cannot assign factory in another tenant directory');
 check((await send('partner','assign_factory',{factoryId:'FAB-PAUSED'},1,'PAUSED-ROSTER')).status,403,
  'Suspended factory cannot be assigned');
 check((await send('partner','assign_factory',{factoryId:'FAB-A'},1,'ASSIGN-A-1')).status,201,
  'Partner assigns approved factory on real database');
 check((await read('otherFactory')).status,404,'Wrong factory cannot read');
 check((await read('factory')).status,200,'Assigned factory can read task');
 check((await rows(tenantA)).length,2,'Immutable assignment and event committed');
 const prepare=await send('partner','prepare_spec',spec(cfg),2,'SPEC-A-1');
 check(prepare.status,201,'Partner prepares real journal spec');
 let factory=(await read('factory')).body.order;
 check(factory.factoryTask.factoryCostKopecks,100001,'Factory sees exact factory cost');
 ok(!Object.hasOwn(factory,'offer')&&!Object.hasOwn(factory,'economics'),
  'Factory has no retail price or platform commission');
 check((await send('factory','confirm_spec',{reference:'ACK-A',note:'Concept reviewed'},3,
  'ACK-A-1','S1')).status,201,'Factory independently confirms S1');

 await adminPool.query("UPDATE gaber_orders.factory_directory SET status='suspended',status_changed_at=now() WHERE tenant_id=$1 AND factory_id='FAB-A'",[tenantA]);
 check((await read('factory')).status,404,'Factory read denied after registry revocation');
 check((await send('factory','message',{note:'Unauthorized',channel:'factory_partner'},4,
  'SUSPENDED-WRITE')).status,404,'Factory post denied after revocation');
 check((await send('partner','offer',{note:'Cannot publish suspended quote'},4,
  'REVOKED-OFFER','S1')).status,403,'Partner cannot publish suspended factory quote');
 check((await rows(tenantA)).length,4,'Denied operations did not commit event');
 check((await read('client')).status,200,'Revocation preserves customer access');
 check((await read('partner')).status,200,'Revocation preserves operator access');

 await adminPool.query("UPDATE gaber_orders.factory_directory SET status='approved',status_changed_at=now() WHERE tenant_id=$1 AND factory_id='FAB-A'",[tenantA]);
 check((await send('partner','offer',{note:'Final client quote'},4,'OFFER-A-1','S1')).status,201,
  'Approved operator publishes R1');
 const client=(await read('client')).body.order;
 check(client.offer.priceKopecks,210005,'Client sees exact R1 price, kopecks');
 ok(!Object.hasOwn(client,'economics')&&!Object.hasOwn(client,'factoryTask'),
  'Client cannot read factory internal margin or BOM');
 const partner=(await read('partner')).body.order;
 check(partner.economics.platformCommissionKopecks,40001,'Partner alone sees commission');
 factory=(await read('factory')).body.order;
 ok(!Object.hasOwn(factory,'offer')&&!Object.hasOwn(factory,'finance'),
  'Factory still cannot see customer invoice');

 check((await send('client','accept',{},5,'ACCEPT-A-1','R1')).status,201,
  'Client accepts R1');
 check((await send('client','report_payment',{amountKopecks:105003,
  reference:'CLIENT-CLAIM'},6,'CLAIM-A-1','R1')).status,201,
  'Client reports (unverified) payment');
 check((await send('partner','record_payment',{amountKopecks:105003,
  reference:'LOCAL-RECORD'},7,'LOCAL-A-1','R1')).status,201,
  'Partner records exact cash claims but not bank settlement');
 check((await read('client')).body.order.finance.verifiedBankKopecks,null,
  'No claim can become verified bank settlement');
 check((await send('factory','start',{},8,'UNTRUSTED-PRODUCTION','R1')).status,403,
  'Physical production never released');

 check((await send('client','message',{note:'Client private note',
  channel:'client_partner'},8,'MSG-CLIENT','R1')).status,201,
  'Client-partner private channel works');
 check((await send('partner','message',{note:'Factory private note',
  channel:'factory_partner'},9,'MSG-FACTORY','R1')).status,201,
  'Factory-partner private channel works');
 const cr=(await read('client')).body.order;
 const fr=(await read('factory')).body.order;
 const pr=(await read('partner')).body.order;
 check(cr.messages.length,1,'Client cannot read partner-factory note');
 check(fr.messages.length,1,'Factory cannot read client-partner note');
 check(pr.messages.length,2,'Partner sees both bilateral channels');
 ok(cr.messages[0].note.includes('Client')&&fr.messages[0].note.includes('Factory'),
  'Bilateral channel content remains isolated');
 check((await send('client','message',{note:'Attempt to enter factory-private',
  channel:'factory_partner'},10,'CROSS-THREAD','R1')).status,403,
  'Client cannot inject factory-private message');

 check((await send('client','request_change',{note:'New width 300cm'},10,
  'CHANGE-A-1','R1')).status,201,'Client requests revision R2');
 check((await read('client')).body.order.offer,null,'R1 quote immediately withdrawn');
 check((await send('partner','prepare_spec',spec({...cfg,width:300},240005),
  11,'SPEC-A-2')).status,201,'Partner records revised spec');
 check((await send('factory','confirm_spec',{reference:'ACK-A-2',
  note:'Revised concept reviewed'},12,'ACK-A-2','S2')).status,201,
  'Factory independently reviews S2');
 check((await send('partner','offer',{note:'Updated customer quote'},13,
  'OFFER-A-2','S2')).status,201,'Partner alone publishes R2');
 check((await read('client')).body.order.offer.priceKopecks,240005,
  'R2 exact price correct and active');
 check((await send('client','accept',{},14,'STALE-R1-ACCEPT','R1')).status,422,
  'Old R1 cannot be accepted');
 check((await send('client','accept',{},14,'ACCEPT-A-2','R2')).status,201,
  'Client accepts current R2');

 const pair=await Promise.all([
  send('partner','message',{note:'Concurrent one',channel:'shared'},15,'PARALLEL-ONE','R2'),
  send('partner','message',{note:'Concurrent two',channel:'shared'},15,'PARALLEL-TWO','R2')
 ]);
 check(pair.map(r=>r.status).sort((a,b)=>a-b),[201,409],
  'Postgres serializable concurrent writers: exactly one succeeds');
 check((await rows(tenantA)).length,16,'Journal length follows committed version 16');
 const partnerA=(await read('partner')).body.order;
 check(partnerA.version,16,'Read-model version equals exactly-once event count');
 check(partnerA.productionRelease.allowed,false,'Production release remains HOLD');

 // Same order ID in a different tenant must be a separate resource and
 // independent hash chain, not a row shared with the operator in tenant A.
 check((await send('clientB','create',{projectId:id,name:'Tenant B independent sofa',
  config:cfg},0,'C-B-1')).status,201,'Tenant B independently creates same order ID');
 check((await rows(tenantB)).length,1,'Tenant B has separate event chain');
 check((await read('partnerB')).body.order.name,'Tenant B independent sofa',
  'Partner B sees only tenant B order');
 check((await read('partner')).body.order.name,'Private Sofa A',
  'Partner A sees only tenant A order');
 check((await read('factoryB')).status,404,'Tenant B factory is not assigned');
 check((await send('partnerB','assign_factory',{factoryId:'FAB-A'},1,
  'ASSIGN-B-1')).status,201,'Factory ID reused in tenant B without cross-tenant collision');
 check((await read('factoryB')).status,200,'Tenant B assigned factory reads B');
 check((await read('factory')).body.order.version,16,
  'Tenant A factory cannot see tenant B history despite same factory ID');

 // Fail closed for direct SQL tenant escalation using the same runtime role.
 const restricted=await clientPool.connect();
 try{
  await restricted.query('BEGIN');
  await restricted.query("SELECT set_config('app.tenant_id',$1,true)",[tenantA]);
  const isolation=await restricted.query("SELECT count(*)::int AS n FROM gaber_orders.order_resources WHERE tenant_id=$1 AND client_id='BUYER-B'",[tenantB]);
  check(isolation.rows[0].n,0,'PostgreSQL RLS blocks direct cross-tenant SELECT');
  await restricted.query('ROLLBACK');
 }finally{restricted.release()}

 // Concurrent FIRST creates on an absent resource must serialize and never
 // persist duplicate resources, heads or events.
 const fresh='ORDER-PG-CONCURRENT';
 const race=await Promise.all([
  send('client','create',{projectId:fresh,name:'Race one',config:cfg},
   0,'CREATE-1',undefined,fresh),
  send('client','create',{projectId:fresh,name:'Race two',config:cfg},
   0,'CREATE-2',undefined,fresh)
 ]);
 check(race.map(r=>r.status).sort((a,b)=>a-b),[201,409],
  'Concurrent first orders exactly one winner, one stale conflict');
 check((await rows(tenantA,fresh)).length,1,'Only one first event committed');

 // Contending assignments on a different, real PostgreSQL order must commit
 // exactly one immutable membership + event pair, never two factory owners.
 const contested='ORDER-PG-FACTORY-RACE';
 check((await send('client','create',{projectId:contested,name:'Concurrent factory case',
  config:cfg},0,'ASSIGN-RACE-CREATE',undefined,contested)).status,201,
  'Create independent order for competing factory assignments');
 const assignmentRace=await Promise.all([
  send('partner','assign_factory',{factoryId:'FAB-A'},1,'ASSIGN-RACE-A',undefined,contested),
  send('partner','assign_factory',{factoryId:'FAB-OTHER'},1,'ASSIGN-RACE-B',undefined,contested)
 ]);
 check(assignmentRace.map(r=>r.status).sort((a,b)=>a-b),[201,409],
  'Competing factory assignments commit exactly once');
 const assignedOrder=(await read('partner',contested)).body.order;
 ok(['FAB-A','FAB-OTHER'].includes(assignedOrder.assignedFactoryId),
  'Approved factory assignment must be visible to partner in authoritative read');
 check((await rows(tenantA,contested)).length,2,
  'Contended factory assignment has only one persistent journal event');
 check((await read('factory',contested)).status,
  assignedOrder.assignedFactoryId==='FAB-A'?200:404,
  'Only selected factory A can read contested order');
 check((await read('otherFactory',contested)).status,
  assignedOrder.assignedFactoryId==='FAB-OTHER'?200:404,
  'Only selected factory B can read contested order');

 // Session revocation is a separate TEST resolver capability; not real IdP.
 tokens.delete(users.factory);
 check((await read('factory')).status,401,'Server-side session revocation denies old bearer token');
 tokens.get(users.client).sessionExpiresAtMs=now-1;
 check((await read('client')).status,401,'Expired test bearer is immediately invalid');
 console.log('GABER_POSTGRES_HTTP_E2E_GREEN assertions='+checks+
  ' two_tenants=true independent_three_roles=true concurrency=true revocation=true');
 console.log('NOTICE: identity principals above are test-only server fixtures, NOT real login or PSP authority.');
}
try{await main()}
finally{
 if(api)await new Promise(done=>api.close(done));
 await Promise.allSettled([clientPool.end(),adminPool.end()]);
}
