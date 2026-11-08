import {normalize} from './domain.js';
export function newId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return [...bytes].map((x) => x.toString(16).padStart(2, '0')).join('');
}
// Офлайн-запас: хранится только черновик текущей конфигурации. Заявки и проекты живут на сервере.
const DRAFT = 'gaber.draft.v1';
export function readDraft() {
  try {
    return normalize(JSON.parse(localStorage.getItem(DRAFT)));
  } catch {
    return null;
  }
}
export function writeDraft(config) {
  try {
    localStorage.setItem(DRAFT, JSON.stringify(config));
  } catch {
    /* хранилище недоступно: черновик просто не сохранится офлайн */
  }
}
export function publicLink(config) {
  const data = btoa(unescape(encodeURIComponent(JSON.stringify(config))));
  return `${location.origin}${location.pathname}#studio?c=${encodeURIComponent(data)}`;
}
export function configFromHash() {
  try {
    const raw = location.hash.split('?')[1];
    const v = new URLSearchParams(raw).get('c');
    return v && v.length < 4000 ? normalize(JSON.parse(decodeURIComponent(escape(atob(v))))) : null;
  } catch {
    return null;
  }
}
