import pg from 'pg';
import {loadConfig} from './config.js';
import {wirePostgresOrderJournal} from './orderJournalWiring.js';
import {createPgAuthStore} from './auth/authStore.js';
import {createAuthService} from './auth/authService.js';
import {createGaberHttpServer} from './httpServer.js';

/**
 * Точка запуска сервера. Две раздельные DB-роли: заказы (RLS по tenant) и вход/сессии.
 * PRODUCTION HOLD: сервер для локальной разработки и staging, не для реальных заказов.
 */
const config = loadConfig();
const ordersPool = new pg.Pool({connectionString: config.ordersDatabaseUrl, max: 10});
const authPool = new pg.Pool({connectionString: config.authDatabaseUrl, max: 5});
const authService = createAuthService({
  store: createPgAuthStore({pool: authPool}),
  tenantId: config.tenantId,
  mfaAssumed: config.mfaAssumed
});
const server = createGaberHttpServer({
  journal: wirePostgresOrderJournal({pool: ordersPool}),
  authService,
  allowedOrigins: config.allowedOrigins,
  secureCookie: config.production
});
server.listen(config.port, config.host, () => {
  console.log(`GABER server: http://${config.host}:${config.port} (tenant ${config.tenantId})`);
  if (config.mfaAssumed) console.warn('ВНИМАНИЕ: GABER_DEV_ASSUME_MFA=1, MFA считается пройденным. Только для разработки.');
});
const stop = () => server.close(async () => {
  await Promise.all([ordersPool.end(), authPool.end()]);
  process.exit(0);
});
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
