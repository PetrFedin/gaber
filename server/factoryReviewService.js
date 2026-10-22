import {makeTechnologistReviewDecision} from './factoryReviewPolicy.js';

/**
 * Expected authoritative PostgreSQL adapter:
 * repository.withSerializableTransaction(async tx => ...) begins SERIALIZABLE.
 * tx.getRevisionForUpdate(projectId,revisionId) locks exact revision.
 * tx.getEvidenceForRevision(projectId,revisionId) returns independently verified,
 * server-stored and signed evidence. tx.getTechnicalReviewByKey(requestId)
 * and tx.insertImmutableTechnicalReview(event) operate in that transaction,
 * with a UNIQUE idempotency key and rollback on errors.
 *
 * Principal must originate in authenticated server middleware, NEVER request JSON.
 * This module does not provide a DB or HTTP server; it cannot approve production.
 */
const id=/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const named=v=>typeof v==='string'&&id.test(v);
export async function submitTechnologistReview({principal,projectId,revisionId,requestId,
 repository,secret,nowMs}){
 if(![projectId,revisionId,requestId].every(named))
  return {accepted:false,code:'INVALID_REQUEST',productionRelease:{allowed:false}};
 if(!repository||typeof repository.withSerializableTransaction!=='function')
  throw new TypeError('NO_AUTHORITATIVE_REPOSITORY');
 // Reject unauthorized requests before reading any factory data from DB.
 if(!principal||principal.identitySource!=='server-session'||
  principal.authenticated!==true||!named(principal.subject)||
  !Array.isArray(principal.roles)||
  !principal.roles.some(role=>role==='technologist'||role==='factory-admin')||
  principal.mfaVerified!==true||!Number.isSafeInteger(nowMs)||
  !Number.isSafeInteger(principal.sessionExpiresAtMs)||
  principal.sessionExpiresAtMs<=nowMs)
  return {accepted:false,code:'UNAUTHORIZED_TECHNOLOGIST',
   productionRelease:{allowed:false}};
 return repository.withSerializableTransaction(async tx=>{
  const revision=await tx.getRevisionForUpdate(projectId,revisionId);
  const evidenceEnvelopes=await tx.getEvidenceForRevision(projectId,revisionId);
  const decision=makeTechnologistReviewDecision({
   revision,actor:principal,evidenceEnvelopes,nowMs,secret
  });
  if(!decision.accepted)return {accepted:false,code:'TECHNICAL_REVIEW_BLOCKED',
   blockers:decision.blockers,productionRelease:{allowed:false}};
  const previous=await tx.getTechnicalReviewByKey(requestId);
  if(previous){
   if(previous.projectId!==projectId||previous.revisionId!==revisionId||
    previous.reviewerId!==principal.subject||previous.configHash!==revision.configHash||
    previous.bomHash!==revision.bomHash||previous.costHash!==revision.costHash)
    return {accepted:false,code:'IDEMPOTENCY_CONFLICT',productionRelease:{allowed:false}};
   return {accepted:true,code:'ALREADY_REVIEWED',eventId:previous.id,
    productionRelease:{allowed:false}};
  }
  const event={idempotencyKey:requestId,projectId,revisionId,
   reviewerId:principal.subject,configHash:revision.configHash,
   bomHash:revision.bomHash,costHash:revision.costHash,
   statement:decision.statement,signature:decision.signature,
   createdAtMs:nowMs,kind:'TECHNICAL_REVIEW_ACCEPTED_NOT_RELEASED'};
  const persisted=await tx.insertImmutableTechnicalReview(event);
  if(!persisted||!named(persisted.id))throw new Error('REVIEW_EVENT_NOT_PERSISTED');
  return {accepted:true,code:'TECHNICAL_REVIEW_RECORDED',eventId:persisted.id,
   productionRelease:{allowed:false}};
 });
}
