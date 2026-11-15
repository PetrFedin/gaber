-- Disposable PostgreSQL 17 HTTP integration test fixture.
-- Apply AFTER 001..007 and postgres-staging-v007.sql; NEVER on production.
\set ON_ERROR_STOP on
CREATE ROLE gaber_http_ci
  LOGIN PASSWORD 'gaber_http_disposable_only' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
GRANT gaber_runtime_contract TO gaber_http_ci;
DO $$
BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='gaber_http_ci'
           AND (rolsuper OR rolbypassrls OR rolcreaterole)) THEN
  RAISE EXCEPTION 'INSECURE_E2E_SERVER_ROLE';
 END IF;
END;
$$;
-- These are explicitly fake organisations and a test administrator, NOT
-- verified business identities and not a tenant onboarding implementation.
INSERT INTO gaber_orders.factory_directory
 (tenant_id,factory_id,status,verified_by,verified_at)
VALUES
 ('TENANT-API-A','FAB-A','approved','E2E-ADMIN',now()),
 ('TENANT-API-A','FAB-OTHER','approved','E2E-ADMIN',now()),
 ('TENANT-API-A','FAB-PAUSED','suspended','E2E-ADMIN',now()),
 ('TENANT-API-B','FAB-B-ONLY','approved','E2E-ADMIN',now()),
 ('TENANT-API-B','FAB-A','approved','E2E-ADMIN',now());
SELECT 'GABER_HTTP_E2E_DB_FIXTURES_READY' AS result;
