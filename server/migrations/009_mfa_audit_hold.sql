-- GABER 009: TOTP-MFA, постоянный ограничитель попыток и журнал событий входа. STAGING / DBA REVIEW ONLY.
-- Применять после 008. Секрет TOTP хранится зашифрованным (AES-256-GCM), ключ только в окружении сервера.
BEGIN;
DO $gaber$
BEGIN
 IF to_regclass('gaber_auth.users') IS NULL THEN RAISE EXCEPTION 'MIGRATION_008_REQUIRED'; END IF;
END $gaber$;

ALTER TABLE gaber_auth.users
  ADD COLUMN totp_secret_enc text,
  ADD COLUMN totp_enrolled_at timestamptz,
  ADD COLUMN totp_last_step bigint NOT NULL DEFAULT -1,
  ADD CONSTRAINT gaber_auth_totp_state_v9 CHECK(totp_enrolled_at IS NULL OR totp_secret_enc IS NOT NULL);

CREATE TABLE gaber_auth.login_attempts(
 id bigserial PRIMARY KEY,
 key text NOT NULL CHECK(length(key) BETWEEN 1 AND 300),
 at timestamptz NOT NULL
);
CREATE INDEX gaber_auth_login_attempts_v9 ON gaber_auth.login_attempts(key, at);

-- Журнал только на добавление: изменение и удаление запрещены триггером.
CREATE TABLE gaber_auth.auth_events(
 id bigserial PRIMARY KEY,
 at timestamptz NOT NULL DEFAULT now(),
 tenant_id text NOT NULL,
 user_id text,
 event text NOT NULL CHECK(event IN ('register','login_ok','login_fail','logout','mfa_enroll_started','mfa_enrolled','mfa_ok','mfa_fail','rate_limited')),
 ip text,
 detail jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX gaber_auth_events_user_v9 ON gaber_auth.auth_events(user_id, id);
CREATE FUNCTION gaber_auth.forbid_event_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'AUTH_EVENTS_APPEND_ONLY'; END $$;
CREATE TRIGGER auth_events_append_only BEFORE UPDATE OR DELETE ON gaber_auth.auth_events
  FOR EACH ROW EXECUTE FUNCTION gaber_auth.forbid_event_change();

GRANT UPDATE(totp_secret_enc,totp_enrolled_at,totp_last_step) ON gaber_auth.users TO gaber_auth_runtime;
GRANT SELECT,INSERT,DELETE ON gaber_auth.login_attempts TO gaber_auth_runtime;
GRANT USAGE ON SEQUENCE gaber_auth.login_attempts_id_seq TO gaber_auth_runtime;
GRANT INSERT ON gaber_auth.auth_events TO gaber_auth_runtime;
GRANT USAGE ON SEQUENCE gaber_auth.auth_events_id_seq TO gaber_auth_runtime;
COMMIT;
