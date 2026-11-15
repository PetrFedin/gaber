import {hashPassword, verifyPassword, MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH} from './passwords.js';
import {buildPrincipal} from './principal.js';
import {decryptSecret, encryptSecret, newTotpSecret, otpauthUri, base32Encode, totpStep, verifyTotp} from './totp.js';

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const fail = (status, code) => Object.assign(Error(code), {status, code});

/** Ограничитель попыток в памяти процесса (тесты и запасной вариант). */
export function createLoginLimiter({max = 8, windowMs = 10 * 60 * 1000} = {}) {
  const hits = new Map();
  const fresh = (key, now) => (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  return {
    blocked: (key, now) => fresh(key, now).length >= max,
    fail(key, now) {
      hits.set(key, [...fresh(key, now), now]);
      if (hits.size > 5000) hits.clear();
    },
    reset: (key) => hits.delete(key)
  };
}
/** Постоянный ограничитель: попытки лежат в PostgreSQL и переживают перезапуск и несколько экземпляров. */
export function createStoreLimiter(store, {max = 8, windowMs = 10 * 60 * 1000} = {}) {
  return {
    blocked: async (key, now) => (await store.countAttempts(key, now - windowMs)) >= max,
    fail: (key, now) => store.addAttempt(key, now),
    reset: (key) => store.clearAttempts(key)
  };
}

export function createAuthService({
  store,
  tenantId,
  clock = Date.now,
  sessionTtlMs = 14 * 24 * 3600 * 1000,
  limiter,
  mfaLimiter,
  mfaAssumed = false,
  encKey = null,
  hash = hashPassword,
  verify = verifyPassword
}) {
  if (!store || typeof tenantId !== 'string') throw TypeError('INVALID_AUTH_DEPS');
  limiter ??= store.countAttempts ? createStoreLimiter(store) : createLoginLimiter();
  mfaLimiter ??= store.countAttempts ? createStoreLimiter(store, {max: 5}) : createLoginLimiter({max: 5});
  const normalize = (email) => (typeof email === 'string' ? email.trim() : '');
  const event = (e, userId, ip, detail) => store.recordEvent?.({tenantId, userId, event: e, ip, detail});
  const view = (u) => ({id: u.user_id, email: u.email, name: u.name, role: u.role});
  const mfaOf = (row) => ({
    required: row.role !== 'client',
    enrolled: Boolean(row.totp_enrolled_at),
    verified: Boolean(row.mfa_verified_at) || mfaAssumed,
    devAssumed: mfaAssumed
  });
  const needKey = () => {
    if (!encKey) throw fail(503, 'MFA_NOT_CONFIGURED');
    return encKey;
  };
  async function session(token) {
    const row = await store.resolveSession(token, clock());
    if (!row) throw fail(401, 'SESSION_INVALID');
    return row;
  }
  // Общая проверка кода с ограничением попыток; возвращает шаг, принятый сервером.
  async function checkCode(row, secretRow, code, ip) {
    const now = clock(), key = `mfa|${row.user_id}`;
    if (await mfaLimiter.blocked(key, now)) {
      await event('rate_limited', row.user_id, ip, {scope: 'mfa'});
      throw fail(429, 'TOO_MANY_ATTEMPTS');
    }
    const secret = decryptSecret(secretRow.totp_secret_enc, needKey());
    const r = verifyTotp(secret, code, now, {lastStep: Number(secretRow.totp_last_step)});
    if (!r.ok) {
      await mfaLimiter.fail(key, now);
      await event('mfa_fail', row.user_id, ip, {});
      throw fail(401, 'BAD_CODE');
    }
    await mfaLimiter.reset(key);
    return r.step;
  }
  return {
    // Публичная регистрация создаёт только клиентов. Фабрики и партнёры заводятся вне этого API.
    async register({email, password, name = '', ip = null}) {
      email = normalize(email);
      if (!EMAIL.test(email) || email.length > 254) throw fail(400, 'INVALID_EMAIL');
      if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH)
        throw fail(400, 'WEAK_PASSWORD');
      if (typeof name !== 'string' || name.length > 80) throw fail(400, 'INVALID_NAME');
      const user = await store.createUser({tenantId, email, name: name.trim(), passwordHash: await hash(password), role: 'client'});
      if (!user) throw fail(409, 'EMAIL_TAKEN');
      await event('register', user.user_id, ip, {});
      return {user: view(user), ...(await store.createSession({userId: user.user_id, tenantId, nowMs: clock(), ttlMs: sessionTtlMs}))};
    },
    async login({email, password, clientKey = ''}) {
      email = normalize(email);
      const now = clock(), key = `${clientKey}|${email.toLowerCase()}`;
      if (typeof password !== 'string' || !email || password.length > MAX_PASSWORD_LENGTH) throw fail(400, 'INVALID_CREDENTIALS_REQUEST');
      if (await limiter.blocked(key, now)) {
        await event('rate_limited', null, clientKey, {scope: 'login'});
        throw fail(429, 'TOO_MANY_ATTEMPTS');
      }
      const user = await store.findUserByEmail({tenantId, email});
      if (!(await verify(user?.password_hash, password)) || !user) {
        await limiter.fail(key, now);
        await event('login_fail', user?.user_id ?? null, clientKey, {});
        throw fail(401, 'BAD_CREDENTIALS');
      }
      await limiter.reset(key);
      await event('login_ok', user.user_id, clientKey, {});
      return {user: view(user), ...(await store.createSession({userId: user.user_id, tenantId, nowMs: now, ttlMs: sessionTtlMs}))};
    },
    async logout(token) {
      if (!token) return;
      const row = await store.resolveSession(token, clock());
      await store.revokeSession(token, clock());
      if (row) await event('logout', row.user_id, null, {});
    },
    /** Зависимость для createOrderHttpHandler: токен -> проверенный principal или null. */
    async resolveSession(token) {
      const row = await store.resolveSession(token, clock());
      return buildPrincipal(row, {mfaAssumed});
    },
    async me(token) {
      const row = await store.resolveSession(token, clock());
      return row ? {...view(row), mfa: mfaOf(row)} : null;
    },
    // ---- MFA ----
    async mfaEnroll(token, {ip = null} = {}) {
      const row = await session(token);
      if (row.totp_enrolled_at) throw fail(409, 'ALREADY_ENROLLED');
      const secret = newTotpSecret();
      if (!(await store.setPendingTotp({userId: row.user_id, enc: encryptSecret(secret, needKey())}))) throw fail(409, 'ALREADY_ENROLLED');
      await event('mfa_enroll_started', row.user_id, ip, {});
      return {secret: base32Encode(secret), uri: otpauthUri(row.email, secret), period: 30, digits: 6};
    },
    async mfaConfirm(token, code, {ip = null} = {}) {
      const row = await session(token);
      const s = await store.getUserSecret({tenantId, userId: row.user_id});
      if (!s?.totp_secret_enc || s.totp_enrolled_at) throw fail(409, 'NO_PENDING_ENROLLMENT');
      const step = await checkCode(row, s, code, ip);
      if (!(await store.confirmTotp({userId: row.user_id, step}))) throw fail(409, 'NO_PENDING_ENROLLMENT');
      await store.markSessionMfa(token, clock());
      await event('mfa_enrolled', row.user_id, ip, {});
      return {mfa: {...mfaOf(row), enrolled: true, verified: true}};
    },
    async mfaVerify(token, code, {ip = null} = {}) {
      const row = await session(token);
      const s = await store.getUserSecret({tenantId, userId: row.user_id});
      if (!s?.totp_enrolled_at) throw fail(409, 'NOT_ENROLLED');
      const step = await checkCode(row, s, code, ip);
      // Второй запрос с тем же кодом проигрывает гонку и получает отказ.
      if (!(await store.advanceTotpStep({userId: row.user_id, step}))) throw fail(401, 'BAD_CODE');
      await store.markSessionMfa(token, clock());
      await event('mfa_ok', row.user_id, ip, {});
      return {mfa: {...mfaOf(row), verified: true}};
    }
  };
}
export {totpStep};
