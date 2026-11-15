/**
 * Полный жизненный цикл заказа поверх реального HTTP -> журнал -> PostgreSQL 17 (RLS):
 * оплата (заявление клиента, учёт партнёром, аванс, остаток) и границы PRODUCTION HOLD для производства, отгрузки и доставки.
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
import {devUsers, DEV_TENANT, DEV_FACTORY} from '../dev/seed-data.js';

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
const server = createGaberHttpServer({
  journal: wirePostgresOrderJournal({pool: ordersPool}),
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
async function acceptedOrder(tag) {
  const id = `ORDER-LC-${tag}-${run}`;
  await must('client', id, 'create', {projectId: id, name: 'Жизненный цикл ' + tag, config: initialConfig()}, null, 'создание ' + tag);
  await must('partner', id, 'assign_factory', {factoryId: DEV_FACTORY}, null, 'назначение ' + tag);
  await must('partner', id, 'prepare_spec', spec, null, 'ТЗ ' + tag);
  await must('factory', id, 'confirm_spec', {reference: 'ACK-' + tag, note: 'Проверено'}, 'spec', 'подтверждение ' + tag);
  await must('partner', id, 'offer', {note: 'Предложение'}, 'spec', 'предложение ' + tag);
  await must('client', id, 'accept', {}, 'current', 'принятие ' + tag);
  return id;
}
try {
  // ---------- оплата, производство, отгрузка, доставка ----------
  const A = await acceptedOrder('A');
  check((await read('client', A)).finance.advanceKopecks, 105003, 'аванс округляется вверх до копейки');
  await deny('client', A, 'report_payment', {amountKopecks: 0, reference: 'CLAIM-0'}, 'current', 422, 'нулевая оплата отклоняется');
  await must('client', A, 'report_payment', {amountKopecks: 105003, reference: 'CLAIM-A1'}, 'current', 'клиент сообщает об оплате');
  let c = await read('client', A);
  check(c.paymentClaims.length, 1, 'заявление об оплате видно клиенту');
  check(c.finance.localRecordedKopecks, 0, 'заявление клиента не считается учтённой оплатой');
  check(c.finance.verifiedBankKopecks, null, 'банковское подтверждение отсутствует');
  await deny('client', A, 'report_payment', {amountKopecks: 5, reference: 'claim-a1'}, 'current', 422, 'повтор номера заявления (без учёта регистра)');
  await deny('client', A, 'record_payment', {amountKopecks: 105003, reference: 'BANK-X'}, 'current', 403, 'клиент не записывает оплату');
  await deny('factory', A, 'record_payment', {amountKopecks: 105003, reference: 'BANK-F'}, 'current', 403, 'фабрика не записывает оплату');
  await deny('partner', A, 'record_payment', {amountKopecks: 999999999, reference: 'BANK-BIG'}, 'current', 422, 'оплата сверх остатка отклоняется');
  await deny('partner', A, 'record_payment', {amountKopecks: 0, reference: 'BANK-ZERO'}, 'current', 422, 'нулевая запись отклоняется');
  await must('partner', A, 'record_payment', {amountKopecks: 105003, reference: 'BANK-A1'}, 'current', 'партнёр записывает аванс');
  await deny('partner', A, 'record_payment', {amountKopecks: 100, reference: 'bank-a1'}, 'current', 422, 'повтор номера документа (без учёта регистра)');
  c = await read('client', A);
  check([c.finance.localRecordedKopecks, c.finance.advanceDueKopecks, c.finance.balanceKopecks], [105003, 0, 105002], 'учёт аванса и остатка');
  const f = await read('factory', A);
  ok(!('finance' in f) && !('payments' in f) && !('paymentClaims' in f) && !('offer' in f), 'фабрика не видит оплаты и цену клиента');
  const p = await read('partner', A);
  check(p.payments.length, 1, 'партнёр видит учтённые оплаты');
  check(p.finance.verifiedBankKopecks, null, 'партнёру тоже не выдаётся банковское подтверждение');
  await must('partner', A, 'record_payment', {amountKopecks: 105002, reference: 'BANK-A2'}, 'current', 'партнёр записывает остаток');
  check((await read('client', A)).finance.balanceKopecks, 0, 'остаток закрыт');
  await deny('partner', A, 'record_payment', {amountKopecks: 1, reference: 'BANK-A3'}, 'current', 422, 'переплата после закрытия остатка отклоняется');

  // PRODUCTION HOLD: журнал сервера закрывает start, complete, quality_pass, ship, deliver и accept_delivery
  // как действия внешнего полномочия (банк, допуск производства, перевозчик), которого в системе нет.
  // Поэтому на реальном сервере заказ не доходит до производства, отгрузки, доставки и спора.
  for (const [role, type, payload] of [
    ['factory', 'start', {}],
    ['factory', 'complete', {}],
    ['factory', 'quality_pass', {reference: 'QC-A1'}],
    ['factory', 'ship', {carrier: 'ТК Демо', tracking: 'TRK-A', reference: 'SHIP-A1'}],
    ['factory', 'deliver', {reference: 'DLV-A1'}],
    ['client', 'accept_delivery', {}]
  ]) {
    const r = await deny(role, A, type, payload, 'current', 403, `HOLD: ${type} закрыт внешним полномочием`);
    check(r.body.code, 'EXTERNAL_AUTHORITY_REQUIRED', `HOLD: код отказа для ${type}`);
  }
  await deny('client', A, 'report_issue', {note: 'Рано'}, 'current', 422, 'спор невозможен до отгрузки');
  check((await read('client', A)).stage, 'accepted', 'заказ остаётся принятым: дальше только после внешнего полномочия');
  check((await read('client', A)).productionRelease, {allowed: false}, 'productionRelease.allowed=false в ответе');

  // ---------- устаревшая версия и повтор ----------
  const C = await acceptedOrder('C');
  const stale = await call('POST', `/api/v1/orders/${C}/commands`, {cookie: who.client, body: {requestId: `LC-${run}-stale`, expectedVersion: 1, type: 'message', payload: {note: 'x', channel: 'shared'}, revisionId: 'R1'}});
  check(stale.status, 409, 'устаревшая версия: 409');
  const body = {requestId: `LC-${run}-dup`, expectedVersion: (await read('client', C)).version, type: 'report_payment', payload: {amountKopecks: 1000, reference: 'DUP-1'}, revisionId: 'R1'};
  check((await call('POST', `/api/v1/orders/${C}/commands`, {cookie: who.client, body})).status, 201, 'первая отправка заявления');
  check((await call('POST', `/api/v1/orders/${C}/commands`, {cookie: who.client, body})).status, 200, 'повтор того же запроса идемпотентен');
  check((await read('client', C)).paymentClaims.length, 1, 'повтор не создал вторую запись');
  console.log(`✓ order payments and HOLD e2e: ${checks} проверок на реальной PostgreSQL (оплата; производство, отгрузка и доставка закрыты HOLD)`);
} finally {
  server.close();
  await Promise.all([ordersPool.end(), authPool.end()]);
}
