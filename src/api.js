// Клиент серверного API. Куки сессии httpOnly: JavaScript их не видит, браузер отправляет сам.
async function request(method, path, {body, headers, signal} = {}) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      signal,
      headers: {...(body ? {'Content-Type': 'application/json'} : {}), ...headers},
      body: body ? JSON.stringify(body) : undefined
    });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw Object.assign(new Error('Сервер недоступен'), {status: 0, offline: true});
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* пустой или не JSON */
  }
  if (!res.ok)
    throw Object.assign(new Error(data?.message || `Ошибка сервера (${res.status})`), {
      status: res.status,
      code: data?.error,
      details: data?.details
    });
  return data;
}
export const api = {
  me: () => request('GET', '/auth/me').then((r) => r.user),
  login: (email, password) => request('POST', '/auth/login', {body: {email, password}}).then((r) => r.user),
  register: (email, password, name) =>
    request('POST', '/auth/register', {body: {email, password, name: name || undefined}}).then((r) => r.user),
  logout: () => request('POST', '/auth/logout'),
  quote: (config, signal) => request('POST', '/quote', {body: {config}, signal}),
  projects: () => request('GET', '/projects').then((r) => r.projects),
  createProject: (payload, key) =>
    request('POST', '/projects', {body: payload, headers: {'Idempotency-Key': key}}).then((r) => r.project),
  addVersion: (id, config, image) =>
    request('POST', `/projects/${id}/versions`, {body: {config, image}}).then((r) => r.project),
  submit: (id) => request('POST', `/projects/${id}/submit`).then((r) => r.project),
  remove: (id) => request('DELETE', `/projects/${id}`),
  // Только менеджер и технолог; клиент получит 403.
  factoryRequests: () => request('GET', '/factory/requests').then((r) => r.requests),
  decide: (id, body) => request('POST', `/factory/requests/${id}/decision`, {body}).then((r) => r.project),
  profile: () => request('GET', '/internal/profile'),
  saveProfile: (profile) => request('PUT', '/internal/profile', {body: {profile}}).then((r) => r.profile),
  estimate: (config, profile, signal) =>
    request('POST', '/internal/estimate', {body: {config, profile}, signal}).then((r) => r.estimate)
};
