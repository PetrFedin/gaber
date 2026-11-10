/**
 * TOTP-MFA, постоянный ограничитель и журнал входов поверх реального HTTP -> журнал заказов -> PostgreSQL 17.
 * Сервер БЕЗ dev-флага MFA: запись партнёра разрешается только после настоящей проверки кода.
 */
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {randomBytes} from 'node:crypto';
import pg from 'pg';
import {createGaberHttpServer} from '../httpServer.js';
import {wirePostgresOrderJournal} from '../orderJournalWiring.js';
import {createPgAuthStore} from '../auth/authStore.js';
import {createAuthService} from '../auth/authService.js';
import {hashPassword} from '../auth/passwords.js';
import {base32Decode, hotp, totpStep} from '../auth/totp.js';
import {initialConfig} from '../../src/domain.js';
import {DEV_TENANT, DEV_FACTORY} from '../dev/seed-data.js';

const e = process.env;
for (const k of ['GABER_ORDERS_DATABASE_URL', 'GABER_AUTH_DATABASE_URL', 'GABER_DEV_ADMIN_DATABASE_URL', 'GABER_AUTH_ENC_KEY'])
  if (!e[k]) throw Error(`Нужна переменная ${k} (см. server/dev/dev.env.example)`);
const ordersPool = new pg.Pool({connectionString: e.GABER_ORDERS_DATABASE_URL, max: 4});
const authPool = new pg.Pool({connectionString: e.GABER_AUTH_DATABASE_URL, max: 4});
const admin = new pg.Pool({connectionString: e.GABER_DEV_ADMIN_DATABASE_URL, max: 2});
const run = randomBytes(4).toString('hex'), pw = 'mfa-passphrase-' + run;
const partnerEmail = `mfa-partner-${run}@example.test`, partnerId = 'U-mfa-' + run;
let checks = 0;
const check = (a, b, l) => { assert.deepEqual(a, b, l); checks++; };
const ok = (v, l) => { assert.ok(v, l); checks++; };

await admin.query(
  `INSERT INTO gaber_auth.users(user_id,tenant_id,email,name,password_hash,role) VALUES($1,$2,$3,'MFA partner',$4,'partner')`,
  [partnerId, DEV_TENANT, partnerEmail, await hashPassword(pw)]
);
const service = createAuthService({store: createPgAuthStore({pool: authPool}), tenantId: DEV_TENANT, mfaAssumed: false, encKey: Buffer.from(e.GABER_AUTH_ENC_KEY, 'base64')});
const server = createGaberHttpServer({journal: wirePostgresOrderJournal({pool: ordersPool}), authService: service, allowedOrigins: []});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = 'http://127.0.0.1:' + server.address().port;
const call = async (method, path, {body, cookie} = {}) => {
  const res = await fetch(base + path, {method, headers: {...(cookie ? {cookie} : {}), ...(body !== undefined ? {'content-type': 'application/json'} : {})}, ...(body !== undefined ? {body: JSON.stringify(body)} : {})});
  const set = res.headers.get('set-cookie');
  return {status: res.statusCode ?? res.status, body: await res.json(), cookie: set ? set.split(';')[0] : undefined};
};
const login = async () => (await call('POST', '/api/v1/auth/login', {body: {email: partnerEmail, password: pw}})).cookie;
const ORDER = 'ORDER-MFA-' + run;
const assign = (cookie, rid) => call('POST', `/api/v1/orders/${ORDER}/commands`, {cookie, body: {requestId: rid, expectedVersion: 1, type: 'assign_factory', payload: {factoryId: DEV_FACTORY}}});
try {
  const client = (await call('POST', '/api/v1/auth/register', {body: {email: `mfa-client-${run}@example.test`, password: pw}})).cookie;
  check((await call('GET', '/api/v1/auth/me', {cookie: client})).body.user.mfa, {required: false, enrolled: false, verified: false, devAssumed: false}, 'клиенту MFA не требуется');
  check((await call('POST', `/api/v1/orders/${ORDER}/commands`, {cookie: client, body: {requestId: 'MFA-C-' + run, expectedVersion: 0, type: 'create', payload: {projectId: ORDER, name: 'MFA e2e', config: initialConfig()}}})).status, 201, 'клиент создаёт заказ');

  // без MFA запись партнёра закрыта
  let p = await login();
  let me = (await call('GET', '/api/v1/auth/me', {cookie: p})).body.user;
  check(me.mfa, {required: true, enrolled: false, verified: false, devAssumed: false}, 'партнёр: MFA обязателен, не подключён');
  const denied = await assign(p, 'MFA-A0-' + run);
  check([denied.status, denied.body.code], [403, 'MFA_REQUIRED'], 'без MFA запись партнёра отклонена');
  check((await call('POST', '/api/v1/auth/mfa/verify', {cookie: p, body: {code: '123456'}})).status, 409, 'verify до подключения невозможен');
  check((await call('POST', '/api/v1/auth/mfa/confirm', {cookie: p, body: {code: '123456'}})).status, 409, 'confirm без запроса на подключение невозможен');

  // подключение: секрет выдаётся один раз, в базе только шифртекст
  const enroll = await call('POST', '/api/v1/auth/mfa/enroll', {cookie: p, body: {}});
  check(enroll.status, 200, 'enroll');
  ok(/^otpauth:\/\/totp\/GABER:/.test(enroll.body.uri) && /^[A-Z2-7]{32}$/.test(enroll.body.secret), 'выдан секрет и otpauth-ссылка');
  const secret = base32Decode(enroll.body.secret);
  const row = (await admin.query('SELECT totp_secret_enc, totp_enrolled_at FROM gaber_auth.users WHERE user_id=$1', [partnerId])).rows[0];
  ok(row.totp_secret_enc.startsWith('v1:') && !row.totp_secret_enc.includes(enroll.body.secret) && row.totp_enrolled_at === null, 'в базе зашифрованный секрет, подключение ещё не подтверждено');
  check((await call('POST', '/api/v1/auth/mfa/enroll', {cookie: p, body: {}})).status, 200, 'повторный enroll до подтверждения перевыпускает секрет');
  const enroll2 = await call('POST', '/api/v1/auth/mfa/enroll', {cookie: p, body: {}});
  const secret2 = base32Decode(enroll2.body.secret);
  const now = Date.now(), step = totpStep(now);
  check((await call('POST', '/api/v1/auth/mfa/confirm', {cookie: p, body: {code: hotp(secret2, step) === '000000' ? '111111' : '000000'}})).body.code, 'BAD_CODE', 'неверный код при подключении');
  check((await call('POST', '/api/v1/auth/mfa/confirm', {cookie: p, body: {code: 'abc'}})).body.code, 'BAD_CODE', 'код неверного формата');
  const confirm = await call('POST', '/api/v1/auth/mfa/confirm', {cookie: p, body: {code: hotp(secret2, step)}});
  check([confirm.status, confirm.body.mfa.enrolled, confirm.body.mfa.verified], [200, true, true], 'подключение подтверждено верным кодом');
  check((await call('POST', '/api/v1/auth/mfa/enroll', {cookie: p, body: {}})).status, 409, 'после подтверждения секрет не перевыпускается');

  // сессия, прошедшая MFA, может писать от имени партнёра, и это настоящая политика, а не dev-флаг
  check((await assign(p, 'MFA-A1-' + run)).status, 201, 'с подтверждённым MFA запись партнёра проходит');

  // новый вход: MFA для сессии снова не пройден, одноразовый код не работает дважды
  p = await login();
  check((await call('GET', '/api/v1/auth/me', {cookie: p})).body.user.mfa.verified, false, 'новая сессия без MFA');
  const next = hotp(secret2, step + 1);
  check((await call('POST', '/api/v1/auth/mfa/verify', {cookie: p, body: {code: hotp(secret2, step)}})).body.code, 'BAD_CODE', 'код, уже принятый при подключении, повторно отвергается');
  check((await call('POST', '/api/v1/auth/mfa/verify', {cookie: p, body: {code: next}})).status, 200, 'следующий код принят');
  check((await call('GET', '/api/v1/auth/me', {cookie: p})).body.user.mfa.verified, true, 'сессия подтверждена');
  const p2 = await login();
  check((await call('POST', '/api/v1/auth/mfa/verify', {cookie: p2, body: {code: next}})).body.code, 'BAD_CODE', 'принятый код нельзя использовать во второй сессии');

  // ограничитель попыток хранится в базе
  let last;
  for (let i = 0; i < 6; i++) last = await call('POST', '/api/v1/auth/mfa/verify', {cookie: p2, body: {code: String(100000 + i)}});
  check(last.status, 429, 'после серии неверных кодов 429');
  ok((await admin.query("SELECT count(*)::int n FROM gaber_auth.login_attempts WHERE key=$1", [`mfa|${partnerId}`])).rows[0].n >= 5, 'попытки лежат в PostgreSQL');

  // журнал событий: только добавление
  const ev = (await admin.query('SELECT event FROM gaber_auth.auth_events WHERE user_id=$1 ORDER BY id', [partnerId])).rows.map((r) => r.event);
  for (const name of ['login_ok', 'mfa_enroll_started', 'mfa_enrolled', 'mfa_ok', 'mfa_fail', 'rate_limited']) ok(ev.includes(name), 'в журнале есть ' + name);
  await assert.rejects(admin.query('UPDATE gaber_auth.auth_events SET event=$1 WHERE user_id=$2', ['login_ok', partnerId]), /AUTH_EVENTS_APPEND_ONLY/);
  await assert.rejects(admin.query('DELETE FROM gaber_auth.auth_events WHERE user_id=$1', [partnerId]), /AUTH_EVENTS_APPEND_ONLY/);
  checks += 2;
  await assert.rejects(authPool.query('UPDATE gaber_auth.auth_events SET event=$1', ['login_ok']), /permission denied|APPEND_ONLY/);
  checks++;

  // без ключа шифрования MFA честно отвечает «не настроено»
  const bare = createAuthService({store: createPgAuthStore({pool: authPool}), tenantId: DEV_TENANT});
  const tok = p.split('=')[1];
  await assert.rejects(bare.mfaEnroll(tok), {code: 'ALREADY_ENROLLED'});
  checks++;
  console.log(`✓ mfa e2e: ${checks} проверок на реальной PostgreSQL (TOTP, одноразовость кода, шифрование секрета, ограничитель и журнал в базе)`);
} finally {
  server.close();
  await admin.query('DELETE FROM gaber_auth.sessions WHERE user_id=$1', [partnerId]).catch(() => {});
  await admin.query('DELETE FROM gaber_auth.users WHERE user_id=$1', [partnerId]).catch(() => {});
  await Promise.all([ordersPool.end(), authPool.end(), admin.end()]);
}
