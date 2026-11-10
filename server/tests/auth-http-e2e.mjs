/**
 * Вход и сессии поверх реального HTTP -> журнал заказов -> PostgreSQL 17 (RLS).
 * Требуются dev-база и пользователи: npm run dev:db && npm run dev:setup. Только вымышленные данные.
 * Это НЕ проверка MFA, реальных организаций и production.
 */
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createHash, randomBytes} from 'node:crypto';
import pg from 'pg';
import {createGaberHttpServer} from '../httpServer.js';
import {wirePostgresOrderJournal} from '../orderJournalWiring.js';
import {createPgAuthStore} from '../auth/authStore.js';
import {createAuthService} from '../auth/authService.js';
import {initialConfig} from '../../src/domain.js';
import {devUsers, DEV_TENANT, DEV_FACTORY} from '../dev/seed-data.js';

const e = process.env;
for (const k of ['GABER_ORDERS_DATABASE_URL', 'GABER_AUTH_DATABASE_URL', 'GABER_DEV_ADMIN_DATABASE_URL'])
  if (!e[k]) throw Error(`Нужна переменная ${k} (см. server/dev/dev.env.example)`);
const ordersPool = new pg.Pool({connectionString: e.GABER_ORDERS_DATABASE_URL, max: 6});
const authPool = new pg.Pool({connectionString: e.GABER_AUTH_DATABASE_URL, max: 4});
const admin = new pg.Pool({connectionString: e.GABER_DEV_ADMIN_DATABASE_URL, max: 2});
const origin = 'http://127.0.0.1:4173';
const run = randomBytes(4).toString('hex');
const ORDER = 'ORDER-AUTH-' + run;
const pw = 'e2e-passphrase-' + run;
let checks = 0;
const check = (actual, expected, label) => {
  assert.deepEqual(actual, expected, label);
  checks++;
};
const ok = (value, label) => {
  assert.ok(value, label);
  checks++;
};

async function start(mfaAssumed) {
  const authService = createAuthService({
    store: createPgAuthStore({pool: authPool}),
    tenantId: DEV_TENANT,
    mfaAssumed
  });
  const server = createGaberHttpServer({
    journal: wirePostgresOrderJournal({pool: ordersPool}),
    authService,
    allowedOrigins: [origin]
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = 'http://127.0.0.1:' + server.address().port;
  const call = async (method, path, {body, cookie, headers = {}} = {}) => {
    const res = await fetch(base + path, {
      method,
      headers: {
        ...(cookie ? {cookie} : {}),
        ...(body !== undefined ? {'content-type': 'application/json'} : {}),
        ...headers
      },
      ...(body !== undefined ? {body: JSON.stringify(body)} : {})
    });
    const set = res.headers.get('set-cookie');
    return {status: res.status, body: await res.json(), setCookie: set, cookie: set ? set.split(';')[0] : undefined};
  };
  return {server, call};
}
const loginCookie = async (api, email, password) => {
  const r = await api.call('POST', '/api/v1/auth/login', {body: {email, password}});
  check(r.status, 200, 'login ' + email);
  return r.cookie;
};
const command = (api, cookie, orderId, type, payload, expectedVersion, requestId, revisionId) =>
  api.call('POST', `/api/v1/orders/${orderId}/commands`, {
    cookie,
    body: {requestId, expectedVersion, type, payload, ...(revisionId ? {revisionId} : {})}
  });
const readOrder = (api, cookie, orderId = ORDER) => api.call('GET', `/api/v1/orders/${orderId}`, {cookie});
const user = (role) => devUsers.find((u) => u.role === role);

const strict = await start(false); // MFA не считается пройденным
const dev = await start(true); // dev-флаг: MFA считается пройденным
try {
  // --- регистрация и сессия ---
  check((await strict.call('GET', '/api/v1/auth/me')).body.user, null, 'без cookie пользователя нет');
  const emailA = `a-${run}@example.test`,
    emailB = `b-${run}@example.test`;
  const a = await strict.call('POST', '/api/v1/auth/register', {body: {email: emailA, password: pw, name: 'A'}});
  check(a.status, 201, 'регистрация клиента');
  check(a.body.user.role, 'client', 'публичная регистрация даёт только клиента');
  ok(/HttpOnly/i.test(a.setCookie) && /SameSite=Lax/i.test(a.setCookie), 'cookie HttpOnly и SameSite=Lax');
  ok(!JSON.stringify(a.body).includes(a.cookie.split('=')[1]), 'токен сессии не отдаётся в теле ответа');
  check((await strict.call('GET', '/api/v1/auth/me', {cookie: a.cookie})).body.user.email, emailA, 'me по cookie');
  const b = await strict.call('POST', '/api/v1/auth/register', {body: {email: emailB, password: pw}});
  check(b.status, 201, 'второй клиент');
  check((await strict.call('POST', '/api/v1/auth/register', {body: {email: emailA.toUpperCase(), password: pw}})).status, 409, 'почта уникальна без учёта регистра');
  check((await strict.call('POST', '/api/v1/auth/register', {body: {email: 'x@example.test', password: 'short'}})).status, 400, 'слабый пароль');
  check((await strict.call('POST', '/api/v1/auth/register', {body: {email: 'y@example.test', password: pw, role: 'partner'}})).status, 400, 'роль и лишние поля отвергаются');
  check((await strict.call('POST', '/api/v1/auth/register', {body: {email: 'z@example.test', password: pw, tenantId: 'TENANT-X'}})).status, 400, 'tenant из запроса не принимается');

  // --- что лежит в базе ---
  const row = (await admin.query('SELECT password_hash FROM gaber_auth.users WHERE lower(email)=lower($1)', [emailA])).rows[0];
  ok(row.password_hash.startsWith('$argon2id$'), 'пароль хранится как argon2id');
  const token = a.cookie.split('=')[1];
  const hash = createHash('sha256').update(token).digest('hex');
  check((await admin.query('SELECT count(*)::int n FROM gaber_auth.sessions WHERE token_hash=$1', [hash])).rows[0].n, 1, 'в базе SHA-256 токена');
  check((await admin.query('SELECT count(*)::int n FROM gaber_auth.sessions WHERE token_hash=$1', [token])).rows[0].n, 0, 'в базе нет открытого токена');
  await assert.rejects(ordersPool.query('SELECT password_hash FROM gaber_auth.users'), /permission denied/);
  checks++;

  // --- вход ---
  check((await strict.call('POST', '/api/v1/auth/login', {body: {email: emailA, password: 'wrong-' + pw}})).status, 401, 'неверный пароль');
  check((await strict.call('POST', '/api/v1/auth/login', {body: {email: 'nobody@example.test', password: pw}})).status, 401, 'неизвестная почта даёт тот же 401');
  check((await strict.call('POST', '/api/v1/auth/login', {headers: {origin: 'https://evil.example'}, body: {email: emailA, password: pw}})).status, 403, 'чужой Origin');
  const victim = `limit-${run}@example.test`;
  for (let i = 0; i < 8; i++) await strict.call('POST', '/api/v1/auth/login', {body: {email: victim, password: 'bad-password-' + i}});
  check((await strict.call('POST', '/api/v1/auth/login', {body: {email: victim, password: 'bad-password-x'}})).status, 429, 'ограничение попыток входа');

  // --- объектные права поверх реального журнала и RLS ---
  const cfg = initialConfig();
  const created = {projectId: ORDER, name: 'Auth e2e', config: cfg};
  check((await command(strict, a.cookie, ORDER, 'create', created, 0, 'AUTH-C-1')).status, 201, 'клиент создаёт заказ по cookie');
  check((await command(strict, a.cookie, ORDER, 'create', created, 0, 'AUTH-C-1')).status, 200, 'идемпотентный повтор');
  check((await readOrder(strict, a.cookie)).status, 200, 'владелец читает заказ');
  check((await readOrder(strict, b.cookie)).status, 404, 'чужой клиент не читает заказ');
  check((await readOrder(strict, undefined)).status, 401, 'без cookie 401');
  const evil = await strict.call('POST', `/api/v1/orders/${ORDER}/commands`, {
    cookie: a.cookie,
    headers: {origin: 'https://evil.example'},
    body: {requestId: 'EVIL-2', expectedVersion: 1, type: 'message', payload: {note: 'x'}}
  });
  check(evil.status, 403, 'команда с чужим Origin отклонена');

  const partner = await loginCookie(strict, user('partner').email, user('partner').password);
  const factory = await loginCookie(strict, user('factory').email, user('factory').password);
  check((await strict.call('GET', '/api/v1/auth/me', {cookie: partner})).body.user.role, 'partner', 'роль партнёра из базы');
  check((await readOrder(strict, partner)).status, 200, 'партнёр читает заказ своего tenant');
  check((await readOrder(strict, factory)).status, 404, 'фабрика без назначения не читает заказ');
  // Роль фабрики берётся из учётной записи, привязка к организации из базы
  check((await admin.query('SELECT factory_id FROM gaber_auth.users WHERE role=$1', ['factory'])).rows[0].factory_id, DEV_FACTORY, 'factoryId из учётной записи');

  // --- MFA: без реального MFA запись партнёра отклоняется политикой, с dev-флагом проходит ---
  const nomfa = await command(strict, partner, ORDER, 'assign_factory', {factoryId: DEV_FACTORY}, 1, 'ASSIGN-NOMFA-' + run);
  check(nomfa.status, 403, 'без MFA партнёр не назначает фабрику');
  const partnerDev = await loginCookie(dev, user('partner').email, user('partner').password);
  check((await command(dev, partnerDev, ORDER, 'assign_factory', {factoryId: DEV_FACTORY}, 1, 'ASSIGN-' + run)).status, 201, 'с dev-флагом MFA назначение проходит');
  check((await readOrder(strict, factory)).status, 200, 'назначенная фабрика читает заказ');
  check((await readOrder(strict, a.cookie)).status, 200, 'клиент по-прежнему читает свой заказ');

  // --- завершение, истечение, блокировка ---
  const out = await strict.call('POST', '/api/v1/auth/logout', {cookie: a.cookie});
  check(out.status, 200, 'выход');
  check((await readOrder(strict, a.cookie)).status, 401, 'после выхода cookie недействительна на сервере');
  const c = await strict.call('POST', '/api/v1/auth/register', {body: {email: `c-${run}@example.test`, password: pw}});
  await admin.query("UPDATE gaber_auth.sessions SET expires_at=now()-interval '1 second', created_at=now()-interval '1 day' WHERE token_hash=$1", [createHash('sha256').update(c.cookie.split('=')[1]).digest('hex')]);
  check((await readOrder(strict, c.cookie)).status, 401, 'истёкшая сессия отклоняется');
  const d = await strict.call('POST', '/api/v1/auth/register', {body: {email: `d-${run}@example.test`, password: pw}});
  await admin.query("UPDATE gaber_auth.users SET disabled_at=now() WHERE lower(email)=lower($1)", [`d-${run}@example.test`]);
  check((await readOrder(strict, d.cookie)).status, 401, 'заблокированный пользователь теряет доступ сразу');
  check((await strict.call('POST', '/api/v1/auth/login', {body: {email: `d-${run}@example.test`, password: pw}})).status, 401, 'заблокированный не входит');
  console.log(`✓ auth HTTP e2e: ${checks} проверок на реальной PostgreSQL (вход, cookie, роли, RLS, сессии)`);
} finally {
  strict.server.close();
  dev.server.close();
  await Promise.all([ordersPool.end(), authPool.end(), admin.end()]);
}
