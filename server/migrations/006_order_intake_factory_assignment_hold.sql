-- GABER G0/G4: atomic client order intake + one immutable factory assignment.
-- PostgreSQL 17 STAGING ONLY. Apply after 001..005 on an isolated database.
-- Requires DBA review, explicit server-role grants and independent two-tenant tests.
BEGIN;
DO $gaber$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint
  WHERE conrelid='gaber_orders.order_events'::regclass
    AND conname='gaber_three_role_commands_v4')
 THEN RAISE EXCEPTION 'GABER_V4_CONSTRAINT_REQUIRED'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint
  WHERE conrelid='gaber_orders.order_events'::regclass
    AND conname='gaber_order_message_channel_v5')
 THEN RAISE EXCEPTION 'GABER_V5_CHANNEL_CONSTRAINT_REQUIRED'; END IF;
END $gaber$;

-- The verified client session supplies tenant_id and client_id; browser JSON
-- never chooses them. The application uses this policy only under a trusted
-- DB role with RLS enforced; CUSTOM GUCs ARE NOT AUTHENTICATION.
CREATE POLICY order_resource_create_v6 ON gaber_orders.order_resources FOR INSERT
 WITH CHECK(tenant_id=current_setting('app.tenant_id',true));

-- The base order resource remains immutable. The partner records ONE factory
-- assignment as a separate immutable row, not an UPDATE on the client record.
CREATE TABLE gaber_orders.order_factory_assignments(
 tenant_id text NOT NULL,
 order_id text NOT NULL,
 factory_id text NOT NULL
  CHECK(factory_id ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$'),
 assigned_by text NOT NULL
  CHECK(assigned_by ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$'),
 assigned_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,order_id),
 FOREIGN KEY(tenant_id,order_id)
  REFERENCES gaber_orders.order_resources(tenant_id,order_id)
);
CREATE TRIGGER lock_factory_assignment BEFORE UPDATE OR DELETE
 ON gaber_orders.order_factory_assignments FOR EACH ROW
 EXECUTE FUNCTION gaber_orders.deny_mutation();
ALTER TABLE gaber_orders.order_factory_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE gaber_orders.order_factory_assignments FORCE ROW LEVEL SECURITY;
CREATE POLICY factory_assignment_read_v6
 ON gaber_orders.order_factory_assignments FOR SELECT
 USING(tenant_id=current_setting('app.tenant_id',true));
CREATE POLICY factory_assignment_insert_v6
 ON gaber_orders.order_factory_assignments FOR INSERT
 WITH CHECK(tenant_id=current_setting('app.tenant_id',true));
REVOKE ALL ON gaber_orders.order_factory_assignments FROM PUBLIC;

-- Preserve the strict v4 allowlist and add only partner.assign_factory.
-- v5 message-channel CHECK remains in place.
ALTER TABLE gaber_orders.order_events
 DROP CONSTRAINT gaber_three_role_commands_v4;
ALTER TABLE gaber_orders.order_events
 ADD CONSTRAINT gaber_three_role_commands_v6 CHECK ((
  (command->>'type'='message' AND
   command->>'role' IN ('client','factory','partner') AND
   (command->'payload' ? 'note') AND
   NOT (command->'payload' ? 'partnerId') AND
   NOT (command->'payload' ? 'privateThread'))
  OR
  (command->>'type'='create' AND command->>'role'='client')
  OR
  (command->>'type'='assign_factory' AND command->>'role'='partner' AND
   NOT (command ? 'revisionId') AND
   jsonb_typeof(command->'payload'->'factoryId')='string' AND
   (command->'payload'->>'factoryId') ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$')
  OR
  (command->>'type'='prepare_spec' AND command->>'role'='partner' AND
   NOT (command ? 'revisionId'))
  OR
  (command->>'type' IN ('confirm_spec','return_spec') AND
   command->>'role'='factory' AND command ? 'revisionId')
  OR
  (command->>'type'='offer' AND command->>'role'='partner' AND
   command ? 'revisionId')
  OR
  (command->>'type'='record_payment' AND command->>'role'='partner')
  OR
  (command->>'type' IN ('quality_pass','ship','deliver','start','complete') AND
   command->>'role'='factory')
  OR
  (command->>'type'='respond_issue' AND command->>'role' IN ('factory','partner'))
  OR
  (command->>'type' IN ('accept','request_change','report_payment',
   'allocate_credit','accept_delivery','report_issue',
   'reject_resolution','confirm_resolution') AND command->>'role'='client')
 ) IS TRUE);
-- Server transaction orders client CREATE: auth -> reducer validation ->
-- resource INSERT -> head INSERT -> event INSERT -> head CAS -> COMMIT.
-- Partner assignment: auth -> reducer validation -> immutable assignment
-- INSERT -> event INSERT -> head CAS -> COMMIT. Any exception ROLLBACKs all.
-- No factory reassignment, real payment or manufacturing authority included.
-- Security assumes trusted server Pool, non-browser DB role and tenant RLS.
COMMIT;
