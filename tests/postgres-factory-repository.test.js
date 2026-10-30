import test from 'node:test';
import assert from 'node:assert/strict';
import {createPostgresFactoryReviewRepository} from '../server/postgresFactoryRepository.js';
import {submitTechnologistReview} from '../server/factoryReviewService.js';

function mockPool({rows={},failOnce=null,failCommit=false}={}){
 const log=[];let failures=0,releases=0;
 return {log,get releases(){return releases;},async connect(){
  log.push({sql:'CONNECT',params:[]});
  return {async query(sql,params=[]){
   const statement=sql.trim();log.push({sql:statement,params});
   if(failOnce&&statement.includes(failOnce)&&failures++===0)
    throw Object.assign(new Error('SERIALIZATION_FAILURE'),{code:'40001'});
   if(failCommit&&statement==='COMMIT')throw Error('COMMIT_FAILED');
   if(statement.includes('FROM gaber_factory.revisions'))return {rows:rows.revisions??[]};
   if(statement.includes('FROM gaber_factory.evidence'))return {rows:rows.evidence??[]};
   if(statement.includes('FROM gaber_factory.technical_reviews'))return {rows:rows.reviews??[]};
   if(statement.includes('INSERT INTO gaber_factory.technical_reviews'))return {rows:[{id:'6'}]};
   return {rows:[]};
  },release(){releases++;}};
 }};
}
const factoryId='Factory_A',projectId='Project:1',revisionId='Revision-2';
const find=(pool,fragment)=>pool.log.filter(entry=>entry.sql.includes(fragment));

test('v0.4.14: explicit factory scope, transaction-local RLS and locked revision',async()=>{
 const pool=mockPool({rows:{revisions:[{projectId,revisionId,configHash:'a'.repeat(64)}],
  evidence:[{envelope:{kind:'test'}}]}});
 const repo=createPostgresFactoryReviewRepository({pool,factoryId});
 const result=await repo.withSerializableTransaction(async tx=>{
  const revision=await tx.getRevisionForUpdate(projectId,revisionId);
  const envelopes=await tx.getEvidenceForRevision(projectId,revisionId);
  const prior=await tx.getTechnicalReviewByKey('Request-1');
  return {revision,envelopes,prior};
 });
 assert.equal(result.revision.projectId,projectId);
 assert.deepEqual(result.envelopes,[{kind:'test'}]);assert.equal(result.prior,null);
 assert.deepEqual(find(pool,'set_config')[0].params,[factoryId]);
 assert.deepEqual(find(pool,'FROM gaber_factory.revisions')[0].params,[factoryId,projectId,revisionId]);
 assert.deepEqual(find(pool,'FROM gaber_factory.evidence')[0].params,[factoryId,projectId,revisionId]);
 assert.deepEqual(find(pool,'FROM gaber_factory.technical_reviews')[0].params,[factoryId,'Request-1']);
 assert.match(find(pool,'FROM gaber_factory.revisions')[0].sql,/FOR UPDATE/);
 assert.equal(find(pool,'COMMIT').length,1);
 assert.equal(pool.releases,1);
});
test('v0.4.14: technical review can record only after a completed COMMIT',async()=>{
 const pool=mockPool(),repo=createPostgresFactoryReviewRepository({pool,factoryId});
 const value=await repo.withSerializableTransaction(tx=>tx.insertImmutableTechnicalReview({
  kind:'TECHNICAL_REVIEW_ACCEPTED_NOT_RELEASED',
  idempotencyKey:'REQ-1',projectId,revisionId,reviewerId:'reviewer-1',
  configHash:'a'.repeat(64),bomHash:'b'.repeat(64),costHash:'c'.repeat(64),
  statement:{outcome:'TECHNICAL_DOCUMENTATION_REVIEWED_NOT_RELEASED'},
  signature:'d'.repeat(64),createdAtMs:1000
 }));
 assert.equal(value.id,'6');
 assert.equal(pool.log.at(-1).sql,'COMMIT');
 assert.deepEqual(find(pool,'INSERT INTO')[0].params.slice(0,5),
  [factoryId,'REQ-1',projectId,revisionId,'reviewer-1']);
 assert.equal(pool.releases,1);
});
test('v0.4.14: transaction errors always roll back and release the connection',async()=>{
 const pool=mockPool(),repo=createPostgresFactoryReviewRepository({pool,factoryId});
 await assert.rejects(repo.withSerializableTransaction(async tx=>{
  await tx.getRevisionForUpdate(projectId,revisionId);
  throw Error('STOP');
 }),/STOP/);
 assert.equal(find(pool,'ROLLBACK').length,1);
 assert.equal(find(pool,'COMMIT').length,0);
 assert.equal(pool.releases,1);
});
test('v0.4.14: serialization conflict retries the ENTIRE transaction',async()=>{
 const pool=mockPool({failOnce:'FROM gaber_factory.revisions'});
 const repo=createPostgresFactoryReviewRepository({pool,factoryId});
 const result=await repo.withSerializableTransaction(tx=>tx.getRevisionForUpdate(projectId,revisionId));
 assert.equal(result,null);
 assert.equal(find(pool,'BEGIN ISOLATION LEVEL SERIALIZABLE').length,2);
 assert.equal(find(pool,'ROLLBACK').length,1);
 assert.equal(find(pool,'COMMIT').length,1);
 assert.equal(pool.releases,2);
});
test('v0.4.14: COMMIT failure cannot claim successful persistence',async()=>{
 const pool=mockPool({failCommit:true}),repo=createPostgresFactoryReviewRepository({pool,factoryId});
 await assert.rejects(repo.withSerializableTransaction(async()=>({accepted:true})),/COMMIT_FAILED/);
 assert.equal(find(pool,'ROLLBACK').length,1);
 assert.equal(pool.releases,1);
});
test('v0.4.14: untrusted identifiers cannot reach database SQL',async()=>{
 const pool=mockPool();
 assert.throws(()=>createPostgresFactoryReviewRepository({pool,factoryId:'wrong factory'}),/INVALID_FACTORY_SCOPE/);
 const repo=createPostgresFactoryReviewRepository({pool,factoryId});
 await assert.rejects(repo.withSerializableTransaction(tx=>
  tx.getRevisionForUpdate('bad project',revisionId)),/INVALID_REVISION_ID/);
 assert.equal(find(pool,'FROM gaber_factory.revisions').length,0);
});
test('v0.4.14: actor factory cannot borrow another factory scoped repository',async()=>{
 const pool=mockPool(),repository=createPostgresFactoryReviewRepository({pool,factoryId});
 const result=await submitTechnologistReview({
  principal:{subject:'tech-1',roles:['factory-technologist'],tenantId:'T1',authenticated:true,
   identitySource:'server-session',mfaVerified:true,sessionExpiresAtMs:1000,
   factoryId:'Factory_B'},
  projectId,revisionId,requestId:'REQ-3',
  repository,secret:'this-is-a-long-server-only-secret-2026',nowMs:10
 });
 assert.equal(result.accepted,false);
 assert.equal(result.code,'FACTORY_SCOPE_MISMATCH');
 assert.equal(result.productionRelease.allowed,false);
 assert.equal(pool.log.length,0);
});
