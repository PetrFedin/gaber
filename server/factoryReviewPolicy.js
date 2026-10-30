import {createHmac,timingSafeEqual} from 'node:crypto';

/** Server-only policy: never import this module in the Vite client bundle. */
export const FACTORY_REVIEW_POLICY='gaber/factory-review-policy/v1';
export const REQUIRED_FACTORY_EVIDENCE=Object.freeze([
 'frame-cad','joint-and-hole-drawing','fastener-specification',
 'foam-compression-test','upholstery-cutting-marker','measured-supplier-prices',
 'verified-operation-times','mechanism-clearance-test','load-and-stability-test'
]);
const hash=/^[a-f0-9]{64}$/;
const id=/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const named=x=>typeof x==='string'&&id.test(x);
const digest=x=>typeof x==='string'&&hash.test(x);
const time=x=>Number.isSafeInteger(x)&&x>0;
const has=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
const keys=['id','kind','projectId','revisionId','configHash','bomHash','costHash',
 'contentHash','verifiedBy','verifiedAtMs','expiresAtMs'];
function canonical(value,depth=0){
 if(depth>12)throw new TypeError('DOCUMENT_TOO_DEEP');
 if(value===null||typeof value==='string'||typeof value==='boolean')return value;
 if(typeof value==='number'&&Number.isFinite(value))return value;
 if(Array.isArray(value))return value.map(x=>canonical(x,depth+1));
 if(!value||typeof value!=='object'||Object.getPrototypeOf(value)!==Object.prototype)
  throw new TypeError('INVALID_DOCUMENT');
 return Object.fromEntries(Object.keys(value).sort().map(key=>{
  if(['__proto__','prototype','constructor'].includes(key))throw new TypeError('INVALID_DOCUMENT');
  return [key,canonical(value[key],depth+1)];
 }));
}
function keyBytes(secret){
 if(typeof secret!=='string'&&!Buffer.isBuffer(secret))throw new TypeError('MISSING_SERVER_SECRET');
 const value=Buffer.isBuffer(secret)?secret:Buffer.from(secret,'utf8');
 if(value.length<32)throw new TypeError('SERVER_SECRET_TOO_SHORT');
 return value;
}
function mac(payload,secret){
 return createHmac('sha256',keyBytes(secret)).update(JSON.stringify(canonical(payload))).digest('hex');
}
export function validEvidenceFields(r){
 return !!r&&typeof r==='object'&&!Array.isArray(r)&&
  keys.every(k=>has(r,k))&&Object.keys(r).every(k=>keys.includes(k))&&
  [r.id,r.kind,r.projectId,r.revisionId,r.verifiedBy].every(named)&&
  [r.configHash,r.bomHash,r.costHash,r.contentHash].every(digest)&&
  time(r.verifiedAtMs)&&time(r.expiresAtMs)&&r.verifiedAtMs<r.expiresAtMs;
}
/** Sign only after independent server-side validation and durable storage. */
export function sealFactoryEvidence(record,secret){
 if(!validEvidenceFields(record))throw new TypeError('INVALID_EVIDENCE_FIELDS');
 return {policyVersion:FACTORY_REVIEW_POLICY,record:canonical(record),mac:mac(record,secret)};
}
export function verifyFactoryEvidence(envelope,secret){
 if(!envelope||envelope.policyVersion!==FACTORY_REVIEW_POLICY||
  !validEvidenceFields(envelope.record)||!digest(envelope.mac))return false;
 const expected=mac(envelope.record,secret);
 return timingSafeEqual(Buffer.from(expected,'hex'),Buffer.from(envelope.mac,'hex'));
}
/**
 * Inputs are server-trusted DB/auth objects, NOT browser-supplied objects.
 * A valid HMAC protects integrity only. It does not establish that CAD,
 * a supplier quote or a physical test was genuine in the first place.
 */
export function evaluateFactoryReview({revision,actor,evidenceEnvelopes,nowMs,secret}){
 keyBytes(secret);
 const blockers=new Set(),seen=new Set();
 if(!time(nowMs))blockers.add('INVALID_SERVER_CLOCK');
 if(!revision||![revision.projectId,revision.revisionId].every(named)||
  ![revision.configHash,revision.bomHash,revision.costHash].every(digest)||
  revision.state!=='frozen-for-technical-review')
  blockers.add('UNFROZEN_OR_INVALID_REVISION');
 if(!actor||actor.authenticated!==true||actor.identitySource!=='server-session'||
  !named(actor.subject)||!named(actor.tenantId)||!named(actor.factoryId)||
  !Array.isArray(actor.roles)||
  !actor.roles.some(x=>x==='factory')||
  actor.mfaVerified!==true||!time(actor.sessionExpiresAtMs)||
  !time(nowMs)||actor.sessionExpiresAtMs<=nowMs)
  blockers.add('UNAUTHORIZED_TECHNOLOGIST');
 if(!Array.isArray(evidenceEnvelopes)||evidenceEnvelopes.length>64)
  blockers.add('INVALID_EVIDENCE_REGISTER');
 for(const item of Array.isArray(evidenceEnvelopes)?evidenceEnvelopes.slice(0,65):[]){
  const e=item?.record;
  if(!verifyFactoryEvidence(item,secret)){blockers.add('INVALID_EVIDENCE_SIGNATURE');continue;}
  if(!revision||e.projectId!==revision.projectId||
   e.revisionId!==revision.revisionId||e.configHash!==revision.configHash||
   e.bomHash!==revision.bomHash||e.costHash!==revision.costHash){
    blockers.add('STALE_EVIDENCE_REVISION');continue;
  }
  if(e.verifiedAtMs>nowMs||e.expiresAtMs<=nowMs){
    blockers.add('EXPIRED_OR_FUTURE_EVIDENCE');continue;
  }
  if(seen.has(e.kind))blockers.add('DUPLICATE_EVIDENCE_KIND');
  seen.add(e.kind);
 }
 for(const kind of REQUIRED_FACTORY_EVIDENCE)if(!seen.has(kind))
  blockers.add('MISSING_'+kind.toUpperCase().replaceAll('-','_'));
 return {policyVersion:FACTORY_REVIEW_POLICY,
  eligibleForTechnologistReview:blockers.size===0,blockers:[...blockers].sort(),
  verifiedKinds:REQUIRED_FACTORY_EVIDENCE.filter(k=>seen.has(k)),
  productionRelease:{allowed:false,reason:'NO_AUTHORIZED_PRODUCTION_RELEASE_SERVICE'}};
}
/** Technical document review only; never a manufacturing approval. */
export function makeTechnologistReviewDecision(context){
 const review=evaluateFactoryReview(context);
 if(!review.eligibleForTechnologistReview)return {accepted:false,...review};
 const {actor,revision,nowMs,secret}=context;
 const statement={policyVersion:FACTORY_REVIEW_POLICY,
  projectId:revision.projectId,revisionId:revision.revisionId,
  configHash:revision.configHash,bomHash:revision.bomHash,costHash:revision.costHash,
  reviewerId:actor.subject,reviewedAtMs:nowMs,
  outcome:'TECHNICAL_DOCUMENTATION_REVIEWED_NOT_RELEASED'};
 return {accepted:true,statement,signature:mac(statement,secret),...review,
  productionRelease:{allowed:false,reason:'PRODUCTION_REQUIRES_SEPARATE_AUTHORITY'}};
}
