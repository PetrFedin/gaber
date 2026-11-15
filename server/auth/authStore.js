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
        `SELECT u.user_id,u.tenant_id,u.email,u.name,u.role,u.factory_id,u.totp_enrolled_at,s.expires_at,s.mfa_verified_at
         FROM gaber_auth.sessions s JOIN gaber_auth.users u ON u.user_id=s.user_id AND u.tenant_id=s.tenant_id
         WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>$2 AND u.disabled_at IS NULL`,
        [sha256(token), at(nowMs)]
      );
      return q.rows[0] ?? null;
    },
    // ---- MFA, ограничитель попыток и журнал событий ----
    async getUserSecret({tenantId, userId}) {
      const q = await pool.query(
        'SELECT user_id,email,totp_secret_enc,totp_enrolled_at,totp_last_step FROM gaber_auth.users WHERE tenant_id=$1 AND user_id=$2 AND disabled_at IS NULL',
        [tenantId, userId]
      );
      return q.rows[0] ?? null;
    },
    async setPendingTotp({userId, enc}) {
      const q = await pool.query(
        'UPDATE gaber_auth.users SET totp_secret_enc=$2 WHERE user_id=$1 AND totp_enrolled_at IS NULL',
        [userId, enc]
      );
      return q.rowCount === 1;
    },
    async confirmTotp({userId, step}) {
      const q = await pool.query(
        'UPDATE gaber_auth.users SET totp_enrolled_at=now(), totp_last_step=$2 WHERE user_id=$1 AND totp_enrolled_at IS NULL AND totp_secret_enc IS NOT NULL',
        [userId, step]
      );
      return q.rowCount === 1;
    },
    // Атомарно: код с шагом не больше уже принятого отвергается (защита от повторного использования).
    async advanceTotpStep({userId, step}) {
      const q = await pool.query(
        'UPDATE gaber_auth.users SET totp_last_step=$2 WHERE user_id=$1 AND totp_enrolled_at IS NOT NULL AND totp_last_step<$2',
        [userId, step]
      );
      return q.rowCount === 1;
    },
    async markSessionMfa(token, nowMs) {
      await pool.query(
        'UPDATE gaber_auth.sessions SET mfa_verified_at=$2 WHERE token_hash=$1 AND revoked_at IS NULL',
        [sha256(String(token)), at(nowMs)]
      );
    },
    async countAttempts(key, sinceMs) {
      const q = await pool.query('SELECT count(*)::int AS n FROM gaber_auth.login_attempts WHERE key=$1 AND at>$2', [key, at(sinceMs)]);
      return q.rows[0].n;
    },
    async addAttempt(key, nowMs) {
      await pool.query('INSERT INTO gaber_auth.login_attempts(key,at) VALUES($1,$2)', [key, at(nowMs)]);
    },
    async clearAttempts(key) {
      await pool.query('DELETE FROM gaber_auth.login_attempts WHERE key=$1', [key]);
    },
    async recordEvent({tenantId, userId = null, event, ip = null, detail = {}}) {
      await pool.query('INSERT INTO gaber_auth.auth_events(tenant_id,user_id,event,ip,detail) VALUES($1,$2,$3,$4,$5)', [tenantId, userId, event, ip, detail]);
    },
    async revokeSession(token, nowMs) {
      await pool.query(
        'UPDATE gaber_auth.sessions SET revoked_at=$2 WHERE token_hash=$1 AND revoked_at IS NULL',
        [sha256(String(token)), at(nowMs)]
      );
    }
  };
}
