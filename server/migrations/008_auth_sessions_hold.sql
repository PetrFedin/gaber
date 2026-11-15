-- GABER 008: серверные учётные записи и сессии (закрывает код-часть issue #5). STAGING / DBA REVIEW ONLY.
-- Применять после 001..007 в изолированной PostgreSQL 17. Это НЕ MFA, НЕ проверка личности организации
-- и НЕ допуск в production. Пароли хранятся как argon2id-хеш, токены сессий как SHA-256.
BEGIN;
DO $gaber$
BEGIN
 IF to_regclass('gaber_orders.factory_directory') IS NULL THEN
  RAISE EXCEPTION 'MIGRATION_007_REQUIRED';
 END IF;
END $gaber$;

CREATE SCHEMA IF NOT EXISTS gaber_auth;
REVOKE ALL ON SCHEMA gaber_auth FROM PUBLIC;

CREATE TABLE gaber_auth.users(
 user_id text PRIMARY KEY CHECK(user_id ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$'),
 tenant_id text NOT NULL CHECK(tenant_id ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$'),
 email text NOT NULL CHECK(length(email) BETWEEN 3 AND 254),
 name text NOT NULL DEFAULT '' CHECK(length(name)<=80),
 password_hash text NOT NULL CHECK(password_hash LIKE '$argon2id$%'),
 -- Ровно три роли политики доступа. Партнёр: оператор платформы; фабрика привязана к организации.
 role text NOT NULL CHECK(role IN ('client','factory','partner')),
 factory_id text CHECK(factory_id ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$'),
 created_at timestamptz NOT NULL DEFAULT now(),
 disabled_at timestamptz,
 UNIQUE(tenant_id,user_id),
 CHECK((role='factory')=(factory_id IS NOT NULL))
);
CREATE UNIQUE INDEX gaber_auth_users_email_v8 ON gaber_auth.users(tenant_id,lower(email));

CREATE TABLE gaber_auth.sessions(
 token_hash text PRIMARY KEY CHECK(token_hash ~ '^[a-f0-9]{64}$'),
 user_id text NOT NULL,
 tenant_id text NOT NULL,
 created_at timestamptz NOT NULL,
 expires_at timestamptz NOT NULL CHECK(expires_at>created_at),
 revoked_at timestamptz,
 -- Заполняется только будущим реальным MFA. Сейчас всегда NULL.
 mfa_verified_at timestamptz,
 FOREIGN KEY(tenant_id,user_id) REFERENCES gaber_auth.users(tenant_id,user_id) ON DELETE CASCADE
);
CREATE INDEX gaber_auth_sessions_user_v8 ON gaber_auth.sessions(user_id);

-- Отдельная DB-роль для входа и сессий. Роль обработки заказов (gaber_runtime_contract) доступа сюда не получает.
DO $gaber$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='gaber_auth_runtime') THEN
  CREATE ROLE gaber_auth_runtime NOLOGIN;
 END IF;
END $gaber$;
GRANT USAGE ON SCHEMA gaber_auth TO gaber_auth_runtime;
GRANT SELECT,INSERT ON gaber_auth.users TO gaber_auth_runtime;
GRANT SELECT,INSERT,UPDATE ON gaber_auth.sessions TO gaber_auth_runtime;
-- Заведение фабрик и партнёров, смена ролей и блокировка (UPDATE users) только отдельной onboarding-ролью DBA.
COMMIT;
