import {authorizeGaberAction} from './accessPolicy.js';
import {canAccessOrderMessageChannel} from '../src/orderMessageChannels.js';

export const GABER_COMMAND_POLICY='gaber-three-role-command-admission/1';
const MAP=Object.freeze({
 create:['orders.create','client'],message:['orders.message',null],
 assign_factory:['orders.assign_factory','partner'],
 prepare_spec:['partner.spec.prepare','partner'],
 confirm_spec:['factory.spec.confirm','factory'],
 return_spec:['factory.spec.return','factory'],
 offer:['offers.write','partner'],
 accept:['offers.accept','client'],
 request_change:['changes.request','client'],
 report_payment:['payments.report','client'],
 record_payment:['payments.record_unverified','partner'],
 allocate_credit:['offers.accept','client'],
 start:['production.start','factory'],complete:['production.start','factory'],
 quality_pass:['qc.record','factory'],ship:['shipments.record','factory'],
 deliver:['shipments.confirm_carrier','factory'],
 accept_delivery:['delivery.accept','client'],
 report_issue:['issues.report','client'],
 respond_issue:['issues.respond',null],
 reject_resolution:['issues.reject','client'],
 confirm_resolution:['issues.accept','client']
});
const deny=code=>({allowed:false,code,productionRelease:{allowed:false}});
/**
 * Principal role is assigned by trusted session middleware. Browser-selected
 * or command payload roles do not establish authority.
 */
export function admitOrderCommand({principal,resource,command,nowMs,externalGrants=null}){
 if(!command||typeof command!=='object'||Array.isArray(command)||
   typeof command.type!=='string'||!Object.hasOwn(MAP,command.type))
  return deny('COMMAND_UNKNOWN');
 const [action,perspective]=MAP[command.type];
 const auth=authorizeGaberAction({principal,resource,action,nowMs,externalGrants});
 if(!auth.allowed)return deny(auth.reason);
 if(perspective&&auth.role!==perspective)return deny('PERSPECTIVE_MISMATCH');
 if(command.role!==auth.role)return deny('UNTRUSTED_COMMAND_ROLE');
 if(command.type==='message'){
  if(command.payload?.partnerId!==undefined||command.payload?.privateThread!==undefined)
   return deny('LEGACY_PRIVATE_THREAD_REMOVED');
  if(!canAccessOrderMessageChannel(auth.role,command.payload?.channel))
   return deny('MESSAGE_CHANNEL_FORBIDDEN');
 }
 return {allowed:true,code:'ELIGIBLE_FOR_SERVER_TRANSACTION',
   action,authorSubject:principal.subject,reducerRole:auth.role,
   tenantId:auth.tenantId,resourceId:auth.resourceId,
   authority:'SERVER_MEMBERSHIP_CHECKED_COMMAND_UNEXECUTED',
   productionRelease:{allowed:false}};
}
