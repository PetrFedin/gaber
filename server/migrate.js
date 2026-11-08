import {readdir, readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {tx} from './db.js';
const dir = fileURLToPath(new URL('./migrations/', import.meta.url));
// Применяет *.sql по порядку имён; каждая миграция в своей транзакции, повторный запуск безопасен.
export async function migrate(pool) {
  await tx(pool, async (c) => {
    await c.query('SELECT pg_advisory_xact_lock(7466001)');
    await c.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())'
    );
  });
  const applied = [];
  for (const file of (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort()) {
    await tx(pool, async (c) => {
      await c.query('SELECT pg_advisory_xact_lock(7466001)');
      const done = await c.query('SELECT 1 FROM schema_migrations WHERE name = $1', [file]);
      if (done.rowCount) return;
      await c.query(await readFile(dir + file, 'utf8'));
      await c.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      applied.push(file);
    });
  }
  return applied;
}
