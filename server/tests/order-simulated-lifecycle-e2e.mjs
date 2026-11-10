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
  check((await read('client', A)).stage, 'production', 'этап: производство');
  await deny('factory', A, 'quality_pass', {reference: 'QC-0'}, 'current', 422, 'контроль качества до завершения производства');
  await must('factory', A, 'complete', {}, 'current', 'производство завершено');
  await deny('factory', A, 'ship', {carrier: 'ТК', tracking: 'T1', reference: 'SHIP-0'}, 'current', 422, 'отгрузка до контроля качества');
  await must('factory', A, 'quality_pass', {reference: 'QC-A1'}, 'current', 'контроль качества пройден');
  await deny('factory', A, 'ship', {carrier: 'ТК Демо', tracking: 'TRK-A', reference: 'SHIP-A0'}, 'current', 422, 'отгрузка при неоплаченном остатке');
  await must('partner', A, 'record_payment', {amountKopecks: 105002, reference: 'BANK-A2'}, 'current', 'партнёр записывает остаток');
  await deny('factory', A, 'ship', {carrier: '', tracking: 'T1', reference: 'SHIP-A0'}, 'current', 422, 'отгрузка без перевозчика');
  await must('factory', A, 'ship', {carrier: 'ТК Демо', tracking: 'TRK-' + run, reference: 'SHIP-A1'}, 'current', 'отгрузка');
  await deny('client', A, 'accept_delivery', {}, 'current', 422, 'приёмка до доставки');
  await deny('client', A, 'deliver', {reference: 'DLV-X'}, 'current', 403, 'клиент не подтверждает доставку перевозчика');
  await must('factory', A, 'deliver', {reference: 'DLV-A1'}, 'current', 'доставка');
  await must('client', A, 'accept_delivery', {}, 'current', 'клиент принимает доставку');
  check((await read('client', A)).stage, 'closed', 'заказ закрыт');
  const dto = await read('client', A);
  check(dto.productionRelease, {allowed: false}, 'productionRelease.allowed остаётся false');
  check(dto.finance.verifiedBankKopecks, null, 'банк по-прежнему не подтверждён');
  await deny('client', A, 'report_issue', {note: 'Поздно'}, 'current', 422, 'закрытый заказ нельзя оспорить');

  // ---------- спор после отгрузки ----------
  const B = await acceptedOrder('B');
  await must('partner', B, 'record_payment', {amountKopecks: 210005, reference: 'BANK-B1'}, 'current', 'полная оплата B');
  for (const [t, pl] of [['start', {}], ['complete', {}], ['quality_pass', {reference: 'QC-B1'}], ['ship', {carrier: 'ТК Демо', tracking: 'TRK-B-' + run, reference: 'SHIP-B1'}]])
    await must('factory', B, t, pl, 'current', 'B ' + t);
  await must('client', B, 'report_issue', {note: 'Повреждена обивка'}, 'current', 'клиент сообщает о проблеме');
  check((await read('client', B)).stage, 'disputed', 'этап: спор');
  await deny('client', B, 'confirm_resolution', {}, 'current', 422, 'подтверждать решение, которого нет');
  await must('factory', B, 'respond_issue', {note: 'Заменим чехол'}, 'current', 'фабрика отвечает');
  await must('client', B, 'reject_resolution', {note: 'Нужна замена обивки целиком'}, 'current', 'клиент отклоняет решение');
  await must('partner', B, 'respond_issue', {note: 'Заменим обивку целиком'}, 'current', 'партнёр предлагает новое решение');
  await must('client', B, 'confirm_resolution', {}, 'current', 'клиент подтверждает решение');
  check((await read('client', B)).stage, 'shipped', 'после спора заказ возвращается к отгрузке');
  await must('factory', B, 'deliver', {reference: 'DLV-B1'}, 'current', 'доставка после спора');
  await must('client', B, 'accept_delivery', {}, 'current', 'приёмка после спора');
  check((await read('partner', B)).stage, 'closed', 'B закрыт');

  // ---------- след в логе и видимость ----------
  ok(logged.length >= 12 && logged.every((m) => m.startsWith('DEV_SIMULATED_EXTERNAL_AUTHORITY:')), 'каждая симулированная команда записана в лог сервера');
  const f = await read('factory', A);
  ok(!('finance' in f) && !('offer' in f), 'фабрика по-прежнему не видит финансы и цену клиента');
  console.log(`✓ simulated external authority e2e: ${checks} проверок на реальной PostgreSQL (полный цикл до закрытия и спор; банк не имитируется)`);
} finally {
  server.close();
  await Promise.all([ordersPool.end(), authPool.end()]);
}
