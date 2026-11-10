import test from 'node:test';
import assert from 'node:assert/strict';
import {createAuthService, createLoginLimiter} from '../server/auth/authService.js';
import {buildPrincipal} from '../server/auth/principal.js';
import {hashPassword, verifyPassword} from '../server/auth/passwords.js';
import {newToken, sha256} from '../server/auth/authStore.js';
import {authorizeGaberAction} from '../server/accessPolicy.js';
import {readCookie} from '../server/auth/authHttp.js';

// Память вместо PostgreSQL: проверяем только логику сервиса. Реальную базу проверяет server/tests/auth-http-e2e.mjs.
function memoryStore() {
  const users = [],
    sessions = new Map();
  return {
    users,
    sessions,
    async createUser(u) {
      if (users.some((x) => x.tenantId === u.tenantId && x.email.toLowerCase() === u.email.toLowerCase())) return null;
      const row = {user_id: 'U-' + users.length, tenant_id: u.tenantId, email: u.email, name: u.name, role: u.role, factory_id: u.factoryId ?? null, password_hash: u.passwordHash};
      users.push({...row, tenantId: u.tenantId});
      return row;
    },
    async findUserByEmail({tenantId, email}) {
      return users.find((x) => x.tenantId === tenantId && x.email.toLowerCase() === email.toLowerCase()) ?? null;
    },
    async createSession({userId, tenantId, nowMs, ttlMs}) {
      const token = newToken();
      sessions.set(sha256(token), {userId, tenantId, exp: nowMs + ttlMs, revoked: false});
      return {token, expiresAtMs: nowMs + ttlMs};
    },
    async resolveSession(token, nowMs) {
      const s = sessions.get(sha256(token));
      if (!s || s.revoked || s.exp <= nowMs) return null;
      const u = users.find((x) => x.user_id === s.userId);
      return {...u, expires_at: new Date(s.exp).toISOString(), mfa_verified_at: null};
    },
    async revokeSession(token) {
      const s = sessions.get(sha256(token));
      if (s) s.revoked = true;
    }
  };
}
const fastHash = async (p) => '$argon2id$test$' + p;
const fastVerify = async (h, p) => h === '$argon2id$test$' + p;
const make = (over = {}) => {
  const store = memoryStore();
  let now = 1_800_000_000_000;
  const service = createAuthService({store, tenantId: 'TENANT-T', clock: () => now, hash: fastHash, verify: fastVerify, ...over});
  return {store, service, tick: (ms) => (now += ms)};
};

test('argon2id: хеш проверяется, чужой пароль и пустой хеш отклоняются', async () => {
  const h = await hashPassword('correct horse battery');
  assert.match(h, /^\$argon2id\$/);
  assert.equal(await verifyPassword(h, 'correct horse battery'), true);
  assert.equal(await verifyPassword(h, 'wrong'), false);
  assert.equal(await verifyPassword(null, 'anything'), false);
});
test('токен сессии подходит под ограничение HTTP-адаптера, а в хранилище идёт только SHA-256', () => {
  const t = newToken();
  assert.match('Bearer ' + t, /^Bearer ([A-Za-z0-9_-]{32,256})$/);
  assert.match(sha256(t), /^[a-f0-9]{64}$/);
  assert.notEqual(sha256(t), t);
});
test('регистрация создаёт только клиента и проверяет почту и пароль', async () => {
  const {service} = make();
  const r = await service.register({email: 'a@example.test', password: 'long-enough-pass'});
  assert.equal(r.user.role, 'client');
  await assert.rejects(service.register({email: 'bad', password: 'long-enough-pass'}), {code: 'INVALID_EMAIL'});
  await assert.rejects(service.register({email: 'b@example.test', password: 'short'}), {code: 'WEAK_PASSWORD'});
  await assert.rejects(service.register({email: 'A@Example.test', password: 'long-enough-pass'}), {code: 'EMAIL_TAKEN'});
});
test('вход: неверный пароль и неизвестная почта дают один и тот же отказ', async () => {
  const {service} = make();
  await service.register({email: 'a@example.test', password: 'long-enough-pass'});
  await assert.rejects(service.login({email: 'a@example.test', password: 'nope-nope-nope'}), {code: 'BAD_CREDENTIALS', status: 401});
  await assert.rejects(service.login({email: 'ghost@example.test', password: 'nope-nope-nope'}), {code: 'BAD_CREDENTIALS', status: 401});
  assert.equal((await service.login({email: 'A@example.test', password: 'long-enough-pass'})).user.role, 'client');
});
test('ограничитель блокирует перебор и сбрасывается после успеха', async () => {
  const {service, tick} = make({limiter: createLoginLimiter({max: 3, windowMs: 1000})});
  await service.register({email: 'a@example.test', password: 'long-enough-pass'});
  for (let i = 0; i < 3; i++) await assert.rejects(service.login({email: 'a@example.test', password: 'bad-bad-bad-' + i, clientKey: 'ip'}), {status: 401});
  await assert.rejects(service.login({email: 'a@example.test', password: 'long-enough-pass', clientKey: 'ip'}), {status: 429});
  tick(1500);
  assert.ok((await service.login({email: 'a@example.test', password: 'long-enough-pass', clientKey: 'ip'})).token);
});
test('сессия: истечение и выход отзывают доступ на сервере', async () => {
  const {service, tick} = make({sessionTtlMs: 1000});
  const {token} = await service.register({email: 'a@example.test', password: 'long-enough-pass'});
  assert.equal((await service.resolveSession(token)).roles[0], 'client');
  await service.logout(token);
  assert.equal(await service.resolveSession(token), null);
  const again = await service.login({email: 'a@example.test', password: 'long-enough-pass'});
  tick(1001);
  assert.equal(await service.resolveSession(again.token), null);
});
test('principal соответствует accessPolicy: роль и привязки берутся из учётной записи, MFA не выдаётся даром', () => {
  const now = 1_800_000_000_000,
    exp = new Date(now + 60_000).toISOString();
  const base = {tenant_id: 'T-1', expires_at: exp, mfa_verified_at: null};
  const client = buildPrincipal({...base, user_id: 'U-c', role: 'client'});
  const factory = buildPrincipal({...base, user_id: 'U-f', role: 'factory', factory_id: 'FAB-1'});
  const partner = buildPrincipal({...base, user_id: 'U-p', role: 'partner'});
  const order = {source: 'server-repository', tenantId: 'T-1', orderId: 'O-1', clientId: 'U-c', factoryId: 'FAB-1'};
  assert.equal(authorizeGaberAction({principal: client, resource: order, action: 'orders.read', nowMs: now}).allowed, true);
  assert.equal(authorizeGaberAction({principal: factory, resource: order, action: 'orders.read', nowMs: now}).allowed, true);
  assert.equal(authorizeGaberAction({principal: partner, resource: order, action: 'orders.read', nowMs: now}).allowed, true);
  const other = {...order, clientId: 'U-other'};
  assert.equal(authorizeGaberAction({principal: client, resource: other, action: 'orders.read', nowMs: now}).reason, 'RESOURCE_MEMBERSHIP_DENIED');
  assert.equal(authorizeGaberAction({principal: partner, resource: order, action: 'orders.assign_factory', nowMs: now}).reason, 'MFA_REQUIRED');
  assert.equal(authorizeGaberAction({principal: buildPrincipal({...base, user_id: 'U-p', role: 'partner'}, {mfaAssumed: true}), resource: order, action: 'orders.assign_factory', nowMs: now}).allowed, true);
  assert.equal(buildPrincipal({...base, user_id: 'U-x', role: 'admin'}), null);
});
test('cookie читается точно по имени', () => {
  assert.equal(readCookie({headers: {cookie: 'a=1; gaber_sid=tok_en-1; b=2'}}), 'tok_en-1');
  assert.equal(readCookie({headers: {cookie: 'xgaber_sid=nope'}}), null);
  assert.equal(readCookie({headers: {}}), null);
});
