import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import React, {act} from 'react';
import {createServer} from 'vite';

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {url: 'https://gaber.example.test/#studio?c=abc'});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;
globalThis.location = dom.window.location;
globalThis.history = dom.window.history;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const {createRoot} = await import('react-dom/client');
const vite = await createServer({optimizeDeps: {noDiscovery: true, include: []}, server: {middlewareMode: true}, appType: 'custom'});
try {
  const {readDraft, writeDraft, stripConfigFromUrl} = await vite.ssrLoadModule('/src/draftStorage.js');
  const {initialConfig} = await vite.ssrLoadModule('/src/domain.js');
  const {default: ErrorBoundary} = await vite.ssrLoadModule('/src/ErrorBoundary.jsx');

  // черновик: только нормализованная конфигурация, мусор отбрасывается
  assert.equal(readDraft(), null);
  const c = {...initialConfig('sofa'), width: 300};
  assert.equal(writeDraft(c), true);
  assert.equal(readDraft().width, 300);
  localStorage.setItem('gaber.draft.v1', JSON.stringify({category: 'foreign'}));
  assert.equal(readDraft(), null, 'невалидный черновик отбрасывается');
  localStorage.setItem('gaber.draft.v1', '{не json');
  assert.equal(readDraft(), null, 'повреждённый черновик не роняет приложение');
  const broken = {setItem() { throw new Error('quota'); }};
  assert.equal(writeDraft(c, broken), false, 'ошибка хранилища не выбрасывается наружу');

  // ссылка: параметр ?c= убирается из адреса
  assert.match(location.hash, /\?c=abc/);
  assert.equal(stripConfigFromUrl(), true);
  assert.equal(location.hash, '#studio');
  assert.equal(stripConfigFromUrl(), false);

  // граница ошибок показывает понятное сообщение вместо пустого экрана
  const Boom = () => { throw new Error('boom'); };
  const root = createRoot(document.getElementById('root'));
  const log = console.error; console.error = () => {};
  try {
    await act(async () => root.render(React.createElement(ErrorBoundary, null, React.createElement(Boom))));
  } finally { console.error = log; }
  assert.match(document.body.textContent, /Раздел не открылся/);
  assert.match(document.body.textContent, /Ваши проекты и черновик не затронуты/);
  await act(async () => root.render(React.createElement(ErrorBoundary, null, React.createElement('p', null, 'ok'))));
  console.log('✓ draft storage, link cleanup and error boundary');
} finally {
  await vite.close();
}
