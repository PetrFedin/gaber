-- v0.4.18 order ledger. NOT payment, carrier or manufacturing authority.
-- Staging PostgreSQL 17 only: DBA review, two-tenant RLS tests required.
BEGIN;
CREATE SCHEMA IF NOT EXISTS gaber_orders;
REVOKE ALL ON SCHEMA gaber_orders FROM PUBLIC;
CREATE TABLE gaber_orders.order_resources(
 tenant_id text NOT NULL,order_id text NOT NULL,client_id text NOT NULL,
 brand_id text,factory_id text,partner_ids text[] NOT NULL DEFAULT '{}',
 PRIMARY KEY(tenant_id,order_id)
);
CREATE TABLE gaber_orders.order_heads(
 tenant_id text NOT NULL,order_id text NOT NULL,
 version integer NOT NULL DEFAULT 0 CHECK(version BETWEEN 0 AND 500),
 head_hash text CHECK(head_hash IS NULL OR head_hash ~ '^[a-f0-9]{64}$'),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,order_id),
 FOREIGN KEY(tenant_id,order_id) REFERENCES gaber_orders.order_resources(tenant_id,order_id),
 CHECK((version=0 AND head_hash IS NULL) OR(version>0 AND head_hash IS NOT NULL))
);
CREATE TABLE gaber_orders.order_events(
 tenant_id text NOT NULL,order_id text NOT NULL,
 seq integer NOT NULL CHECK(seq BETWEEN 1 AND 500),
 actor_id text NOT NULL,request_id text NOT NULL,
 request_hash text NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),
 previous_hash text CHECK(previous_hash IS NULL OR previous_hash ~ '^[a-f0-9]{64}$'),
 event_hash text NOT NULL CHECK(event_hash ~ '^[a-f0-9]{64}$'),
 command jsonb NOT NULL CHECK(jsonb_typeof(command)='object'),
 recorded_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,order_id,seq),UNIQUE(tenant_id,order_id,request_id),
 FOREIGN KEY(tenant_id,order_id) REFERENCES gaber_orders.order_heads(tenant_id,order_id),
 CHECK((seq=1 AND previous_hash IS NULL) OR (seq>1 AND previous_hash IS NOT NULL)),
 CHECK(command->>'id'=request_id),
 CHECK(command->>'role' IN ('client','factory')),
 CHECK(command->>'type' IN ('create','message','offer','accept','request_change',
  'report_payment','record_payment','allocate_credit','report_issue',
  'respond_issue','reject_resolution','confirm_resolution'))
);
CREATE FUNCTION gaber_orders.deny_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'IMMUTABLE_ORDER_EVIDENCE' USING ERRCODE='check_violation'; END;
$$;
CREATE TRIGGER lock_resource BEFORE UPDATE OR DELETE ON gaber_orders.order_resources
 FOR EACH ROW EXECUTE FUNCTION gaber_orders.deny_mutation();
CREATE TRIGGER lock_event BEFORE UPDATE OR DELETE ON gaber_orders.order_events
 FOR EACH ROW EXECUTE FUNCTION gaber_orders.deny_mutation();
CREATE FUNCTION gaber_orders.enforce_head_step() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'ORDER_HEAD_DELETE_DENIED'; END IF;
 IF NEW.tenant_id<>OLD.tenant_id OR NEW.order_id<>OLD.order_id OR
 NEW.version<>OLD.version+1 OR NEW.head_hash IS NULL THEN
 RAISE EXCEPTION 'INVALID_HEAD_STEP'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER head_step BEFORE UPDATE OR DELETE ON gaber_orders.order_heads
 FOR EACH ROW EXECUTE FUNCTION gaber_orders.enforce_head_step();
CREATE FUNCTION gaber_orders.check_head_events() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE n integer; h text; v integer; tip text;
BEGIN
 SELECT version,head_hash INTO v,h FROM gaber_orders.order_heads
 WHERE tenant_id=NEW.tenant_id AND order_id=NEW.order_id;
 SELECT count(*),max(event_hash) FILTER(WHERE seq=v) INTO n,tip
 FROM gaber_orders.order_events WHERE tenant_id=NEW.tenant_id AND order_id=NEW.order_id;
 IF v IS NULL OR n<>v OR (v=0 AND h IS NOT NULL) OR
 (v>0 AND (tip IS NULL OR h<>tip)) THEN
 RAISE EXCEPTION 'INCOMPLETE_ORDER_JOURNAL'; END IF;
 RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER head_consistency AFTER INSERT OR UPDATE ON gaber_orders.order_heads
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION gaber_orders.check_head_events();
CREATE CONSTRAINT TRIGGER event_consistency AFTER INSERT ON gaber_orders.order_events
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION gaber_orders.check_head_events();
ALTER TABLE gaber_orders.order_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE gaber_orders.order_resources FORCE ROW LEVEL SECURITY;
ALTER TABLE gaber_orders.order_heads ENABLE ROW LEVEL SECURITY;
ALTER TABLE gaber_orders.order_heads FORCE ROW LEVEL SECURITY;
ALTER TABLE gaber_orders.order_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE gaber_orders.order_events FORCE ROW LEVEL SECURITY;
CREATE POLICY resource_read ON gaber_orders.order_resources FOR SELECT
 USING(tenant_id=current_setting('app.tenant_id',true));
CREATE POLICY resource_lock ON gaber_orders.order_resources FOR UPDATE
 USING(tenant_id=current_setting('app.tenant_id',true))
 WITH CHECK(tenant_id=current_setting('app.tenant_id',true));
CREATE POLICY head_read ON gaber_orders.order_heads FOR SELECT
 USING(tenant_id=current_setting('app.tenant_id',true));
CREATE POLICY head_add ON gaber_orders.order_heads FOR INSERT
 WITH CHECK(tenant_id=current_setting('app.tenant_id',true));
CREATE POLICY head_change ON gaber_orders.order_heads FOR UPDATE
 USING(tenant_id=current_setting('app.tenant_id',true))
 WITH CHECK(tenant_id=current_setting('app.tenant_id',true));
CREATE POLICY event_read ON gaber_orders.order_events FOR SELECT
 USING(tenant_id=current_setting('app.tenant_id',true));
CREATE POLICY event_add ON gaber_orders.order_events FOR INSERT
 WITH CHECK(tenant_id=current_setting('app.tenant_id',true));
REVOKE ALL ON ALL TABLES IN SCHEMA gaber_orders FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA gaber_orders FROM PUBLIC;
-- No grants to anon/browser users. app.tenant_id alone is NOT authentication.
-- Real order_resources must be created by a trusted membership/onboarding service.
COMMIT;
