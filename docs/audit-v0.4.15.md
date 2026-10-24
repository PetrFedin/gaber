# GABER v0.4.15 — evidence-based project audit and integration backlog

Date: 2026-10-24. Branch: feat/production-engineering-v04, Draft PR #2.
Baseline: v0.4.14 SHA f86ffefc9a776dd18b087bb60fff6f6be56734c4.
**No real production release. Do not merge to main until release gates pass.**

## 1. Audit method and evidence boundary
Reviewed repository tree, package test commands, main app route structure, local project/order
storage, exact order reducer, frame/soft/joinery/BOM generation, demo costing and
factory supplier input models, server technical-review policy, proposed PostgreSQL RLS
migration, local role perspectives and CSS/UX contracts. Compared current code with
prior verification-v0.4.12–v0.4.14.

Status labels:
- CODE: an implementation is present but may lack real database/production verification.
- CHECKED: actually executed in a stated test method.
- BLOCKED: an external environment, authority or dataset is missing.
- ABSENT: required implementation does not exist.

Historical v0.4.13 documentation reports **136/136 local Node tests,
52 SSR scenarios, DOM order lifecycle and Vite build PASS** on that older SHA.
These results cannot be transferred to the v0.4.15 commit.

The available container has Node 22 and Chromium, but no GitHub/npm DNS and
no repo/node_modules, so no new complete npm/Vite/Chromium test is claimed.
GitHub Actions on v0.4.14 SHA f86ffefc... run 40128689443 failed with
verify.steps=null before executing any defined steps. Root cause is unresolved.

## 2. Coverage and risk matrix

| Domain | Evidence of current code | Status | Real blocker |
|---|---|---|---|
| Configurator and categories | src/domain.js + ConfiguratorPanel.jsx | CODE | Factory-tested ergonomic rules and supplier variants absent |
| 3D / BOM / scene identity | src/EngineeringAssembly.js, frame/soft/support/joint Layout, traceability.js | CODE; earlier synthetic tests | No approved CAD, drilling, physical loads and tolerances |
| Materials and upholstery | src/manufacturing.js & softLayout.js | Conceptual | Real pattern surfaces, grain, shrinkage and measured marker not validated |
| Demo customer price | src/costing.js | CODE | Supplier/manufacturer pricing and real tax/logistics unavailable |
| Factory costing | src/factoryCosting.js, costTraceability.js, factoryInsights.js | CODE; V8 candidate tests earlier | Actual invoices, effective quotes, time studies and authority absent |
| Project recovery | src/storage.js and ProjectStorageTools.jsx | CODE; older DOM tests | No authoritative cross-device restore or server back-ups |
| Order revisions, payment claims, shipping | src/orderWorkflow.js, orderStorage.js, OrderWorkspace.jsx | CODE; older v0.4.13 DOM | Browser localStorage, no bank/carrier/ERP or authenticated actors |
| Complaint/repair loop | v0.4.15 reducer + OrderWorkspace dispute forms | NEW CODE; candidate V8 test bodies PASS | No real case manager, attachments or legally authoritative acceptance |
| Owner operations insight | v0.4.15 orderAnalytics.js + OperationsPage.jsx | NEW CODE; candidate V8 tests PASS | Browser-local only; cannot be called cross-device company KPIs |
| Partner view | v0.4.15 aggregate-only preview | NEW CODE | No enrolled partners, resource membership or server data integration |
| Access by client/brand/partner/factory/owner | server/accessPolicy.js | NEW SERVER CONTRACT; V8 policy tests PASS | No real login, JWT/session middleware or server endpoint wiring |
| Technical documentation review | server/factoryReviewPolicy.js and factoryReviewService.js | CODE / earlier mock tests | No live evidence issuer, signed archive, actual integration |
| PostgreSQL RLS | server/migrations/001_factory_review_hold.sql and postgresFactoryRepository.js | CODE; mock-Pool tests | Migration never run against a live DB, RLS/concurrency unproven |
| Real production release | requireProductionRelease() | Explicit HOLD | Independent factory authority, physical tests, approved documents |
| WebGL/SVG, accessibility, responsive UX | Scene.jsx & styles.css | CODE | No current Chromium 375/768/1440 screenshots or keyboard E2E |

## 3. Implemented in v0.4.15
### 3.1 Disputes no longer dead-end
- Report issue from shipped or delivered -> disputed with immutable-ish
  **local event-journal** history, issue ID and previous stage.
- Factory responds; client can explicitly accept or reject. Rejection returns
  to open status with preserved prior attempts. Client acceptance returns to
  shipped/delivered state, not automatically closed.
- Delivery acceptance still requires the customer. Repeated issue cycles are
  tracked in state. Server authority is still absent, and no repair is certified.
- Role checks in the local reducer are **perspective checks, not auth**.

### 3.2 Traceable operations analytics
- Pure engine calculates stage counts, next-action actor, current revision,
  overdue (local calendar date), local payment balance/credit reconciliation,
  unlinked submitted projects, orders missing project context, engineering
  link integrity and open issues.
- Integer kopecks preserved. Bank-verified receipts, realized revenue,
  manufacturing actual cost and margins explicitly remain NULL.
- Owner preview can see local order list and self-reported money; partner
  preview shows only aggregate stage counts, not customer names or monetary
  lines. **Both views are local mock perspectives, not secure accounts.**
- The analytics engine rejects corrupted order journals instead of making
  confident-looking charts from incomplete data.

### 3.3 Server RBAC contract, not a live access gateway
- A server-session principal and repository-authoritative resource are
  prerequisites; tenant scope and object membership are evaluated for
  client, brand, partner, factory operator, factory technologist and owner.
- Sensitive actions require MFA. Bank verification, production start, real
  production release, and carrier confirmation remain **denied for all** until
  independent external service authority exists.
- No HTTP API, authentication provider, role provisioning or database
  authorization enforcement was connected by this patch.

### 3.4 Visual harmonization
- Added a restrained ruled-ledger operations screen using existing atelier
  colors, typography and 2px borders, with multi-breakpoint layout.
- Issue action panels and role-preview navigation follow the same system.
- Removed the decorative hero-stage watermark and heavy hero mockup shadow;
  retained cloth texture cues required for material illustration.
- The code is responsive **by design**, but pixel-perfect screenshot QA on
  physical viewport sizes remains open.

## 4. Local test evidence for candidate changes
- Actual GitHub JS modules executed in an isolated V8 with injected ESM
  dependencies: 3 dispute + 4 analytics **candidate Node test bodies PASS**;
  5 server-access **candidate Node test bodies PASS**.
- Additional direct scenario checks: 11 dispute flow assertions PASS and
  11 owner analytics/invariant assertions PASS.
- These are **not** npm test, React DOM, Chromium, WebGL, PostgreSQL,
  signed bank events or authorized browser acceptance.
- A Vite/JSDOM operations test was added and the existing order DOM script
  was extended for rejection and confirmation of complaints. Both scripts
  require full npm installation and must be executed on the exact new commit.

## 5. P0 acceptance plan

| ID | Task | Mandatory release criteria |
|---|---|---|
| P0-01 | Resolve GitHub Actions failure | Exact SHA job with assigned runner, logged npm ci/test/build, all commands PASS |
| P0-02 | Actual browser acceptance | Chromium at 375,768,1440; verify WebGL fallback, keyboard tab order, roles, histories, new complaint loop, no clipped tables |
| P0-03 | Real tenant auth | Signed server sessions, MFA/role claims from server, object-level permissions tested for all 6 roles, zero cross-tenant leakage |
| P0-04 | Authoritative order service | SERIALIZABLE immutable event journal, version/expectedRevision, idempotency, safe parallel updates and backend-driven UI |
| P0-05 | PostgreSQL RLS validation | Migration applied to isolated DB, two-tenant read/write attack tests, composite FK and immutable trigger tests, full rollback |
| P0-06 | Finance controls | Bank-reconciled payment events vs customer claims vs local records; reversals/refunds, no phantom allocations |
| P0-07 | Production gate | All nine independently verified evidence classes, frozen hash identity, separate manufacturing authorization and physical tests |
| P0-08 | Engineering integrity | All BOM partIDs, geometry, joints, support, soft layer IDs and routes reconcile for every supported family and width |
| P0-09 | Full order lifecycle | Client/brand/factory/partner/owner roles exercise allowed and denied actions; no route dead ends; real audit log |
| P0-10 | Data safety | Encrypted backups, key rotation, tested recovery, RPO/RTO declared; corrupt journals fail closed |

## 6. P1 functionality backlog
1. Partial shipments by quantity/size with inventory allocation, actual carrier
   events and linked delivery acceptances; reconciled remaining quantities.
2. Cancellation, refund, payment reversal, multi-revision credit/escrow policy,
   dispute escalation, SLA and immutable business rationale.
3. Supplier and partner registration, contracts, SKU mapping, lead times,
   capacity, actual purchase order acknowledgement and portal analytics.
4. Approved 2D upholstery patterns and real marker optimization with direction,
   repeat, shrinkage and sewing allowances. No inferred real meterage.
5. Quality plans per production operation, measured deviations, photographs,
   digital documents, rework counts, serial-number product passport.
6. Engineering constraints: tolerance stack, holes and fasteners, kinematic
   collisions, structural tests, geometry validation under approved factory CAD.
7. Audit-friendly revisions of pricing and cost by qty, rate, waste, supplier,
   work center, with independent actual-vs-planned analytics after real data.
8. Observability: time-to-quote, revision acceptance, dispute cycle time,
   error codes, factory and partner SLAs. Record only real timestamps/evidence.

## 7. P2 / investor-grade improvements
- Scenario planning over verified supplier lead times, labor capacity and
  production costs; never substitute fabricated demonstration values.
- Explainable optimizer: geometry feasible variants, BOM and material savings
  subject to customer/engineering constraints, plus reproducible inputs.
- ERP/MES/PLM/CAD integration contracts with provenance, retries, event
  delivery dedupe, rollback/reconciliation.
- Investor evidence pack: verified pilot throughput, quote-to-order conversion,
  partner participation, on-time delivery, contribution margin and unit
  economics. Until a paid pilot these are **targets**, not traction.
- Brand and designer B2B showrooms, fabric swatch inventory, contract templates,
  warranty/aftersales service and multilingual private-client portal.

## 8. Non-negotiable release classification
**Implemented in branch != tested in CI != running in production.**
Current state is Draft/HOLD. A local actor may switch perspectives in the
prototype, so it is not authenticated. No real payment, order, shipment,
technical signoff or production release should be inferred from this UI.
