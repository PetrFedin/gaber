# GABER v0.4.14 — tenant-isolated PostgreSQL review repository (Draft / HOLD)

Base: v0.4.13 order workspace (client↔factory, revisions, local payment/shipment journal).
Only the **technical DOCUMENTATION review** is addressed here. This is NOT an
authorization for manufacturing, payment settlement, shipping or production.

## Implemented
- \`server/postgresFactoryRepository.js\`: inject an authenticated server-owned
  PostgreSQL Pool and **server-session factoryId**. Each transaction is
  \`SERIALIZABLE READ WRITE\`, with a transaction-local \`app.factory_id\`
  setting and explicit \`WHERE factory_id=$1\` in every query.
- \`getRevisionForUpdate\` locks a frozen revision; evidence is read exclusively
  from the tenant-scoped database, never accepted from the browser. The current
  evidence policy still verifies signatures, hashes, expiry and all nine
  required kinds independently.
- \`getTechnicalReviewByKey\` and \`insertImmutableTechnicalReview\` use the
  same transaction. A successful result is returned **only after COMMIT**.
  Rollback and client release run on errors; serialization failure/deadlock
  can retry the entire callback (maximum three attempts).
- \`server/factoryReviewService.js\` rejects a principal whose server-session
  factoryId disagrees with the bound repository BEFORE a database query.
  Existing authentication, MFA, evidence hash, idempotency and
  \`productionRelease.allowed=false\` checks are retained.
- \`server/migrations/001_factory_review_hold.sql\` defines immutable frozen
  revision snapshots, signed evidence envelopes and append-only technical
  reviews; RLS with FORCE; a composite FK binds review hashes to the exact
  frozen config/BOM/cost revision. Cross-factory idempotency is disallowed.
- No client-side role switch, storage flag, editable quote or demo order
  state can authenticate a reviewer or authorize production.

## Verification completed
- Local isolated Node.js 22 tests of the technical-review prototype,
  plus PostgreSQL-adapter tests using an injectable **mock Pool**:
  **23/23 PASS** at initial test pass (16 policy/service + 7 adapter checks),
  including scope mismatch, SQL parameters, locks, rollback, COMMIT failure,
  and serializable retry. The exact source committed in GitHub must still
  run under its CI environment.
- No real PostgreSQL engine was available to execute this migration or validate
  live RLS/GRANT behavior. SQL was reviewed structurally; this is not an
  executed database migration.
- The container used for project-wide browser/Vite tests could not resolve
  GitHub/npm; therefore no exact-head \`npm ci\`, \`npm test\`, \`npm run build\`,
  Chromium 375/768/1440 screenshots or WebGL/SVG acceptance is claimed here.
- Docs v0.4.13 record 136 local Node tests, SSR, DOM and Vite build passes
  on an earlier GitHub SHA; that historical evidence is not transferable to
  v0.4.14.

## Important integration requirements / blocking gates
1. In an isolated PostgreSQL 17 database, apply migration after backup and
   security review. Verify SQL syntax, unique/FK/RLS/trigger behavior, tenant
   isolation, failed UPDATE/DELETE, and transaction retry/commit errors.
2. Provide a **dedicated non-superuser** server role with minimal schema/table
   privileges. \`SELECT ... FOR UPDATE\` requires UPDATE privilege, but immutable
   triggers must reject any UPDATE/DELETE. Do not grant to browser/anon roles.
3. The factory ID must come from verified authenticated server middleware,
   not a client-supplied selector. The Pool credentials and evidence HMAC key
   stay server-side. Separate service roles write independently verified
   evidence/revisions; do not allow an ordinary technologist to sign them.
4. Database adapters should be tested in concurrent sessions. Serializable
   retries must never include non-transactional external side effects.
   An ambiguous COMMIT must not be reported as successful.
5. Connect an authenticated server API, audit logs, backup/restore, per-order
   membership and **independently bank-verified payment evidence** before
   the local order workspace can become cross-device authoritative.
6. Real CAD/hole patterns, fasteners, supplier lot/cost quotes, upholstery
   cutting markers, measured work-center timings, collision/stability/load
   tests and designated release authorities remain unavailable.

## Status
Review acceptance means only \`TECHNICAL_DOCUMENTATION_REVIEWED_NOT_RELEASED\`.
There is NO production release implementation and NO live database connection.
Do not merge the Draft PR into \`main\` until the exact-SHA GitHub Actions,
integration, browser and physical factory tests pass.
