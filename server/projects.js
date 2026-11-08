import {checkConfig, getFamily} from '../shared/domain.js';
import {estimate, defaultProfile} from '../shared/costing.js';

export async function activeProfile(db) {
  const {rows} = await db.query('SELECT profile FROM rate_profiles ORDER BY id DESC LIMIT 1');
  return rows[0]?.profile || defaultProfile();
}

export const SELECT_PROJECT = `
  SELECT p.id, p.name, p.created_at, p.owner_id, u.email AS owner_email,
         r.id AS request_id, r.status, r.quote_price, r.quote_discount, r.internal_margin, r.updated_at,
         v.id AS version_id, v.version, v.config, v.catalog_version, v.price, v.estimate, v.image,
         (SELECT count(*)::int FROM project_versions x WHERE x.project_id = p.id) AS version_count
  FROM projects p
  JOIN requests r ON r.project_id = p.id
  JOIN project_versions v ON v.id = r.version_id
  JOIN users u ON u.id = p.owner_id
  WHERE p.deleted_at IS NULL`;

export async function eventsFor(db, requestIds, staff) {
  if (!requestIds.length) return new Map();
  const {rows} = await db.query(
    `SELECT e.request_id, e.label, e.comment, e.internal_note, e.to_status, e.created_at, a.role AS actor_role
     FROM request_events e JOIN users a ON a.id = e.actor_id
     WHERE e.request_id = ANY($1::uuid[]) ORDER BY e.id`,
    [requestIds]
  );
  const map = new Map();
  for (const e of rows) {
    const out = {date: e.created_at, label: e.label, status: e.to_status, comment: e.comment || undefined};
    if (staff) Object.assign(out, {internalNote: e.internal_note || undefined, actorRole: e.actor_role});
    map.set(e.request_id, [...(map.get(e.request_id) || []), out]);
  }
  return map;
}

// Представление проекта. Для клиента: только цена. estimate (себестоимость, нормы, маржа) — только staff.
export function viewProject(row, events, staff) {
  const out = {
    id: row.id,
    name: row.name,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    version: row.version,
    versionCount: row.version_count,
    config: row.config,
    image: row.image,
    catalogVersion: row.catalog_version,
    price: row.price,
    quote:
      row.status === 'approved' && row.quote_price != null
        ? {price: row.quote_price, discount: Number(row.quote_discount)}
        : null,
    events: events || []
  };
  if (staff) {
    out.owner = row.owner_email;
    out.estimate = row.estimate;
    out.internalMargin = row.internal_margin == null ? null : Number(row.internal_margin);
  }
  return out;
}

export async function loadProject(db, id, {ownerId, staff = false, lock = false} = {}) {
  const params = [id];
  let sql = SELECT_PROJECT + ' AND p.id = $1';
  if (ownerId) {
    params.push(ownerId);
    sql += ' AND p.owner_id = $2';
  }
  if (lock) sql += ' FOR UPDATE OF r';
  const {rows} = await db.query(sql, params);
  if (!rows[0]) return null;
  const ev = await eventsFor(db, [rows[0].request_id], staff);
  return viewProject(rows[0], ev.get(rows[0].request_id), staff);
}

// Проверка конфигурации и расчёт на сервере: клиентским цифрам не доверяем.
export function priceConfig(input, profile) {
  const {config, errors} = checkConfig(input);
  if (!config) return {errors};
  return {config, errors: [], estimate: estimate(config, 0, profile), family: getFamily(config)};
}

export const IMAGE_LIMIT = 700_000;
export const cleanImage = (v) =>
  typeof v === 'string' &&
  v.length <= IMAGE_LIMIT &&
  /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(v)
    ? v
    : null;
