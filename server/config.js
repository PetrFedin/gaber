/** Конфигурация процесса из окружения. Секреты в код и репозиторий не попадают. */
export function loadConfig(env = process.env) {
  const production = env.NODE_ENV === 'production';
  const need = (k) => {
    if (!env[k]) throw Error(`Не задана переменная окружения ${k}`);
    return env[k];
  };
  const mfaAssumed = env.GABER_DEV_ASSUME_MFA === '1';
  if (mfaAssumed && production) throw Error('GABER_DEV_ASSUME_MFA запрещён в production');
  const simulateExternalAuthority = env.GABER_DEV_SIMULATE_EXTERNAL_AUTHORITY === '1';
  if (simulateExternalAuthority && production) throw Error('GABER_DEV_SIMULATE_EXTERNAL_AUTHORITY запрещён в production');
  return {
    production,
    mfaAssumed,
    simulateExternalAuthority,
    ordersDatabaseUrl: need('GABER_ORDERS_DATABASE_URL'),
    authDatabaseUrl: need('GABER_AUTH_DATABASE_URL'),
    tenantId: need('GABER_TENANT_ID'),
    host: env.HOST || '127.0.0.1',
    port: Number(env.PORT || 8788),
    allowedOrigins: (env.ALLOWED_ORIGINS || 'http://127.0.0.1:4173,http://localhost:4173')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  };
}
