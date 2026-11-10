/**
 * Преобразует проверенную строку сессии в principal для accessPolicy/journal.
 * Роль всегда берётся из базы, а не из запроса. Для client subject совпадает с clientId,
 * для factory factoryId берётся из учётной записи (допуск фабрики затем проверяет доверенный реестр).
 */
export const AUTH_ROLES = Object.freeze(['client', 'factory', 'partner']);
export function buildPrincipal(row, {mfaAssumed = false} = {}) {
  if (!row || !AUTH_ROLES.includes(row.role)) return null;
  const expires = new Date(row.expires_at).getTime();
  const principal = {
    authenticated: true,
    identitySource: 'server-session',
    subject: row.user_id,
    tenantId: row.tenant_id,
    roles: [row.role],
    sessionExpiresAtMs: expires,
    // Настоящий MFA ещё не реализован: без dev-флага действия партнёра и фабрики с записью будут отклонены политикой.
    mfaVerified: Boolean(row.mfa_verified_at) || mfaAssumed
  };
  if (row.role === 'client') principal.clientId = row.user_id;
  if (row.role === 'factory') principal.factoryId = row.factory_id;
  return principal;
}
