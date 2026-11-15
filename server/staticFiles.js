import {createReadStream} from 'node:fs';
import {stat, realpath} from 'node:fs/promises';
import {extname, join, normalize, sep} from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.glb': 'model/gltf-binary', '.txt': 'text/plain; charset=utf-8'
};
const SECURITY = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'same-origin',
  'x-frame-options': 'DENY',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()'
};
/**
 * Раздача собранного фронтенда (vite build). Возвращает true, если запрос обработан.
 * Незнакомые пути без расширения получают index.html (маршруты на хэше, но прямые заходы тоже работают);
 * /api/* и /health сюда не попадают. Выход за каталог через .. и \0 невозможен.
 */
export function createStaticHandler(root) {
  const base = normalize(root.endsWith(sep) ? root : root + sep);
  return async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return false;
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    } catch {
      res.writeHead(400, SECURITY).end();
      return true;
    }
    if (pathname.startsWith('/api/') || pathname === '/health' || pathname.includes('\0')) return false;
    // A backslash may be a path separator on Windows. Never interpret it as a file name.
    if (pathname.includes('\\')) {
      res.writeHead(403, SECURITY).end();
      return true;
    }
    let file = normalize(join(base, pathname === '/' ? 'index.html' : pathname));
    if (!file.startsWith(base)) {
      res.writeHead(403, SECURITY).end();
      return true;
    }
    // Lexical path checks do not stop symlinks. Resolve the site directory and
    // requested asset before opening it; stream the validated canonical path.
    // Deployment must keep build output immutable while requests run.
    const realRoot = await realpath(base).catch(() => null);
    if (!realRoot) {
      res.writeHead(404, SECURITY).end();
      return true;
    }
    const prefix = realRoot.endsWith(sep) ? realRoot : realRoot + sep;
    const resolveAsset = async (candidate) => {
      const info = await stat(candidate).catch(() => null);
      if (!info?.isFile()) return null;
      const resolved = await realpath(candidate).catch(() => null);
      if (!resolved || !resolved.startsWith(prefix)) return {blocked: true};
      return {info, resolved};
    };
    let asset = await resolveAsset(file);
    if (asset?.blocked) {
      res.writeHead(403, SECURITY).end();
      return true;
    }
    if (!asset) {
      if (extname(pathname)) {
        res.writeHead(404, SECURITY).end();
        return true;
      }
      file = join(base, 'index.html');
      asset = await resolveAsset(file);
      if (asset?.blocked) {
        res.writeHead(403, SECURITY).end();
        return true;
      }
      if (!asset) {
        res.writeHead(404, SECURITY).end();
        return true;
      }
    }
    const immutable = /^\/assets\//.test(pathname);
    res.writeHead(200, {
      ...SECURITY,
      'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
      'content-length': asset.info.size,
      'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache'
    });
    if (req.method === 'HEAD') res.end();
    else createReadStream(asset.resolved).pipe(res);
    return true;
  };
}
