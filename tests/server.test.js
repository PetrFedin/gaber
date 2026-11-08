import test, {before, after, beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync, readFileSync} from 'node:fs';
import {initialConfig, families, checkConfig} from '../shared/domain.js';
import {estimate} from '../shared/costing.js';

// ---- проверки без базы: всегда выполняются ----
test('клиентский код не импортирует расчёт и нормы', () => {
  for (const f of readdirSync(new URL('../src/', import.meta.url)).filter((f) => /\.(js|jsx)$/.test(f))) {
    const code = readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8');
    assert.ok(!/from\s+['"][^'"]*costing/.test(code), `${f} импортирует shared/costing`);
    assert.ok(!/import[^;]*\bestimate\b[^;]*from/.test(code), `${f} импортирует estimate`);
  }
  assert.ok(!readFileSync(new URL('../shared/domain.js', import.meta.url), 'utf8').includes('price: 1800'));
});
test('checkConfig отбрасывает чужие поля и невозможные сборки', () => {
  const ok = checkConfig({...initialConfig(), price: 1, role: 'admin'});
  assert.equal(ok.config.price, undefined);
  assert.equal(ok.config.role, undefined);
  assert.ok(checkConfig({...initialConfig('chair'), layout: 'left'}).errors.length);
  assert.ok(checkConfig(null).errors.length);
  assert.ok(checkConfig({category: 'x'}).errors.length);
});

// ---- интеграционные тесты: нужна PostgreSQL (TEST_DATABASE_URL) ----
const url = process.env.TEST_DATABASE_URL;
const opts = {skip: url ? false : 'TEST_DATABASE_URL не задан — интеграционные тесты сервера пропущены'};
let app, pool;
const {createPool} = await import('../server/db.js');
const {migrate} = await import('../server/migrate.js');
const {buildApp} = await import('../server/app.js');
const {seed} = await import('../server/seed.js');
const {seedUsers} = await import('../server/seed-data.js');
const creds = (role) => seedUsers.find((u) => u.role === role);

before(async () => {
  if (!url) return;
  pool = createPool(url);
  await migrate(pool);
  app = await buildApp({
    pool,
    config: {
      cookieName: 'gaber_sid',
      cookieSecure: false,
      sessionDays: 1,
      allowedOrigins: ['http://127.0.0.1:4173']
    }
  });
});
after(async () => {
  await app?.close();
  await pool?.end();
});
beforeEach(async () => {
  if (!url) return;
  await pool.query(
    'TRUNCATE request_events, requests, idempotency_keys, rate_profiles, sessions, projects, users RESTART IDENTITY CASCADE'
  );
  await seed(pool);
});

const call = async (method, path, {body, cookie, headers = {}} = {}) => {
  const res = await app.inject({
    method,
    url: path,
    payload: body,
    headers: {...(cookie ? {cookie} : {}), ...headers}
  });
  const set = res.headers['set-cookie'];
  return {
    status: res.statusCode,
    body: res.body ? JSON.parse(res.body) : null,
    headers: res.headers,
    cookie: set ? String(Array.isArray(set) ? set[0] : set).split(';')[0] : undefined
  };
};
const login = async (role) => {
  const r = await call('POST', '/api/auth/login', {
    body: {email: creds(role).email, password: creds(role).password}
  });
  assert.equal(r.status, 200);
  return r.cookie;
};
const register = async (email = 'new.client@example.test') => {
  const r = await call('POST', '/api/auth/register', {body: {email, password: 'a-long-test-passphrase'}});
  assert.equal(r.status, 201);
  return r.cookie;
};
let n = 0;
const key = () => `test-key-${Date.now()}-${n++}`;
const create = (cookie, extra = {}, k = key()) =>
  call('POST', '/api/projects', {
    cookie,
    headers: {'idempotency-key': k},
    body: {config: initialConfig(), ...extra}
  });
// Любое внутреннее поле расчёта не должно встречаться в ответе клиенту.
const FORBIDDEN = [
  'estimate',
  'cost',
  'margin',
  'profit',
  'rows',
  'rate',
  'profileSnapshot',
  'internal',
  'owner'
];
const assertNoInternals = (value) => {
  const text = JSON.stringify(value);
  for (const f of FORBIDDEN)
    assert.ok(!new RegExp(`"${f}[A-Za-z]*"`, 'i').test(text), `утечка поля ${f}: ${text.slice(0, 200)}`);
};

test('вход: регистрация клиентом, cookie httpOnly, me, выход', opts, async () => {
  const r = await call('POST', '/api/auth/register', {
    body: {email: 'A@Example.test', password: 'a-long-test-passphrase'}
  });
  assert.equal(r.status, 201);
  assert.equal(r.body.user.role, 'client');
  const raw = (await app.inject({method: 'GET', url: '/api/auth/me', headers: {cookie: r.cookie}})).body;
  assert.equal(JSON.parse(raw).user.email, 'A@Example.test');
  assert.match(r.headers['set-cookie'], /HttpOnly/i);
  assert.match(r.headers['set-cookie'], /SameSite=Lax/i);
  assert.equal((await call('GET', '/api/auth/me')).body.user, null);
  // почта регистронезависима
  const dup = await call('POST', '/api/auth/register', {
    body: {email: 'a@example.test', password: 'a-long-test-passphrase'}
  });
  assert.equal(dup.status, 409);
  const out = await call('POST', '/api/auth/logout', {cookie: r.cookie});
  assert.equal(out.status, 200);
  assert.equal((await call('GET', '/api/auth/me', {cookie: r.cookie})).body.user, null);
});
test('вход: неверный пароль, короткий пароль, лишние поля и роль нельзя выбрать', opts, async () => {
  const bad = await call('POST', '/api/auth/login', {
    body: {email: creds('manager').email, password: 'wrong-password-1'}
  });
  assert.equal(bad.status, 401);
  assert.equal(bad.cookie, undefined);
  assert.equal(
    (await call('POST', '/api/auth/register', {body: {email: 'x@example.test', password: 'short'}})).status,
    400
  );
  const sneaky = await call('POST', '/api/auth/register', {
    body: {email: 'y@example.test', password: 'a-long-test-passphrase', role: 'manager'}
  });
  // Лишнее поле role отбрасывается схемой, роль всегда client.
  assert.equal(sneaky.status, 201);
  assert.equal(sneaky.body.user.role, 'client');
  const hash = (await pool.query("SELECT password_hash FROM users WHERE role = 'manager'")).rows[0]
    .password_hash;
  assert.match(hash, /^\$argon2id\$/);
});
test('без входа проекты недоступны, чужой Origin отклоняется', opts, async () => {
  assert.equal((await call('GET', '/api/projects')).status, 401);
  assert.equal((await call('GET', '/api/factory/requests')).status, 401);
  const r = await call('POST', '/api/auth/login', {
    headers: {origin: 'https://evil.example'},
    body: {email: creds('client').email, password: creds('client').password}
  });
  assert.equal(r.status, 403);
});

test('объектные права: клиент не читает, не меняет и не удаляет чужой проект', opts, async () => {
  const a = await register('a@example.test'),
    b = await register('b@example.test');
  const p = (await create(a)).body.project;
  assert.equal((await call('GET', `/api/projects/${p.id}`, {cookie: a})).status, 200);
  assert.equal((await call('GET', `/api/projects/${p.id}`, {cookie: b})).status, 404);
  assert.deepEqual((await call('GET', '/api/projects', {cookie: b})).body.projects, []);
  assert.equal((await call('GET', '/api/projects', {cookie: a})).body.projects.length, 1);
  const cfg = {config: initialConfig('chair')};
  assert.equal((await call('POST', `/api/projects/${p.id}/versions`, {cookie: b, body: cfg})).status, 404);
  assert.equal((await call('POST', `/api/projects/${p.id}/submit`, {cookie: b})).status, 404);
  assert.equal((await call('DELETE', `/api/projects/${p.id}`, {cookie: b})).status, 404);
  assert.equal((await call('GET', `/api/projects/${p.id}`, {cookie: a})).body.project.status, 'draft');
  // кабинет фабрики и внутренние данные закрыты для клиента
  for (const [m, path, body] of [
    ['GET', '/api/factory/requests'],
    ['GET', '/api/internal/profile'],
    ['POST', '/api/internal/estimate', {config: initialConfig()}],
    ['POST', `/api/factory/requests/${p.id}/decision`, {decision: 'changes'}]
  ])
    assert.equal((await call(m, path, {cookie: a, body})).status, 403, path);
});

test('клиент не видит себестоимость, маржу и нормы ни в одном ответе', opts, async () => {
  const c = await register();
  const created = await create(c, {submit: true});
  assert.equal(created.status, 201);
  assertNoInternals(created.body);
  assert.ok(created.body.project.price > 0);
  assertNoInternals((await call('GET', '/api/projects', {cookie: c})).body);
  assertNoInternals((await call('GET', `/api/projects/${created.body.project.id}`, {cookie: c})).body);
  const q = await call('POST', '/api/quote', {body: {config: initialConfig()}});
  assert.deepEqual(Object.keys(q.body).sort(), ['catalogVersion', 'illustrative', 'price']);
  // решение менеджера с комментариями: внутренняя заметка клиенту не уходит
  const m = await login('manager');
  const d = await call('POST', `/api/factory/requests/${created.body.project.id}/decision`, {
    cookie: m,
    body: {decision: 'approved', discount: 3, comment: 'Согласовано', internalNote: 'секретная заметка'}
  });
  assert.equal(d.status, 200);
  const mine = (await call('GET', `/api/projects/${created.body.project.id}`, {cookie: c})).body.project;
  assert.equal(mine.status, 'approved');
  assert.equal(mine.quote.discount, 3);
  assert.ok(mine.quote.price < mine.price);
  assertNoInternals(mine);
  assert.ok(!JSON.stringify(mine).includes('секретная'));
  assert.ok(mine.events.some((e) => e.comment === 'Согласовано'));
});
test('персонал получает себестоимость и нормы', opts, async () => {
  const c = await register();
  const id = (await create(c, {submit: true})).body.project.id;
  for (const role of ['manager', 'technologist']) {
    const cookie = await login(role);
    const list = (await call('GET', '/api/factory/requests', {cookie})).body.requests;
    assert.equal(list.length, 1);
    assert.equal(list[0].id, id);
    assert.ok(list[0].estimate.cost > 0 && list[0].estimate.rows.length > 5);
    assert.equal(list[0].owner, 'new.client@example.test');
    const est = await call('POST', '/api/internal/estimate', {cookie, body: {config: initialConfig()}});
    assert.equal(est.body.estimate.cost, list[0].estimate.cost);
    const prof = (await call('GET', '/api/internal/profile', {cookie})).body;
    assert.equal(prof.canEdit, role === 'technologist');
    assert.ok(prof.profile.rates.targetMargin > 0);
  }
});

test('расчёт на сервере даёт те же цифры, что общий модуль и tests/domain.test.js', opts, async () => {
  const m = await login('manager');
  for (const f of families) {
    const cfg = initialConfig(f.id),
      local = estimate(cfg);
    const q = await call('POST', '/api/quote', {body: {config: cfg}});
    assert.equal(q.body.price, local.price, f.id);
    const e = (await call('POST', '/api/internal/estimate', {cookie: m, body: {config: cfg}})).body.estimate;
    assert.equal(e.cost, local.cost);
    assert.equal(e.price, local.price);
    assert.deepEqual(e.rows, local.rows);
    assert.equal(
      e.cost,
      e.rows.reduce((s, r) => s + r.cost, 0)
    );
    assert.ok(e.price > e.cost && e.margin >= 40 && e.illustrative === true);
  }
  const base = initialConfig();
  const wide = await call('POST', '/api/quote', {body: {config: {...base, width: 320}}});
  assert.ok(wide.body.price > (await call('POST', '/api/quote', {body: {config: base}})).body.price);
  const disc = (await call('POST', '/api/internal/estimate', {cookie: m, body: {config: base, discount: 15}}))
    .body.estimate;
  assert.equal(disc.cost, estimate(base).cost);
  assert.equal(disc.requiresApproval, true);
});

test('сервер проверяет конфигурацию и не доверяет цене клиента', opts, async () => {
  const c = await register();
  const bad = await create(c, {config: {...initialConfig('chair'), layout: 'left'}});
  assert.equal(bad.status, 422);
  assert.equal(bad.body.error, 'invalid_config');
  assert.equal((await call('POST', '/api/quote', {body: {config: {category: 'foreign'}}})).status, 422);
  // NaN в JSON превращается в null — это не «поле не задано», а ошибка
  assert.equal((await create(c, {config: {...initialConfig(), width: NaN}})).status, 422);
  // лишние поля тела (price) отбрасываются схемой, цену всегда считает сервер
  const extra = await call('POST', '/api/projects', {
    cookie: c,
    headers: {'idempotency-key': key()},
    body: {config: initialConfig(), price: 1}
  });
  assert.equal(extra.status, 201);
  assert.equal(extra.body.project.price, estimate(initialConfig()).price);
  const ok = await create(c, {config: {...initialConfig(), price: 1, cost: 1}});
  assert.equal(ok.body.project.config.price, undefined);
  assert.equal(ok.body.project.price, estimate(initialConfig()).price);
  assert.equal((await create(c, {image: 'javascript:alert(1)'})).status, 422);
});

test('создание заявки идемпотентно', opts, async () => {
  const c = await register();
  const k = key();
  const first = await create(c, {submit: true}, k),
    again = await create(c, {submit: true}, k);
  assert.equal(first.status, 201);
  assert.equal(again.status, 201);
  assert.equal(again.headers['idempotency-replay'], 'true');
  assert.equal(again.body.project.id, first.body.project.id);
  assert.equal((await call('GET', '/api/projects', {cookie: c})).body.projects.length, 1);
  // тот же ключ с другими данными — отказ, ничего не создаётся
  const other = await create(c, {config: {...initialConfig(), width: 300}, submit: true}, k);
  assert.equal(other.status, 422);
  assert.equal(other.body.error, 'idempotency_key_reuse');
  assert.equal((await call('GET', '/api/projects', {cookie: c})).body.projects.length, 1);
  // без ключа создать нельзя
  const nokey = await call('POST', '/api/projects', {cookie: c, body: {config: initialConfig()}});
  assert.equal(nokey.status, 400);
  // ключ привязан к пользователю
  const d = await register('d@example.test');
  assert.notEqual((await create(d, {submit: true}, k)).body.project.id, first.body.project.id);
});
test('параллельные запросы с одним ключом создают одну заявку', opts, async () => {
  const c = await register();
  const k = key();
  const rs = await Promise.all(Array.from({length: 6}, () => create(c, {submit: true}, k)));
  assert.ok(rs.every((r) => r.status === 201));
  assert.equal(new Set(rs.map((r) => r.body.project.id)).size, 1);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM projects')).rows[0].n, 1);
  assert.equal((await pool.query('SELECT count(*)::int AS n FROM requests')).rows[0].n, 1);
});

test('статусы: draft → requested → changes → новая версия → requested → approved', opts, async () => {
  const c = await register(),
    m = await login('manager');
  const p = (await create(c)).body.project;
  assert.equal(p.status, 'draft');
  // черновик ещё не виден фабрике
  assert.equal((await call('GET', '/api/factory/requests', {cookie: m})).body.requests.length, 0);
  assert.equal(
    (await call('POST', `/api/factory/requests/${p.id}/decision`, {cookie: m, body: {decision: 'approved'}}))
      .status,
    409
  );
  const sub = await call('POST', `/api/projects/${p.id}/submit`, {cookie: c});
  assert.equal(sub.body.project.status, 'requested');
  assert.equal(
    (await call('POST', `/api/projects/${p.id}/submit`, {cookie: c})).headers['idempotency-replay'],
    'true'
  );
  // на рассмотрении версию менять и удалять нельзя
  assert.equal(
    (
      await call('POST', `/api/projects/${p.id}/versions`, {
        cookie: c,
        body: {config: initialConfig('chair')}
      })
    ).status,
    409
  );
  assert.equal((await call('DELETE', `/api/projects/${p.id}`, {cookie: c})).status, 409);
  const ch = await call('POST', `/api/factory/requests/${p.id}/decision`, {
    cookie: m,
    body: {decision: 'changes', comment: 'Уточните ткань'}
  });
  assert.equal(ch.body.project.status, 'changes');
  const v2 = await call('POST', `/api/projects/${p.id}/versions`, {
    cookie: c,
    body: {config: {...initialConfig(), width: 300}}
  });
  assert.equal(v2.status, 201);
  assert.equal(v2.body.project.version, 2);
  assert.equal(v2.body.project.config.width, 300);
  assert.equal(
    (await call('POST', `/api/projects/${p.id}/submit`, {cookie: c})).body.project.status,
    'requested'
  );
  const ok = await call('POST', `/api/factory/requests/${p.id}/decision`, {
    cookie: m,
    body: {decision: 'approved'}
  });
  assert.equal(ok.body.project.status, 'approved');
  assert.equal(
    (await call('POST', `/api/factory/requests/${p.id}/decision`, {cookie: m, body: {decision: 'changes'}}))
      .status,
    409
  );
  assert.equal((await call('POST', `/api/projects/${p.id}/submit`, {cookie: c})).status, 409);
  const labels = (await call('GET', `/api/projects/${p.id}`, {cookie: c})).body.project.events.map(
    (e) => e.label
  );
  assert.deepEqual(labels, [
    'Вариант сохранён',
    'Заявка отправлена',
    'Запрошены уточнения',
    'Сохранена версия 2',
    'Заявка отправлена повторно',
    'Предложение подготовлено'
  ]);
});
test('версии неизменяемы; низкая маржа подтверждается технологом', opts, async () => {
  const c = await register(),
    m = await login('manager'),
    t = await login('technologist');
  const p = (await create(c, {submit: true})).body.project;
  await assert.rejects(
    pool.query('UPDATE project_versions SET price = 1 WHERE project_id = $1', [p.id]),
    /неизменяемы/
  );
  await assert.rejects(
    pool.query('DELETE FROM project_versions WHERE project_id = $1', [p.id]),
    /неизменяемы/
  );
  const low = await call('POST', `/api/factory/requests/${p.id}/decision`, {
    cookie: m,
    body: {decision: 'approved', discount: 20}
  });
  assert.equal(low.status, 403);
  assert.equal(low.body.error, 'needs_technologist');
  assert.equal(
    (
      await call('POST', `/api/factory/requests/${p.id}/decision`, {
        cookie: m,
        body: {decision: 'approved', discount: 31}
      })
    ).status,
    400
  );
  const ok = await call('POST', `/api/factory/requests/${p.id}/decision`, {
    cookie: t,
    body: {decision: 'approved', discount: 20}
  });
  assert.equal(ok.status, 200);
  assert.ok(ok.body.project.internalMargin < 35);
});

test('нормы: меняет только технолог, расчёт использует новую ставку', opts, async () => {
  const m = await login('manager'),
    t = await login('technologist');
  const prof = (await call('GET', '/api/internal/profile', {cookie: t})).body.profile;
  const next = {...prof, rates: {...prof.rates, labor: prof.rates.labor * 2}};
  assert.equal((await call('PUT', '/api/internal/profile', {cookie: m, body: {profile: next}})).status, 403);
  assert.equal(
    (
      await call('PUT', '/api/internal/profile', {
        cookie: t,
        body: {profile: {...next, rates: {...next.rates, labor: -1}}}
      })
    ).status,
    422
  );
  const before = (await call('POST', '/api/quote', {body: {config: initialConfig()}})).body.price;
  // предпросмотр правок не сохраняет их
  const preview = await call('POST', '/api/internal/estimate', {
    cookie: m,
    body: {config: initialConfig(), profile: next}
  });
  assert.ok(preview.body.estimate.price > before);
  assert.equal((await call('POST', '/api/quote', {body: {config: initialConfig()}})).body.price, before);
  assert.equal((await call('PUT', '/api/internal/profile', {cookie: t, body: {profile: next}})).status, 200);
  assert.ok((await call('POST', '/api/quote', {body: {config: initialConfig()}})).body.price > before);
});
