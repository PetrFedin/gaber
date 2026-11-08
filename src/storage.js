import {normalize} from './domain.js';
const KEY = 'gaber.projects.v1';
export function newId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return [...bytes].map((x) => x.toString(16).padStart(2, '0')).join('');
}
export function readProjects() {
  try {
    const data = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(data)
      ? data
          .filter(
            (p) =>
              typeof p.id === 'string' &&
              normalize(p.config) &&
              ['draft', 'requested', 'approved', 'changes'].includes(p.status)
          )
          .slice(0, 100)
          .map((p) => ({...p, config: normalize(p.config)}))
      : [];
  } catch {
    return [];
  }
}
export function writeProjects(projects) {
  localStorage.setItem(KEY, JSON.stringify(projects.slice(0, 100)));
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
