import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, rmSync, writeFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {createStaticHandler} from '../server/staticFiles.js';

const root = mkdtempSync(join(tmpdir(), 'gaber-static-'));
mkdirSync(join(root, 'assets'));
writeFileSync(join(root, 'index.html'), '<!doctype html><title>GABER</title>');
writeFileSync(join(root, 'assets', 'app-abc.js'), 'console.log(1)');
writeFileSync(join(root, '..', 'gaber-outside-secret.txt'), 'TOPSECRET');
const handler = createStaticHandler(join(root));
const server = createServer(async (req, res) => {
  if (!(await handler(req, res))) {
    res.writeHead(418).end('not static');
  }
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const port = server.address().port;
const get = (path, method = 'GET') =>
  new Promise((resolve, reject) => {
    // сырой запрос, чтобы клиент не нормализовал «..»
    import('node:net').then(({connect}) => {
      const s = connect(port, '127.0.0.1');
      let data = '';
      s.on('data', (c) => (data += c));
      s.on('end', () => resolve({status: Number(data.split(' ')[1]), text: data}));
      s.on('error', reject);
      s.write(`${method} ${path} HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n`);
    });
  });
test.after(() => {
  server.close();
  rmSync(root, {recursive: true, force: true});
  rmSync(join(root, '..', 'gaber-outside-secret.txt'), {force: true});
});

test('отдаёт index.html на корне и на неизвестных маршрутах, ресурсы с долгим кэшем', async () => {
  const home = await get('/');
  assert.equal(home.status, 200);
  assert.match(home.text, /content-type: text\/html/i);
  assert.match(home.text, /cache-control: no-cache/i);
  assert.match(home.text, /x-content-type-options: nosniff/i);
  assert.equal((await get('/studio/anything')).status, 200);
  const asset = await get('/assets/app-abc.js');
  assert.match(asset.text, /immutable/);
  assert.match(asset.text, /text\/javascript/);
});
test('несуществующий файл с расширением даёт 404, а не index.html', async () => {
  assert.equal((await get('/assets/missing.js')).status, 404);
});
test('выход за каталог и подмена пути не раскрывают чужие файлы', async () => {
  for (const path of ['/../gaber-outside-secret.txt', '/%2e%2e/gaber-outside-secret.txt', '/assets/..%2f..%2fgaber-outside-secret.txt', '/assets/%2e%2e/%2e%2e/gaber-outside-secret.txt', '/..%5cgaber-outside-secret.txt']) {
    const r = await get(path);
    assert.ok(!r.text.includes('TOPSECRET'), 'утечка по ' + path);
    assert.ok([200, 403, 404].includes(r.status), path + ' ' + r.status);
  }
  assert.equal((await get('/assets/..%2f..%2fgaber-outside-secret.txt')).status, 403);
  assert.equal((await get('/%00')).status, 418);
  assert.equal((await get('/%E0%A4%A')).status, 400);
});
test('API и методы записи статикой не перехватываются', async () => {
  assert.equal((await get('/api/v1/auth/me')).status, 418);
  assert.equal((await get('/health')).status, 418);
  assert.equal((await get('/', 'POST')).status, 418);
  assert.equal((await get('/', 'HEAD')).status, 200);
});
