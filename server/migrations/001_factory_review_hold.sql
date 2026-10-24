-- GABER v0.4.14: technical DOCUMENTATION review storage, not factory release.
-- Requires PostgreSQL 17; apply only in a disposable DB pending integration QA.
BEGIN;
CREATE SCHEMA IF NOT EXISTS gaber_factory;
REVOKE ALL ON SCHEMA gaber_factory FROM PUBLIC;

CREATE TABLE gaber_factory.revisions (
  factory_id text NOT NULL CHECK(factory_id ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$'),
  project_id text NOT NULL CHECK(project_id ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$'),
  revision_id text NOT NULL CHECK(revision_id ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$'),
  state text NOT NULL CHECK(state='frozen-for-technical-review'),
  config_hash text NOT NULL CHECK(config_hash ~ '^[a-f0-9]{64}$'),
  bom_hash text NOT NULL CHECK(bom_hash ~ '^[a-f0-9]{64}$'),
  cost_hash text NOT NULL CHECK(cost_hash ~ '^[a-f0-9]{64}$'),
  frozen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(factory_id,project_id,revision_id),
  UNIQUE(factory_id,project_id,revision_id,config_hash,bom_hash,cost_hash)
);

CREATE TABLE gaber_factory.evidence (
  factory_id text NOT NULL,
  project_id text NOT NULL,
  revision_id text NOT NULL,
  evidence_id text NOT NULL CHECK(evidence_id ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$'),
  kind text NOT NULL CHECK(kind IN (
    'frame-cad','joint-and-hole-drawing','fastener-specification',
    'foam-compression-test','upholstery-cutting-marker','measured-supplier-prices',
    'verified-operation-times','mechanism-clearance-test','load-and-stability-test'
  )),
  envelope jsonb NOT NULL CHECK(jsonb_typeof(envelope)='object'),
  inserted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(factory_id,evidence_id),
  UNIQUE(factory_id,project_id,revision_id,kind),
  FOREIGN KEY(factory_id,project_id,revision_id)
    REFERENCES gaber_factory.revisions(factory_id,project_id,revision_id)
);

-- In addition to ID locking, review events must match immutable revision
-- hashes at the database layer; stale BOM/cost/config hashes cannot be inserted.
CREATE TABLE gaber_factory.technical_reviews (
  review_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  factory_id text NOT NULL,
  idempotency_key text NOT NULL CHECK(idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$'),
  project_id text NOT NULL,
  revision_id text NOT NULL,
  reviewer_id text NOT NULL CHECK(reviewer_id ~ '^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$'),
  config_hash text NOT NULL CHECK(config_hash ~ '^[a-f0-9]{64}$'),
  bom_hash text NOT NULL CHECK(bom_hash ~ '^[a-f0-9]{64}$'),
  cost_hash text NOT NULL CHECK(cost_hash ~ '^[a-f0-9]{64}$'),
  statement jsonb NOT NULL CHECK(
    jsonb_typeof(statement)='object' AND
    statement->>'outcome'='TECHNICAL_DOCUMENTATION_REVIEWED_NOT_RELEASED'
  ),
  signature text NOT NULL CHECK(signature ~ '^[a-f0-9]{64}$'),
  created_at_ms bigint NOT NULL CHECK(created_at_ms>0),
  kind text NOT NULL CHECK(kind='TECHNICAL_REVIEW_ACCEPTED_NOT_RELEASED'),
  inserted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(factory_id,idempotency_key),
  FOREIGN KEY(factory_id,project_id,revision_id,config_hash,bom_hash,cost_hash)
    REFERENCES gaber_factory.revisions(
      factory_id,project_id,revision_id,config_hash,bom_hash,cost_hash
    )
);

-- Reject changes to frozen revision snapshots, factory evidence and reviews.
CREATE FUNCTION gaber_factory.reject_immutable_write() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'GABER_IMMUTABLE_EVIDENCE' USING ERRCODE='check_violation';
END;
$$;
CREATE TRIGGER immutable_factory_revision BEFORE UPDATE OR DELETE
  ON gaber_factory.revisions FOR EACH ROW
  EXECUTE FUNCTION gaber_factory.reject_immutable_write();
CREATE TRIGGER immutable_factory_evidence BEFORE UPDATE OR DELETE
  ON gaber_factory.evidence FOR EACH ROW
  EXECUTE FUNCTION gaber_factory.reject_immutable_write();
CREATE TRIGGER immutable_factory_review BEFORE UPDATE OR DELETE
  ON gaber_factory.technical_reviews FOR EACH ROW
  EXECUTE FUNCTION gaber_factory.reject_immutable_write();

-- Force RLS even for table owners. Explicit factory WHERE still required.
ALTER TABLE gaber_factory.revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE gaber_factory.revisions FORCE ROW LEVEL SECURITY;
ALTER TABLE gaber_factory.evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE gaber_factory.evidence FORCE ROW LEVEL SECURITY;
ALTER TABLE gaber_factory.technical_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE gaber_factory.technical_reviews FORCE ROW LEVEL SECURITY;
CREATE POLICY factory_revision_read ON gaber_factory.revisions FOR SELECT
  USING(factory_id=current_setting('app.factory_id',true));
-- SELECT ... FOR UPDATE needs UPDATE privilege/policy in PostgreSQL.
-- An immutable trigger prevents actual UPDATE or DELETE of the revision.
CREATE POLICY factory_revision_lock ON gaber_factory.revisions FOR UPDATE
  USING(factory_id=current_setting('app.factory_id',true))
  WITH CHECK(factory_id=current_setting('app.factory_id',true));
CREATE POLICY factory_evidence_read ON gaber_factory.evidence FOR SELECT
  USING(factory_id=current_setting('app.factory_id',true));
CREATE POLICY factory_review_read ON gaber_factory.technical_reviews FOR SELECT
  USING(factory_id=current_setting('app.factory_id',true));
CREATE POLICY factory_review_append ON gaber_factory.technical_reviews FOR INSERT
  WITH CHECK(factory_id=current_setting('app.factory_id',true));

REVOKE ALL ON ALL TABLES IN SCHEMA gaber_factory FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA gaber_factory FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA gaber_factory FROM PUBLIC;
-- No grants to anon/authenticated/browser roles. DBA must create a dedicated
-- server role and test the exact SELECT/UPDATE (for row locking) and INSERT
-- grants under RLS. Authentication must happen outside this schema; a custom
-- GUC alone is never authentication or user authorization.
COMMIT;
