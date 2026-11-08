import {loadConfig} from './config.js';
import {createPool} from './db.js';
import {migrate} from './migrate.js';
import {buildApp} from './app.js';

const config = loadConfig();
const pool = createPool(config.databaseUrl);
const applied = await migrate(pool);
const app = await buildApp({pool, config, logger: {level: config.production ? 'info' : 'warn'}});
if (applied.length) console.log('Применены миграции:', applied.join(', '));
await app.listen({port: config.port, host: config.host});
console.log(`GABER API: http://${config.host}:${config.port}`);
const stop = async () => {
  await app.close();
  await pool.end();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
