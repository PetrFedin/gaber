import {readdir, readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import pg from 'pg';
import {hashPassword} from '../auth/passwords.js';
import {devUsers, DEV_TENANT, DEV_FACTORY} from './seed-data.js';

/**
 * Разработческая подготовка базы: миграции 001..N, роли с минимальными правами, вымышленные пользователи.
 * Запускается под суперпользователем ЛОКАЛЬНОЙ одноразовой базы. В production запрещено.
 */
const dir = fileURLToPath(new URL('../migrations/', import.meta.url));
export async function setupDevDatabase({adminUrl, ordersPassword, authPassword, applyMigrations = true}) {
  if (process.env.NODE_ENV === 'production') throw Error('dev setup запрещён в production');
  const pool = new pg.Pool({connectionString: adminUrl, max: 2});
  try {
    if (applyMigrations) {
      await pool.query('CREATE TABLE IF NOT EXISTS public.gaber_dev_migrations(name text PRIMARY KEY)');
      for (const file of (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort()) {
        if ((await pool.query('SELECT 1 FROM public.gaber_dev_migrations WHERE name=$1', [file])).rowCount) continue;
        await pool.query(await readFile(dir + file, 'utf8'));
        await pool.query('INSERT INTO public.gaber_dev_migrations(name) VALUES($1)', [file]);
      }
    }
    // Роль заказов: только то, что требует контракт (см. server/tests/postgres-staging-v007.sql).
    await pool.query(`DO $$ BEGIN
      IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='gaber_runtime_contract') THEN CREATE ROLE gaber_runtime_contract NOLOGIN; END IF;
    END $$;
    GRANT USAGE ON SCHEMA gaber_orders TO gaber_runtime_contract;
    GRANT SELECT,INSERT,UPDATE ON gaber_orders.order_resources TO gaber_runtime_contract;
    GRANT SELECT,INSERT,UPDATE ON gaber_orders.order_heads TO gaber_runtime_contract;
    GRANT SELECT,INSERT ON gaber_orders.order_events TO gaber_runtime_contract;
    GRANT SELECT,INSERT ON gaber_orders.order_factory_assignments TO gaber_runtime_contract;
    GRANT SELECT ON gaber_orders.factory_directory TO gaber_runtime_contract`);
    for (const [name, group, password] of [
      ['gaber_app_orders', 'gaber_runtime_contract', ordersPassword],
      ['gaber_app_auth', 'gaber_auth_runtime', authPassword]
    ]) {
      const exists = (await pool.query('SELECT 1 FROM pg_roles WHERE rolname=$1', [name])).rowCount;
      const verb = exists ? 'ALTER' : 'CREATE';
      const ddl = (
        await pool.query(
          `SELECT format('%s ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE', $1::text, $2::text, $3::text) AS ddl`,
          [verb, name, String(password)]
        )
      ).rows[0].ddl;
      await pool.query(ddl);
      await pool.query(`GRANT ${group} TO ${name}`);
    }
    // Вымышленная фабрика в доверенном реестре (в реальной системе это отдельный onboarding).
    await pool.query(
      `INSERT INTO gaber_orders.factory_directory(tenant_id,factory_id,status,verified_by,verified_at)
       VALUES($1,$2,'approved','DEV-SEED',now()) ON CONFLICT DO NOTHING`,
      [DEV_TENANT, DEV_FACTORY]
    );
    for (const u of devUsers)
      await pool.query(
        `INSERT INTO gaber_auth.users(user_id,tenant_id,email,name,password_hash,role,factory_id)
         VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`,
        ['U-dev-' + u.role, DEV_TENANT, u.email, u.name, await hashPassword(u.password), u.role, u.factoryId ?? null]
      );
  } finally {
    await pool.end();
  }
}
if (process.argv[1]?.endsWith('setup.mjs')) {
  const e = process.env;
  await setupDevDatabase({
    adminUrl: e.GABER_DEV_ADMIN_DATABASE_URL,
    ordersPassword: e.GABER_DEV_DB_ORDERS_PASSWORD,
    authPassword: e.GABER_DEV_DB_AUTH_PASSWORD,
    // В CI миграции уже применены скриптом verify-postgres-staging.sh
    applyMigrations: e.GABER_DEV_SKIP_MIGRATIONS !== '1'
  });
  console.log('Готово: миграции, DB-роли и вымышленные пользователи (см. server/dev/seed-data.js)');
}
