-- GABER G3: six-role dialogue scoped to assigned partners.
-- FOR STAGING ONLY. Review against a live disposable PostgreSQL 17 instance.
-- Migration 002 accepts only client/factory commands and currently has
-- nullable JSON CHECK expressions. This migration preserves existing rows
-- while adding strict shape and tenant-safe thread controls.
BEGIN;
DO $gaber$
DECLARE old_role_constraint text; hits integer;
BEGIN
  SELECT count(*),min(conname) INTO hits,old_role_constraint
  FROM pg_constraint WHERE conrelid='gaber_orders.order_events'::regclass
    AND contype='c'
    AND pg_get_constraintdef(oid) LIKE '%role%'
    AND pg_get_constraintdef(oid) LIKE '%client%'
    AND pg_get_constraintdef(oid) LIKE '%factory%'
    AND conname NOT IN ('gaber_order_role_command_v3','gaber_order_command_shape_v3');
  IF hits<>1 THEN
    RAISE EXCEPTION 'EXPECTED_ONE_LEGACY_ROLE_CONSTRAINT, found %',hits;
  END IF;
  EXECUTE format('ALTER TABLE gaber_orders.order_events DROP CONSTRAINT %I',old_role_constraint);
END
$gaber$;

-- Prevent SQL's UNKNOWN / NULL CHECK loopholes for absent or null keys.
ALTER TABLE gaber_orders.order_events ADD CONSTRAINT gaber_order_command_shape_v3 CHECK (
  (
    jsonb_typeof(command)='object' AND
    jsonb_typeof(command->'payload')='object' AND
    jsonb_typeof(command->'expectedVersion')='number' AND
    (command->>'expectedVersion') ~ '^[0-9]{1,3}$' AND
    (command->>'expectedVersion')::integer = seq-1 AND
    command->>'id' = request_id AND
    command->>'role' IS NOT NULL AND
    command->>'type' IS NOT NULL
  ) IS TRUE
);

-- Brand/public messages are general. Private partner threads may contain
-- client, factory, owner or that exact partner. JavaScript policy must check
-- the resource.partner_ids array; SQL alone cannot authenticate a user.
ALTER TABLE gaber_orders.order_events ADD CONSTRAINT gaber_order_role_command_v3 CHECK (
 (
  (command->>'type' = 'message' AND
   command->>'role' IN ('client','factory','brand','partner','owner') AND
   (
    (command->>'role'='partner' AND
     jsonb_typeof(command->'payload'->'partnerId')='string' AND
     (command->'payload'->>'partnerId') ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$')
    OR (command->>'role'='brand' AND NOT (command->'payload' ? 'partnerId'))
    OR (command->>'role' IN ('client','factory','owner') AND
       (NOT (command->'payload' ? 'partnerId') OR
        (jsonb_typeof(command->'payload'->'partnerId')='string' AND
         (command->'payload'->>'partnerId') ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$')))
   )
  )
  OR
  (command->>'type' <> 'message' AND command->>'role' IN ('client','factory'))
 ) IS TRUE
);
COMMIT;
