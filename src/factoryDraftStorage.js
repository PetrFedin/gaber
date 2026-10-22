/**
 * Local, unverified revision journal for factory-cost drafts.
 * No prices, totals or production approvals are trusted or stored as authority.
 * This is best-effort localStorage conflict detection, not a database transaction.
 */
export const FACTORY_WORKSPACE_KEY = 'gaber.factory-cost-revisions.v1';
export const FACTORY_WORKSPACE_SCHEMA = 'gaber-factory-cost-revisions/1';
export const FACTORY_REVISION_EXPORT = 'gaber-factory-revision-export/1';
export const MAX_FACTORY_REVISIONS = 30;
export const MAX_FACTORY_TEXT_BYTES = 512 * 1024;
export const MAX_FACTORY_STORE_BYTES = 2 * 1024 * 1024;
export const MAX_FACTORY_IMPORT_BYTES = 1024 * 1024;
const observed = new WeakMap();
const bytes = value => new TextEncoder().encode(value).length;
const fail = code => { throw new Error(code); };
const onlyKeys = (value, keys) => Object.keys(value).every(key => keys.includes(key));
const plain = value => value !== null && typeof value === 'object' &&
  !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));

/** Sorted object keys; array order and numeric values remain significant. */
export function factoryConfigKey(config) {
  let nodes = 0;
  const visit = (value, depth = 0) => {
    if (++nodes > 2048 || depth > 12) fail('CONFIG_TOO_COMPLEX');
    if (value === null || typeof value === 'boolean' || typeof value === 'string') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (Array.isArray(value)) return value.map(item => visit(item, depth + 1));
    if (!plain(value)) fail('INVALID_CONFIG');
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, visit(value[key], depth + 1)]));
  };
  if (!plain(config)) fail('INVALID_CONFIG');
  const encoded = JSON.stringify(visit(config));
  if (bytes(encoded) > 16 * 1024) fail('CONFIG_TOO_LARGE');
  return encoded;
}
export function sameFactoryConfig(a, b) {
  try { return factoryConfigKey(a) === factoryConfigKey(b); } catch { return false; }
}
function validTimestamp(value) {
  if (typeof value !== 'string') return false;
  try { return new Date(value).toISOString() === value; } catch { return false; }
}
function validateRecord(input) {
  if (!plain(input) || !onlyKeys(input, ['id','label','savedAt','sourceConfig','text','authority']) || typeof input.id !== 'string' ||
      !/^[A-Za-z0-9_.:-]{1,128}$/.test(input.id) ||
      typeof input.label !== 'string' || !input.label.trim() || input.label.length > 100 ||
      !validTimestamp(input.savedAt) || input.authority !== 'LOCAL_UNVERIFIED' ||
      typeof input.text !== 'string' || !input.text.trim()) fail('INVALID_REVISION');
  if (bytes(input.text) > MAX_FACTORY_TEXT_BYTES) fail('DRAFT_TOO_LARGE');
  factoryConfigKey(input.sourceConfig);
  // Deliberately preserve the exact text, even an unfinished/invalid JSON draft.
  return {id:input.id, label:input.label, savedAt:input.savedAt,
    sourceConfig:structuredClone(input.sourceConfig), text:input.text,
    authority:'LOCAL_UNVERIFIED'};
}
function decode(raw) {
  if (raw === null) return [];
  if (typeof raw !== 'string' || bytes(raw) > MAX_FACTORY_STORE_BYTES) fail('WORKSPACE_TOO_LARGE');
  const data = JSON.parse(raw);
  if (!plain(data) || !onlyKeys(data, ['schemaVersion','records']) || data.schemaVersion !== FACTORY_WORKSPACE_SCHEMA ||
      !Array.isArray(data.records) || data.records.length > MAX_FACTORY_REVISIONS)
    fail('INVALID_WORKSPACE');
  const records = data.records.map(validateRecord);
  if (new Set(records.map(record => record.id)).size !== records.length) fail('DUPLICATE_REVISION');
  return records;
}

/** Corrupt records are never silently dropped or overwritten. This call never writes. */
export function readFactoryWorkspace(storage) {
  let raw = null, readable = false, records = [], status = 'ready', error = null;
  try {
    raw = storage.getItem(FACTORY_WORKSPACE_KEY);
    readable = true;
    records = decode(raw);
  } catch (cause) {
    status = readable ? 'corrupt' : 'unavailable';
    error = readable ? 'WORKSPACE_CORRUPT' : 'STORAGE_UNAVAILABLE';
  }
  const result = {status, error, records:structuredClone(records)};
  observed.set(result, {storage, raw, readable, status, records:structuredClone(records)});
  return result;
}
function baselineFor(storage, workspace) {
  const snapshot = observed.get(workspace);
  if (!snapshot || snapshot.storage !== storage) fail('UNOBSERVED_WORKSPACE');
  if (!snapshot.readable) fail('STORAGE_UNAVAILABLE');
  if (snapshot.status !== 'ready') fail('WORKSPACE_CORRUPT');
  let current;
  try { current = storage.getItem(FACTORY_WORKSPACE_KEY); } catch { fail('STORAGE_UNAVAILABLE'); }
  if (current !== snapshot.raw) fail('STALE_WORKSPACE');
  return snapshot;
}

/** Append-only: reaching the limit never silently evicts an older revision. */
export function saveFactoryRevision(storage, workspace, input) {
  const snapshot = baselineFor(storage, workspace);
  const record = validateRecord({...input, authority:'LOCAL_UNVERIFIED'});
  if (snapshot.records.some(old => old.id === record.id)) fail('DUPLICATE_REVISION');
  if (snapshot.records.length >= MAX_FACTORY_REVISIONS) fail('REVISION_LIMIT');
  const records = [...snapshot.records, record];
  const raw = JSON.stringify({schemaVersion:FACTORY_WORKSPACE_SCHEMA, records});
  if (bytes(raw) > MAX_FACTORY_STORE_BYTES) fail('WORKSPACE_TOO_LARGE');
  // Recheck immediately before replacement; localStorage has no atomic CAS.
  baselineFor(storage, workspace);
  try { storage.setItem(FACTORY_WORKSPACE_KEY, raw); } catch { fail('STORAGE_WRITE_FAILED'); }
  let stored;
  try { stored = storage.getItem(FACTORY_WORKSPACE_KEY); } catch { fail('STORAGE_VERIFY_FAILED'); }
  if (stored !== raw) fail('STORAGE_VERIFY_FAILED');
  // Return the verified snapshot, not a third read that could silently fail.
  const result = {status:'ready', error:null, records:structuredClone(records)};
  observed.set(result, {storage, raw, readable:true, status:'ready', records:structuredClone(records)});
  return result;
}
export function matchingFactoryRevisions(workspace, config) {
  factoryConfigKey(config);
  const snapshot = observed.get(workspace);
  if (!snapshot || snapshot.status !== 'ready') return [];
  // Use private copies, not mutable objects exposed to the UI.
  return snapshot.records.filter(record => sameFactoryConfig(record.sourceConfig, config))
    .slice().reverse().map(record => structuredClone(record));
}
export function getFactoryRevision(workspace, id, config) {
  const record = matchingFactoryRevisions(workspace, config).find(item => item.id === id);
  if (!record) fail('REVISION_CONFIG_MISMATCH');
  return record;
}
export function exportFactoryRevision(record) {
  return JSON.stringify({schemaVersion:FACTORY_REVISION_EXPORT,
    record:validateRecord(record), productionRelease:{allowed:false}}, null, 2);
}
/** The exact observed raw string is preserved, including corrupt or future-format data. */
export function exportFactoryWorkspaceRaw(workspace) {
  const snapshot = observed.get(workspace);
  if (!snapshot || !snapshot.readable) fail('STORAGE_UNAVAILABLE');
  return JSON.stringify({schemaVersion:'gaber-factory-workspace-raw/1',
    raw:snapshot.raw, authority:'LOCAL_BACKUP_NOT_APPROVED'}, null, 2);
}

/**
 * Import old factory exports, a plain input draft, or a single local revision.
 * Supplied review/totals/approval are ignored. The caller MUST recompute the
 * manufacturing engine and audit before applying the returned input text.
 * No writes, no evaluation and no inferred unit conversions happen here.
 */
export function parseFactoryDraftImport(input, config) {
  if (typeof input !== 'string' || bytes(input) > MAX_FACTORY_IMPORT_BYTES) fail('IMPORT_TOO_LARGE');
  let payload;
  try { payload = JSON.parse(input); } catch { fail('IMPORT_JSON_INVALID'); }
  let draft;
  if (plain(payload) && payload.schemaVersion === FACTORY_REVISION_EXPORT) {
    const record = validateRecord(payload.record);
    if (!sameFactoryConfig(record.sourceConfig, config)) fail('IMPORT_CONFIG_MISMATCH');
    try { draft = JSON.parse(record.text); } catch { fail('IMPORT_DRAFT_INVALID'); }
  } else if (plain(payload) && payload.kind === 'GABER_FACTORY_COST_PREVIEW_NOT_APPROVED') {
    draft = payload.draft;
  } else {
    draft = payload;
  }
  if (!plain(draft) || draft.schemaVersion !== 'gaber-factory-cost-draft/0.4.7' ||
      !['quotes','consumption','workCenters','operations'].every(key => Array.isArray(draft[key])))
    fail('IMPORT_DRAFT_INVALID');
  if (!sameFactoryConfig(draft.sourceConfig, config)) fail('IMPORT_CONFIG_MISMATCH');
  // Normalize key order only. Never change dimensions/materials to make a stale draft fit.
  const clean = {schemaVersion:draft.schemaVersion, sourceConfig:structuredClone(config),
    asOfDate:draft.asOfDate, revisionId:draft.revisionId, parentRevisionId:draft.parentRevisionId,
    quotes:structuredClone(draft.quotes), consumption:structuredClone(draft.consumption),
    workCenters:structuredClone(draft.workCenters), operations:structuredClone(draft.operations)};
  const text = JSON.stringify(clean, null, 2);
  if (bytes(text) > MAX_FACTORY_TEXT_BYTES) fail('DRAFT_TOO_LARGE');
  return {text, draft:clean, productionRelease:{allowed:false}};
}
