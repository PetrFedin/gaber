import {createServer} from 'node:http';
import {createOrderHttpHandler} from './orderHttpApi.js';
import {createAuthHttpHandler, readCookie, originAllowed} from './auth/authHttp.js';

/**
 * Единый HTTP-вход: /api/v1/auth/* (вход, cookie) и /api/v1/orders/* (журнал заказов).
 * Браузер аутентифицируется httpOnly-cookie: здесь она превращается в Bearer для существующего
 * адаптера заказов. Явный заголовок Authorization имеет приоритет (для не-браузерных клиентов).
 */
export function createGaberHttpServer({journal, authService, allowedOrigins = [], secureCookie = false, clock = Date.now}) {
  const orders = createOrderHttpHandler({journal, resolveSession: (t) => authService.resolveSession(t), clock});
  const auth = createAuthHttpHandler({service: authService, allowedOrigins, secureCookie});
  return createServer(async (req, res) => {
    if (await auth(req, res)) return;
    if (req.method !== 'GET' && req.method !== 'HEAD' && !originAllowed(req, allowedOrigins)) {
      res.writeHead(403, {'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store'});
      res.end(JSON.stringify({code: 'FORBIDDEN_ORIGIN', productionRelease: {allowed: false}}));
      return;
    }
    const sid = readCookie(req);
    if (sid && !req.headers.authorization) req.headers.authorization = 'Bearer ' + sid;
    // Список заказов, доступных текущему пользователю (роль-DTO, без чужих заказов).
    if (new URL(req.url, 'http://localhost').pathname === '/api/v1/orders') {
      const send = (status, body) => {
        res.writeHead(status, {'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff'});
        res.end(JSON.stringify({productionRelease: {allowed: false}, ...body}));
      };
      if (req.method !== 'GET') return send(405, {code: 'METHOD_NOT_ALLOWED'});
      try {
        const token = String(req.headers.authorization ?? '').match(/^Bearer ([A-Za-z0-9_-]{32,256})$/)?.[1];
        const principal = token ? await authService.resolveSession(token) : null;
        if (!principal) return send(401, {code: 'SESSION_REQUIRED'});
        const result = await journal.list({principal});
        return send(result.accepted ? 200 : 401, result.accepted ? {ok: true, orders: result.orders} : {code: result.code});
      } catch {
        return send(503, {code: 'SERVER_OPERATION_FAILED'});
      }
    }
    return orders(req, res);
  });
}
