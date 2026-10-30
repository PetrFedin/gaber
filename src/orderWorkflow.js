import {normalize,validate} from './domain.js';
import {factoryConfigKey} from './factoryDraftStorage.js';
import {createManufacturingPackage} from './manufacturing.js';

export const ORDER_SCHEMA='gaber-local-order/1';
export const ORDER_STAGES={requested:'Заявка',offered:'Предложение',accepted:'Согласовано',change_requested:'Корректировка',production:'В работе',quality:'Контроль качества',ready:'Готов к отгрузке',shipped:'Отгружен',delivered:'Доставлен',disputed:'Замечания',closed:'Принят клиентом'};
const fail=code=>{throw Error(code);};
const text=x=>typeof x==='string'&&x.trim().length>0&&x.length<=500;
const id=x=>typeof x==='string'&&/^[A-Za-z0-9_.:-]{1,128}$/.test(x);
const kopecks=x=>Number.isSafeInteger(x)&&x>0&&x<=1e12;
const timestamp=x=>{try{return typeof x==='string'&&new Date(x).toISOString()===x;}catch{return false;}};
const day=x=>{try{return /^\d{4}-\d{2}-\d{2}$/.test(x)&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x;}catch{return false;}};
const copy=x=>structuredClone(x);
const same=(a,b)=>factoryConfigKey(a)===factoryConfigKey(b);
const only=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).every(k=>keys.includes(k));
const BEFORE_WORK=['requested','offered','accepted','change_requested'];
export function orderEngineering(state){
 const revision=state.revisions.at(-1),config=revision?.config??state.sourceConfig;
 const pkg=createManufacturingPackage(config);
 return {revisionId:revision?.id??null,config:copy(config),integrityOk:pkg.integrity.ok,
  blockers:[...pkg.productionRelease.blockers],routingCount:pkg.routing.length,
  productionRelease:{allowed:false}};
}
const TYPES={
 create:['client',['projectId','name','config']],message:['both',['note','partnerId']],
 offer:['factory',['config','priceKopecks','advanceBps','dueDate','note']],
 accept:['client',[]],request_change:['client',['note']],
 report_payment:['client',['amountKopecks','reference']],
 record_payment:['factory',['amountKopecks','reference']],
 allocate_credit:['client',['fromRevisionId','amountKopecks']],
 start:['factory',[]],complete:['factory',[]],quality_pass:['factory',['reference']],
 ship:['factory',['carrier','tracking','reference']],deliver:['factory',['reference']],
 accept_delivery:['client',[]],report_issue:['client',['note']],
 respond_issue:['factory',['note']],reject_resolution:['client',['note']],confirm_resolution:['client',[]]
};
export function orderFinancials(state){
 const current=state.revisions.at(-1);
 const balances=new Map(state.revisions.map(r=>[r.id,0]));
 for(const p of state.payments)balances.set(p.revisionId,(balances.get(p.revisionId)||0)+p.amountKopecks);
 for(const t of state.transfers){balances.set(t.fromRevisionId,balances.get(t.fromRevisionId)-t.amountKopecks);balances.set(t.toRevisionId,balances.get(t.toRevisionId)+t.amountKopecks);}
 const currentKopecks=balances.get(current?.id)||0;
 const priceKopecks=current?.priceKopecks??0;
 // Product is <= 1e16; BigInt avoids loss of a kopeck before rounding up.
 const advanceKopecks=current?Number((BigInt(priceKopecks)*BigInt(current.advanceBps)+9999n)/10000n):0;
 return {priceKopecks,currentKopecks,advanceKopecks,balanceKopecks:Math.max(0,priceKopecks-currentKopecks),
  advanceDueKopecks:Math.max(0,advanceKopecks-currentKopecks),
  priorCredits:[...balances].filter(([revisionId,amount])=>revisionId!==current?.id&&amount>0).map(([revisionId,amountKopecks])=>({revisionId,amountKopecks})),
  totalRecordedKopecks:state.payments.reduce((s,p)=>s+p.amountKopecks,0),verifiedBankKopecks:null};
}
function validConfig(config){
 const normalized=normalize(config);
 if(!normalized||validate(normalized).length||!same(normalized,config))fail('CONFIG_INVALID');
 return copy(normalized);
}
function apply(state,command){
 if(!only(command,['id','at','role','type','payload','revisionId','expectedVersion'])||!id(command.id)||!timestamp(command.at)||
  !Number.isSafeInteger(command.expectedVersion)||!TYPES[command.type]||!only(command.payload,TYPES[command.type][1]))fail('COMMAND_INVALID');
 const messageRole=command.type==='message'&&['client','factory','brand','partner','owner'].includes(command.role);
 if(!(['client','factory'].includes(command.role)||messageRole)||
    (TYPES[command.type][0]!=='both'&&TYPES[command.type][0]!==command.role))
  fail('ROLE_FORBIDDEN');
 if(command.expectedVersion!==(state?.version??0))fail('STALE_ORDER');
 if(state&&command.at<state.updatedAt)fail('TIME_REVERSED');
 const p=command.payload;
 if(command.type==='create'){
  if(state||command.revisionId!==undefined||!id(p.projectId)||!text(p.name))fail('CREATE_INVALID');
  return {schemaVersion:ORDER_SCHEMA,projectId:p.projectId,name:p.name,sourceConfig:validConfig(p.config),version:1,
   stage:'requested',revisions:[],acceptedRevisionId:null,changeNote:null,payments:[],paymentClaims:[],transfers:[],messages:[],
   shipment:null,delivery:null,quality:null,issue:null,issues:[],createdAt:command.at,updatedAt:command.at,
   authority:'LOCAL_WORKFLOW_SIMULATION',productionRelease:{allowed:false}};
 }
 if(!state)fail('ORDER_MISSING');
 const s=copy(state),current=s.revisions.at(-1);
 if(command.type==='message'){
  if((command.revisionId??null)!==(current?.id??null)||!text(p.note)||
     (p.partnerId!==undefined&&!id(p.partnerId))||
     (command.role==='partner'&&!id(p.partnerId)))fail('MESSAGE_INVALID');
  s.messages.push({role:command.role,note:p.note,partnerId:p.partnerId??null,
   revisionId:current?.id??null,at:command.at});
 }else if(command.type==='offer'){
  if(!BEFORE_WORK.includes(s.stage)||command.revisionId!==undefined||!kopecks(p.priceKopecks)||
   !Number.isInteger(p.advanceBps)||p.advanceBps<0||p.advanceBps>10000||!day(p.dueDate)||p.dueDate<command.at.slice(0,10)||!text(p.note))fail('OFFER_INVALID');
  const config=validConfig(p.config);
  s.revisions.push({id:'R'+(s.revisions.length+1),config,priceKopecks:p.priceKopecks,advanceBps:p.advanceBps,dueDate:p.dueDate,note:p.note,offeredAt:command.at});
  s.acceptedRevisionId=null;s.stage='offered';s.changeNote=null;
 }else{
  if(!current||command.revisionId!==current.id)fail('REVISION_MISMATCH');
  const f=orderFinancials(s);
  switch(command.type){
   case 'accept':
    if(s.stage!=='offered')fail('STAGE_FORBIDDEN');
    s.acceptedRevisionId=current.id;s.stage='accepted';break;
   case 'request_change':
    if(!['offered','accepted','change_requested'].includes(s.stage)||!text(p.note))fail('CHANGE_FORBIDDEN');
    s.stage='change_requested';s.changeNote=p.note;s.acceptedRevisionId=null;break;
   case 'report_payment':
   case 'record_payment':{
    if(s.acceptedRevisionId!==current.id||!['accepted','production','quality','ready'].includes(s.stage))fail('PAYMENT_STAGE');
    if(!kopecks(p.amountKopecks)||!text(p.reference))fail('PAYMENT_INVALID');
    const target=command.type==='record_payment'?s.payments:s.paymentClaims;
    if(target.some(row=>row.reference.trim().toLowerCase()===p.reference.trim().toLowerCase()))fail('PAYMENT_DUPLICATE');
    if(command.type==='record_payment'&&(p.amountKopecks>f.balanceKopecks||!Number.isSafeInteger(f.totalRecordedKopecks+p.amountKopecks)))fail('PAYMENT_EXCEEDS_BALANCE');
    target.push({revisionId:current.id,amountKopecks:p.amountKopecks,reference:p.reference,at:command.at,authority:command.type==='record_payment'?'LOCAL_UNVERIFIED_RECORD':'CLIENT_CLAIM'});break;
   }
   case 'allocate_credit':{
    const credit=f.priorCredits.find(r=>r.revisionId===p.fromRevisionId);
    if(s.stage!=='accepted'||s.acceptedRevisionId!==current.id||!credit||!kopecks(p.amountKopecks)||p.amountKopecks>credit.amountKopecks||p.amountKopecks>f.balanceKopecks)fail('CREDIT_INVALID');
    s.transfers.push({...copy(p),toRevisionId:current.id,at:command.at});break;
   }
   case 'start':
    if(s.stage!=='accepted'||s.acceptedRevisionId!==current.id||f.advanceDueKopecks>0)fail('START_BLOCKED');
    s.stage='production';break;
   case 'complete':
    if(s.stage!=='production')fail('STAGE_FORBIDDEN');s.stage='quality';break;
   case 'quality_pass':
    if(s.stage!=='quality'||!text(p.reference))fail('QUALITY_REQUIRED');
    s.quality={revisionId:current.id,reference:p.reference,at:command.at};s.stage='ready';break;
   case 'ship':
    if(s.stage!=='ready'||f.balanceKopecks>0||!s.quality||!text(p.carrier)||!text(p.tracking)||!text(p.reference))fail('SHIPMENT_BLOCKED');
    s.shipment={revisionId:current.id,...copy(p),at:command.at};s.stage='shipped';break;
   case 'deliver':
    if(s.stage!=='shipped'||!text(p.reference))fail('DELIVERY_BLOCKED');
    s.delivery={revisionId:current.id,reference:p.reference,at:command.at};s.stage='delivered';break;
   case 'accept_delivery':
    if(s.stage!=='delivered')fail('ACCEPTANCE_BLOCKED');s.stage='closed';break;
   case 'report_issue':
    if(!['shipped','delivered'].includes(s.stage)||!text(p.note))fail('ISSUE_INVALID');
    s.issue={id:'I'+(s.issues.length+1),revisionId:current.id,note:p.note,
      at:command.at,fromStage:s.stage,status:'open',response:null,rejections:[],resolvedAt:null};
    s.issues.push(copy(s.issue));s.stage='disputed';break;
   case 'respond_issue':
    if(s.stage!=='disputed'||s.issue?.status!=='open'||!text(p.note))fail('ISSUE_RESPONSE_BLOCKED');
    s.issue.status='response_proposed';s.issue.response={note:p.note,at:command.at};
    s.issues[s.issues.length-1]=copy(s.issue);break;
   case 'reject_resolution':
    if(s.stage!=='disputed'||s.issue?.status!=='response_proposed'||!text(p.note))fail('ISSUE_REJECTION_BLOCKED');
    s.issue.rejections.push({note:p.note,at:command.at,response:copy(s.issue.response)});
    s.issue.status='open';s.issue.response=null;
    s.issues[s.issues.length-1]=copy(s.issue);break;
   case 'confirm_resolution':
    if(s.stage!=='disputed'||s.issue?.status!=='response_proposed'||
     !['shipped','delivered'].includes(s.issue.fromStage))fail('ISSUE_CONFIRMATION_BLOCKED');
    s.issue.status='resolved';s.issue.resolvedAt=command.at;
    s.stage=s.issue.fromStage;s.issues[s.issues.length-1]=copy(s.issue);break;
  }
 }
 s.version++;s.updatedAt=command.at;return s;
}
export function replayOrder(events){
 if(!Array.isArray(events)||events.length<1||events.length>500)fail('JOURNAL_INVALID');
 const seen=new Set();let state=null;
 for(const event of events){if(seen.has(event.id))fail('DUPLICATE_COMMAND');seen.add(event.id);state=apply(state,event);}
 return state;
}
export function appendOrderCommand(events,command){
 const existing=events.find(e=>e.id===command.id);
 if(existing){if(!same(existing,command))fail('COMMAND_CONFLICT');return {events:copy(events),state:replayOrder(events),duplicate:true};}
 if(events.length>=500)fail('EVENT_LIMIT');
 const state=apply(events.length?replayOrder(events):null,command);
 return {events:[...copy(events),copy(command)],state,duplicate:false};
}
