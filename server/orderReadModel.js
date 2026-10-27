import {orderFinancials} from '../src/orderWorkflow.js';

export const ORDER_READ_SCHEMA='gaber-server-order-read/0.4.19';
/** Internal projection AFTER authorization. Never send raw journal rows to a browser. */
export function projectOrderReadModel(state,role){
 if(!['client','brand','partner','factory-operator','factory-technologist','owner'].includes(role))
  throw TypeError('INVALID_READ_ROLE');
 const current=state.revisions.at(-1);
 const dto={schemaVersion:ORDER_READ_SCHEMA,orderId:state.projectId,version:state.version,
  stage:state.stage,updatedAt:state.updatedAt,revisionId:current?.id??null,
  dueDate:current?.dueDate??null,authority:'SERVER_JOURNAL_UNVERIFIED_OPERATIONS',
  productionRelease:{allowed:false}};
 // Assigned partners receive progress only, without names, configuration, notes or money.
 if(role==='partner')return dto;
 dto.config=structuredClone(current?.config??state.sourceConfig);
 if(role==='factory-technologist')return dto;
 dto.name=state.name;
 dto.offer=current?{revisionId:current.id,priceKopecks:current.priceKopecks,
  advanceBps:current.advanceBps,note:current.note}:null;
 dto.acceptedRevisionId=state.acceptedRevisionId;
 dto.messages=structuredClone(state.messages);
 if(role==='brand')return dto;
 dto.finance={...orderFinancials(state),authority:'UNVERIFIED_RECORDS_NOT_BANK_SETTLEMENT'};
 dto.paymentClaims=structuredClone(state.paymentClaims);
 dto.payments=structuredClone(state.payments);
 dto.issue=structuredClone(state.issue);
 return dto;
}
