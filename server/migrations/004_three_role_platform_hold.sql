-- Three-role GABER platform contract. STAGING / DBA REVIEW ONLY.
-- Apply 001 -> 002 -> 003 -> 004 on an isolated PostgreSQL 17 database.
-- Historical six-role rows must be audited/migrated on a separate staging copy;
-- immutable event evidence MUST NOT be silently rewritten. Fail closed on drift.
BEGIN;
DO $gaber$
DECLARE hit_count integer; legacy_type text;
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint
  WHERE conrelid='gaber_orders.order_events'::regclass
    AND conname='gaber_order_role_command_v3') THEN
  RAISE EXCEPTION 'REQUIRED_V3_ROLE_CONSTRAINT_MISSING';
 END IF;
 SELECT count(*),min(conname) INTO hit_count,legacy_type FROM pg_constraint
  WHERE conrelid='gaber_orders.order_events'::regclass AND contype='c'
  AND pg_get_constraintdef(oid) LIKE '%create%'
  AND pg_get_constraintdef(oid) LIKE '%offer%'
  AND pg_get_constraintdef(oid) LIKE '%report_payment%'
  AND conname NOT IN ('gaber_order_role_command_v3',
    'gaber_order_command_shape_v3','gaber_three_role_commands_v4');
 IF hit_count<>1 THEN RAISE EXCEPTION 'EXPECTED_ONE_LEGACY_COMMAND_TYPE_CHECK, found %',hit_count; END IF;
 EXECUTE format('ALTER TABLE gaber_orders.order_events DROP CONSTRAINT %I',legacy_type);
END
$gaber$;

ALTER TABLE gaber_orders.order_events DROP CONSTRAINT gaber_order_role_command_v3;
ALTER TABLE gaber_orders.order_events ADD CONSTRAINT gaber_three_role_commands_v4 CHECK (
 (
  (command->>'type' = 'message' AND
   command->>'role' IN ('client','factory','partner') AND
   (command->'payload' ? 'note') AND
   NOT (command->'payload' ? 'partnerId') AND
   NOT (command->'payload' ? 'privateThread'))
  OR
  (command->>'type' = 'create' AND command->>'role' = 'client')
  OR
  (command->>'type' = 'prepare_spec' AND command->>'role' = 'partner' AND
   NOT (command ? 'revisionId'))
  OR
  (command->>'type' IN ('confirm_spec','return_spec') AND
   command->>'role' = 'factory' AND command ? 'revisionId')
  OR
  (command->>'type' = 'offer' AND command->>'role' = 'partner' AND
   command ? 'revisionId')
  OR
  (command->>'type' = 'record_payment' AND command->>'role' = 'partner')
  OR
  (command->>'type' IN ('quality_pass','ship','deliver','start','complete') AND
   command->>'role' = 'factory')
  OR
  (command->>'type' = 'respond_issue' AND command->>'role' IN ('factory','partner'))
  OR
  (command->>'type' IN ('accept','request_change','report_payment','allocate_credit',
   'accept_delivery','report_issue','reject_resolution','confirm_resolution')
   AND command->>'role' = 'client')
 ) IS TRUE
);
-- Separate immutable factory cost, TЗ and planned platform fee live only inside
-- partner prepare_spec journal events, protected by tenant-scoped DB and actor ACL.
-- Client/factory never receive that raw event; DTO projection is mandatory.
-- This migration does NOT authorize PSP settlement, QC, manufacture or shipping.
COMMIT;
