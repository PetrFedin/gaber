import test from 'node:test';
import assert from 'node:assert/strict';
import {createOrderJournalService} from '../server/orderJournalService.js';
import {createPostgresOrderRepository} from '../server/postgresOrderRepository.js';
const now=Date.parse('2026-10-27T12:00:00Z'),resource={source:'server-repository',tenantId:'T1',
 orderId:'O1',clientId:'C1',factoryId:'F1'};
const client={identitySource:'server-session',authenticated:true,subject:'U1',tenantId:'T1',
 clientId:'C1',roles:['client'],sessionExpiresAtMs:now+60000};
const partner={...client,subject:'U2',roles:['partner'],mfaVerified:true};
const admission=({principal,resource,command})=>{
 const role=principal.roles.includes('client')&&principal.clientId===resource.clientId?'client':
  principal.roles.includes('partner')?'partner':null;
 const typeRole=command.type==='create'||command.type==='accept'?'client':'partner';
 return role&&role===command.role&&role===typeRole?
  {allowed:true,reducerRole:role}:{allowed:false,code:'ROLE_FORBIDDEN'};
};
const reducer={
 replayOrder(events){let state=null;for(const e of events){
  if(e.expectedVersion!==(state?.version??0))throw Error('STALE_ORDER');
  if(e.type==='create'){if(state||!e.payload.name)throw Error('CREATE_INVALID');
   state={version:1,projectId:e.payload.projectId,stage:'requested',updatedAt:e.at};}
  else{if(!state)throw Error('ORDER_MISSING');state.version++;
   state.stage=e.type==='prepare_spec'?'awaiting_factory':e.type==='accept'?'accepted':state.stage;
   state.updatedAt=e.at;}}
  return state;
 },
 appendOrderCommand(events,command){const next=[...events,command];return {
  events:next,state:this.replayOrder(next),duplicate:false};}
};
function memory(){
 const map=new Map(),locks=new Map();let commits=0;
 return {map,get commits(){return commits},async withOrderTransaction(scope,work){
  const key=scope.tenantId+'|'+scope.orderId,previous=locks.get(key)||Promise.resolve();
  let done;const pending=new Promise(r=>done=r);locks.set(key,previous.then(()=>pending));
  await previous;
  const draft=structuredClone(map.get(key)||{head:null,rows:[]});
  const tx={
   getResourceForUpdate:async()=>scope.tenantId==='T1'&&scope.orderId==='O1'?resource:null,
   getHeadForUpdate:async()=>draft.head,
   ensureHead:async()=>{draft.head={version:0,headHash:null}},
   getEvents:async()=>structuredClone(draft.rows),
   appendEvent:async row=>{draft.rows.push(structuredClone(row))},
   advanceHead:async({expectedVersion,nextVersion,headHash})=>{
    if(draft.head.version!==expectedVersion)return false;
    draft.head={version:nextVersion,headHash};return true;}
  };
  try{const result=await work(tx);if(draft.head)map.set(key,draft);commits++;return result}
  finally{done()}
 }};
}
const request={orderId:'O1',requestId:'R1',type:'create',expectedVersion:0,
 payload:{projectId:'O1',name:'Sofa'}};
const setup=()=>{const repository=memory();return {repository,
 service:createOrderJournalService({repository,admission,reducer,clock:()=>now})}};
test('append and replay, hash chain, role attribution',async()=>{
 const {service,repository}=setup();
 const a=await service.execute({principal:client,request});
 assert.equal(a.code,'ORDER_EVENT_COMMITTED');
 const b=await service.execute({principal:partner,request:{orderId:'O1',requestId:'R2',
  type:'prepare_spec',expectedVersion:1,payload:{priceKopecks:12345}}});
 assert.equal(b.version,2);assert.equal(b.productionRelease.allowed,false);
 const rows=repository.map.get('T1|O1').rows;
 assert.equal(rows.length,2);assert.equal(rows[1].previousHash,rows[0].eventHash);
 assert.equal(rows[1].actorId,'U2');
});
test('simultaneous conflicting writers produce one event',async()=>{
 const {service,repository}=setup();
 const commands=[request,{...request,requestId:'R2'}];
 const result=await Promise.all(commands.map(r=>service.execute({principal:client,request:r})));
 assert.equal(result.filter(x=>x.accepted).length,1);
 assert.equal(result.filter(x=>x.code==='STALE_ORDER_VERSION').length,1);
 assert.equal(repository.map.get('T1|O1').rows.length,1);
});
test('idempotent retries preserve event and changed content conflicts',async()=>{
 const {service,repository}=setup();
 await service.execute({principal:client,request});
 assert.equal((await service.execute({principal:client,request})).code,'ALREADY_COMMITTED');
 assert.equal((await service.execute({principal:client,
  request:{...request,payload:{projectId:'O1',name:'Forged'}}})).code,'IDEMPOTENCY_CONFLICT');
 assert.equal(repository.map.get('T1|O1').rows.length,1);
});
test('tampering blocks new events',async()=>{
 const {service,repository}=setup();await service.execute({principal:client,request});
 repository.map.get('T1|O1').rows[0].command.payload.name='Forged';
 await assert.rejects(service.execute({principal:partner,request:{orderId:'O1',
  requestId:'R2',type:'prepare_spec',payload:{},expectedVersion:1}}),/JOURNAL_INTEGRITY_FAILURE/);
});
test('unauthorized tenants, external production, forged actor fields fail closed',async()=>{
 const {service,repository}=setup();
 assert.equal((await service.execute({principal:{...client,tenantId:'T2'},request})).code,'RESOURCE_NOT_AUTHORIZED');
 assert.equal((await service.execute({principal:client,request:{...request,role:'factory'}})).code,'INVALID_ORDER_REQUEST');
 assert.equal((await service.execute({principal:partner,
  request:{...request,type:'start'}})).code,'EXTERNAL_AUTHORITY_REQUIRED');
 assert.equal(repository.map.size,0);
});
test('PostgreSQL adapter uses tenant scope, rollback, parameterized queries',async()=>{
 const queries=[];let released=false;
 const pool={async connect(){return {
  query:async(sql,params=[])=>{queries.push({sql,params});
   if(sql.includes('order_resources'))return {rows:[{tenantId:'T1',orderId:'O1'}]};
   return {rows:[],rowCount:1};},
  release(){released=true}
 }}};
 const repo=createPostgresOrderRepository({pool});
 const result=await repo.withOrderTransaction({tenantId:'T1',orderId:'O1'},
  async tx=>tx.getResourceForUpdate());
 assert.equal(result.source,'server-repository');
 assert.deepEqual(queries.find(x=>x.sql.includes('set_config')).params,['T1']);
 assert.deepEqual(queries.find(x=>x.sql.includes('order_resources')).params,['T1','O1']);
 assert.equal(queries.at(-1).sql,'COMMIT');assert.equal(released,true);
});
