import {hashPassword, verifyPassword, MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH} from './passwords.js';
import {buildPrincipal} from './principal.js';

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const fail = (status, code) => Object.assign(Error(code), {status, code});

/** Ограничитель попыток входа в памяти одного процесса. */
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

export function createAuthService({
  store,
  tenantId,
  clock = Date.now,
  sessionTtlMs = 14 * 24 * 3600 * 1000,
  limiter = createLoginLimiter(),
  mfaAssumed = false,
  hash = hashPassword,
  verify = verifyPassword
}) {
  if (!store || typeof tenantId !== 'string') throw TypeError('INVALID_AUTH_DEPS');
  const normalize = (email) => (typeof email === 'string' ? email.trim() : '');
  const view = (u) => ({id: u.user_id, email: u.email, name: u.name, role: u.role});
  return {
    // Публичная регистрация создаёт только клиентов. Фабрики и партнёры заводятся вне этого API.
    async register({email, password, name = ''}) {
      email = normalize(email);
      if (!EMAIL.test(email) || email.length > 254) throw fail(400, 'INVALID_EMAIL');
      if (typeof password !== 'string' || password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH)
        throw fail(400, 'WEAK_PASSWORD');
      if (typeof name !== 'string' || name.length > 80) throw fail(400, 'INVALID_NAME');
      const user = await store.createUser({
        tenantId,
        email,
        name: name.trim(),
        passwordHash: await hash(password),
        role: 'client'
      });
      if (!user) throw fail(409, 'EMAIL_TAKEN');
      return {user: view(user), ...(await store.createSession({userId: user.user_id, tenantId, nowMs: clock(), ttlMs: sessionTtlMs}))};
    },
    async login({email, password, clientKey = ''}) {
      email = normalize(email);
      const now = clock(),
        key = `${clientKey}|${email.toLowerCase()}`;
      if (typeof password !== 'string' || !email || password.length > MAX_PASSWORD_LENGTH) throw fail(400, 'INVALID_CREDENTIALS_REQUEST');
      if (limiter.blocked(key, now)) throw fail(429, 'TOO_MANY_ATTEMPTS');
      const user = await store.findUserByEmail({tenantId, email});
      if (!(await verify(user?.password_hash, password)) || !user) {
        limiter.fail(key, now);
        throw fail(401, 'BAD_CREDENTIALS');
      }
      limiter.reset(key);
      return {user: view(user), ...(await store.createSession({userId: user.user_id, tenantId, nowMs: now, ttlMs: sessionTtlMs}))};
    },
    async logout(token) {
      if (token) await store.revokeSession(token, clock());
    },
    /** Зависимость для createOrderHttpHandler: токен -> проверенный principal или null. */
    async resolveSession(token) {
      const row = await store.resolveSession(token, clock());
      return buildPrincipal(row, {mfaAssumed});
    },
    async me(token) {
      const row = await store.resolveSession(token, clock());
      return row ? view(row) : null;
    }
  };
}
