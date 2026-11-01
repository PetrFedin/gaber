import {ORDER_STAGES,orderFinancials,orderEngineering} from './orderWorkflow.js';
import {getCurrentClientOffer} from './clientOffer.js';

export const ORDER_PORTFOLIO_SCHEMA='gaber-local-operations-analytics/0.4.15';
const ACTIVE_DUE_STAGES=new Set(['offered','accepted','change_requested','production','quality']);
const PRIORITY={critical:0,attention:1,routine:2,complete:3};
const sumKopecks=values=>{
 const total=values.reduce((sum,n)=>sum+BigInt(n),0n);
 return total<=BigInt(Number.MAX_SAFE_INTEGER)?Number(total):null;
};
function decision(state,finance){
 switch(state.stage){
  case 'requested':return state.assignedFactoryId
   ?['partner','Подготовить ТЗ, себестоимость и комиссию']
   :['partner','Назначить проверенную фабрику до отправки ТЗ'];
  case 'awaiting_factory':return state.assignedFactoryId
   ?['factory','Проверить и подтвердить техническое задание']
   :['partner','Заявка без фабрики: назначить проверенную организацию'];
  case 'factory_confirmed':return ['partner',state.assignedFactoryId
   ?'Опубликовать согласованное фабрикой предложение клиенту'
   :'Требуется назначение фабрики: публикация заблокирована'];
  case 'factory_changes':return ['partner',state.assignedFactoryId
   ?'Исправить ТЗ по замечаниям фабрики'
   :'Назначить фабрику для повторного согласования ТЗ'];
  case 'offered':return ['client','Согласовать предложение или запросить изменение'];
  case 'change_requested':return ['partner','Обновить ТЗ, расчёт и согласование фабрики'];
  case 'accepted':return finance.advanceDueKopecks>0
   ?['partner','Сверить заявленный аванс с банком; подтверждения нет']
   :['factory','Проверить готовность к следующему локальному этапу'];
  case 'production':return ['factory','Уточнить готовность, этапы производства и документы'];
  case 'quality':return ['factory','Зафиксировать результат контроля качества'];
  case 'ready':return finance.balanceKopecks>0
   ?['client','Сверить оставшийся платёж до отгрузки']
   :['factory','Подготовить документы отгрузки'];
  case 'shipped':return ['factory','Получить подтверждение доставки'];
  case 'delivered':return ['client','Проверить изделие и подтвердить приёмку'];
  case 'disputed':return state.issue?.status==='response_proposed'
   ?['client','Принять или отклонить предложение по замечанию']
   :['factory','Ответить на открытое замечание клиента'];
  case 'closed':return ['none','Действий по локальному сценарию нет'];
  default:return ['none','Неизвестное состояние'];
 }
}
export const localOperationalDate=()=>{const d=new Date();
 return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
};
export function analyzeOrderPortfolio(workspace,projects=[],today=localOperationalDate()){
 if(typeof today!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(today)||
    (Number.isNaN(Date.parse(today+'T00:00:00Z'))||new Date(today+'T00:00:00Z').toISOString().slice(0,10)!==today))throw new TypeError('INVALID_ANALYTICS_DATE');
 if(!workspace||workspace.status!=='ready'||!Array.isArray(workspace.orders))
  return {schemaVersion:ORDER_PORTFOLIO_SCHEMA,status:'blocked',
   source:'LOCAL_WORKFLOW_SIMULATION',reason:'Journal unavailable: analytics suppressed',
   productionRelease:{allowed:false}};
 if(!Array.isArray(projects))throw new TypeError('INVALID_PROJECT_LIST');
 const byStage=Object.fromEntries(Object.keys(ORDER_STAGES).map(k=>[k,0]));
 const rows=[],unlinkedProjectIds=[],seen=new Set(),claimed=[],recorded=[],offered=[],credits=[],pendingRequote=[],factoryCosts=[],commissions=[],reserves=[];
 let revisionCount=0,issueCount=0,messageCount=0,integrityFailures=0,reconciliationFailures=0;
 for(const record of workspace.orders){
  const s=record.state,finance=orderFinancials(s),engineering=orderEngineering(s);
  if(seen.has(record.id)||s.projectId!==record.id||!(s.stage in byStage))
   throw new TypeError('INVALID_ORDER_PORTFOLIO');
  seen.add(record.id);byStage[s.stage]++;
  const revision=s.revisions.at(-1),spec=s.specs?.at(-1),activeOffer=getCurrentClientOffer(s),
   [actionOwner,nextAction]=decision(s,finance);
  const proposedDueDate=['awaiting_factory','factory_confirmed','factory_changes'].includes(s.stage)
   ?spec?.dueDate??null:activeOffer?.dueDate??null;
  const overdue=!!activeOffer&&ACTIVE_DUE_STAGES.has(s.stage)&&activeOffer.dueDate<today;
  const priority=s.stage==='disputed'||!engineering.integrityOk||overdue?'critical':
   actionOwner!=='none'?'attention':'complete';
  const row={id:record.id,name:s.name,stage:s.stage,stageLabel:ORDER_STAGES[s.stage],
   version:s.version,assignedFactoryId:s.assignedFactoryId??null,
   revisionId:activeOffer?.id??null,
   dueDate:proposedDueDate,dueDateAuthority:activeOffer?'PUBLISHED_UNVERIFIED':'DRAFT_UNCONFIRMED',
   overdue,priority,
   actionOwner,nextAction,engineeringIntegrityOk:engineering.integrityOk,
   priceKopecks:activeOffer?.priceKopecks??null,
   localRecordedKopecks:activeOffer?finance.currentKopecks:null,
   claimCount:s.paymentClaims.length,localPaymentCount:s.payments.length,
   balanceKopecks:activeOffer?finance.balanceKopecks:null,
   openIssue:!!s.issue&&s.issue.status!=='resolved',
   productionRelease:{allowed:false}};
  if(!engineering.integrityOk)integrityFailures++;
  const accounted=finance.currentKopecks+
   finance.priorCredits.reduce((total,part)=>total+part.amountKopecks,0);
  if(accounted!==finance.totalRecordedKopecks)reconciliationFailures++;
  revisionCount+=s.revisions.length;
  messageCount+=s.messages.length;
  issueCount+=(s.issues?.length??(s.issue?1:0));
  offered.push(activeOffer?.priceKopecks??0);
  recorded.push(activeOffer?finance.currentKopecks:0);
  pendingRequote.push(activeOffer?0:finance.currentKopecks);
  if(spec?.economics){factoryCosts.push(spec.economics.factoryCostKopecks);commissions.push(spec.economics.platformCommissionKopecks);reserves.push(spec.economics.plannedReserveKopecks);}
  claimed.push(...s.paymentClaims.map(p=>p.amountKopecks));
  credits.push(...finance.priorCredits.map(p=>p.amountKopecks));
  rows.push(row);
 }
 const projectIds=new Set(projects.map(p=>p.id));
 for(const p of projects){
  if(p.status!=='draft'&&!seen.has(p.id))unlinkedProjectIds.push(p.id);
 }
 const ordersWithoutProjects=rows.filter(r=>!projectIds.has(r.id)).map(r=>r.id);
 rows.sort((a,b)=>PRIORITY[a.priority]-PRIORITY[b.priority]||
  Number(b.overdue)-Number(a.overdue)||(a.dueDate??'9999').localeCompare(b.dueDate??'9999')||
  a.id.localeCompare(b.id));
 const totals={offeredKopecks:sumKopecks(offered),
  locallyRecordedCurrentKopecks:sumKopecks(recorded),
  claimedByClientKopecks:sumKopecks(claimed),
  unallocatedPriorCreditKopecks:sumKopecks(credits),
  pendingRequoteLocalKopecks:sumKopecks(pendingRequote),
  bankVerifiedKopecks:null,actualRevenueKopecks:null,
  approvedProductionCostKopecks:null,
  plannedFactoryCostKopecks:sumKopecks(factoryCosts),
  plannedPlatformCommissionKopecks:sumKopecks(commissions),
  plannedReserveKopecks:sumKopecks(reserves)};
 const unsafeMoney=Object.entries(totals).some(([k,v])=>v===null&&!['bankVerifiedKopecks','actualRevenueKopecks','approvedProductionCostKopecks'].includes(k));
 return {schemaVersion:ORDER_PORTFOLIO_SCHEMA,status:unsafeMoney?'invalid-money':'ready',
  source:'LOCAL_WORKFLOW_SIMULATION',byStage,rows,
  metrics:{orders:rows.length,open:rows.length-byStage.closed,
   awaitingClient:rows.filter(r=>r.actionOwner==='client').length,
   awaitingFactory:rows.filter(r=>r.actionOwner==='factory').length,
   awaitingPartner:rows.filter(r=>r.actionOwner==='partner').length,
   overdue:rows.filter(r=>r.overdue).length,disputed:byStage.disputed,
   versions:revisionCount,messages:messageCount,issues:issueCount,
   engineeringIntegrityFailures:integrityFailures,
   financialReconciliationFailures:reconciliationFailures,
   unlinkedSubmittedProjects:unlinkedProjectIds.length,
   ordersMissingProject:ordersWithoutProjects.length,
   realProductionReleased:0,bankVerifiedOrders:null},
  unlinkedProjectIds,ordersWithoutProjects,totals,
  tenantScope:'not-implemented-locally',
  productionRelease:{allowed:false}};
}
