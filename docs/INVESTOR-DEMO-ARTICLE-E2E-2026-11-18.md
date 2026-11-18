# GABER — five-article investor demo and exact business-flow verification

Date: 2026-11-18. Branch: `feature/gaber-article-e2e-demo-20261118`, stacked on the review branch `feature/visual-motion-consolidation-20261117` / PR #40.

## Purpose and boundaries

Five real catalog configurations run through the **existing** immutable local order reducer and its Client → GABER Partner → Factory command chain. This is an **investor demonstration**, with simulated external authority, fabricated indicative prices and fabricated invoices/acts/reference IDs. **No live bank payments, supplier rates, completed factory orders or manufacturing release are represented.** No real production data are written.

Only the partner's **local demo cabinet** exposes the opt-in `Загрузить 5 демо-артикулов` button. It performs a staging transaction through the existing reducer, validates replay, and commits once to the browser's localStorage. Existing orders are not deleted or replaced, repeated clicks do not duplicate records, invalid/corrupt workspaces remain blocked, and stale concurrent snapshots are rejected. This is not a substitute for server-side atomic transactions or authentication; local cabinet switching does not confer actual permissions.

## Article matrix (all amounts are illustrative, in Russian rubles)

| Article | Product | Customer price | Factory planned | GABER planned fee | Other planned costs | Planned reserve | Scenario at load |
|---|---|---:|---:|---:|---:|---:|---|
| GABER-DEMO-LINEA-01 | LINEA three-module sofa, 280 cm | 460 000 | 250 000 | 65 000 | 46 000 | 99 000 | Delivered, client accepted, demo transaction closed |
| GABER-DEMO-CAMBIO-04 | CAMBIO fold chair-bed, 100 cm | 170 000 | 105 000 | 27 000 | 15 000 | 23 000 | Awaiting independent factory concept review |
| GABER-DEMO-NOTTE-05 | NOTTE storage bed, 180 → 200 cm | 330 000 | 190 000 | 45 000 | 26 000 | 69 000 | Customer withdrew R1, approved R2, moved 65 000 ruble local credit, demo production started |
| GABER-DEMO-TELA-03 | TELA headboard, 220 cm | 160 000 | 89 000 | 22 000 | 13 000 | 36 000 | Factory QC recorded, final balance remains before shipment |
| GABER-DEMO-FORMA-02 | FORMA recliner chair, 95 cm | 140 000 | 85 000 | 20 000 | 11 000 | 24 000 | Delivery recorded, client rejected an initial resolution to an upholstery complaint |

**Formula:** planned reserve = customer price − factory planned amount − planned GABER fee − logistics − taxes − other costs. Fees and reserve are separate projected amounts, not the same as margin, cash, bank verified funds or earned commission. Every payment event is an unverified local entry; client claims never count toward the order balance without a separate partner record. Shipment and manufacturing steps are marked `DEV_SIMULATED_EXTERNAL_AUTHORITY` and factory `productionRelease.allowed` remains `false`.

## Resolved integrations and defects

1. **Factory price leak:** `OrderJourney` previously displayed customer retail payment amounts to the factory. The factory now sees production task costs and stage updates without the retail price or platform fee; DOM and Chrome checks enforce this boundary. This is a LOCAL presentation boundary only — never rely on this for real RBAC, which belongs to the protected server API.
2. **Broken article-to-BOM link:** the order's “BOM и схема сборки” and “Открыть смету” buttons previously navigated to the unrelated studio configuration. They now pass the selected order's actual current technical revision to the app. The technical passport offers a specific **demo order + BOM JSON** export with order ID, revision ID and a mandatory factory HOLD flag. The costing page explicitly warns that its generic pricing assumptions are **not** the offer's retained commercial terms.
3. **Wrong assembly count:** demo assembly instructions used `config.modules` (not in the real catalog schema) rather than `config.moduleCount` for a sofa. This is corrected; beds and headboards no longer inherit a fictitious three-module joining instruction.
4. **Cabinet switching dead end:** the last selected local order ID is retained in sessionStorage when switching between local Client, Partner and Factory views; explicit project selections still take precedence. No bank/production authority is conveyed by this preference.
5. **Demo seed safety:** immutable event histories, exact integer kopecks, real configuration validation, idempotency, stale/corrupt local storage refusal, finite staged transaction, unique IDs, correct offered/accepted/spec revisions and explicit demo provenance.

## Reproducible verification

- `npm ci && npm run verify:repository && npm run test:node && npm run test:ui && npm run build`
- Browser: `npm run build`, launch `npm run dev` or Vite preview on `http://127.0.0.1:4188`, then run `node scripts/verify-investor-browser.mjs`. For QA environments without local Playwright, supply `GABER_PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs` and `GABER_CHROME_PATH=/absolute/path/to/chrome`. Optional `GABER_EVIDENCE_DIR` writes screenshots on the local QA machine outside the source tree.
- PostgreSQL 17: `bash scripts/verify-disposable-postgres-e2e.sh` starts and destroys a uniquely named, password-generated local container; it refuses to use an existing container, requires a clean committed Git SHA and runs all migrations 001–009, real RLS schema checks, and three-role HTTP→Postgres assertions on **disposable** tenant fixtures. Default port 55491; override with `GABER_TEST_PG_PORT` if needed. No existing Gaber database or another project's container is touched.

## Browser screenshot evidence

The four screenshots are versioned in [`docs/evidence/investor-demo-20261118/`](evidence/investor-demo-20261118/README.md). They cover the precise order-linked technical dossier, factory privacy, client workflow and 375-pixel responsive technical inspection. Captures are from real Chrome running local demo fixtures; all commercial figures are explicitly illustrative.

## Further blockers / release HOLD

- Production payment processor, bank reconciliation, approved factory CAD/BOM, approved mechanical pivots/stops, real foam measurements and certified production sign-off are not implemented by these tests.
- Client, partner and factory **local** cabinet views share one browser's storage; they do **not** demonstrate actual security isolation. Protected server E2E tests use distinct session fixtures, not a real IdP.
- Original local v0.7 archive/commit and full VR Product Graph 1.3 sources remain unlocated. OBB tests are geometric proxies, not BVH/CCD physical validation.
- Full browser device testing of iOS/Android AR and real headset WebXR, external PostgreSQL staging, independent security review, real factory approval and GitHub Actions GREEN on a merged SHA remain pending.

**Release status: INVESTOR DEMO IN DEVELOPMENT / DRAFT PR / PRODUCTION HOLD.**
