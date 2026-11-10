const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff'
};
export const COOKIE_NAME = 'gaber_sid';
const send = (res, status, body, extra = {}) => {
  res.writeHead(status, {...JSON_HEADERS, ...extra});
  res.end(JSON.stringify(body));
};
export function readCookie(req, name = COOKIE_NAME) {
  for (const part of String(req.headers.cookie ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}
async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > 16384) throw Object.assign(Error('BODY_TOO_LARGE'), {status: 413, code: 'BODY_TOO_LARGE'});
    chunks.push(c);
  }
  try {
    const v = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw 0;
    return v;
  } catch {
    throw Object.assign(Error('INVALID_JSON'), {status: 400, code: 'INVALID_JSON'});
  }
}
const ALLOWED = {register: ['email', 'password', 'name'], login: ['email', 'password'], 'mfa/confirm': ['code'], 'mfa/verify': ['code'], 'mfa/enroll': []};

/** Проверка источника для запросов с cookie. Запрос без Origin (не браузер) допускается. */
export const originAllowed = (req, allowedOrigins) => !req.headers.origin || allowedOrigins.includes(req.headers.origin);

/** Возвращает true, если запрос принадлежит маршрутам /api/v1/auth/*. */
export function createAuthHttpHandler({service, allowedOrigins = [], secureCookie = false, serverInfo = {}}) {
  const cookie = (token, maxAge) =>
    `${COOKIE_NAME}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secureCookie ? '; Secure' : ''}`;
  return async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const m = url.pathname.match(/^\/api\/v1\/auth\/(register|login|logout|me|mfa\/enroll|mfa\/confirm|mfa\/verify)$/);
    if (!m) return false;
    try {
      const action = m[1];
      if (action === 'me') {
        if (req.method !== 'GET') return send(res, 405, {code: 'METHOD_NOT_ALLOWED'}), true;
        const me = await service.me(readCookie(req));
        return send(res, 200, {user: me, server: serverInfo}), true;
      }
      if (req.method !== 'POST') return send(res, 405, {code: 'METHOD_NOT_ALLOWED'}), true;
      if (!originAllowed(req, allowedOrigins)) return send(res, 403, {code: 'FORBIDDEN_ORIGIN'}), true;
      if (action.startsWith('mfa/')) {
        if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] ?? '')) return send(res, 415, {code: 'JSON_REQUIRED'}), true;
        const body = await readJson(req);
        if (Object.keys(body).some((k) => !ALLOWED[action].includes(k))) return send(res, 400, {code: 'UNKNOWN_FIELD'}), true;
        const token = readCookie(req), ip = req.socket.remoteAddress ?? '';
        const out = action === 'mfa/enroll' ? await service.mfaEnroll(token, {ip}) : action === 'mfa/confirm' ? await service.mfaConfirm(token, body.code, {ip}) : await service.mfaVerify(token, body.code, {ip});
        return send(res, 200, out), true;
      }
      if (action === 'logout') {
        await service.logout(readCookie(req));
        return send(res, 200, {ok: true}, {'set-cookie': cookie('', 0)}), true;
      }
      if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] ?? ''))
        return send(res, 415, {code: 'JSON_REQUIRED'}), true;
      const body = await readJson(req);
      // Лишние поля (в том числе role, tenantId) не принимаются.
      if (Object.keys(body).some((k) => !ALLOWED[action].includes(k)))
        return send(res, 400, {code: 'UNKNOWN_FIELD'}), true;
      const clientKey = req.socket.remoteAddress ?? '';
      if (action === 'register') body.ip = clientKey;
      const result =
        action === 'register' ? await service.register(body) : await service.login({...body, clientKey});
      const maxAge = Math.max(1, Math.floor((result.expiresAtMs - Date.now()) / 1000));
      send(res, action === 'register' ? 201 : 200, {user: result.user}, {'set-cookie': cookie(result.token, maxAge)});
    } catch (e) {
      if (e.status) send(res, e.status, {code: e.code});
      else send(res, 503, {code: 'SERVER_OPERATION_FAILED'});
    }
    return true;
  };
}
