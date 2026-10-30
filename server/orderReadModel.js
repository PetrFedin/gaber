import {orderFinancials} from '../src/orderWorkflow.js';

export const ORDER_READ_SCHEMA='gaber-server-order-read/0.4.19';
/** Internal projection AFTER authorization. Never send raw journal rows to a browser. */
export function projectOrderReadModel(state,role,viewer={}){
 if(!['client','brand','partner','factory-operator','factory-technologist','owner'].includes(role))
  throw TypeError('INVALID_READ_ROLE');
 const current=state.revisions.at(-1);
 const dto={schemaVersion:ORDER_READ_SCHEMA,orderId:state.projectId,version:state.version,
  stage:state.stage,updatedAt:state.updatedAt,revisionId:current?.id??null,
  dueDate:current?.dueDate??null,authority:'SERVER_JOURNAL_UNVERIFIED_OPERATIONS',
  productionRelease:{allowed:false}};
 // Assigned partners receive progress only, without names, configuration, notes or money.
 if(role==='partner'){
  // A partner has no access to the general conversation or other partners.
  // The id comes from verified session membership, never a request parameter.
  dto.partnerThread=typeof viewer.partnerId==='string'
    ? structuredClone(state.messages.filter(m=>m.partnerId===viewer.partnerId))
    : [];
  return dto;
 }
 dto.config=structuredClone(current?.config??state.sourceConfig);
 if(role==='factory-technologist')return dto;
 dto.name=state.name;
 dto.offer=current?{revisionId:current.id,priceKopecks:current.priceKopecks,
  advanceBps:current.advanceBps,note:current.note}:null;
 dto.acceptedRevisionId=state.acceptedRevisionId;
 dto.messages=structuredClone(role==='brand'
  ? state.messages.filter(m=>m.partnerId===null||m.partnerId===undefined)
  : state.messages);
 if(role==='brand')return dto;
 dto.finance={...orderFinancials(state),authority:'UNVERIFIED_RECORDS_NOT_BANK_SETTLEMENT'};
 dto.paymentClaims=structuredClone(state.paymentClaims);
 dto.payments=structuredClone(state.payments);
 dto.issue=structuredClone(state.issue);
 return dto;
}
