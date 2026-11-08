const env = process.env;
export function loadConfig(overrides = {}) {
  const production = env.NODE_ENV === 'production';
  const port = Number(env.PORT || 8787);
  const cfg = {
    production,
    port,
    host: env.HOST || '127.0.0.1',
    databaseUrl: env.DATABASE_URL || '',
    cookieName: 'gaber_sid',
    cookieSecure: env.COOKIE_SECURE ? env.COOKIE_SECURE === 'true' : production,
    sessionDays: 14,
    // Источники, с которых разрешены изменяющие запросы с cookie (защита от CSRF поверх SameSite=Lax).
    allowedOrigins: (env.ALLOWED_ORIGINS || 'http://127.0.0.1:4173,http://localhost:4173')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    ...overrides
  };
  if (!cfg.databaseUrl) throw Error('Не задан DATABASE_URL (см. .env.example)');
  return cfg;
}
