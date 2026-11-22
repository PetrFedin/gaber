-- GABER 011 DEV synthetic catalog + SERIALIZABLE reservations + append-only batch documents.
-- No real warehouse or supplier SKU authority; no production grants. DBA review required.
BEGIN;
DO $gate$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint
   WHERE conrelid='gaber_orders.order_events'::regclass
     AND conname='gaber_three_role_commands_v10') THEN
  RAISE EXCEPTION 'GABER_MIGRATION_010_REQUIRED';
 END IF;
END $gate$;
CREATE TABLE gaber_orders.dev_stock_skus(
 tenant_id text NOT NULL,factory_id text NOT NULL,sku_id text NOT NULL,
 part_ref text NOT NULL,source_signature char(64) NOT NULL CHECK(source_signature ~ '^[a-f0-9]{64}$'),
 name text NOT NULL,source_kind text NOT NULL DEFAULT 'DEV_SYNTHETIC'
   CHECK(source_kind='DEV_SYNTHETIC'),
 supplier_sku text DEFAULT NULL CHECK(supplier_sku IS NULL),
 on_hand_qty integer NOT NULL CHECK(on_hand_qty BETWEEN 0 AND 1000000),
 reserved_qty integer NOT NULL DEFAULT 0
   CHECK(reserved_qty>=0 AND reserved_qty<=on_hand_qty),
 PRIMARY KEY(tenant_id,factory_id,sku_id),
 FOREIGN KEY(tenant_id,factory_id)
  REFERENCES gaber_orders.factory_directory(tenant_id,factory_id)
);
CREATE TABLE gaber_orders.dev_stock_reservations(
 tenant_id text NOT NULL,order_id text NOT NULL,revision_id text NOT NULL,
 part_ref text NOT NULL,factory_id text NOT NULL,sku_id text NOT NULL,
 required_qty integer NOT NULL CHECK(required_qty BETWEEN 1 AND 10000),
 reserved_qty integer NOT NULL CHECK(reserved_qty BETWEEN 0 AND 10000),
 shipped_qty integer NOT NULL DEFAULT 0 CHECK(shipped_qty BETWEEN 0 AND 10000),
 PRIMARY KEY(tenant_id,order_id,revision_id,part_ref),
 FOREIGN KEY(tenant_id,order_id)
  REFERENCES gaber_orders.order_resources(tenant_id,order_id),
 FOREIGN KEY(tenant_id,factory_id,sku_id)
  REFERENCES gaber_orders.dev_stock_skus(tenant_id,factory_id,sku_id),
 CHECK(shipped_qty<=reserved_qty AND reserved_qty<=required_qty)
);
CREATE TABLE gaber_orders.dev_stock_documents(
 tenant_id text NOT NULL,order_id text NOT NULL,revision_id text NOT NULL,
 document_id text NOT NULL,request_id text NOT NULL,request_hash char(64) NOT NULL
   CHECK(request_hash ~ '^[a-f0-9]{64}$'),
 kind text NOT NULL CHECK(kind IN ('reserve','release','ship_batch','receive_batch')),
 batch_id text,
 reference text NOT NULL,actor_id text NOT NULL,
 order_version integer NOT NULL CHECK(order_version BETWEEN 1 AND 500),
 evidence text NOT NULL DEFAULT 'DEV_SELF_REPORTED'
  CHECK(evidence='DEV_SELF_REPORTED'),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(tenant_id,order_id,document_id),
 UNIQUE(tenant_id,order_id,request_id),
 UNIQUE(tenant_id,order_id,kind,reference),
 UNIQUE(tenant_id,order_id,kind,batch_id),
 FOREIGN KEY(tenant_id,order_id)
  REFERENCES gaber_orders.order_resources(tenant_id,order_id),
 CHECK((kind IN ('ship_batch','receive_batch') AND batch_id IS NOT NULL)
       OR(kind IN ('reserve','release') AND batch_id IS NULL))
);
CREATE TABLE gaber_orders.dev_stock_document_lines(
 tenant_id text NOT NULL,order_id text NOT NULL,document_id text NOT NULL,
 part_ref text NOT NULL,sku_id text NOT NULL,
 quantity integer NOT NULL CHECK(quantity BETWEEN 0 AND 10000),
 damaged_qty integer NOT NULL DEFAULT 0 CHECK(damaged_qty>=0 AND damaged_qty<=quantity),
 PRIMARY KEY(tenant_id,order_id,document_id,part_ref),
 FOREIGN KEY(tenant_id,order_id,document_id)
  REFERENCES gaber_orders.dev_stock_documents(tenant_id,order_id,document_id)
);
-- Source metadata can only be inserted by the controlled DEV database seeder;
-- runtime may change the on-hand/reserved quantities under locked transactions.
CREATE FUNCTION gaber_orders.dev_stock_protect_catalog() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.tenant_id<>OLD.tenant_id OR NEW.factory_id<>OLD.factory_id
    OR NEW.sku_id<>OLD.sku_id OR NEW.part_ref<>OLD.part_ref
    OR NEW.source_signature<>OLD.source_signature OR NEW.name<>OLD.name
    OR NEW.source_kind<>OLD.source_kind
 THEN RAISE EXCEPTION 'DEV_STOCK_CATALOG_IMMUTABLE'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER dev_stock_catalog_guard BEFORE UPDATE ON gaber_orders.dev_stock_skus
 FOR EACH ROW EXECUTE FUNCTION gaber_orders.dev_stock_protect_catalog();
CREATE TRIGGER dev_stock_catalog_no_delete BEFORE DELETE ON gaber_orders.dev_stock_skus
 FOR EACH ROW EXECUTE FUNCTION gaber_orders.deny_mutation();
CREATE TRIGGER dev_stock_reservation_no_delete BEFORE DELETE ON gaber_orders.dev_stock_reservations
 FOR EACH ROW EXECUTE FUNCTION gaber_orders.deny_mutation();
CREATE FUNCTION gaber_orders.dev_stock_protect_reservation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.tenant_id<>OLD.tenant_id OR NEW.order_id<>OLD.order_id
 OR NEW.revision_id<>OLD.revision_id OR NEW.part_ref<>OLD.part_ref
 OR NEW.factory_id<>OLD.factory_id OR NEW.sku_id<>OLD.sku_id
 OR NEW.required_qty<>OLD.required_qty OR NEW.shipped_qty<OLD.shipped_qty
 OR NEW.reserved_qty>OLD.reserved_qty OR NEW.reserved_qty<NEW.shipped_qty
 THEN RAISE EXCEPTION 'DEV_RESERVATION_SCOPE_IMMUTABLE'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER dev_stock_reservation_guard BEFORE UPDATE ON gaber_orders.dev_stock_reservations
 FOR EACH ROW EXECUTE FUNCTION gaber_orders.dev_stock_protect_reservation();
CREATE TRIGGER dev_stock_documents_immutable BEFORE UPDATE OR DELETE
 ON gaber_orders.dev_stock_documents FOR EACH ROW EXECUTE FUNCTION gaber_orders.deny_mutation();
CREATE TRIGGER dev_stock_lines_immutable BEFORE UPDATE OR DELETE
 ON gaber_orders.dev_stock_document_lines FOR EACH ROW EXECUTE FUNCTION gaber_orders.deny_mutation();
DO $rls$
DECLARE tab text;
BEGIN
 FOREACH tab IN ARRAY ARRAY['dev_stock_skus','dev_stock_reservations','dev_stock_documents','dev_stock_document_lines']
 LOOP
 EXECUTE format('ALTER TABLE gaber_orders.%I ENABLE ROW LEVEL SECURITY',tab);
 EXECUTE format('ALTER TABLE gaber_orders.%I FORCE ROW LEVEL SECURITY',tab);
 EXECUTE format('CREATE POLICY %I ON gaber_orders.%I FOR SELECT USING (tenant_id=current_setting(''app.tenant_id'',true))',
   tab||'_read',tab);
 EXECUTE format('CREATE POLICY %I ON gaber_orders.%I FOR INSERT WITH CHECK (tenant_id=current_setting(''app.tenant_id'',true))',
   tab||'_insert',tab);
 END LOOP;
END $rls$;
CREATE POLICY dev_stock_sku_quantity_change ON gaber_orders.dev_stock_skus FOR UPDATE
 USING(tenant_id=current_setting('app.tenant_id',true))
 WITH CHECK(tenant_id=current_setting('app.tenant_id',true));
CREATE POLICY dev_stock_reservation_change ON gaber_orders.dev_stock_reservations FOR UPDATE
 USING(tenant_id=current_setting('app.tenant_id',true))
 WITH CHECK(tenant_id=current_setting('app.tenant_id',true));
REVOKE ALL ON gaber_orders.dev_stock_skus,gaber_orders.dev_stock_reservations,
 gaber_orders.dev_stock_documents,gaber_orders.dev_stock_document_lines FROM PUBLIC;
REVOKE ALL ON FUNCTION gaber_orders.dev_stock_protect_catalog() FROM PUBLIC;
REVOKE ALL ON FUNCTION gaber_orders.dev_stock_protect_reservation() FROM PUBLIC;
COMMIT;
