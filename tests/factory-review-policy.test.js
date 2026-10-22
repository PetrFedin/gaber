import test from 'node:test';
import assert from 'node:assert/strict';
import {FACTORY_REVIEW_POLICY,REQUIRED_FACTORY_EVIDENCE,
 validEvidenceFields,sealFactoryEvidence,verifyFactoryEvidence,
 evaluateFactoryReview,makeTechnologistReviewDecision
} from '../server/factoryReviewPolicy.js';

const secret='a-very-long-server-held-policy-secret-2026';
const now=Date.parse('2026-10-23T00:00:00Z');
const H=char=>char.repeat(64);
const revision={projectId:'GABER-101',revisionId:'REV-003',
 state:'frozen-for-technical-review',configHash:H('a'),bomHash:H('b'),costHash:H('c')};
const actor={subject:'tech-01',identitySource:'server-session',authenticated:true,
 roles:['technologist'],mfaVerified:true,sessionExpiresAtMs:now+3600000};
const record=(kind,index=0)=>({
 id:'EV-'+kind+'-'+index,kind,projectId:revision.projectId,revisionId:revision.revisionId,
 configHash:revision.configHash,bomHash:revision.bomHash,costHash:revision.costHash,
 contentHash:H('d'),verifiedBy:'trusted-factory-auditor',
 verifiedAtMs:now-1000,expiresAtMs:now+3600000
});
const evidence=()=>REQUIRED_FACTORY_EVIDENCE.map(kind=>sealFactoryEvidence(record(kind),secret));
const context=patch=>({revision:structuredClone(revision),actor:structuredClone(actor),
 evidenceEnvelopes:evidence(),nowMs:now,secret,...patch});

test('signed evidence permits technical review but NEVER production release',()=>{
 const data=context(),result=evaluateFactoryReview(data),decision=makeTechnologistReviewDecision(data);
 assert.equal(result.policyVersion,FACTORY_REVIEW_POLICY);
 assert.equal(result.eligibleForTechnologistReview,true);
 assert.deepEqual(result.blockers,[]);
 assert.equal(decision.accepted,true);
 assert.match(decision.signature,/^[a-f0-9]{64}$/);
 assert.equal(decision.statement.outcome,'TECHNICAL_DOCUMENTATION_REVIEWED_NOT_RELEASED');
 assert.equal(decision.productionRelease.allowed,false);
});
test('missing documents or forged release flags cannot approve anything',()=>{
 const missing=evaluateFactoryReview(context({evidenceEnvelopes:[]}));
 assert.equal(missing.eligibleForTechnologistReview,false);
 assert.equal(missing.blockers.filter(x=>x.startsWith('MISSING_')).length,REQUIRED_FACTORY_EVIDENCE.length);
 assert.equal(missing.productionRelease.allowed,false);
 assert.equal(validEvidenceFields({...record('frame-cad'),productionRelease:{allowed:true}}),false);
});
test('tampered or substituted signed evidence is rejected',()=>{
 const e=evidence();
 e[0].record.contentHash=H('e');
 assert.equal(verifyFactoryEvidence(e[0],secret),false);
 const outcome=evaluateFactoryReview(context({evidenceEnvelopes:e}));
 assert.ok(outcome.blockers.includes('INVALID_EVIDENCE_SIGNATURE'));
 assert.equal(outcome.eligibleForTechnologistReview,false);
});
test('cross-revision evidence is stale for dimensions, BOM, price or revision ID',()=>{
 for(const key of ['configHash','bomHash','costHash','revisionId']){
  const value=key==='revisionId'?'REV-004':H('e');
  const outcome=evaluateFactoryReview(context({revision:{...revision,[key]:value}}));
  assert.ok(outcome.blockers.includes('STALE_EVIDENCE_REVISION'));
  assert.equal(outcome.productionRelease.allowed,false);
 }
});
test('expired and future signed factory documents are disallowed',()=>{
 const old=evidence();
 old[0]=sealFactoryEvidence({...record(REQUIRED_FACTORY_EVIDENCE[0]),expiresAtMs:now},secret);
 assert.ok(evaluateFactoryReview(context({evidenceEnvelopes:old})).blockers.includes('EXPIRED_OR_FUTURE_EVIDENCE'));
 const future=evidence();
 future[0]=sealFactoryEvidence({...record(REQUIRED_FACTORY_EVIDENCE[0]),verifiedAtMs:now+10},secret);
 assert.ok(evaluateFactoryReview(context({evidenceEnvelopes:future})).blockers.includes('EXPIRED_OR_FUTURE_EVIDENCE'));
});
test('duplicate claims cannot substitute unique evidence kinds',()=>{
 const all=evidence();all.push(sealFactoryEvidence(record(REQUIRED_FACTORY_EVIDENCE[0],2),secret));
 assert.ok(evaluateFactoryReview(context({evidenceEnvelopes:all})).blockers.includes('DUPLICATE_EVIDENCE_KIND'));
});
test('identity, MFA, role, session expiry and frozen revision are mandatory',()=>{
 const attempts=[
  {actor:{...actor,authenticated:false}},
  {actor:{...actor,mfaVerified:false}},
  {actor:{...actor,identitySource:'browser-state'}},
  {actor:{...actor,roles:['client']}},
  {actor:{...actor,sessionExpiresAtMs:now}},
  {revision:{...revision,state:'draft'}}
 ];
 for(const patch of attempts){
  const result=evaluateFactoryReview(context(patch));
  assert.equal(result.eligibleForTechnologistReview,false);
  assert.equal(result.productionRelease.allowed,false);
 }
});
test('weak or missing signing key fails closed',()=>{
 assert.throws(()=>evaluateFactoryReview(context({secret:'short'})),/SERVER_SECRET_TOO_SHORT/);
 assert.throws(()=>sealFactoryEvidence(record('frame-cad'),null),/MISSING_SERVER_SECRET/);
 assert.throws(()=>sealFactoryEvidence({...record('frame-cad'),contentHash:'wrong'},secret),/INVALID_EVIDENCE_FIELDS/);
});
