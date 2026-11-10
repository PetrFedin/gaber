/**
 * Клиент серверного API заказов. Сессия живёт в httpOnly-cookie: JavaScript токен не видит.
 * Все роли и права проверяет сервер; клиентские проверки здесь только для удобства.
 */
async function request(method, path, body, fetchImpl = globalThis.fetch) {
  let res;
  try {
    res = await fetchImpl(path, {
      method,
      credentials: 'same-origin',
      headers: body === undefined ? {} : {'Content-Type': 'application/json'},
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  } catch {
    throw Object.assign(new Error('SERVER_UNAVAILABLE'), {code: 'SERVER_UNAVAILABLE', status: 0});
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* ответ без JSON */
  }
  if (!res.ok) throw Object.assign(new Error(data?.code ?? 'REQUEST_FAILED'), {code: data?.code ?? 'REQUEST_FAILED', status: res.status});
  return data;
}
export const randomId = (prefix) => {
  const b = crypto.getRandomValues(new Uint8Array(12));
  return prefix + '-' + [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
};
export const serverApi = {
  me: (f) => request('GET', '/api/v1/auth/me', undefined, f).then((r) => r.user),
  login: (email, password, f) => request('POST', '/api/v1/auth/login', {email, password}, f).then((r) => r.user),
  register: (email, password, name, f) =>
    request('POST', '/api/v1/auth/register', {email, password, ...(name ? {name} : {})}, f).then((r) => r.user),
  logout: (f) => request('POST', '/api/v1/auth/logout', {}, f),
  listOrders: (f) => request('GET', '/api/v1/orders', undefined, f).then((r) => r.orders),
  // revisionId передаётся только если он нужен команде.
  command: ({orderId, type, payload, expectedVersion, revisionId, requestId = randomId('REQ')}, f) =>
    request('POST', `/api/v1/orders/${encodeURIComponent(orderId)}/commands`, {
      requestId,
      expectedVersion,
      type,
      payload,
      ...(revisionId ? {revisionId} : {})
    }, f)
};
export const ERROR_TEXT = {
  SERVER_UNAVAILABLE: 'Сервер недоступен. Заказ не изменён, попробуйте позже.',
  SESSION_REQUIRED: 'Нужно войти.',
  SESSION_INVALID: 'Сессия истекла. Войдите снова.',
  BAD_CREDENTIALS: 'Неверная почта или пароль.',
  EMAIL_TAKEN: 'Эта почта уже зарегистрирована.',
  WEAK_PASSWORD: 'Пароль: не короче 10 символов.',
  INVALID_EMAIL: 'Проверьте почту.',
  TOO_MANY_ATTEMPTS: 'Слишком много попыток. Подождите несколько минут.',
  MFA_REQUIRED: 'Для этого действия нужна многофакторная проверка. Она ещё не реализована; в разработке включается флагом сервера.',
  EXTERNAL_AUTHORITY_REQUIRED: 'Действие закрыто (PRODUCTION HOLD): для него нужно внешнее подтверждение — банк, допуск производства или перевозчик. В системе его пока нет.',
  ROLE_FORBIDDEN: 'Эта роль не может выполнить действие.',
  STALE_ORDER_VERSION: 'Заказ уже изменился. Список обновлён, повторите действие.',
  IDEMPOTENCY_CONFLICT: 'Конфликт повторной отправки. Обновите заказ.',
  ORDER_TRANSITION_REJECTED: 'Сейчас это действие недоступно для текущего этапа заказа.',
  FACTORY_NOT_APPROVED: 'Фабрика отсутствует в доверенном реестре или приостановлена.',
  FACTORY_ASSIGNMENT_REQUIRED: 'Сначала назначьте фабрику.',
  FORBIDDEN_ORIGIN: 'Запрос отклонён: неизвестный источник.',
  NO_VERIFIED_SESSION: 'Нужно войти.'
};
export const errorText = (e) => ERROR_TEXT[e?.code] ?? `Не удалось выполнить действие (${e?.code ?? 'ошибка'}).`;
