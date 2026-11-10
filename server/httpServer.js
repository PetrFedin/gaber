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
    return orders(req, res);
  });
}
