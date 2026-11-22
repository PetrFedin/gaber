/**
 * Полный жизненный цикл заказа с DEV-симулятором внешних полномочий: HTTP -> журнал -> PostgreSQL 17 (RLS).
 * Оплата, производство, контроль качества, отгрузка, доставка, приёмка и спор. Банк НЕ имитируется.
 * Требуется dev-база: npm run dev:db && npm run dev:setup. Только вымышленные данные, MFA включён dev-флагом.
 */
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {randomBytes} from 'node:crypto';
import pg from 'pg';
import {createGaberHttpServer} from '../httpServer.js';
import {wirePostgresOrderJournal} from '../orderJournalWiring.js';
import {createPgAuthStore} from '../auth/authStore.js';
import {createAuthService} from '../auth/authService.js';
import {initialConfig} from '../../src/domain.js';
import {getConceptPackoutPlan} from '../../src/fulfillmentInspection.js';
import {getInvestorDemoTemplates} from '../../src/investorDemo.js';
import {devUsers, DEV_TENANT, DEV_FACTORY} from '../dev/seed-data.js';
import {createDevExternalAuthority} from '../devExternalAuthority.js';

const e = process.env;
for (const k of ['GABER_ORDERS_DATABASE_URL', 'GABER_AUTH_DATABASE_URL'])
  if (!e[k]) throw Error(`Нужна переменная ${k} (см. server/dev/dev.env.example)`);
const ordersPool = new pg.Pool({connectionString: e.GABER_ORDERS_DATABASE_URL, max: 6});
const authPool = new pg.Pool({connectionString: e.GABER_AUTH_DATABASE_URL, max: 3});
const run = randomBytes(4).toString('hex');
let checks = 0;
const check = (actual, expected, label) => {
  assert.deepEqual(actual, expected, label);
  checks++;
};
const ok = (v, label) => {
  assert.ok(v, label);
  checks++;
};
const service = createAuthService({store: createPgAuthStore({pool: authPool}), tenantId: DEV_TENANT, mfaAssumed: true});
const simulated = createDevExternalAuthority({production: false, tenantId: DEV_TENANT});
const logged = [];
const server = createGaberHttpServer({
  serverInfo: {devSimulatedAuthority: true},
  journal: wirePostgresOrderJournal({pool: ordersPool, simulatedExternalAuthority: simulated, log: (m) => logged.push(m)}),
  authService: service,
  allowedOrigins: []
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = 'http://127.0.0.1:' + server.address().port;
const call = async (method, path, {body, cookie} = {}) => {
  const res = await fetch(base + path, {
    method,
    headers: {...(cookie ? {cookie} : {}), ...(body !== undefined ? {'content-type': 'application/json'} : {})},
    ...(body !== undefined ? {body: JSON.stringify(body)} : {})
  });
  const set = res.headers.get('set-cookie');
  return {status: res.status, body: await res.json(), cookie: set ? set.split(';')[0] : undefined};
};
const login = async (role) => {
  const u = devUsers.find((x) => x.role === role);
  const r = await call('POST', '/api/v1/auth/login', {body: {email: u.email, password: u.password}});
  assert.equal(r.status, 200);
  return r.cookie;
};
const reg = await call('POST', '/api/v1/auth/register', {body: {email: `life-${run}@example.test`, password: 'life-passphrase-' + run}});
const who = {client: reg.cookie, partner: await login('partner'), factory: await login('factory')};
let seq = 0;
const read = async (role, id) => (await call('GET', `/api/v1/orders/${id}`, {cookie: who[role]})).body.order;
// Отправляет команду от роли с актуальной версией и нужной ревизией; возвращает ответ.
async function send(role, id, type, payload, revision) {
  const o = (await read(role, id)) ?? {version: 0};
  const revisionId = revision === 'spec' ? o.factoryTask?.specId : revision === 'current' ? o.revisionId : undefined;
  return call('POST', `/api/v1/orders/${id}/commands`, {
    cookie: who[role],
    body: {requestId: `LC-${run}-${++seq}`, expectedVersion: o.version, type, payload, ...(revisionId ? {revisionId} : {})}
  });
}
const must = async (role, id, type, payload, revision, label) => {
  const r = await send(role, id, type, payload, revision);
  check(r.status, 201, `${label} (${r.status} ${r.body.code ?? ''})`);
  return r;
};
const deny = async (role, id, type, payload, revision, status, label) => {
  const r = await send(role, id, type, payload, revision);
  check(r.status, status, `${label} (${r.body.code ?? ''})`);
  return r;
};
const spec = {
  config: initialConfig(),
  technicalNote: 'Каркас, наполнитель, швы (демо)',
  customerPriceKopecks: 210005,
  factoryCostKopecks: 100001,
  platformCommissionKopecks: 40001,
  logisticsKopecks: 10000,
  taxKopecks: 5000,
  otherCostsKopecks: 0,
  advanceBps: 5000,
  dueDate: '2099-02-01',
  note: 'Цена после проверки (демо)'
};
// Заказ доводится до принятого предложения.
async function acceptedOrder(tag,config=initialConfig()) {
  const id = `ORDER-LC-${tag}-${run}`;
  await must('client', id, 'create', {projectId: id, name: 'Жизненный цикл ' + tag, config}, null, 'создание ' + tag);
  await must('partner', id, 'assign_factory', {factoryId: DEV_FACTORY}, null, 'назначение ' + tag);
  await must('partner', id, 'prepare_spec', {...spec,config}, null, 'ТЗ ' + tag);
  await must('factory', id, 'confirm_spec', {reference: 'ACK-' + tag, note: 'Проверено'}, 'spec', 'подтверждение ' + tag);
  await must('partner', id, 'offer', {note: 'Предложение'}, 'spec', 'предложение ' + tag);
  await must('client', id, 'accept', {}, 'current', 'принятие ' + tag);
  return id;
}
try {
  // сервер сообщает клиентам о симуляции
  const me = await call('GET', '/api/v1/auth/me', {cookie: who.client});
  check(me.body.server.devSimulatedAuthority, true, 'me сообщает о dev-симуляторе');

  // ---------- оплата, производство, отгрузка, доставка ----------
  const A = await acceptedOrder('A');
  await deny('factory', A, 'start', {}, 'current', 422, 'производство нельзя начать без аванса (правило редьюсера)');
  await must('client', A, 'report_payment', {amountKopecks: 105003, reference: 'CLAIM-A1'}, 'current', 'клиент сообщает об оплате');
  await deny('factory', A, 'start', {}, 'current', 422, 'заявления клиента недостаточно для старта');
  await must('partner', A, 'record_payment', {amountKopecks: 105003, reference: 'BANK-A1'}, 'current', 'партнёр записывает аванс');
  await deny('client', A, 'start', {}, 'current', 403, 'клиент не запускает производство даже при симуляторе');
  await deny('partner', A, 'start', {}, 'current', 403, 'партнёр не запускает производство даже при симуляторе');
  await must('factory', A, 'start', {}, 'current', 'фабрика начинает производство');
  const afterStart = await read('client', A);
  check(afterStart.stage, 'production', 'этап: производство');
  check(afterStart.externalExecution?.provenance, 'DEV_SIMULATED_EXTERNAL_AUTHORITY', 'клиенту виден источник DEV-операций');
  check(afterStart.externalExecution?.markedEventCount, 1, 'первая имитация отмечена в журнале');
  await deny('factory', A, 'quality_pass', {reference: 'QC-0'}, 'current', 422, 'контроль качества до завершения производства');
  await must('factory', A, 'complete', {}, 'current', 'производство завершено');
  await deny('factory', A, 'ship', {carrier: 'ТК', tracking: 'T1', reference: 'SHIP-0'}, 'current', 422, 'отгрузка до контроля качества');
  await must('factory', A, 'quality_pass', {reference: 'QC-A1'}, 'current', 'контроль качества пройден');
  const plan=getConceptPackoutPlan(initialConfig());
  const full=plan.lines.map(row=>({partRef:row.partRef,packedQty:row.expectedQty}));
  await deny('factory',A,'ship',{carrier:'ТК Демо',tracking:'A-NO-PACK',reference:'A-NO-PACK'},'current',422,
    'New server orders cannot ship without factory packing report');
  await must('factory',A,'record_packout',{reference:'PACK-A1',note:'Self-reported complete concept BOM',lines:full},'current',
    'Factory creates mandatory packing document');
  await deny('factory', A, 'ship', {carrier: 'ТК Демо', tracking: 'TRK-A', reference: 'SHIP-A0'}, 'current', 422, 'отгрузка при неоплаченном остатке');
  await must('partner', A, 'record_payment', {amountKopecks: 105002, reference: 'BANK-A2'}, 'current', 'партнёр записывает остаток');
  await deny('factory', A, 'ship', {carrier: '', tracking: 'T1', reference: 'SHIP-A0'}, 'current', 422, 'отгрузка без перевозчика');
  await must('factory', A, 'ship', {carrier: 'ТК Демо', tracking: 'TRK-' + run, reference: 'SHIP-A1'}, 'current', 'отгрузка');
  await deny('client', A, 'accept_delivery', {}, 'current', 422, 'приёмка до доставки');
  await deny('client', A, 'deliver', {reference: 'DLV-X'}, 'current', 403, 'клиент не подтверждает доставку перевозчика');
  await must('factory', A, 'deliver', {reference: 'DLV-A1'}, 'current', 'доставка');
  await deny('client',A,'accept_delivery',{},'current',422,'Closing without independent receipt forbidden');
  const receivedFull=full.map(x=>({partRef:x.partRef,receivedQty:x.packedQty,damagedQty:0}));
  await must('client',A,'record_receipt',{reference:'RECEIPT-A1',note:'Customer claims all items received',
     lines:receivedFull},'current','Independent full receipt');
  await must('client', A, 'accept_delivery', {}, 'current', 'клиент принимает доставку');
  check((await read('client', A)).stage, 'closed', 'заказ закрыт');
  const dto = await read('client', A);
  check(dto.productionRelease, {allowed: false}, 'productionRelease.allowed остаётся false');
  check(dto.externalExecution?.eventCount, 6, 'все шесть симулированных этапов сохранены');
  check(dto.externalExecution?.markedEventCount, 6, 'все шесть этапов помечены сервером');
  check((await read('factory', A)).externalExecution?.provenance, 'DEV_SIMULATED_EXTERNAL_AUTHORITY', 'фабрика видит происхождение этапов');
  check((await read('partner', A)).externalExecution?.provenance, 'DEV_SIMULATED_EXTERNAL_AUTHORITY', 'партнёр видит происхождение этапов');
  check(dto.finance.verifiedBankKopecks, null, 'банк по-прежнему не подтверждён');
  await deny('client', A, 'report_issue', {note: 'Поздно'}, 'current', 422, 'закрытый заказ нельзя оспорить');

  // ---------- спор после отгрузки ----------
  const B = await acceptedOrder('B');
  await must('partner', B, 'record_payment', {amountKopecks: 210005, reference: 'BANK-B1'}, 'current', 'полная оплата B');
  for (const [t, pl] of [['start', {}], ['complete', {}], ['quality_pass', {reference: 'QC-B1'}]])
    await must('factory', B, t, pl, 'current', 'B ' + t);
  await must('factory',B,'record_packout',{reference:'PACK-B1',note:'Self-reported full concept BOM',lines:full},
    'current','B factory packing');
  await must('factory', B, 'ship', {carrier: 'ТК Демо', tracking: 'TRK-B-' + run,
    reference: 'SHIP-B1'},'current','B shipping');
  await must('client', B, 'report_issue', {note: 'Повреждена обивка'}, 'current', 'клиент сообщает о проблеме');
  check((await read('client', B)).stage, 'disputed', 'этап: спор');
  await deny('client', B, 'confirm_resolution', {}, 'current', 422, 'подтверждать решение, которого нет');
  await must('factory', B, 'respond_issue', {note: 'Заменим чехол'}, 'current', 'фабрика отвечает');
  await must('client', B, 'reject_resolution', {note: 'Нужна замена обивки целиком'}, 'current', 'клиент отклоняет решение');
  await must('partner', B, 'respond_issue', {note: 'Заменим обивку целиком'}, 'current', 'партнёр предлагает новое решение');
  await must('client', B, 'confirm_resolution', {}, 'current', 'клиент подтверждает решение');
  check((await read('client', B)).stage, 'shipped', 'после спора заказ возвращается к отгрузке');
  await must('factory', B, 'deliver', {reference: 'DLV-B1'}, 'current', 'доставка после спора');
  await deny('client',B,'accept_delivery',{},'current',422,'Resolved ordinary claim does not waive independent receipt');
  await must('client',B,'record_receipt',{reference:'RECEIPT-B1',note:'Independent reported receiving',
    lines:receivedFull},'current','B customer receiving');
  await must('client', B, 'accept_delivery', {}, 'current', 'приёмка после спора');
  check((await read('partner', B)).stage, 'closed', 'B закрыт');

  // ---------- independent packout → customer short receipt → correction plan
  // → customer reinspection on disposable PG, no real bank/carrier ----------
  const C=await acceptedOrder('C');
  await must('partner',C,'record_payment',{amountKopecks:210005,reference:'C-UNVERIFIED-FULL'},'current','C local settlement');
  await must('factory',C,'start',{},'current','C DEV factory production start');
  await deny('factory',C,'record_packout',{reference:'EARLY-C',note:'too early',lines:[]},'current',422,
    'Factory cannot pack parts before quality gate');
  await must('factory',C,'complete',{},'current','C production complete');
  await must('factory',C,'quality_pass',{reference:'QC-C1'},'current','C quality');
  const partial=structuredClone(full);partial[0].packedQty--;
  await deny('client',C,'record_packout',{reference:'CLIENT-FORGE',note:'forbidden',lines:full},'current',403,
    'Customer cannot impersonate factory packout');
  await must('factory',C,'record_packout',{reference:'PACK-C1',note:'Concept shortage',lines:partial},'current',
    'Factory records concept packout with one shortage');
  check((await read('factory',C)).fulfillment.packout.complete,false,'Packing incomplete with shortage');
  await deny('factory',C,'ship',{carrier:'Demo',tracking:'C-T1',reference:'C-PACK-FAIL'},'current',422,
    'Shipment blocked if factory-reported packing is incomplete');
  await deny('factory',C,'amend_packout',{reference:'pack-c1',note:'duplicate',lines:full},'current',422,
    'Packing amendment reference must not duplicate prior revision');
  await must('factory',C,'amend_packout',{reference:'PACK-C2',note:'Packing complete',lines:full},'current',
    'Amended packing version with full concept items');
  check((await read('factory',C)).fulfillment.packout.complete,true,'Packout complete');
  await must('factory',C,'ship',{carrier:'Demo carrier',tracking:'C-T2',reference:'C-SHIP'},'current',
    'C shipped in dev simulation');
  await must('factory',C,'deliver',{reference:'C-POD'},'current',
    'C delivered in dev simulation');
  const incomplete=full.map(x=>({partRef:x.partRef,receivedQty:x.packedQty,damagedQty:0}));
  incomplete[0].receivedQty--;
  await deny('factory',C,'record_receipt',{reference:'FACTORY-FORGE',note:'forbidden',lines:incomplete},'current',403,
    'Factory cannot impersonate customer acceptance');
  await must('client',C,'record_receipt',{reference:'C-RECEIPT-1',note:'One part missing',lines:incomplete},'current',
    'Independent customer receipt reports shortage');
  check((await read('client',C)).stage,'disputed','Receipt shortage opens dispute');
  check((await read('client',C)).fulfillment.receipt.discrepancies.length,1,
    'Exactly one missing part group');
  await deny('client',C,'accept_delivery',{},'current',422,'Disputed receipt cannot close order');
  await deny('partner',C,'respond_issue',{note:'unstructured promise'},'current',422,
    'Discrepancy correction must specify exact affected part and quantity');
  const firstPart=incomplete[0].partRef;
  const corrections=[{partRef:firstPart,kind:'replace',quantity:1}];
  await deny('partner',C,'respond_issue',{note:'invalid quantity',
    corrections:[{partRef:firstPart,kind:'replace',quantity:999}]},'current',422,
    'Cannot over-promise a repair for non-missing quantities');
  await must('partner',C,'respond_issue',{note:'Supply missing part',corrections},'current',
    'Partner proposes bounded corrective plan');
  await deny('factory',C,'confirm_resolution',{},'current',403,
    'Factory cannot accept correction for customer');
  await must('client',C,'reject_resolution',{note:'Need dated plan'},'current',
    'Customer rejects first plan');
  await must('factory',C,'respond_issue',{note:'Replacement by factory',
    corrections},'current','Factory creates revised correction plan');
  await must('client',C,'confirm_resolution',{},'current',
    'Customer accepts plan, not proof of replacement');
  check((await read('client',C)).fulfillment.receipt.status,'correction_pending_reinspection',
    'Accepted correction does not fake repaired inventory');
  await deny('client',C,'accept_delivery',{},'current',422,
    'Cannot close after plan-only acceptance without reinspection');
  const completeReceipt=full.map(x=>({partRef:x.partRef,receivedQty:x.packedQty,damagedQty:0}));
  await must('client',C,'record_receipt',{reference:'C-RECEIPT-2',note:'Rechecked by client',
    lines:completeReceipt},'current','Customer rechecks all parts');
  check((await read('client',C)).fulfillment.receipt.status,'matched_unverified',
    'Reinspection records customer-reported quantity without warehouse evidence');
  await must('client',C,'accept_delivery',{},'current','Customer finally closes C');
  check((await read('client',C)).stage,'closed','C workflow closes only after successful customer reinspection');
  check((await read('client',C)).productionRelease.allowed,false,'Production release remains HOLD on C');

  // ---------- Five actual article configs, one non-shared PostgreSQL journal
  // per article; each exercises full DEV-only intake, packout, complaints,
  // correction agreement and final independent customer reinspection. ----------
  const categories=[];
  const articles=getInvestorDemoTemplates();
  check(articles.length,5,'Exactly five planned investor article categories');
  for (const [index,article] of articles.entries()){
    const tag='M'+index;
    const articleId=await acceptedOrder(tag,article.config);
    const initial=await read('client',articleId);
    check(initial.config,article.config,'Exact configured engineering source for '+article.id);
    check(initial.fulfillmentRequired,true,'Mandatory receipt for '+article.id);
    check(initial.productionRelease.allowed,false,'No factory release for '+article.id);
    await must('partner',articleId,'record_payment',
      {amountKopecks:210005,reference:'DEV-LOCAL-'+tag},'current',
      'Recorded only by simulated partner '+article.id);
    for(const [type,payload] of [
      ['start',{}],['complete',{}],['quality_pass',{reference:'DEV-QC-'+tag}]
    ])await must('factory',articleId,type,payload,'current',
       'DEV factory action '+type+' for '+article.id);
    const engineering=getConceptPackoutPlan(article.config);
    const packed=engineering.lines.map(x=>({partRef:x.partRef,packedQty:x.expectedQty}));
    await deny('factory',articleId,'ship',
      {carrier:'Demo',tracking:'NO-PACK-'+tag,reference:'NO-PACK-'+tag},
      'current',422,'No packing → no shipment '+article.id);
    await must('factory',articleId,'record_packout',
      {reference:'PACK-'+tag,note:'Concept packing by factory',lines:packed},
      'current','Record exact group BOM '+article.id);
    await must('factory',articleId,'ship',
      {carrier:'Demo',tracking:'TRACK-'+tag,reference:'SHIP-'+tag},'current',
      'Simulated shipping '+article.id);
    await must('factory',articleId,'deliver',{reference:'DELIVERY-'+tag},'current',
      'Simulated delivery '+article.id);
    await deny('client',articleId,'accept_delivery',{},'current',422,
      'No independent client receipt → no closure '+article.id);
    const receipt=packed.map(x=>({partRef:x.partRef,receivedQty:x.packedQty,damagedQty:0}));
    const isMissing=index%2===0;
    if(isMissing)receipt[0].receivedQty--;
    else receipt[0].damagedQty++;
    await must('client',articleId,'record_receipt',
      {reference:'RECEIPT-'+tag+'-1',note:'Client reported discrepancy',lines:receipt},
      'current','Client inspection '+article.id);
    const clientView=await read('client',articleId);
    check(clientView.stage,'disputed','Discrepancy opens dispute '+article.id);
    check(clientView.fulfillment.receiptHistory.length,1,'Receipt history kept for '+article.id);
    check(clientView.fulfillment.receipt.discrepancies.length,1,
      'One group differs for '+article.id);
    const group=clientView.fulfillment.receipt.discrepancies[0];
    check(group.partRef,receipt[0].partRef,'Inspection tied to original BOM '+article.id);
    const invalidCorrection=await deny('partner',articleId,'respond_issue',
      {note:'Impossible repair quantity',
       corrections:[{partRef:group.partRef,kind:'repair',quantity:group.missingQty+group.damagedQty+1}]},
      'current',422,'Cannot overstate repair '+article.id);
    check(invalidCorrection.body.reason??null,null,'HTTP exposes refusal code only');
    if(isMissing)await deny('partner',articleId,'respond_issue',
      {note:'Missing physical item cannot be repaired',
       corrections:[{partRef:group.partRef,kind:'repair',quantity:1}]},
      'current',422,'No repair for missing item '+article.id);
    const corrective=[{partRef:group.partRef,
      kind:isMissing?'replace':'repair',quantity:1}];
    await must('partner',articleId,'respond_issue',
      {note:'Specific correction proposal, not proof of work',corrections:corrective},
      'current','Operator proposes correction '+article.id);
    await must('client',articleId,'confirm_resolution',{},'current',
      'Customer accepts plan only '+article.id);
    const beforeReinspection=await read('client',articleId);
    check(beforeReinspection.fulfillment.correctionPending,true,
      'Plan acceptance alone not proof of repair '+article.id);
    await deny('client',articleId,'accept_delivery',{},'current',422,
      'No closure without fresh receipt '+article.id);
    receipt[0].receivedQty=packed[0].packedQty;receipt[0].damagedQty=0;
    await must('client',articleId,'record_receipt',
      {reference:'RECEIPT-'+tag+'-2',note:'Independent reinspection claimed',lines:receipt},
      'current','Second independent receipt '+article.id);
    const reinspected=await read('client',articleId);
    check(reinspected.fulfillment.receiptHistory.length,2,'Both records persist '+article.id);
    check(reinspected.fulfillment.issueHistory.length,1,'Original claim persists '+article.id);
    check(reinspected.fulfillment.issueHistory[0].reinspectionReceiptId,'RC2',
      'Correction linked to second receipt '+article.id);
    check(reinspected.fulfillment.issueHistory[0].status,'reinspected_matched_unverified',
      'Claim linked to reported reinspection, never verified factory remedy');
    check(reinspected.fulfillment.issueHistory[0].reinspectionOutcome,'REPORTED_MATCH_UNVERIFIED',
      'Provenance stays self reported '+article.id);
    await must('client',articleId,'accept_delivery',{},'current',
      'Customer closes only after reinspection '+article.id);
    const factoryView=await read('factory',articleId);
    check(factoryView.stage,'closed','Factory sees closed order '+article.id);
    ok(!('finance' in factoryView)&&!('offer' in factoryView),
      'No client economics leak to factory '+article.id);
    check(factoryView.productionRelease.allowed,false,
      'Real production release remains HOLD '+article.id);
    categories.push(article.config.category);
  }
  check(categories,['sofa','chairbed','bed','headboard','chair'],
    'Five categories passed full independent PostgreSQL fulfillment');

  // ---------- след в логе и видимость ----------
  ok(logged.length >= 12 && logged.every((m) => m.startsWith('DEV_SIMULATED_EXTERNAL_AUTHORITY:')), 'каждая симулированная команда записана в лог сервера');
  const f = await read('factory', A);
  ok(!('finance' in f) && !('offer' in f), 'фабрика по-прежнему не видит финансы и цену клиента');
  console.log(`✓ simulated external authority e2e: ${checks} проверок на реальной PostgreSQL (полный цикл до закрытия и спор; банк не имитируется)`);
} finally {
  server.close();
  await Promise.all([ordersPool.end(), authPool.end()]);
}
