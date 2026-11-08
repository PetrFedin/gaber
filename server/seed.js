import {loadConfig} from './config.js';
import {createPool} from './db.js';
import {migrate} from './migrate.js';
import {hashPassword} from './auth.js';
import {seedUsers} from './seed-data.js';

export async function seed(pool) {
  for (const u of seedUsers)
    await pool.query(
      `INSERT INTO users (email, name, password_hash, role) VALUES ($1, $2, $3, $4)
       ON CONFLICT (lower(email)) DO NOTHING`,
      [u.email, u.name, await hashPassword(u.password), u.role]
    );
}
if (process.argv[1]?.endsWith('seed.js')) {
  if (process.env.NODE_ENV === 'production') throw Error('seed.js запрещён в production');
  const pool = createPool(loadConfig().databaseUrl);
  await migrate(pool);
  await seed(pool);
  console.log(
    'Тестовые пользователи созданы (см. server/seed-data.js):',
    seedUsers.map((u) => u.email).join(', ')
  );
  await pool.end();
}
