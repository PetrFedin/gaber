-- Disposable PostgreSQL 17 contract exercise for GABER three-role schema.
-- Run only after 001..010 in an isolated GitHub-hosted service container.
-- This is NOT an authentication, bank, or production acceptance test.
\set ON_ERROR_STOP on
DO $pg$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE
   conrelid='gaber_orders.order_events'::regclass
   AND conname='gaber_three_role_commands_v10') THEN
  RAISE EXCEPTION 'MIGRATION_010_NOT_APPLIED';
 END IF;
 IF EXISTS(SELECT 1 FROM pg_constraint WHERE
   conrelid='gaber_orders.order_events'::regclass
   AND conname='gaber_three_role_commands_v6') THEN
  RAISE EXCEPTION 'STALE_COMMAND_ALLOWLIST';
 END IF;
END $pg$;
CREATE ROLE gaber_runtime_contract NOLOGIN;
GRANT USAGE ON SCHEMA gaber_orders TO gaber_runtime_contract;
GRANT SELECT,INSERT,UPDATE ON gaber_orders.order_resources TO gaber_runtime_contract;
GRANT SELECT,INSERT,UPDATE ON gaber_orders.order_heads TO gaber_runtime_contract;
GRANT SELECT,INSERT ON gaber_orders.order_events TO gaber_runtime_contract;
GRANT SELECT,INSERT ON gaber_orders.order_factory_assignments TO gaber_runtime_contract;
GRANT SELECT ON gaber_orders.factory_directory TO gaber_runtime_contract;
GRANT SELECT,UPDATE ON gaber_orders.dev_stock_skus TO gaber_runtime_contract;
GRANT SELECT,INSERT,UPDATE ON gaber_orders.dev_stock_reservations TO gaber_runtime_contract;
GRANT SELECT,INSERT ON gaber_orders.dev_stock_documents TO gaber_runtime_contract;
GRANT SELECT,INSERT ON gaber_orders.dev_stock_document_lines TO gaber_runtime_contract;
DO $pg$
BEGIN
 IF to_regclass('gaber_orders.dev_stock_skus') IS NULL OR
    to_regclass('gaber_orders.dev_stock_documents') IS NULL
 THEN RAISE EXCEPTION 'GABER_MIGRATION_011_REQUIRED'; END IF;
END $pg$;

-- A real onboarding process is outside this script. Fixture rows are explicit
-- admin-created test data and must not be used as verified real factories.
INSERT INTO gaber_orders.factory_directory
 (tenant_id,factory_id,status,verified_by,verified_at)
 VALUES
 ('TENANT-A','FACTORY-A','approved','TEST-ADMIN',now()),
 ('TENANT-A','FACTORY-PAUSED','suspended','TEST-ADMIN',now()),
 ('TENANT-B','FACTORY-A','approved','TEST-ADMIN',now());
INSERT INTO gaber_orders.order_resources(tenant_id,order_id,client_id)
 VALUES('TENANT-B','ORDER-B','BUYER-B');

BEGIN;
SET ROLE gaber_runtime_contract;
SET LOCAL app.tenant_id='TENANT-A';

-- Enforce that a restricted server role cannot read another tenant's rows.
DO $pg$
DECLARE visible integer;
BEGIN
 SELECT count(*) INTO visible FROM gaber_orders.order_resources
  WHERE tenant_id='TENANT-B';
 IF visible<>0 THEN RAISE EXCEPTION 'CROSS_TENANT_RESOURCE_READ'; END IF;
 SELECT count(*) INTO visible FROM gaber_orders.factory_directory
  WHERE tenant_id='TENANT-B';
 IF visible<>0 THEN RAISE EXCEPTION 'CROSS_TENANT_FACTORY_DIRECTORY_READ'; END IF;
 SELECT count(*) INTO visible FROM gaber_orders.factory_directory
  WHERE tenant_id='TENANT-A' AND status='approved' AND verified_at IS NOT NULL;
 IF visible<>1 THEN RAISE EXCEPTION 'INCORRECT_APPROVED_FACTORY_COUNT'; END IF;
END $pg$;

INSERT INTO gaber_orders.order_resources(tenant_id,order_id,client_id)
 VALUES('TENANT-A','ORDER-A','BUYER-A'),
       ('TENANT-A','ORDER-UNVERIFIED','BUYER-A');

-- Unknown factories cannot be assigned even when the order exists.
DO $pg$
BEGIN
 BEGIN
  INSERT INTO gaber_orders.order_factory_assignments
    (tenant_id,order_id,factory_id,assigned_by)
    VALUES('TENANT-A','ORDER-UNVERIFIED','UNKNOWN','GABER-ADMIN');
  RAISE EXCEPTION 'UNREGISTERED_FACTORY_ASSIGNMENT_WAS_ALLOWED';
 EXCEPTION WHEN foreign_key_violation THEN NULL;
 END;
END $pg$;

INSERT INTO gaber_orders.order_factory_assignments
 (tenant_id,order_id,factory_id,assigned_by)
 VALUES('TENANT-A','ORDER-A','FACTORY-A','GABER-ADMIN');

-- An attacker cannot write the next tenant's resource by setting order id.
DO $pg$
BEGIN
 BEGIN
  INSERT INTO gaber_orders.order_resources(tenant_id,order_id,client_id)
   VALUES('TENANT-B','FORGED-CROSS-TENANT','BUYER-A');
  RAISE EXCEPTION 'CROSS_TENANT_INSERT_ALLOWED';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $pg$;

-- Runtime can inspect the roster but must NEVER impersonate onboarding.
DO $pg$
BEGIN
 BEGIN
  INSERT INTO gaber_orders.factory_directory
   (tenant_id,factory_id,status,verified_by,verified_at)
   VALUES('TENANT-A','SELF-APPROVED','approved','ATTACKER',now());
  RAISE EXCEPTION 'RUNTIME_APPROVED_UNVERIFIED_FACTORY';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $pg$;

-- One complete append-only journal write; deferred consistency checks must
-- observe the final head version/hash at COMMIT, not the intermediate state.
INSERT INTO gaber_orders.order_heads(tenant_id,order_id,version,head_hash)
 VALUES('TENANT-A','ORDER-A',0,NULL);
INSERT INTO gaber_orders.order_events(
 tenant_id,order_id,seq,actor_id,request_id,request_hash,
 previous_hash,event_hash,command
) VALUES(
 'TENANT-A','ORDER-A',1,'BUYER-A','REQ-CREATE-1',repeat('a',64),
 NULL,repeat('b',64),
 '{"id":"REQ-CREATE-1","role":"client","type":"create",
    "expectedVersion":0,"payload":{"projectId":"ORDER-A","name":"Test sofa"}}'::jsonb
);
UPDATE gaber_orders.order_heads SET version=1,head_hash=repeat('b',64)
 WHERE tenant_id='TENANT-A' AND order_id='ORDER-A';

-- Even direct INSERTs (bypassing HTTP) cannot forge the new inspection roles.
DO $pg$
BEGIN
 BEGIN
  INSERT INTO gaber_orders.order_events(
   tenant_id,order_id,seq,actor_id,request_id,request_hash,
   previous_hash,event_hash,command
  ) VALUES(
   'TENANT-A','ORDER-A',2,'BUYER-A','REQ-FORGE-PACK',repeat('c',64),
   repeat('b',64),repeat('d',64),
   '{"id":"REQ-FORGE-PACK","role":"client","type":"record_packout",
      "revisionId":"R1","expectedVersion":1,
      "payload":{"reference":"fake","lines":[]}}'::jsonb
  );
  RAISE EXCEPTION 'CLIENT_FORGED_FACTORY_PACKOUT_IN_DB';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
 BEGIN
  INSERT INTO gaber_orders.order_events(
   tenant_id,order_id,seq,actor_id,request_id,request_hash,
   previous_hash,event_hash,command
  ) VALUES(
   'TENANT-A','ORDER-A',2,'FACTORY-A','REQ-FORGE-RECEIPT',repeat('c',64),
   repeat('b',64),repeat('d',64),
   '{"id":"REQ-FORGE-RECEIPT","role":"factory","type":"record_receipt",
      "revisionId":"R1","expectedVersion":1,
      "payload":{"reference":"fake","lines":[]}}'::jsonb
  );
  RAISE EXCEPTION 'FACTORY_FORGED_CUSTOMER_RECEIPT_IN_DB';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
END $pg$;
-- Runtime role may read synthetic DEV SKU catalog and edit quantities under
-- application-controlled serializable transactions, but never register a fake
-- factory item by directly inserting its own vendor SKU mapping.
DO $pg$
DECLARE n integer;
BEGIN
 SELECT count(*) INTO n FROM pg_class
 WHERE oid IN ('gaber_orders.dev_stock_skus'::regclass,
  'gaber_orders.dev_stock_reservations'::regclass,
  'gaber_orders.dev_stock_documents'::regclass,
  'gaber_orders.dev_stock_document_lines'::regclass)
 AND relrowsecurity AND relforcerowsecurity;
 IF n<>4 THEN RAISE EXCEPTION 'DEV_STOCK_RLS_OR_FORCE_MISSING'; END IF;
 BEGIN
  INSERT INTO gaber_orders.dev_stock_skus
   (tenant_id,factory_id,sku_id,part_ref,source_signature,name,on_hand_qty)
  VALUES('TENANT-A','FACTORY-A','FORGED-VENDOR','FRAME',repeat('f',64),
   'Forged vendor stock',9999);
  RAISE EXCEPTION 'RUNTIME_FORGED_STOCK_CATALOG';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $pg$;
-- RLS alone must not let a client inject a factory-private message.
DO $pg$
BEGIN
 BEGIN
  INSERT INTO gaber_orders.order_events(
   tenant_id,order_id,seq,actor_id,request_id,request_hash,
   previous_hash,event_hash,command
  ) VALUES(
   'TENANT-A','ORDER-A',2,'BUYER-A','REQ-INVALID-CHANNEL',repeat('c',64),
   repeat('b',64),repeat('d',64),
   '{"id":"REQ-INVALID-CHANNEL","role":"client","type":"message",
      "expectedVersion":1,"payload":{"note":"injection","channel":"factory_partner"}}'::jsonb
  );
  RAISE EXCEPTION 'CLIENT_FACTORY_CHANNEL_NOT_BLOCKED';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
END $pg$;
RESET ROLE;
COMMIT;

-- Directory revocation is an admin operation; immutable assignment remains.
UPDATE gaber_orders.factory_directory SET status='suspended',status_changed_at=now()
 WHERE tenant_id='TENANT-A' AND factory_id='FACTORY-A';
BEGIN;
SET ROLE gaber_runtime_contract;
SET LOCAL app.tenant_id='TENANT-A';
DO $pg$
DECLARE approved integer;assigned integer;events integer;
BEGIN
 SELECT count(*) INTO approved FROM gaber_orders.factory_directory
 WHERE tenant_id='TENANT-A' AND factory_id='FACTORY-A'
   AND status='approved' AND verified_at IS NOT NULL;
 IF approved<>0 THEN RAISE EXCEPTION 'REVOKED_FACTORY_STILL_APPROVED'; END IF;
 SELECT count(*) INTO assigned FROM gaber_orders.order_factory_assignments
 WHERE tenant_id='TENANT-A' AND order_id='ORDER-A' AND factory_id='FACTORY-A';
 IF assigned<>1 THEN RAISE EXCEPTION 'REVOKE_ERASED_ASSIGNMENT_EVIDENCE'; END IF;
 SELECT count(*) INTO events FROM gaber_orders.order_events
 WHERE tenant_id='TENANT-A' AND order_id='ORDER-A';
 IF events<>1 THEN RAISE EXCEPTION 'REVOKE_ERASED_IMMUTABLE_JOURNAL'; END IF;
END $pg$;
RESET ROLE;
COMMIT;

-- Database owner cannot tamper with immutable assignment evidence either.
DO $pg$
BEGIN
 BEGIN
  UPDATE gaber_orders.order_factory_assignments SET assigned_by='FORGED'
   WHERE tenant_id='TENANT-A' AND order_id='ORDER-A';
  RAISE EXCEPTION 'ASSIGNMENT_EVIDENCE_MUTABLE';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
END $pg$;

SELECT 'GABER_POSTGRES_17_STAGING_CONTRACT_GREEN' AS result;
