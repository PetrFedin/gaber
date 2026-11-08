-- GABER: первая схема. Данные и нормы демонстрационные.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL,
  name          text NOT NULL DEFAULT '',
  password_hash text NOT NULL,
  role          text NOT NULL CHECK (role IN ('client', 'manager', 'technologist')),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_key ON users (lower(email));

-- Серверные сессии: в базе только SHA-256 токена, сам токен живёт в httpOnly-cookie.
CREATE TABLE sessions (
  token_hash text PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX sessions_user_idx ON sessions (user_id);

CREATE TABLE projects (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id   uuid NOT NULL REFERENCES users(id),
  name       text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE INDEX projects_owner_idx ON projects (owner_id) WHERE deleted_at IS NULL;

-- Неизменяемые версии конфигурации. estimate — внутренняя калькуляция (себестоимость, нормы),
-- клиентскому API она не отдаётся; price продублирована для быстрых выборок.
CREATE TABLE project_versions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid NOT NULL REFERENCES projects(id),
  version         integer NOT NULL CHECK (version > 0),
  config          jsonb NOT NULL,
  catalog_version text NOT NULL,
  price           integer NOT NULL CHECK (price >= 0),
  estimate        jsonb NOT NULL,
  image           text,
  created_by      uuid NOT NULL REFERENCES users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, version)
);
CREATE FUNCTION forbid_version_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'project_versions неизменяемы';
END $$;
CREATE TRIGGER project_versions_immutable
  BEFORE UPDATE OR DELETE ON project_versions
  FOR EACH ROW EXECUTE FUNCTION forbid_version_change();

-- Заявка: по одной на проект. Конечный автомат draft -> requested -> approved | changes -> requested.
CREATE TABLE requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id    uuid NOT NULL UNIQUE REFERENCES projects(id),
  version_id    uuid NOT NULL REFERENCES project_versions(id),
  status        text NOT NULL CHECK (status IN ('draft', 'requested', 'approved', 'changes')),
  quote_price   integer,
  quote_discount numeric(4, 1),
  internal_margin numeric(6, 2),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX requests_status_idx ON requests (status);

-- История решений и переходов. comment виден клиенту, internal_note — только персоналу.
CREATE TABLE request_events (
  id            bigserial PRIMARY KEY,
  request_id    uuid NOT NULL REFERENCES requests(id),
  actor_id      uuid NOT NULL REFERENCES users(id),
  from_status   text,
  to_status     text NOT NULL,
  label         text NOT NULL,
  comment       text,
  internal_note text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX request_events_request_idx ON request_events (request_id, id);

CREATE TABLE idempotency_keys (
  user_id         uuid NOT NULL REFERENCES users(id),
  key             text NOT NULL CHECK (length(key) BETWEEN 8 AND 128),
  request_hash    text NOT NULL,
  response_status integer,
  response_body   jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);

-- Активные ставки калькуляции; последняя запись действует. Пока записей нет, берётся демо-профиль.
CREATE TABLE rate_profiles (
  id         bigserial PRIMARY KEY,
  profile    jsonb NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
