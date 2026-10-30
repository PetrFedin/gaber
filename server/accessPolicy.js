/**
 * GABER has EXACTLY THREE server roles: customer, factory, platform partner.
 * The partner is the operator of this tenant and sees all of its assigned
 * deals; it is NOT a per-order external partner/messenger. Server sessions
 * and resource tenant/factory/customer membership must be independently verified.
 */
export const GABER_ACCESS_SCHEMA='gaber-server-three-role-policy/1';
export const GABER_ROLES=Object.freeze(['client','factory','partner']);
const id=v=>typeof v==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(v);
const WRITE_MFA=new Set([
 'partner.spec.prepare','offers.write','payments.record_unverified',
 'factory.spec.confirm','factory.spec.return','factory.technical_review',
 'qc.record','shipments.record','issues.respond','catalog.manage'
]);
const EXTERNAL_AUTHORITY=new Set([
 'payments.verify_bank','production.start','factory.production_release',
 'shipments.confirm_carrier','payments.charge','payments.refund'
]);
const RIGHTS=Object.freeze({
 'orders.read':['client','factory','partner'],
 'orders.create':['client'],
 'orders.message':['client','factory','partner'],
 'partner.spec.prepare':['partner'],
 'factory.spec.confirm':['factory'],
 'factory.spec.return':['factory'],
 'offers.write':['partner'],
 'offers.accept':['client'],
 'changes.request':['client'],
 'payments.report':['client'],
 'payments.record_unverified':['partner'],
 'payments.read':['client','partner'],
 'finance.internal.read':['partner'],
 'finance.factory.read':['factory','partner'],
 'qc.record':['factory'],
 'shipments.record':['factory'],
 'delivery.accept':['client'],
 'issues.report':['client'],
 'issues.respond':['factory','partner'],
 'issues.reject':['client'],
 'issues.accept':['client'],
 'catalog.read':['client','factory','partner'],
 'catalog.manage':['partner'],
 'analytics.own':['client'],
 'analytics.factory':['factory'],
 'analytics.tenant':['partner'],
 'factory.technical_review':['factory']
});
const deny=reason=>({allowed:false,reason,scope:null,productionRelease:{allowed:false}});
export function authorizeGaberAction({principal,resource,action,nowMs}){
 if(!principal||principal.identitySource!=='server-session'||
    principal.authenticated!==true||!id(principal.subject)||!id(principal.tenantId)||
    !Number.isSafeInteger(principal.sessionExpiresAtMs)||
    !Number.isSafeInteger(nowMs)||nowMs<=0||principal.sessionExpiresAtMs<=nowMs||
    !Array.isArray(principal.roles)||principal.roles.length!==1||
    !GABER_ROLES.includes(principal.roles[0]))return deny('NO_VERIFIED_SESSION');
 if(!resource||resource.source!=='server-repository'||!id(resource.tenantId)||
   ![resource.orderId,resource.catalogId,resource.analyticsScopeId].some(id))
  return deny('NO_AUTHORITATIVE_RESOURCE');
 if(principal.tenantId!==resource.tenantId)return deny('TENANT_SCOPE_MISMATCH');
 if(EXTERNAL_AUTHORITY.has(action))return deny('EXTERNAL_AUTHORITY_REQUIRED');
 if(!Object.hasOwn(RIGHTS,action))return deny('ACTION_UNKNOWN');
 const role=principal.roles[0];
 if(!RIGHTS[action].includes(role))return deny('ROLE_FORBIDDEN');
 if(WRITE_MFA.has(action)&&principal.mfaVerified!==true)return deny('MFA_REQUIRED');
 // Partner is the platform operator; it has TENANT-wide scope, not a user-supplied
 // partnerId. Client and factory are restricted to the current order membership.
 if(role==='client'&&(!id(principal.clientId)||principal.clientId!==resource.clientId))
  return deny('RESOURCE_MEMBERSHIP_DENIED');
 if(role==='factory'&&(!id(principal.factoryId)||principal.factoryId!==resource.factoryId))
  return deny('RESOURCE_MEMBERSHIP_DENIED');
 return {allowed:true,reason:'AUTHORIZED_CONTRACT_ONLY',role,
   scope:role==='partner'?'tenant':role==='factory'?'assigned-factory':'own-order',
   tenantId:principal.tenantId,
   resourceId:resource.orderId??resource.catalogId??resource.analyticsScopeId,
   productionRelease:{allowed:false}};
}
