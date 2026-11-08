import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import {createHash} from 'node:crypto';
import {tx} from './db.js';
import {
  hashPassword,
  verifyPassword,
  createSession,
  userBySession,
  destroySession,
  isStaff,
  loginLimiter
} from './auth.js';
import {
  activeProfile,
  loadProject,
  priceConfig,
  cleanImage,
  viewProject,
  eventsFor,
  SELECT_PROJECT
} from './projects.js';
import {applyDiscount, publicQuote, validProfile, rateDefinitions, estimate} from '../shared/costing.js';
import {fabrics} from '../shared/domain.js';

const uuid = {type: 'string', format: 'uuid'};
const idParams = {type: 'object', required: ['id'], properties: {id: uuid}};
const keyPattern = /^[A-Za-z0-9_.:-]{8,128}$/;

export async function buildApp({pool, config, logger = false}) {
  const app = Fastify({logger, bodyLimit: 1_500_000});
  await app.register(cookie);
  app.decorateRequest('user', null);
  const limiter = loginLimiter();

  // Единый формат ошибок; подробности внутренних сбоев наружу не отдаём.
  app.setErrorHandler((err, req, reply) => {
    if (err.validation) return reply.code(400).send({error: 'bad_request', message: err.message});
    if (err.statusCode && err.statusCode < 500)
      return reply.code(err.statusCode).send({error: 'bad_request', message: err.message});
    req.log.error(err);
    reply.code(500).send({error: 'server_error', message: 'Внутренняя ошибка сервера'});
  });
  app.setNotFoundHandler((req, reply) => reply.code(404).send({error: 'not_found', message: 'Не найдено'}));

  // Сессия из httpOnly-cookie + проверка источника для изменяющих запросов.
  app.addHook('onRequest', async (req, reply) => {
    reply.header('Cache-Control', 'no-store');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const origin = req.headers.origin;
      if (origin && !config.allowedOrigins.includes(origin))
        return reply.code(403).send({error: 'forbidden_origin', message: 'Источник запроса не разрешён'});
    }
    req.user = await userBySession(pool, req.cookies?.[config.cookieName]);
  });

  const needUser = async (req, reply) => {
    if (!req.user) return reply.code(401).send({error: 'unauthorized', message: 'Требуется вход'});
  };
  const needStaff = async (req, reply) => {
    if (!req.user) return reply.code(401).send({error: 'unauthorized', message: 'Требуется вход'});
    if (!isStaff(req.user)) return reply.code(403).send({error: 'forbidden', message: 'Недостаточно прав'});
  };
  const publicUser = (u) => ({id: u.id, email: u.email, name: u.name, role: u.role});
  const setSession = (reply, token) =>
    reply.setCookie(config.cookieName, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: config.cookieSecure,
      path: '/',
      maxAge: config.sessionDays * 86400
    });

  app.get('/api/health', async () => ({ok: true}));

  // ---------- вход ----------
  const credentials = {
    type: 'object',
    required: ['email', 'password'],
    additionalProperties: false,
    properties: {
      email: {type: 'string', format: 'email', maxLength: 254},
      password: {type: 'string', minLength: 1, maxLength: 200},
      name: {type: 'string', maxLength: 80}
    }
  };
  app.post('/api/auth/register', {schema: {body: credentials}}, async (req, reply) => {
    const {email, password, name = ''} = req.body;
    if (password.length < 10)
      return reply.code(400).send({error: 'weak_password', message: 'Пароль: не короче 10 символов'});
    const hash = await hashPassword(password);
    // Публичная регистрация создаёт только клиентов; роли персонала выдаются вне API.
    const {rows} = await pool.query(
      `INSERT INTO users (email, name, password_hash, role) VALUES ($1, $2, $3, 'client')
       ON CONFLICT DO NOTHING RETURNING id, email, name, role`,
      [email.trim(), name.trim(), hash]
    );
    if (!rows[0])
      return reply.code(409).send({error: 'email_taken', message: 'Эта почта уже зарегистрирована'});
    setSession(reply, await createSession(pool, rows[0].id, config.sessionDays));
    return reply.code(201).send({user: publicUser(rows[0])});
  });
  app.post('/api/auth/login', {schema: {body: credentials}}, async (req, reply) => {
    const email = req.body.email.trim().toLowerCase(),
      key = `${req.ip}|${email}`;
    if (limiter.blocked(key))
      return reply.code(429).send({error: 'too_many_attempts', message: 'Слишком много попыток, подождите'});
    const {rows} = await pool.query(
      'SELECT id, email, name, role, password_hash FROM users WHERE lower(email) = $1',
      [email]
    );
    const ok = await verifyPassword(rows[0]?.password_hash, req.body.password);
    if (!ok) {
      limiter.fail(key);
      return reply.code(401).send({error: 'bad_credentials', message: 'Неверная почта или пароль'});
    }
    limiter.reset(key);
    setSession(reply, await createSession(pool, rows[0].id, config.sessionDays));
    return {user: publicUser(rows[0])};
  });
  app.post('/api/auth/logout', async (req, reply) => {
    await destroySession(pool, req.cookies?.[config.cookieName]);
    reply.clearCookie(config.cookieName, {path: '/'});
    return {ok: true};
  });
  app.get('/api/auth/me', async (req) => ({user: req.user ? publicUser(req.user) : null}));

  // ---------- публичная цена: только price, без себестоимости и норм ----------
  app.post(
    '/api/quote',
    {schema: {body: {type: 'object', required: ['config'], properties: {config: {type: 'object'}}}}},
    async (req, reply) => {
      const r = priceConfig(req.body.config, await activeProfile(pool));
      if (!r.config) return reply.code(422).send({error: 'invalid_config', details: r.errors});
      return publicQuote(r.estimate);
    }
  );

  // ---------- проекты клиента ----------
  const ownProjects = async (userId) => {
    const {rows} = await pool.query(
      SELECT_PROJECT + ' AND p.owner_id = $1 ORDER BY p.created_at DESC LIMIT 100',
      [userId]
    );
    const ev = await eventsFor(
      pool,
      rows.map((r) => r.request_id),
      false
    );
    return rows.map((r) => viewProject(r, ev.get(r.request_id), false));
  };
  app.get('/api/projects', {preHandler: needUser}, async (req) => ({
    projects: await ownProjects(req.user.id)
  }));
  app.get('/api/projects/:id', {preHandler: needUser, schema: {params: idParams}}, async (req, reply) => {
    // Чужой проект неотличим от несуществующего.
    const p = await loadProject(pool, req.params.id, {ownerId: req.user.id});
    return p ? {project: p} : reply.code(404).send({error: 'not_found', message: 'Проект не найден'});
  });

  const projectBody = {
    type: 'object',
    required: ['config'],
    additionalProperties: false,
    properties: {
      name: {type: 'string', maxLength: 120},
      config: {type: 'object'},
      image: {type: ['string', 'null']},
      submit: {type: 'boolean'}
    }
  };
  const bodyHash = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
  const invalid = (reply, r) => reply.code(422).send({error: 'invalid_config', details: r.errors});

  // Идемпотентное создание: тот же ключ и тело -> тот же ответ, другое тело -> 422.
  app.post('/api/projects', {preHandler: needUser, schema: {body: projectBody}}, async (req, reply) => {
    const key = req.headers['idempotency-key'];
    if (typeof key !== 'string' || !keyPattern.test(key))
      return reply
        .code(400)
        .send({error: 'idempotency_key_required', message: 'Нужен заголовок Idempotency-Key'});
    const profile = await activeProfile(pool),
      priced = priceConfig(req.body.config, profile);
    if (!priced.config) return invalid(reply, priced);
    const submit = req.body.submit === true,
      image = req.body.image ? cleanImage(req.body.image) : null;
    if (req.body.image && !image)
      return reply
        .code(422)
        .send({error: 'invalid_image', message: 'Неверное или слишком большое изображение'});
    const hash = bodyHash({name: req.body.name?.trim() || null, config: priced.config, submit, image});
    const result = await tx(pool, async (db) => {
      const ins = await db.query(
        `INSERT INTO idempotency_keys (user_id, key, request_hash) VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING RETURNING key`,
        [req.user.id, key, hash]
      );
      if (!ins.rowCount) {
        const {rows} = await db.query(
          'SELECT request_hash, response_status, response_body FROM idempotency_keys WHERE user_id = $1 AND key = $2',
          [req.user.id, key]
        );
        if (rows[0].request_hash !== hash)
          return {
            status: 422,
            body: {error: 'idempotency_key_reuse', message: 'Ключ уже использован с другими данными'}
          };
        return {status: rows[0].response_status, body: rows[0].response_body, replay: true};
      }
      const n = (
        await db.query(
          `SELECT count(*)::int AS n FROM projects p JOIN requests r ON r.project_id = p.id
           JOIN project_versions v ON v.id = r.version_id
           WHERE p.owner_id = $1 AND v.config->>'category' = $2`,
          [req.user.id, priced.config.category]
        )
      ).rows[0].n;
      const name = req.body.name?.trim() || `${priced.family.collection} · вариант ${n + 1}`;
      const pr = await db.query('INSERT INTO projects (owner_id, name) VALUES ($1, $2) RETURNING id', [
        req.user.id,
        name
      ]);
      const projectId = pr.rows[0].id;
      const ver = await db.query(
        `INSERT INTO project_versions (project_id, version, config, catalog_version, price, estimate, image, created_by)
         VALUES ($1, 1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [
          projectId,
          priced.config,
          priced.estimate.catalogVersion,
          priced.estimate.price,
          priced.estimate,
          image,
          req.user.id
        ]
      );
      const status = submit ? 'requested' : 'draft';
      const rq = await db.query(
        `INSERT INTO requests (project_id, version_id, status) VALUES ($1, $2, $3) RETURNING id`,
        [projectId, ver.rows[0].id, status]
      );
      await db.query(
        `INSERT INTO request_events (request_id, actor_id, from_status, to_status, label) VALUES ($1, $2, NULL, 'draft', 'Вариант сохранён')`,
        [rq.rows[0].id, req.user.id]
      );
      if (submit)
        await db.query(
          `INSERT INTO request_events (request_id, actor_id, from_status, to_status, label) VALUES ($1, $2, 'draft', 'requested', 'Заявка отправлена')`,
          [rq.rows[0].id, req.user.id]
        );
      const body = {project: await loadProject(db, projectId, {ownerId: req.user.id})};
      await db.query(
        'UPDATE idempotency_keys SET response_status = 201, response_body = $3 WHERE user_id = $1 AND key = $2',
        [req.user.id, key, body]
      );
      return {status: 201, body};
    });
    if (result.replay) reply.header('Idempotency-Replay', 'true');
    return reply.code(result.status).send(result.body);
  });

  // Новая неизменяемая версия: допустима, пока заявка не на рассмотрении.
  app.post(
    '/api/projects/:id/versions',
    {
      preHandler: needUser,
      schema: {
        params: idParams,
        body: {
          type: 'object',
          required: ['config'],
          additionalProperties: false,
          properties: {config: {type: 'object'}, image: {type: ['string', 'null']}}
        }
      }
    },
    async (req, reply) => {
      const priced = priceConfig(req.body.config, await activeProfile(pool));
      if (!priced.config) return invalid(reply, priced);
      const image = req.body.image ? cleanImage(req.body.image) : null;
      if (req.body.image && !image)
        return reply
          .code(422)
          .send({error: 'invalid_image', message: 'Неверное или слишком большое изображение'});
      const out = await tx(pool, async (db) => {
        const cur = await loadProject(db, req.params.id, {ownerId: req.user.id, lock: true});
        if (!cur) return null;
        if (!['draft', 'changes'].includes(cur.status)) return {conflict: true};
        const ver = await db.query(
          `INSERT INTO project_versions (project_id, version, config, catalog_version, price, estimate, image, created_by)
           VALUES ($1, (SELECT max(version) + 1 FROM project_versions WHERE project_id = $1), $2, $3, $4, $5, $6, $7)
           RETURNING id, version`,
          [
            cur.id,
            priced.config,
            priced.estimate.catalogVersion,
            priced.estimate.price,
            priced.estimate,
            image,
            req.user.id
          ]
        );
        const rq = await db.query(
          'UPDATE requests SET version_id = $2, updated_at = now() WHERE project_id = $1 RETURNING id, status',
          [cur.id, ver.rows[0].id]
        );
        await db.query(
          `INSERT INTO request_events (request_id, actor_id, from_status, to_status, label)
           VALUES ($1, $2, $3, $3, $4)`,
          [rq.rows[0].id, req.user.id, rq.rows[0].status, `Сохранена версия ${ver.rows[0].version}`]
        );
        return {project: await loadProject(db, cur.id, {ownerId: req.user.id})};
      });
      if (!out) return reply.code(404).send({error: 'not_found', message: 'Проект не найден'});
      if (out.conflict)
        return reply
          .code(409)
          .send({error: 'locked', message: 'Заявка на рассмотрении или принята — версию изменить нельзя'});
      return reply.code(201).send(out);
    }
  );

  // Отправка заявки: draft|changes -> requested. Повтор безопасен: уже отправленная возвращается как есть.
  app.post(
    '/api/projects/:id/submit',
    {preHandler: needUser, schema: {params: idParams}},
    async (req, reply) => {
      const out = await tx(pool, async (db) => {
        const cur = await loadProject(db, req.params.id, {ownerId: req.user.id, lock: true});
        if (!cur) return null;
        if (cur.status === 'requested') return {project: cur, replay: true};
        if (cur.status === 'approved') return {conflict: true};
        const rq = await db.query(
          `UPDATE requests SET status = 'requested', updated_at = now() WHERE project_id = $1 RETURNING id`,
          [cur.id]
        );
        await db.query(
          `INSERT INTO request_events (request_id, actor_id, from_status, to_status, label)
         VALUES ($1, $2, $3, 'requested', $4)`,
          [
            rq.rows[0].id,
            req.user.id,
            cur.status,
            cur.status === 'changes' ? 'Заявка отправлена повторно' : 'Заявка отправлена'
          ]
        );
        return {project: await loadProject(db, cur.id, {ownerId: req.user.id})};
      });
      if (!out) return reply.code(404).send({error: 'not_found', message: 'Проект не найден'});
      if (out.conflict)
        return reply.code(409).send({error: 'locked', message: 'Предложение уже подготовлено'});
      if (out.replay) reply.header('Idempotency-Replay', 'true');
      return {project: out.project};
    }
  );

  app.delete('/api/projects/:id', {preHandler: needUser, schema: {params: idParams}}, async (req, reply) => {
    const out = await tx(pool, async (db) => {
      const cur = await loadProject(db, req.params.id, {ownerId: req.user.id, lock: true});
      if (!cur) return null;
      if (!['draft', 'changes'].includes(cur.status)) return {conflict: true};
      await db.query('UPDATE projects SET deleted_at = now() WHERE id = $1', [cur.id]);
      return {ok: true};
    });
    if (!out) return reply.code(404).send({error: 'not_found', message: 'Проект не найден'});
    if (out.conflict)
      return reply
        .code(409)
        .send({error: 'locked', message: 'Заявку на рассмотрении или принятую удалить нельзя'});
    return out;
  });

  // ---------- кабинет фабрики: менеджер и технолог ----------
  app.get('/api/factory/requests', {preHandler: needStaff}, async () => {
    const {rows} = await pool.query(
      SELECT_PROJECT + " AND r.status <> 'draft' ORDER BY r.updated_at DESC LIMIT 200"
    );
    const ev = await eventsFor(
      pool,
      rows.map((r) => r.request_id),
      true
    );
    return {requests: rows.map((r) => viewProject(r, ev.get(r.request_id), true))};
  });
  app.post(
    '/api/factory/requests/:id/decision',
    {
      preHandler: needStaff,
      schema: {
        params: idParams,
        body: {
          type: 'object',
          required: ['decision'],
          additionalProperties: false,
          properties: {
            decision: {enum: ['approved', 'changes']},
            discount: {type: 'number', minimum: 0, maximum: 30},
            comment: {type: 'string', maxLength: 1000},
            internalNote: {type: 'string', maxLength: 1000}
          }
        }
      }
    },
    async (req, reply) => {
      const {decision, discount = 0, comment = '', internalNote = ''} = req.body;
      const out = await tx(pool, async (db) => {
        const cur = await loadProject(db, req.params.id, {staff: true, lock: true});
        if (!cur) return null;
        if (cur.status !== 'requested') return {conflict: true};
        let quote = null;
        if (decision === 'approved') {
          quote = applyDiscount(cur.estimate, discount);
          // Низкая маржа: решение остаётся за технологом.
          if (quote.requiresApproval && req.user.role !== 'technologist') return {lowMargin: true};
        }
        await db.query(
          `UPDATE requests SET status = $2, quote_price = $3, quote_discount = $4, internal_margin = $5, updated_at = now()
           WHERE project_id = $1`,
          [
            cur.id,
            decision,
            quote?.finalPrice ?? null,
            quote ? discount : null,
            quote ? quote.margin.toFixed(2) : null
          ]
        );
        const rq = await db.query('SELECT id FROM requests WHERE project_id = $1', [cur.id]);
        await db.query(
          `INSERT INTO request_events (request_id, actor_id, from_status, to_status, label, comment, internal_note)
           VALUES ($1, $2, 'requested', $3, $4, $5, $6)`,
          [
            rq.rows[0].id,
            req.user.id,
            decision,
            decision === 'approved' ? 'Предложение подготовлено' : 'Запрошены уточнения',
            comment || null,
            internalNote || null
          ]
        );
        return {project: await loadProject(db, cur.id, {staff: true})};
      });
      if (!out) return reply.code(404).send({error: 'not_found', message: 'Заявка не найдена'});
      if (out.conflict)
        return reply
          .code(409)
          .send({error: 'not_requested', message: 'Решение возможно только по заявке на рассмотрении'});
      if (out.lowMargin)
        return reply
          .code(403)
          .send({error: 'needs_technologist', message: 'Маржа ниже 35%: предложение подтверждает технолог'});
      return out;
    }
  );

  // ---------- внутренние данные: нормы и калькуляция ----------
  const knownFabrics = new Set(fabrics.map((f) => f.id));
  const cleanProfile = (p) => {
    if (!p || typeof p !== 'object' || !validProfile(p)) return null;
    const text = (v) => String(v ?? '').slice(0, 200);
    const obj = (o, valid) =>
      Object.fromEntries(
        Object.entries(o || {})
          .filter(([k]) => valid(k))
          .map(([k, v]) => [k, v])
      );
    const rateKeys = new Set(rateDefinitions.map(([k]) => k));
    return {
      version: text(p.version),
      name: text(p.name),
      updatedAt: new Date().toISOString(),
      rates: Object.fromEntries(rateDefinitions.map(([k]) => [k, p.rates[k]])),
      sources: Object.fromEntries(
        Object.entries(obj(p.sources, (k) => rateKeys.has(k))).map(([k, v]) => [k, text(v)])
      ),
      fabricPrices: obj(p.fabricPrices, (k) => knownFabrics.has(k)),
      fabricSources: Object.fromEntries(
        Object.entries(obj(p.fabricSources, (k) => knownFabrics.has(k))).map(([k, v]) => [k, text(v)])
      )
    };
  };
  app.get('/api/internal/profile', {preHandler: needStaff}, async (req) => ({
    profile: await activeProfile(pool),
    definitions: rateDefinitions.map(([key, label, unit]) => [key, label, unit]),
    canEdit: req.user.role === 'technologist'
  }));
  app.put(
    '/api/internal/profile',
    {preHandler: needStaff, schema: {body: {type: 'object', required: ['profile']}}},
    async (req, reply) => {
      if (req.user.role !== 'technologist')
        return reply.code(403).send({error: 'forbidden', message: 'Нормы меняет технолог'});
      const profile = cleanProfile(req.body.profile);
      if (!profile)
        return reply.code(422).send({error: 'invalid_profile', message: 'Неверные ставки калькуляции'});
      await pool.query('INSERT INTO rate_profiles (profile, created_by) VALUES ($1, $2)', [
        profile,
        req.user.id
      ]);
      return {profile};
    }
  );
  app.post(
    '/api/internal/estimate',
    {
      preHandler: needStaff,
      schema: {
        body: {
          type: 'object',
          required: ['config'],
          properties: {config: {type: 'object'}, discount: {type: 'number'}, profile: {type: 'object'}}
        }
      }
    },
    async (req, reply) => {
      // profile из тела — черновой предпросмотр правок норм, на сервере не сохраняется.
      const profile = req.body.profile ? cleanProfile(req.body.profile) : await activeProfile(pool);
      if (!profile)
        return reply.code(422).send({error: 'invalid_profile', message: 'Неверные ставки калькуляции'});
      const {config: cfg, errors} = priceConfig(req.body.config, profile);
      if (!cfg) return reply.code(422).send({error: 'invalid_config', details: errors});
      try {
        return {estimate: estimate(cfg, req.body.discount ?? 0, profile)};
      } catch (e) {
        return reply.code(422).send({error: 'invalid_discount', message: e.message});
      }
    }
  );

  return app;
}
