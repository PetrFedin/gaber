import pg from 'pg';
import {loadConfig} from './config.js';
import {wirePostgresOrderJournal} from './orderJournalWiring.js';
import {createPostgresOrderRepository} from './postgresOrderRepository.js';
import {createDevStockService} from './devStockService.js';
import {createPgAuthStore} from './auth/authStore.js';
import {createAuthService} from './auth/authService.js';
import {createGaberHttpServer} from './httpServer.js';
import {createDevExternalAuthority} from './devExternalAuthority.js';

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
  mfaAssumed: config.mfaAssumed,
  encKey: config.authEncKey
});
// Падает при запуске, если флаг включён в production или для tenant не из TENANT-DEV*/TENANT-TEST*.
const simulated = config.simulateExternalAuthority
  ? createDevExternalAuthority({production: config.production, tenantId: config.tenantId})
  : null;
const server = createGaberHttpServer({
  serverInfo: {devMfaAssumed: config.mfaAssumed, devSimulatedAuthority: Boolean(simulated)},
  journal: wirePostgresOrderJournal({pool: ordersPool, simulatedExternalAuthority: simulated}),
  devStockService:simulated ? createDevStockService({
    repository:createPostgresOrderRepository({pool:ordersPool}),enabled:true
  }) : null,
  authService,
  allowedOrigins: config.allowedOrigins,
  staticDir: config.staticDir,
  secureCookie: config.production
});
server.listen(config.port, config.host, () => {
  console.log(`GABER server: http://${config.host}:${config.port} (tenant ${config.tenantId})`);
  if (simulated) console.warn('ВНИМАНИЕ: DEV-симулятор внешних полномочий включён (производство, отгрузка, доставка без банка и перевозчика). Только для разработки.');
  if (config.mfaAssumed) console.warn('ВНИМАНИЕ: GABER_DEV_ASSUME_MFA=1, MFA считается пройденным. Только для разработки.');
});
const stop = () => server.close(async () => {
  await Promise.all([ordersPool.end(), authPool.end()]);
  process.exit(0);
});
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
