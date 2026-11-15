# GABER v0.4.17 — server order command admission

**Scope:** code-only, server-side command admission. No live API, authentication middleware or PostgreSQL order journal was connected. Branch remains Draft and Production HOLD.

## Added
- `server/orderCommandAdmission.js`: central maps reducer commands to resource-scoped server permissions, requiring an authenticated server principal and repository-fetched order resource. Browser-provided `role` is checked against server-derived reducer perspective, not trusted.
- Bank confirmation, production start/complete and carrier delivery confirmation remain denied, because their independent authority is not present.
- Partners are currently **not allowed** to write to the two-perspective local reducer; a separate server-native partner event schema is required rather than impersonating a factory or client.
- `tests/order-command-admission-v0417.test.js`: positive and negative access contracts.

## Evidence and remaining blockers
Targeted policy test bodies evaluated against GitHub code in isolated V8. This is **not** a complete Node/Vite/browser build. GitHub Actions remains blocked before test steps; successful exact-SHA CI is still mandatory.

## Next server P0
1. Order creation must use a server-authoritative tenant, client ID and project membership (not a browser-supplied resource).
2. Build immutable PostgreSQL event journal with version check, unique idempotency key and transactional replay.
3. Resolve actor/role via verified session and map allowed event types to authoritative business services.
4. Require real bank evidence before financial state changes, and independent factory authority before starting manufacture.
5. Full six-role negative E2E, simultaneous writers, duplicate retries and cross-tenant isolation.

See `docs/project-map-v0.4.16.md` and issues #3, #4, #5 and #6.
