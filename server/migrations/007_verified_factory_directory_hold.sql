-- GABER 007: trusted factory organisation directory and assignment integrity.
-- STAGING ONLY; apply after migrations 001..006 with a DBA-reviewed,
-- dedicated server DB role. This is not an identity-verification service.
BEGIN;
DO $gaber$
BEGIN
 IF to_regclass('gaber_orders.order_factory_assignments') IS NULL THEN
  RAISE EXCEPTION 'MIGRATION_006_REQUIRED';
 END IF;
 IF NOT EXISTS(
  SELECT 1 FROM pg_constraint
  WHERE conrelid='gaber_orders.order_events'::regclass
    AND conname='gaber_three_role_commands_v6'
 ) THEN RAISE EXCEPTION 'GABER_V6_COMMAND_CONSTRAINT_REQUIRED'; END IF;
END $gaber$;

-- The platform operator approves an organisation by a separate, auditable
-- onboarding process. Never accept a browser-supplied string as proof.
-- This is an organisation registry, NOT a fourth application user role.
CREATE TABLE gaber_orders.factory_directory(
 tenant_id text NOT NULL,
 factory_id text NOT NULL CHECK(
  factory_id ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$'),
 status text NOT NULL CHECK(status IN ('approved','suspended')),
 verified_by text NOT NULL CHECK(
  verified_by ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$'),
 verified_at timestamptz NOT NULL,
 status_changed_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,factory_id)
);
ALTER TABLE gaber_orders.factory_directory ENABLE ROW LEVEL SECURITY;
ALTER TABLE gaber_orders.factory_directory FORCE ROW LEVEL SECURITY;
CREATE POLICY approved_factory_directory_read_v7
 ON gaber_orders.factory_directory FOR SELECT
 USING (tenant_id=current_setting('app.tenant_id',true));
-- Only a separately provisioned, privileged onboarding DB role may receive
-- INSERT/UPDATE grants; the runtime order-processing role must have SELECT
-- only. RLS is tenant-scoped but custom GUCs are NOT authentication.
CREATE POLICY factory_directory_onboard_v7
 ON gaber_orders.factory_directory FOR INSERT
 WITH CHECK(tenant_id=current_setting('app.tenant_id',true));
CREATE POLICY factory_directory_status_update_v7
 ON gaber_orders.factory_directory FOR UPDATE
 USING(tenant_id=current_setting('app.tenant_id',true))
 WITH CHECK(tenant_id=current_setting('app.tenant_id',true));
CREATE FUNCTION gaber_orders.reject_factory_directory_delete() RETURNS trigger
 LANGUAGE plpgsql AS $$
 BEGIN
  RAISE EXCEPTION 'FACTORY_DIRECTORY_EVIDENCE_IMMUTABLE'
   USING ERRCODE='check_violation';
 END;
 $$;
CREATE TRIGGER factory_directory_no_delete BEFORE DELETE
 ON gaber_orders.factory_directory FOR EACH ROW
 EXECUTE FUNCTION gaber_orders.reject_factory_directory_delete();

-- A recorded assignment must reference an existing organisation in the SAME
-- tenant. Current approval is verified by the server at assignment and at
-- every factory read/write; an FK alone cannot express revocation status.
DO $gaber$
BEGIN
 IF EXISTS(
  SELECT 1 FROM gaber_orders.order_factory_assignments AS a
  LEFT JOIN gaber_orders.factory_directory AS d
    ON d.tenant_id=a.tenant_id AND d.factory_id=a.factory_id
  WHERE d.factory_id IS NULL
 ) THEN
  RAISE EXCEPTION 'UNVERIFIED_LEGACY_FACTORY_ASSIGNMENTS';
 END IF;
END $gaber$;
ALTER TABLE gaber_orders.order_factory_assignments
 ADD CONSTRAINT factory_assignment_verified_directory_v7
 FOREIGN KEY(tenant_id,factory_id)
 REFERENCES gaber_orders.factory_directory(tenant_id,factory_id)
 ON UPDATE RESTRICT ON DELETE RESTRICT;

REVOKE ALL ON gaber_orders.factory_directory FROM PUBLIC;
REVOKE ALL ON FUNCTION gaber_orders.reject_factory_directory_delete() FROM PUBLIC;
-- GRANT SELECT on directory to the trusted runtime DB role only.
-- GRANT SELECT/INSERT/UPDATE to a separate, reviewed onboarding DB role.
-- Do not grant directory INSERT/UPDATE to browser/anon/public/runtime.
-- No factory rows are pre-approved by this migration.
COMMIT;
