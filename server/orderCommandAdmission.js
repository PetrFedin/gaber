import {authorizeGaberAction} from './accessPolicy.js';

/**
 * Server-side adapter for event-journal commands, NOT an HTTP endpoint.
 * The existing browser workflow accepts client/factory perspective labels.
 * Never derive that role from a payload; derive it from server membership.
 * Real production, bank settlement and shipping confirmations remain HOLD.
 */
export const GABER_COMMAND_POLICY='gaber-command-admission/0.4.17';
const MAP=Object.freeze({
  create:['orders.create','client'],
  message:['orders.message',null],
  offer:['offers.write','factory'],
  accept:['offers.accept','client'],
  request_change:['changes.request','client'],
  report_payment:['payments.report','client'],
  record_payment:['payments.record_unverified','factory'],
  allocate_credit:['offers.accept','client'],
  start:['production.start','factory'],
  complete:['production.start','factory'],
  quality_pass:['qc.record','factory'],
  ship:['shipments.record','factory'],
  deliver:['shipments.confirm_carrier','factory'],
  accept_delivery:['delivery.accept','client'],
  report_issue:['issues.report','client'],
  respond_issue:['issues.respond','factory'],
  reject_resolution:['issues.reject','client'],
  confirm_resolution:['issues.accept','client']
});
const deny=(code)=>({allowed:false,code,productionRelease:{allowed:false}});
/**
 * Authorizes a command against a resource already fetched by a tenant-filtered
 * repository. No mutations. A positive result is NOT authorization to execute
 * the prototype reducer or a real transaction without rechecking membership.
 */
export function admitOrderCommand({principal,resource,command,nowMs}){
 if(!command||typeof command!=='object'||Array.isArray(command)||
    typeof command.type!=='string'||!Object.hasOwn(MAP,command.type))
   return deny('COMMAND_UNKNOWN');
 const [action,requiredPerspective]=MAP[command.type];
 const authorization=authorizeGaberAction({principal,resource,action,nowMs});
 if(!authorization.allowed)return deny(authorization.reason);
 // Only the designated owner of the action may submit a journal event.
 // A factory/owner can be authorized for offers; owner acts on factory side.
 const inferred=authorization.role==='client'?'client':
   ['factory-operator','factory-technologist','owner','brand'].includes(authorization.role)?'factory':null;
 if(requiredPerspective&&!inferred)return deny('PERSPECTIVE_NOT_SUPPORTED');
 if(requiredPerspective&&inferred!==requiredPerspective)return deny('PERSPECTIVE_MISMATCH');
 if(command.role!==inferred)return deny('UNTRUSTED_COMMAND_ROLE');
 // The prototype reducer records these money and stages as LOCAL_UNVERIFIED.
 // Server must not accept them as real bank/production facts.
 return {allowed:true,code:'ELIGIBLE_FOR_SERVER_TRANSACTION',
   action,authorSubject:principal.subject,
   reducerRole:inferred,tenantId:authorization.tenantId,
   resourceId:authorization.resourceId,
   authority:'SERVER_MEMBERSHIP_CHECKED_COMMAND_UNEXECUTED',
   productionRelease:{allowed:false}};
}
