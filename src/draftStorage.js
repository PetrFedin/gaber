import { normalize } from "./domain.js";

// Офлайн-запас конфигуратора: хранится только текущая конфигурация. Проекты и заказы здесь не хранятся.
const KEY = "gaber.draft.v1";
export function readDraft(storage = globalThis.localStorage) {
  try {
    return normalize(JSON.parse(storage.getItem(KEY)));
  } catch {
    return null;
  }
}
export function writeDraft(config, storage = globalThis.localStorage) {
  try {
    storage.setItem(KEY, JSON.stringify(config));
    return true;
  } catch {
    return false;
  }
}
// После загрузки конфигурации из ссылки адрес очищается: перезагрузка не должна затирать правки.
export function stripConfigFromUrl(loc = globalThis.location, hist = globalThis.history) {
  if (!loc?.hash?.includes("?c=")) return false;
  hist.replaceState(null, "", loc.pathname + loc.search + loc.hash.split("?")[0]);
  return true;
}
