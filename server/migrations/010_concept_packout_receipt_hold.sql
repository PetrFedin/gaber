-- GABER 010: concept-only packout and independent customer receipt event types.
-- Apply after 001..009 on disposable PostgreSQL 17 staging.
-- SQL allowlist is an ADDITIONAL guard, not principal authentication or real inventory authority.
BEGIN;
DO $gaber$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint
   WHERE conrelid='gaber_orders.order_events'::regclass
    AND conname='gaber_three_role_commands_v6')
 THEN RAISE EXCEPTION 'GABER_V6_COMMAND_ALLOWLIST_REQUIRED'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint
   WHERE conrelid='gaber_orders.order_events'::regclass
    AND conname='gaber_order_message_channel_v5')
 THEN RAISE EXCEPTION 'GABER_V5_MESSAGE_SCOPE_REQUIRED'; END IF;
END $gaber$;

ALTER TABLE gaber_orders.order_events DROP CONSTRAINT gaber_three_role_commands_v6;
ALTER TABLE gaber_orders.order_events
 ADD CONSTRAINT gaber_three_role_commands_v10 CHECK ((
  (command->>'type'='message' AND command->>'role' IN ('client','factory','partner')
   AND command->'payload' ? 'note'
   AND NOT (command->'payload' ? 'partnerId')
   AND NOT (command->'payload' ? 'privateThread'))
  OR (command->>'type'='create' AND command->>'role'='client')
  OR (command->>'type'='assign_factory' AND command->>'role'='partner'
   AND NOT (command ? 'revisionId')
   AND jsonb_typeof(command->'payload'->'factoryId')='string'
   AND (command->'payload'->>'factoryId') ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$')
  OR (command->>'type'='prepare_spec' AND command->>'role'='partner'
   AND NOT (command ? 'revisionId'))
  OR (command->>'type' IN ('confirm_spec','return_spec')
   AND command->>'role'='factory' AND command ? 'revisionId')
  OR (command->>'type'='offer' AND command->>'role'='partner'
   AND command ? 'revisionId')
  OR (command->>'type'='record_payment' AND command->>'role'='partner')
  OR (command->>'type' IN ('quality_pass','ship','deliver','start','complete')
   AND command->>'role'='factory')
  OR (command->>'type'='respond_issue' AND command->>'role' IN ('factory','partner'))
  OR (command->>'type' IN ('accept','request_change','report_payment',
   'allocate_credit','accept_delivery','report_issue',
   'reject_resolution','confirm_resolution') AND command->>'role'='client')
  -- New concept-only ledger entries: no user-controlled approval, balance,
  -- bank assertion, factory production release or transaction scope.
  OR (command->>'type' IN ('record_packout','amend_packout')
   AND command->>'role'='factory' AND command ? 'revisionId'
   AND jsonb_typeof(command->'payload'->'reference')='string'
   AND jsonb_typeof(command->'payload'->'lines')='array')
  OR (command->>'type'='record_receipt'
   AND command->>'role'='client' AND command ? 'revisionId'
   AND jsonb_typeof(command->'payload'->'reference')='string'
   AND jsonb_typeof(command->'payload'->'lines')='array')
 ) IS TRUE);
-- Existing order_events INSERT ONLY and DELETE/UPDATE denial triggers, tenant RLS,
-- and all full journal hash-chain / expectedVersion / MFA and membership checks persist.
-- Historic events are not rewritten or backfilled. Production remains HOLD.
COMMIT;
