import {initialConfig, validate} from './domain.js';
import {appendOrderCommand, replayOrder, orderFinancials, DEV_EXECUTION_MODE} from './orderWorkflow.js';
import {ORDER_STORAGE_KEY,readOrderWorkspace,saveOrderCommand} from './orderStorage.js';

/** Five reproducible, strictly LOCAL furniture order stories; never bank/PSP proof. */
export const INVESTOR_DEMO_SCHEMA='gaber-investor-article-showcase/1';
const FIXTURE_ARTICLES=Object.freeze([
 {id:'GABER-DEMO-LINEA-01',name:'LINEA / модульный диван · демо',category:'sofa',stage:'closed',factoryId:'DEMO-FACTORY-01',price:46000000,cost:25000000,fee:6500000,logistics:2200000,tax:1600000,other:800000,advanceBps:4000},
 {id:'GABER-DEMO-CAMBIO-04',name:'CAMBIO / кресло-кровать · демо',category:'chairbed',stage:'awaiting_factory',factoryId:'DEMO-FACTORY-02',price:17000000,cost:10500000,fee:2700000,logistics:800000,tax:500000,other:200000,advanceBps:5000},
 {id:'GABER-DEMO-NOTTE-05',name:'NOTTE / кровать с хранением · демо',category:'bed',stage:'production',factoryId:'DEMO-FACTORY-03',price:33000000,cost:19000000,fee:4500000,logistics:1300000,tax:900000,other:400000,advanceBps:5000},
 {id:'GABER-DEMO-TELA-03',name:'TELA / мягкое изголовье · демо',category:'headboard',stage:'ready',factoryId:'DEMO-FACTORY-04',price:16000000,cost:8900000,fee:2200000,logistics:700000,tax:500000,other:100000,advanceBps:5000},
 {id:'GABER-DEMO-FORMA-02',name:'FORMA / кресло · демо',category:'chair',stage:'disputed',factoryId:'DEMO-FACTORY-05',price:14000000,cost:8500000,fee:2000000,logistics:600000,tax:300000,other:200000,advanceBps:5000}
]);
const external=new Set(['start','complete','quality_pass','ship','deliver','accept_delivery']);
const safeDate=(now)=>{
 const ms=now instanceof Date?now.getTime():Date.parse(now);
 if(!Number.isFinite(ms)||ms<=0)throw RangeError('DEMO_INVALID_CLOCK');
 return ms;
};
function terms(article,config,dueDate,price=article.price){
 return {config,technicalNote:`DEMO ${article.id}: каркас, габариты, обивка, наполнение, конструктивные зазоры и маршрут контроля — концепт, не КД.`,
  customerPriceKopecks:price,factoryCostKopecks:article.cost,
  platformCommissionKopecks:article.fee,logisticsKopecks:article.logistics,
  taxKopecks:article.tax,otherCostsKopecks:article.other,
  advanceBps:article.advanceBps,dueDate,note:`DEMO ${article.id}: плановые условия только для инвесторского сценария`};
}
function productConfig(article){
 let config=initialConfig(article.category);
 if(article.category==='sofa')config={...config,width:280,moduleCount:3,layout:'straight',fabric:'boucle',color:'sage'};
 if(article.category==='chairbed')config={...config,width:100,mechanism:'fold',fabric:'velvet',color:'blue'};
 if(article.category==='bed')config={...config,storage:true,width:180,fabric:'linen',color:'cream'};
 if(article.category==='headboard')config={...config,width:220,panels:5,color:'clay',fabric:'velvet'};
 if(article.category==='chair')config={...config,width:95,mechanism:'recliner',color:'ink',fabric:'microfiber'};
 if(validate(config).length)throw Error('DEMO_INVALID_ARTICLE_CONFIGURATION');
 return config;
}
/** Only validated product templates cross into the protected server create form.
 * These are NOT copied local orders, quotes, payments, approvals or events. */
export function getInvestorDemoTemplates(){
 return FIXTURE_ARTICLES.map(article=>({id:article.id,name:article.name,
  config:article.category==='bed'?{...productConfig(article),width:200}:productConfig(article)}));
}
function construct(article,nowMs){
 let config=productConfig(article);
 const dueDate=new Date(nowMs+90*86400000).toISOString().slice(0,10);
 const at=new Date(nowMs).toISOString();
 let events=[],eventIndex=0;
 const send=(role,type,payload={},revisionType=null)=>{
  const state=events.length?replayOrder(events):null;
  const specId=state?.specs.at(-1)?.id;
  const revisionId=state?.revisions.at(-1)?.id;
  const selected=revisionType==='spec'?specId:revisionType==='revision'?revisionId:undefined;
  const command={id:`${article.id}-E${String(++eventIndex).padStart(3,'0')}`,
   at,role,type,payload,expectedVersion:events.length,
   ...(selected?{revisionId:selected}:{}),...(external.has(type)?{executionMode:DEV_EXECUTION_MODE}:{})};
  events=appendOrderCommand(events,command).events;
  return replayOrder(events);
 };
 send('client','create',{projectId:article.id,name:article.name,config});
 send('client','message',{channel:'client_partner',note:`Демо-заявка ${article.id}: просьба согласовать выбранную конфигурацию.`});
 send('partner','assign_factory',{factoryId:article.factoryId});
 send('partner','prepare_spec',terms(article,config,dueDate));
 send('factory','message',{channel:'factory_partner',note:`Демо-фабрика ${article.factoryId}: проверка исходного ТЗ и цены изготовления.`});
 if(article.stage==='awaiting_factory')return {article,events,state:replayOrder(events)};
 send('factory','confirm_spec',{reference:`DEMO-ACK-${article.category.toUpperCase()}-01`,note:'Демо-подтверждение концептуальных условий, не производственный допуск'},'spec');
 send('partner','offer',{note:`DEMO предложение ${article.id} после концептуального подтверждения фабрики`},'spec');
 send('client','accept',{},'revision');
 if(article.category==='bed'){
  send('partner','record_payment',{amountKopecks:6500000,reference:'DEMO-OLD-ADVANCE'},'revision');
  send('client','request_change',{note:'Уточнить ширину кровати до 200 см и перевыпустить предложение'},'revision');
  config={...config,width:200};
  send('partner','prepare_spec',terms(article,config,dueDate));
  send('factory','confirm_spec',{reference:'DEMO-NOTTE-REV2',note:'Новая ширина проверена концептуально'},'spec');
  send('partner','offer',{note:'DEMO-ревизия R2: ширина 200 см, новую цену снова согласует клиент'},'spec');
  send('client','accept',{},'revision');
  send('client','allocate_credit',{fromRevisionId:'R1',amountKopecks:6500000},'revision');
  send('partner','record_payment',{amountKopecks:10000000,reference:'DEMO-R2-ADVANCE'},'revision');
  send('factory','start',{},'revision');
  return {article,events,state:replayOrder(events)};
 }
 const advance=Number((BigInt(article.price)*BigInt(article.advanceBps)+9999n)/10000n);
 send('client','report_payment',{amountKopecks:advance,reference:`DEMO-CLIENT-CLAIM-${article.category}`},'revision');
 send('partner','record_payment',{amountKopecks:advance,reference:`DEMO-ADVANCE-${article.category}`},'revision');
 send('factory','start',{},'revision');
 send('factory','complete',{},'revision');
 send('factory','quality_pass',{reference:`DEMO-QC-${article.category}`},'revision');
 if(article.stage==='ready')return {article,events,state:replayOrder(events)};
 const remainder=article.price-advance;
 if(remainder>0)send('partner','record_payment',{amountKopecks:remainder,reference:`DEMO-BALANCE-${article.category}`},'revision');
 send('factory','ship',{carrier:'Демо-логистика GABER',tracking:`DEMO-TRACK-${article.category}`,reference:`DEMO-PACK-${article.category}`},'revision');
 send('factory','deliver',{reference:`DEMO-POD-${article.category}`},'revision');
 if(article.stage==='disputed'){
  send('client','report_issue',{note:'Демо-замечание: требуется дополнительная проверка обивки'},'revision');
  send('partner','respond_issue',{note:'Демо-план корректирующих работ, подтверждение клиента обязательно'},'revision');
  send('client','reject_resolution',{note:'Нужен дополнительный осмотр шва'},'revision');
  return {article,events,state:replayOrder(events)};
 }
 send('client','accept_delivery',{},'revision');
 return {article,events,state:replayOrder(events)};
}
export function buildInvestorDemoArticles({now=new Date()}={}){
 const at=safeDate(now);
 return FIXTURE_ARTICLES.map(article=>{
  const value=construct(article,at);
  if(value.state.stage!==article.stage || value.state.productionRelease.allowed!==false ||
      orderFinancials(value.state).verifiedBankKopecks!==null)throw Error('DEMO_FIXTURE_INTEGRITY');
  return value;
 });
}
/** All-or-nothing best-effort single localStorage write after reducer validation.
 * Fails closed on corrupt snapshots, full journal or concurrent tab edits. */
export function seedInvestorDemoArticles(storage,{now=new Date()}={}){
 const original=readOrderWorkspace(storage);
 if(original.status!=='ready')throw Error('DEMO_STORAGE_BLOCKED');
 const baseline=storage.getItem(ORDER_STORAGE_KEY);
 let staged=baseline;
 const adapter={getItem:key=>key===ORDER_STORAGE_KEY?staged:null,
  setItem:(key,value)=>{if(key!==ORDER_STORAGE_KEY)throw Error('DEMO_STORAGE_KEY_INVALID');staged=value;}};
 let workspace=readOrderWorkspace(adapter);
 const scenarios=buildInvestorDemoArticles({now});
 const created=[],skipped=[];
 for(const fixture of scenarios){
  if(workspace.orders.some(row=>row.id===fixture.article.id)){
   skipped.push(fixture.article.id);continue;
  }
  for(const event of fixture.events){
   workspace=saveOrderCommand(adapter,workspace,fixture.article.id,event);
  }
  created.push(fixture.article.id);
 }
 if(storage.getItem(ORDER_STORAGE_KEY)!==baseline)throw Error('STALE_WORKSPACE');
 if(created.length){
  storage.setItem(ORDER_STORAGE_KEY,staged);
  if(storage.getItem(ORDER_STORAGE_KEY)!==staged)throw Error('DEMO_STORAGE_VERIFY_FAILED');
 }
 const verified=readOrderWorkspace(storage);
 if(verified.status!=='ready')throw Error('DEMO_STORAGE_VERIFY_FAILED');
 return {schemaVersion:INVESTOR_DEMO_SCHEMA,created,skipped,stages:scenarios.map(x=>({
  orderId:x.article.id,name:x.article.name,expectedStage:x.state.stage,
  actualStage:verified.orders.find(y=>y.id===x.article.id)?.state.stage??null}))};
}
