/**
 * GABER server-only permission contract.
 * Principal must come from verified authentication middleware; resource
 * must be loaded by an authoritative repository. This is NOT a login API.
 */
export const GABER_ACCESS_SCHEMA='gaber-server-access-policy/0.4.15';
export const GABER_ROLES=Object.freeze([
 'client','brand','partner','factory-operator','factory-technologist','owner'
]);
const id=x=>typeof x==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(x);
const WRITE_MFA=new Set(['offers.write','payments.record_unverified','qc.record',
 'shipments.record','issues.respond','catalog.manage','factory.technical_review']);
const NEVER_WITHOUT_EXTERNAL_AUTHORITY=new Set([
 'payments.verify_bank','production.start','factory.production_release','shipments.confirm_carrier'
]);
const RIGHTS=Object.freeze({
 'orders.read':['client','brand','partner','factory-operator','factory-technologist','owner'],
 'orders.create':['client'],
 'orders.message':['client','brand','partner','factory-operator','owner'],
 'offers.write':['brand','factory-operator','owner'],
 'offers.accept':['client'],
 'changes.request':['client'],
 'payments.report':['client'],
 'payments.record_unverified':['factory-operator','owner'],
 'payments.read':['client','factory-operator','owner'],
 'qc.record':['factory-operator','factory-technologist','owner'],
 'shipments.record':['factory-operator','owner'],
 'delivery.accept':['client'],
 'issues.report':['client'],
 'issues.respond':['factory-operator','owner'],
 'catalog.read':['client','brand','partner','factory-operator','factory-technologist','owner'],
 'catalog.manage':['brand','owner'],
 'analytics.own':['client','brand','partner'],
 'analytics.factory':['factory-operator','factory-technologist','owner'],
 'analytics.tenant':['owner'],
 'factory.technical_review':['factory-technologist','owner']
});
const deny=(reason)=>({allowed:false,reason,scope:null,productionRelease:{allowed:false}});
export function authorizeGaberAction({principal,resource,action,nowMs}){
 if(!principal||principal.identitySource!=='server-session'||
   principal.authenticated!==true||!id(principal.subject)||!id(principal.tenantId)||
   !Number.isSafeInteger(principal.sessionExpiresAtMs)||
   !Number.isSafeInteger(nowMs)||nowMs<=0||principal.sessionExpiresAtMs<=nowMs||
   !Array.isArray(principal.roles)||!principal.roles.length||
   principal.roles.some(role=>!GABER_ROLES.includes(role)))
  return deny('NO_VERIFIED_SESSION');
 if(!resource||resource.source!=='server-repository'||!id(resource.tenantId)||
    !id(resource.orderId)&&!id(resource.catalogId)&&!id(resource.analyticsScopeId))
  return deny('NO_AUTHORITATIVE_RESOURCE');
 if(principal.tenantId!==resource.tenantId)return deny('TENANT_SCOPE_MISMATCH');
 if(NEVER_WITHOUT_EXTERNAL_AUTHORITY.has(action))return deny('EXTERNAL_AUTHORITY_REQUIRED');
 if(!Object.hasOwn(RIGHTS,action))return deny('ACTION_UNKNOWN');
 const accepted=principal.roles.filter(role=>RIGHTS[action].includes(role));
 if(!accepted.length)return deny('ROLE_FORBIDDEN');
 if(WRITE_MFA.has(action)&&principal.mfaVerified!==true)return deny('MFA_REQUIRED');
 const matched=accepted.find(role=>{
  switch(role){
   case 'owner':return true;
   case 'client':return id(principal.clientId)&&principal.clientId===resource.clientId;
   case 'brand':return id(principal.brandId)&&principal.brandId===resource.brandId;
   case 'partner':return id(principal.partnerId)&&Array.isArray(resource.partnerIds)&&
     resource.partnerIds.includes(principal.partnerId);
   case 'factory-operator':
   case 'factory-technologist':return id(principal.factoryId)&&principal.factoryId===resource.factoryId;
   default:return false;
  }
 });
 if(!matched)return deny('RESOURCE_MEMBERSHIP_DENIED');
 // Owners receive tenant aggregate; partners and brands only explicit
 // resource membership. This policy MUST be checked on every API query.
 const scope=matched==='owner'?'tenant':matched.startsWith('factory-')?'factory':
  matched==='client'?'own-order':matched==='brand'?'brand-assigned':'partner-assigned';
 return {allowed:true,reason:'AUTHORIZED_CONTRACT_ONLY',role:matched,scope,
  tenantId:principal.tenantId,resourceId:resource.orderId??resource.catalogId??resource.analyticsScopeId,
  productionRelease:{allowed:false}};
}
