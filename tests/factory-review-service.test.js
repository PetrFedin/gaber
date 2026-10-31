import test from 'node:test';
import assert from 'node:assert/strict';
import {REQUIRED_FACTORY_EVIDENCE,sealFactoryEvidence} from '../server/factoryReviewPolicy.js';
import {submitTechnologistReview} from '../server/factoryReviewService.js';

const secret='server-review-key-longer-than-thirty-two';
const now=Date.parse('2026-10-23T00:00:00Z'),H=c=>c.repeat(64);
const revision={projectId:'GABER-001',revisionId:'R-001',
 state:'frozen-for-technical-review',configHash:H('a'),bomHash:H('b'),costHash:H('c')};
const principal={subject:'technologist-01',roles:['factory'],mfaVerified:true,
 authenticated:true,identitySource:'server-session',sessionExpiresAtMs:now+3600000,
 tenantId:'T1',factoryId:'Factory_A'};
const signed=()=>REQUIRED_FACTORY_EVIDENCE.map((kind,i)=>sealFactoryEvidence({
 id:'ev-'+i,kind,projectId:revision.projectId,revisionId:revision.revisionId,
 configHash:revision.configHash,bomHash:revision.bomHash,costHash:revision.costHash,
 contentHash:H('d'),verifiedBy:'external-auditor',
 verifiedAtMs:now-1000,expiresAtMs:now+3600000
},secret));
function fakeRepository({documents=signed(),row=revision,fail=false}={}){
 const events=new Map();
 return {events,factoryId:'Factory_A',async withSerializableTransaction(work){
  let pending=null;
  const tx={
   getRevisionForUpdate:async()=>row,
   getEvidenceForRevision:async()=>documents,
   getTechnicalReviewByKey:async key=>events.get(key)||null,
   insertImmutableTechnicalReview:async item=>{
    if(fail)throw new Error('DB_WRITE_FAILED');
    pending={...item,id:'review-'+(events.size+1)};return pending;
   }
  };
  const result=await work(tx);
  if(pending)events.set(pending.idempotencyKey,pending);
  return result;
 }};
}
const args=(repository,change={})=>({
 repository,principal,projectId:revision.projectId,
 revisionId:revision.revisionId,requestId:'REQ-001',nowMs:now,secret,...change
});
test('server adapter records technical review and preserves manufacturing HOLD',async()=>{
 const repository=fakeRepository(),result=await submitTechnologistReview(args(repository));
 assert.equal(result.accepted,true);
 assert.equal(result.code,'TECHNICAL_REVIEW_RECORDED');
 assert.equal(result.productionRelease.allowed,false);
 assert.equal(repository.events.size,1);
 assert.equal(repository.events.get('REQ-001').kind,'TECHNICAL_REVIEW_ACCEPTED_NOT_RELEASED');
});
test('idempotent retries do not duplicate immutable review events',async()=>{
 const repository=fakeRepository();
 const first=await submitTechnologistReview(args(repository));
 const again=await submitTechnologistReview(args(repository));
 assert.equal(first.eventId,again.eventId);
 assert.equal(again.code,'ALREADY_REVIEWED');
 assert.equal(repository.events.size,1);
});
test('cross-user replay conflicts rather than borrowing a prior approval',async()=>{
 const repository=fakeRepository();
 await submitTechnologistReview(args(repository));
 const other=await submitTechnologistReview(args(repository,{
  principal:{...principal,subject:'other-reviewer'}
 }));
 assert.equal(other.accepted,false);
 assert.equal(other.code,'IDEMPOTENCY_CONFLICT');
 assert.equal(repository.events.size,1);
});
test('missing supplier evidence, invalid MFA or changed cost revision never persist',async()=>{
 for(const options of [{documents:[]},{row:{...revision,costHash:H('e')}}]){
  const repository=fakeRepository(options);
  const result=await submitTechnologistReview(args(repository));
  assert.equal(result.accepted,false);
  assert.equal(repository.events.size,0);
 }
 const repository=fakeRepository();
 const result=await submitTechnologistReview(args(repository,{
  principal:{...principal,mfaVerified:false}
 }));
 assert.equal(result.accepted,false);
 assert.equal(repository.events.size,0);
});
test('database failure is surfaced and never reported as accepted',async()=>{
 const repository=fakeRepository({fail:true});
 await assert.rejects(submitTechnologistReview(args(repository)),/DB_WRITE_FAILED/);
 assert.equal(repository.events.size,0);
});
test('only unified server role and matching factory can conduct a technical review',async()=>{
 const repository=fakeRepository();
 for(const override of [
  {roles:['technologist']},
  {roles:['factory-admin']},
  {roles:['factory-operator']},
  {roles:['factory','partner']},
  {roles:['client','factory']},
  {roles:['factory','factory']},
  {roles:[]},
  {tenantId:null}
 ]){
  const result=await submitTechnologistReview(args(repository,{
   principal:{...principal,...override}
  }));
  assert.equal(result.accepted,false);
  assert.equal(repository.events.size,0);
 }
 const cross=await submitTechnologistReview(args(repository,{
  principal:{...principal,factoryId:'Factory_B'}
 }));
 assert.equal(cross.code,'FACTORY_SCOPE_MISMATCH');
 assert.equal(repository.events.size,0);
});
test('bad IDs and missing transaction layer fail closed',async()=>{
 const repository=fakeRepository();
 const bad=await submitTechnologistReview(args(repository,{requestId:'invalid request'}));
 assert.equal(bad.accepted,false);
 assert.equal(bad.productionRelease.allowed,false);
 await assert.rejects(submitTechnologistReview(args(null)),/NO_AUTHORITATIVE_REPOSITORY/);
});

test('unauthorized session never performs a factory database query',async()=>{
 let called=false;
 const repository={withSerializableTransaction:async()=>{called=true;throw new Error('QUERY_NOT_ALLOWED');}};
 const result=await submitTechnologistReview(args(repository,{
  principal:{...principal,mfaVerified:false}
 }));
 assert.equal(result.accepted,false);
 assert.equal(result.code,'UNAUTHORIZED_TECHNOLOGIST');
 assert.equal(called,false);
});
