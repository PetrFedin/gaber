/**
 * Интерфейс заказов на сервере: вход и три роли по настоящему редьюсеру журнала и роль-DTO read model.
 * Сервер заменён памятью (fetch-заглушка): здесь проверяется только UI; HTTP и PostgreSQL проверяет
 * server/tests/auth-http-e2e.mjs. Это не проверка MFA и не production.
 */
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import React, {act} from 'react';
import {createServer} from 'vite';

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {url: 'https://gaber.example.test/#orders'});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const {createRoot} = await import('react-dom/client');
const vite = await createServer({optimizeDeps: {noDiscovery: true, include: []}, server: {middlewareMode: true}, appType: 'custom'});
const root = createRoot(document.getElementById('root'));
try {
  const {default: ServerOrders} = await vite.ssrLoadModule('/src/ServerOrders.jsx');
  const {initialConfig} = await vite.ssrLoadModule('/src/domain.js');
  const {appendOrderCommand, replayOrder} = await vite.ssrLoadModule('/src/orderWorkflow.js');
  const {projectOrderReadModel} = await vite.ssrLoadModule('/server/orderReadModel.js');

  // --- сервер в памяти: пользователи, сессия, журнал событий, права по роли ---
  const users = {
    'c@x.test': {id: 'U-c', email: 'c@x.test', role: 'client', password: 'client-pass-1'},
    'p@x.test': {id: 'U-p', email: 'p@x.test', role: 'partner', password: 'partner-pass-1'},
    'f@x.test': {id: 'U-f', email: 'f@x.test', role: 'factory', password: 'factory-pass-1', factoryId: 'FAB-T'}
  };
  let session = null, owner = null, events = [], clock = Date.parse('2026-11-10T10:00:00.000Z'), mfaVerified = false, autoVerify = false, enrolled = false, pendingSecret = false, externalHold = true, holdProp;
  const requests = [];
  const json = (status, body) => ({ok: status < 400, status, json: async () => body});
  globalThis.fetch = async (url, init = {}) => {
    const body = init.body ? JSON.parse(init.body) : undefined;
    requests.push({url, method: init.method, body});
    const mfaOf = (u) => ({required: u.role !== 'client', enrolled: u.role === 'partner' && enrolled, verified: mfaVerified});
    if (url === '/api/v1/auth/me') return json(200, {user: session && {id: session.id, email: session.email, role: session.role, mfa: mfaOf(session)}, server: {devSimulatedAuthority: !externalHold}});
    if (url === '/api/v1/auth/mfa/enroll') { pendingSecret = true; return json(200, {secret: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567', uri: 'otpauth://totp/GABER:p?secret=ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'}); }
    if (url === '/api/v1/auth/mfa/confirm' || url === '/api/v1/auth/mfa/verify') {
      if (body.code !== '123456') return json(401, {code: 'BAD_CODE'});
      enrolled = true; mfaVerified = true;
      return json(200, {ok: true});
    }
    if (url === '/api/v1/auth/login') {
      const u = users[body.email];
      if (!u || u.password !== body.password) return json(401, {code: 'BAD_CREDENTIALS'});
      session = u;
      mfaVerified = autoVerify;
      return json(200, {user: {id: u.id, email: u.email, role: u.role}});
    }
    if (url === '/api/v1/auth/logout') { session = null; return json(200, {ok: true}); }
    if (!session) return json(401, {code: 'SESSION_REQUIRED'});
    if (url === '/api/v1/orders') {
      if (!events.length) return json(200, {ok: true, orders: []});
      const state = replayOrder(events);
      const visible = session.role !== 'client' || owner === session.id;
      const assigned = session.role !== 'factory' || state.assignedFactoryId === session.factoryId;
      return json(200, {ok: true, orders: visible && assigned ? [projectOrderReadModel(state, session.role)] : []});
    }
    const m = url.match(/^\/api\/v1\/orders\/([^/]+)\/commands$/);
    if (m && init.method === 'POST') {
      if (externalHold && ['start', 'complete', 'quality_pass', 'ship', 'deliver', 'accept_delivery'].includes(body.type)) return json(403, {code: 'EXTERNAL_AUTHORITY_REQUIRED'});
      const mfaRoles = ['partner', 'factory'];
      if (mfaRoles.includes(session.role) && !mfaVerified && !['message'].includes(body.type)) return json(403, {code: 'MFA_REQUIRED'});
      clock += 60000;
      const command = {id: body.requestId, at: new Date(clock).toISOString(), role: session.role, type: body.type, payload: body.payload, expectedVersion: body.expectedVersion, ...(body.revisionId ? {revisionId: body.revisionId} : {})};
      try {
        const r = appendOrderCommand(events, command);
        events = r.events;
        if (body.type === 'create') owner = session.id;
        return json(201, {ok: true, code: 'COMMITTED', version: r.state.version});
      } catch (e) {
        return json(e.message === 'STALE_ORDER' ? 409 : 422, {code: e.message === 'STALE_ORDER' ? 'STALE_ORDER_VERSION' : 'ORDER_TRANSITION_REJECTED'});
      }
    }
    return json(404, {code: 'NOT_FOUND'});
  };

  const render = async () => act(async () => root.render(React.createElement(ServerOrders, {config: initialConfig(), holdDisabled: holdProp})));
  const text = () => document.body.textContent;
  const button = (label) => {
    const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === label);
    assert.ok(b, 'Нет кнопки: ' + label);
    return b;
  };
  const click = async (label) => act(async () => { const b = button(label); assert.equal(b.disabled, false, 'Заблокирована: ' + label); b.click(); });
  const setValue = (el, value) => {
    const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : el.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
    el.dispatchEvent(new window.Event(el.tagName === 'SELECT' ? 'change' : 'input', {bubbles: true}));
  };
  const field = (label, scope = document) => {
    const el = [...scope.querySelectorAll('label')].find((x) => [...x.childNodes].filter((n) => n.nodeType === window.Node.TEXT_NODE).map((n) => n.textContent).join('').trim() === label);
    assert.ok(el, 'Нет поля: ' + label);
    return el.querySelector('input,textarea,select');
  };
  const fill = async (label, value) => act(async () => setValue(field(label), value));
  const formOf = (buttonLabel) => button(buttonLabel).closest('form');
  const fillIn = async (buttonLabel, label, value) => act(async () => setValue(field(label, formOf(buttonLabel)), value));
  const login = async (email, password) => {
    await fill('Почта', email);
    await fill('Пароль', password);
    await click('Войти');
  };
  const logout = async () => { await click('Выйти'); };
  const state = () => replayOrder(events);

  // гость видит форму входа, а не заказы
  await render();
  assert.match(text(), /Вход/);
  assert.doesNotMatch(text(), /Мои заказы/);
  await login('c@x.test', 'wrong-password');
  assert.match(text(), /Неверная почта или пароль/);

  // клиент создаёт заказ на сервере
  await login('c@x.test', 'client-pass-1');
  assert.match(text(), /Мои заказы/);
  await click('Создать заказ на сервере');
  assert.equal(state().stage, 'requested');
  assert.match(text(), /Заявка/);
  const created = requests.find((r) => r.body?.type === 'create');
  assert.equal(created.body.expectedVersion, 0);
  assert.ok(!('role' in created.body) && !('principal' in created.body), 'клиент не передаёт роль');
  await fill('Сообщение', 'Нужна доставка в пятницу');
  await click('Отправить сообщение');
  assert.match(text(), /Нужна доставка в пятницу/);
  await logout();

  // фабрика не видит заказ до назначения; у партнёра без MFA запись отклоняется понятным текстом
  await login('f@x.test', 'factory-pass-1');
  assert.match(text(), /Заказов пока нет/);
  await logout();
  await login('p@x.test', 'partner-pass-1');
  await fillIn('Назначить фабрику', 'Код фабрики из реестра', 'FAB-T');
  await click('Назначить фабрику');
  assert.match(text(), /многофакторная проверка/);
  assert.equal(state().assignedFactoryId, null);
  // интерфейс предлагает пройти MFA: подключение аутентификатора, неверный и верный код
  assert.match(text(), /Подтвердите вход кодом/);
  await click('Подключить аутентификатор');
  assert.match(text(), /ABCD EFGH IJKL MNOP/);
  assert.match(text(), /otpauth:\/\/totp\/GABER/);
  await fill('Код из приложения', '000000');
  await click('Подтвердить и подключить');
  assert.match(text(), /Код не подошёл/);
  assert.equal(state().assignedFactoryId, null);
  await fill('Код из приложения', '123456');
  await click('Подтвердить и подключить');
  assert.doesNotMatch(text(), /Подтвердите вход кодом/, 'после подтверждения блок MFA исчезает');
  await click('Назначить фабрику');
  assert.equal(state().assignedFactoryId, 'FAB-T');
  autoVerify = true; // дальше сценарий не повторяет ввод кода

  // ТЗ и расчёт: рубли переводятся в копейки на клиенте, проверка на сервере
  const spec = {'Техническое задание': 'Каркас, наполнитель, швы', 'Цена клиенту, ₽': '2100,05', 'Стоимость у фабрики, ₽': '1000,01', 'Комиссия GABER, ₽': '400,01', 'Логистика, ₽': '100', 'Налоги, ₽': '50', 'Прочие затраты, ₽': '1', 'Аванс, % от цены': '50', 'Срок (ГГГГ-ММ-ДД)': '2027-02-01', 'Комментарий к предложению': 'Цена после проверки'};
  for (const [label, value] of Object.entries(spec)) await fillIn('Подготовить ТЗ и расчёт', label, value);
  await click('Подготовить ТЗ и расчёт');
  assert.equal(state().stage, 'awaiting_factory');
  assert.equal(state().specs[0].economics.customerPriceKopecks, 210005);
  assert.match(text(), /Цена клиенту \/ у фабрики/);
  await logout();

  // фабрика видит задание, но не цену клиента и не комиссию
  await login('f@x.test', 'factory-pass-1');
  assert.match(text(), /Стоимость у фабрики/);
  assert.doesNotMatch(text(), /2\s?100,05|Комиссия/);
  await fillIn('Подтвердить ТЗ', 'Номер подтверждения', 'ACK-T-1');
  await fillIn('Подтвердить ТЗ', 'Комментарий', 'Проверено');
  await click('Подтвердить ТЗ');
  assert.equal(state().stage, 'factory_confirmed');
  await logout();

  // партнёр публикует предложение, клиент видит цену и принимает
  await login('p@x.test', 'partner-pass-1');
  await fillIn('Опубликовать предложение клиенту', 'Комментарий клиенту', 'Финальная цена');
  await click('Опубликовать предложение клиенту');
  assert.equal(state().stage, 'offered');
  await logout();
  await login('c@x.test', 'client-pass-1');
  assert.match(text(), /Цена предложения/);
  assert.doesNotMatch(text(), /Стоимость у фабрики|Комиссия|Цена клиенту \/ у фабрики/);
  await click('Принять предложение');
  assert.equal(state().stage, 'accepted');
  assert.equal(state().acceptedRevisionId, 'R1');

  // --- оплата: заявление клиента, учёт партнёром, остаток ---
  const has = (label) => [...document.querySelectorAll('button')].some((b) => b.textContent.trim() === label);
  const alertText = () => document.querySelector('[role=alert]')?.textContent ?? '';
  await fill('Сумма, ₽', 'abc');
  await fill('Номер платёжного документа', 'CLAIM-1');
  await click('Сообщить об оплате');
  assert.match(alertText(), /Проверьте поле «Сумма, ₽»/);
  assert.equal(requests.filter((r) => r.body?.type === 'report_payment').length, 0, 'неверная сумма не уходит на сервер');
  await fill('Сумма, ₽', '1050,03');
  await click('Сообщить об оплате');
  assert.equal(state().paymentClaims[0].amountKopecks, 105003);
  assert.match(text(), /Заявлено клиентом: 1\s050,03/);
  assert.match(text(), /Учтено партнёром \(не банк\)0,00/);
  await logout();
  await login('p@x.test', 'partner-pass-1');
  await fill('Сумма, ₽', '1050,03');
  await fill('Номер платёжного документа', 'BANK-1');
  await click('Записать оплату');
  assert.equal(state().payments[0].amountKopecks, 105003);
  assert.match(text(), /Учтено: 1\s050,03/);
  await logout();
  await login('c@x.test', 'client-pass-1');
  assert.match(text(), /Аванс к оплате0,00/);
  assert.match(text(), /Остаток к оплате1\s050,02/);
  await logout();

  // --- PRODUCTION HOLD: кнопки закрытых этапов не показываются, причина объяснена ---
  await login('f@x.test', 'factory-pass-1');
  assert.equal(has('Начать производство'), false, 'при HOLD кнопка производства скрыта');
  assert.match(text(), /PRODUCTION HOLD/);
  assert.doesNotMatch(text(), /Учтено|Заявлено клиентом|Остаток к оплате/, 'фабрика не видит платежи');
  await logout();
  // если интерфейс всё же отправит закрытую команду, отказ сервера объяснён
  holdProp = false; // принудительно показать закрытые кнопки, сервер ответит отказом
  await render();
  await login('f@x.test', 'factory-pass-1');
  await click('Начать производство');
  assert.match(alertText(), /PRODUCTION HOLD/);
  assert.equal(state().stage, 'accepted');

  // --- сервер сообщает о dev-симуляторе внешних полномочий: кнопки этапов появляются сами, с предупреждением ---
  holdProp = undefined;
  externalHold = false;
  await render();
  await logout();
  assert.doesNotMatch(text(), /DEV-СИМУЛЯТОР/, 'без входа баннер не нужен');
  await login('f@x.test', 'factory-pass-1');
  assert.match(text(), /DEV-СИМУЛЯТОР/, 'баннер dev-симулятора');
  assert.equal(has('Начать производство'), true, 'кнопка этапа показана по сигналу сервера');
  await click('Начать производство');
  assert.equal(state().stage, 'production');
  await click('Производство завершено');
  await fillIn('Контроль качества пройден', 'Номер акта', 'QC-1');
  await click('Контроль качества пройден');
  assert.equal(state().stage, 'ready');
  await logout();
  await login('p@x.test', 'partner-pass-1');
  await fill('Сумма, ₽', '1050,02');
  await fill('Номер платёжного документа', 'BANK-2');
  await click('Записать оплату');
  assert.equal(state().payments.length, 2);
  await logout();
  await login('f@x.test', 'factory-pass-1');
  await fill('Перевозчик', 'ТК Демо');
  await fill('Трек-номер', 'TRK-1');
  await fillIn('Отгрузить', 'Номер документа', 'SHIP-1');
  await click('Отгрузить');
  assert.equal(state().stage, 'shipped');
  assert.equal(state().shipment.carrier, 'ТК Демо');
  await logout();
  await login('c@x.test', 'client-pass-1');
  await fill('Описание проблемы', 'Повреждена обивка');
  await click('Сообщить о проблеме');
  assert.equal(state().stage, 'disputed');
  await logout();
  await login('f@x.test', 'factory-pass-1');
  await fill('Предложение по решению', 'Заменим чехол');
  await click('Ответить на проблему');
  assert.equal(state().issue.status, 'response_proposed');
  await logout();
  await login('c@x.test', 'client-pass-1');
  await fill('Почему не подходит', 'Нужна замена целиком');
  await click('Отклонить решение');
  assert.equal(state().issue.status, 'open');
  await logout();
  await login('p@x.test', 'partner-pass-1');
  await fill('Предложение по решению', 'Заменим обивку целиком');
  await click('Ответить на проблему');
  await logout();
  await login('c@x.test', 'client-pass-1');
  await click('Подтвердить решение');
  assert.equal(state().stage, 'shipped');
  await logout();
  await login('f@x.test', 'factory-pass-1');
  await fillIn('Доставлено', 'Номер документа', 'DLV-1');
  await click('Доставлено');
  assert.equal(state().stage, 'delivered');
  await logout();
  await login('c@x.test', 'client-pass-1');
  await click('Принять доставку');
  assert.equal(state().stage, 'closed');
  await logout();

  // отказ из-за устаревшей версии
  await login('c@x.test', 'client-pass-1');
  const stale = {orderId: state().projectId, type: 'message', payload: {note: 'x', channel: 'shared'}, expectedVersion: 1, revisionId: 'R1'};
  const {serverApi} = await vite.ssrLoadModule('/src/serverApi.js');
  await assert.rejects(serverApi.command(stale), {code: 'STALE_ORDER_VERSION'});
  await logout();
  assert.match(text(), /Вход/);
  console.log('✓ server orders UI: вход, клиент → партнёр → фабрика → предложение → принятие, права ролей, отказы сервера');
} finally {
  await vite.close();
}
