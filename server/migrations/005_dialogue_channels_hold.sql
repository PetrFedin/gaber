-- GABER three-role dialogue scopes, staging PostgreSQL 17 only.
-- Requires migrations 001..004 and independent DBA/RLS review.
-- Old immutable messages without a channel are SHARED by design; no rewriting.
BEGIN;
DO $gaber$
BEGIN
 IF NOT EXISTS(
  SELECT 1 FROM pg_constraint
  WHERE conrelid='gaber_orders.order_events'::regclass
   AND conname='gaber_three_role_commands_v4'
 ) THEN RAISE EXCEPTION 'GABER_V4_COMMAND_CONSTRAINT_REQUIRED'; END IF;
END $gaber$;
ALTER TABLE gaber_orders.order_events
 ADD CONSTRAINT gaber_order_message_channel_v5 CHECK((
  command->>'type' <> 'message'
  OR (
   (
    NOT (command->'payload' ? 'channel')
    OR (jsonb_typeof(command->'payload'->'channel')='string' AND
        command->'payload'->>'channel' IN ('shared','client_partner','factory_partner'))
   )
   AND (
    command->>'role'='partner'
    OR (command->>'role'='client' AND
        (NOT (command->'payload' ? 'channel') OR
         command->'payload'->>'channel' IN ('shared','client_partner')))
    OR (command->>'role'='factory' AND
        (NOT (command->'payload' ? 'channel') OR
         command->'payload'->>'channel' IN ('shared','factory_partner')))
   )
  )
 ) IS TRUE);
-- Server authorization must check session role and tenant membership;
-- SQL CHECK is neither login verification nor row-scoped read permission.
COMMIT;
