import {orderFinancials} from '../src/orderWorkflow.js';
import {createManufacturingPackage} from '../src/manufacturing.js';

export const ORDER_READ_SCHEMA='gaber-server-order-three-roles/1';
const clone=x=>structuredClone(x);
function factoryTask(state){
 const spec=state.specs?.at(-1);
 if(!spec)return null;
 const pkg=createManufacturingPackage(spec.config);
 return {
  specId:spec.id,technicalNote:spec.technicalNote,
  factoryCostKopecks:spec.economics.factoryCostKopecks,
  dueDate:spec.dueDate,confirmation:clone(spec.factoryDecision),
  stage:spec.status,sourceConfig:clone(spec.config),
  drawingReleaseId:null,parts:pkg.parts,joinery:pkg.joinery,layers:pkg.layers,
  suspension:pkg.suspension,hardware:pkg.hardware,routing:pkg.routing,
  upholstery:pkg.upholstery,traceability:pkg.traceability,
  integrity:pkg.integrity,productionRelease:{allowed:false,
   blockers:[...pkg.productionRelease.blockers]},
  authority:'CONCEPT_FACTORY_TZ_NOT_APPROVED'
 };
}
/**
 * No raw state or partner-only economic fields in client/factory DTOs.
 * Access is checked before this projection in journal.read.
 */
export function projectOrderReadModel(state,role){
 if(!['client','factory','partner'].includes(role))throw TypeError('INVALID_READ_ROLE');
 const current=state.revisions.at(-1);
 const base={schemaVersion:ORDER_READ_SCHEMA,orderId:state.projectId,
  version:state.version,stage:state.stage,updatedAt:state.updatedAt,
  revisionId:current?.id??null,dueDate:current?.dueDate??null,
  authority:'SERVER_JOURNAL_UNVERIFIED_OPERATIONS',
  productionRelease:{allowed:false}};
 const messages=clone(state.messages),config=clone(current?.config??state.sourceConfig);
 const task=factoryTask(state);
 if(role==='client'){
  const f=orderFinancials(state);
  return {...base,name:state.name,config,acceptedRevisionId:state.acceptedRevisionId,
   offer:current?{revisionId:current.id,priceKopecks:current.priceKopecks,
    advanceBps:current.advanceBps,note:current.note}:null,
   finance:{customerPriceKopecks:f.priceKopecks,
    advanceKopecks:f.advanceKopecks,advanceDueKopecks:f.advanceDueKopecks,
    balanceKopecks:f.balanceKopecks,localRecordedKopecks:f.currentKopecks,
    verifiedBankKopecks:null,authority:'UNVERIFIED_NOT_SETTLEMENT'},
   paymentClaims:clone(state.paymentClaims),messages,issue:clone(state.issue)};
 }
 if(role==='factory'){
  return {...base,name:state.name,config:clone(task?.sourceConfig??config),
   factoryTask:task,acceptedRevisionId:state.acceptedRevisionId,
   messages,issue:clone(state.issue)};
 }
 const f=orderFinancials(state);
 return {...base,name:state.name,config:clone(task?.sourceConfig??config),
  acceptedRevisionId:state.acceptedRevisionId,
  offer:current?{revisionId:current.id,priceKopecks:current.priceKopecks,
   advanceBps:current.advanceBps,note:current.note}:null,
  factoryTask:task,
  proposals:clone(state.specs??[]),
  economics:clone(state.specs?.at(-1)?.economics??null),
  finance:{...f,authority:'UNVERIFIED_RECORDS_NOT_BANK_SETTLEMENT'},
  payments:clone(state.payments),paymentClaims:clone(state.paymentClaims),
  messages,issue:clone(state.issue),
  operatorScope:'TENANT_OPERATIONS'
 };
}
