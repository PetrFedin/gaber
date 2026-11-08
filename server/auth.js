import argon2 from 'argon2';
import {createHash, randomBytes} from 'node:crypto';

export const hashPassword = (password) => argon2.hash(password, {type: argon2.argon2id});
// Заглушка для постоянного времени ответа, когда пользователя нет.
let dummy;
export async function verifyPassword(hash, password) {
  if (!hash) {
    dummy ??= await hashPassword('gaber-dummy-password');
    await argon2.verify(dummy, password).catch(() => false);
    return false;
  }
  return argon2.verify(hash, password).catch(() => false);
}
export const sha256 = (s) => createHash('sha256').update(s).digest('hex');
export const newToken = () => randomBytes(32).toString('base64url');

export async function createSession(db, userId, days) {
  const token = newToken();
  await db.query(
    `INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, now() + make_interval(days => $3))`,
    [sha256(token), userId, days]
  );
  return token;
}
export async function userBySession(db, token) {
  if (!token || typeof token !== 'string' || token.length > 100) return null;
  const {rows} = await db.query(
    `SELECT u.id, u.email, u.name, u.role FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > now()`,
    [sha256(token)]
  );
  return rows[0] || null;
}
export const destroySession = (db, token) =>
  db.query('DELETE FROM sessions WHERE token_hash = $1', [sha256(token || '')]);

export const isStaff = (user) => user?.role === 'manager' || user?.role === 'technologist';

// Простой ограничитель попыток входа в памяти процесса (для одного экземпляра сервера).
export function loginLimiter({max = 8, windowMs = 10 * 60 * 1000} = {}) {
  const hits = new Map();
  const fresh = (k, now) => (hits.get(k) || []).filter((t) => now - t < windowMs);
  return {
    blocked: (k, now = Date.now()) => fresh(k, now).length >= max,
    fail(k, now = Date.now()) {
      hits.set(k, [...fresh(k, now), now]);
      if (hits.size > 5000) hits.clear();
    },
    reset: (k) => hits.delete(k)
  };
}
