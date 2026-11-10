import {createHash, randomBytes, randomUUID} from 'node:crypto';

export const sha256 = (value) => createHash('sha256').update(value).digest('hex');
export const newToken = () => randomBytes(32).toString('base64url');

/**
 * PostgreSQL-хранилище пользователей и сессий. Работает под отдельной DB-ролью gaber_auth_runtime,
 * у роли заказов (gaber_runtime_contract) к хешам паролей доступа нет. В базе лежит только SHA-256 токена.
 */
export function createPgAuthStore({pool}) {
  if (typeof pool?.query !== 'function') throw TypeError('INVALID_AUTH_POOL');
  const at = (ms) => new Date(ms).toISOString();
  return {
    async createUser({tenantId, email, name, passwordHash, role, factoryId = null}) {
      const userId = 'U-' + randomUUID();
      const q = await pool.query(
        `INSERT INTO gaber_auth.users (user_id,tenant_id,email,name,password_hash,role,factory_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING
         RETURNING user_id,tenant_id,email,name,role,factory_id`,
        [userId, tenantId, email, name, passwordHash, role, factoryId]
      );
      return q.rows[0] ?? null;
    },
    async findUserByEmail({tenantId, email}) {
      const q = await pool.query(
        `SELECT user_id,tenant_id,email,name,role,factory_id,password_hash
         FROM gaber_auth.users WHERE tenant_id=$1 AND lower(email)=lower($2) AND disabled_at IS NULL`,
        [tenantId, email]
      );
      return q.rows[0] ?? null;
    },
    async createSession({userId, tenantId, nowMs, ttlMs}) {
      const token = newToken();
      await pool.query(
        `INSERT INTO gaber_auth.sessions (token_hash,user_id,tenant_id,created_at,expires_at)
         VALUES ($1,$2,$3,$4,$5)`,
        [sha256(token), userId, tenantId, at(nowMs), at(nowMs + ttlMs)]
      );
      return {token, expiresAtMs: nowMs + ttlMs};
    },
    async resolveSession(token, nowMs) {
      if (typeof token !== 'string' || token.length > 256) return null;
      const q = await pool.query(
        `SELECT u.user_id,u.tenant_id,u.email,u.name,u.role,u.factory_id,s.expires_at,s.mfa_verified_at
         FROM gaber_auth.sessions s JOIN gaber_auth.users u ON u.user_id=s.user_id AND u.tenant_id=s.tenant_id
         WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>$2 AND u.disabled_at IS NULL`,
        [sha256(token), at(nowMs)]
      );
      return q.rows[0] ?? null;
    },
    async revokeSession(token, nowMs) {
      await pool.query(
        'UPDATE gaber_auth.sessions SET revoked_at=$2 WHERE token_hash=$1 AND revoked_at IS NULL',
        [sha256(String(token)), at(nowMs)]
      );
    }
  };
}
