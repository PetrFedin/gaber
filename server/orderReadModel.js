import {orderFinancials} from '../src/orderWorkflow.js';
import {createManufacturingPackage} from '../src/manufacturing.js';
import {getCurrentClientOffer} from '../src/clientOffer.js';
import {visibleOrderMessages} from '../src/orderMessageChannels.js';
import {getConceptPackoutPlan} from '../src/fulfillmentInspection.js';

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
 const messages=clone(visibleOrderMessages(state.messages,role)),config=clone(current?.config??state.sourceConfig);
 const task=factoryTask(state);
 const plan=(state.stage==='ready'||state.packout||state.delivery)?
  getConceptPackoutPlan(current?.config??state.sourceConfig):null;
 const fulfillment={plan,packout:clone(state.packout??null),
  receipt:clone(state.receipt??null),
  correctionPending:state.receipt?.status==='correction_pending_reinspection',
  authority:'CONCEPT_INSPECTION_NOT_PHYSICAL_WAREHOUSE_PROOF'};
 if(role==='client'){
  // Repricing or a customer change immediately revokes the current payable
  // quote. Previous revisions remain in the journal but must not be presented
  // as active offers or outstanding invoices to the customer.
  const active=getCurrentClientOffer(state);
  const f=active?orderFinancials(state):null;
  return {...base,
   revisionId:active?.id??null,
   dueDate:active?.dueDate??null,
   name:state.name,config:clone(active?.config??current?.config??state.sourceConfig),
   configurationStatus:active?'PUBLISHED_CONCEPT':'HISTORICAL_OR_ORIGINAL_UNPRICED',
   offerStatus:active?'PUBLISHED_CONCEPT':'AWAITING_NEW_CONFIRMED_OFFER',
   acceptedRevisionId:active?state.acceptedRevisionId:null,
   offer:active?{revisionId:active.id,priceKopecks:active.priceKopecks,
    advanceBps:active.advanceBps,note:active.note}:null,
   finance:{customerPriceKopecks:f?.priceKopecks??null,
    advanceKopecks:f?.advanceKopecks??null,
    advanceDueKopecks:f?.advanceDueKopecks??null,
    balanceKopecks:f?.balanceKopecks??null,
    localRecordedKopecks:f?.currentKopecks??null,
    verifiedBankKopecks:null,authority:'UNVERIFIED_NOT_SETTLEMENT'},
   paymentClaims:clone(state.paymentClaims),messages,issue:clone(state.issue),fulfillment};
 }
 if(role==='factory'){
  return {...base,name:state.name,config:clone(task?.sourceConfig??config),
   dueDate:task?.dueDate??null,
   factoryTask:task,acceptedRevisionId:state.acceptedRevisionId,
   messages,issue:clone(state.issue),fulfillment};
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
  messages,issue:clone(state.issue),fulfillment,
  assignedFactoryId:state.assignedFactoryId??null,
  operatorScope:'TENANT_OPERATIONS'
 };
}
