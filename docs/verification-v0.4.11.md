# GABER v0.4.11 — server-review contract and build blocker

## Current engineering branch
Feature branch \`feat/production-engineering-v04\`. All production functions stay **HOLD**. No deployment or \`main\` merge is authorized.

### 1. Build and browser acceptance findings
- Local isolated container: Node 22 and Chromium are available.
- The actual GitHub repository and npm dependencies cannot be downloaded in that container because DNS to github.com and registry.npmjs.org is blocked.
- Previously checked GitHub Actions job \`verify\` returned \`failure\` with \`steps=[]\`; job log download produced \`BlobNotFound\`. No evidence of a successful \`npm ci\`, \`npm test\`, Vite build or actual end-to-end browser run on the feature head.
- Mac remote desktop exists but is **offline**. This is a connectivity limitation, not evidence the build is broken or good.
- **Required before merge:** exact-SHA \`npm ci && npm test && npm run build\`; Chromium screenshots at 375, 768 and 1440 px, WebGL and SVG fallback, file import/export, revision recovery, config changes and authorizations.

### 2. Client session correctness fix
\`FactoryCostDraftPanel.jsx\` now keys its working session by canonical full furniture configuration. Changing width, fabric, layout or other config values causes the panel's local state to be reinstantiated instead of carrying supplier measurements or working operation rows from another variant.
An unfinished sessionStorage scratch is labeled as **not yet saved** in the local revision journal, using the journal's saved text as a baseline. No such scratch is factory-authoritative.
A new \`tests/factory-editor-ui.mjs\` exercises configuration switching in a real React/JSDOM/Vite harness once npm dependencies are available.

### 3. Server-only policy (Node crypto)
\`server/factoryReviewPolicy.js\` includes:
- Frozen revision identity (project/revision IDs + SHA-256 hashes for configuration, BOM and provisional cost snapshot).
- Nine mandatory kinds of documents: approved frame CAD, holes/joints drawing, fastener specification, foam compression, actual upholstery cutting marker, measured supplier prices, workcenter times, mechanism clearance and load/stability validation.
- HMAC-SHA256 envelopes, signed only by a trusted server after independently validating and storing each document; signature validation uses timing-safe comparison.
- Freshness/expiry and exact revision matching; detection of missing or duplicate evidence.
- Authenticated, server-derived identity, technologist/factory-admin role, MFA and active session.
- Signed result \`TECHNICAL_DOCUMENTATION_REVIEWED_NOT_RELEASED\`.
- **Never** produces manufacturing release: \`productionRelease.allowed=false\` in all outcomes.

\`server/factoryReviewService.js\` is a service-layer adapter expecting an authoritative database transaction. It locks the frozen revision, fetches evidence stored server-side, evaluates the policy and inserts an immutable, idempotent review event. It has no HTTP endpoint or live database; client-provided identity, evidence and totals cannot be trusted.

### 4. Required PostgreSQL implementation
The production repository adapter must implement in the same SERIALIZABLE transaction:
- \`getRevisionForUpdate(projectId,revisionId)\`, from immutable revision snapshots (SELECT ... FOR UPDATE).
- \`getEvidenceForRevision(projectId,revisionId)\`, from evidence that was separately verified and signed by the server, with secure document storage and immutable hashes.
- \`getTechnicalReviewByKey(key)\`, preventing cross-user idempotency collisions.
- \`insertImmutableTechnicalReview(event)\`, UNIQUE idempotency key and append-only audit log.

Apply RLS with role- and factory-scoped access. Browser clients must not have direct write permission for evidence, signatures, review events, revision freeze or release status. Store HMAC key in a server secret manager, support key rotation, do not send it to the client. Audit event logs and reviews should be backed up.

### 5. Independent verification
Local Node 22 test harness ran a server-review policy and transaction-adapter prototype: **16/16 tests passed** on 2026-10-23. Tests cover tampering, forged signatures, cross-revision mismatches, expired evidence, missing role/MFA, duplicate evidence and request idempotency, rejected writes and storage failures. These tests do **not** demonstrate an integrated PostgreSQL service, factory certificate authenticity or an actual functioning production release.
The committed modules and test sources must be independently rerun in the exact GitHub head once CI/runner access is restored.

### 6. Next business/engineering functionality
Prioritize one independently measured reference sofa: signed CAD and tolerance stack, a genuine approved full upholstery marker, supplier-document identity, time study, geometric collision checks, post-calculation variance, independently signed factory acceptance. Expand to additional furniture families only when the reference case is reproducible. No simulation may be reported as a physical measurement.
