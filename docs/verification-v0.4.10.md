# GABER v0.4.10 — Unified atelier interface and provisional factory analysis

## Scope
This change builds on engineering branch v0.4.9 without merging to main or authorizing furniture production.

### UX and design
- The customer-facing hero describes real actions (dimensions, upholstery, structural elements) instead of generic marketing claims.
- Cost input is a restrained technical ledger with four editable sections: supplier quotations, material consumption, workcenter rates and measured operation time.
- Production IDs and route/operation identifiers are selected from the actual manufacturing engine. Editing source values recalculates the existing factoryCosting validations, and raw JSON remains available in a clearly marked advanced panel.
- CSS aligns tokens, typography, borders and status presentation for 375/768/1440 responsive layouts by design; physical screenshot/browser validation is still REQUIRED.
- The existing local revision history from v0.4.9 remains. A best-effort synchronous sessionStorage scratch keeps *unsaved input text* across SPA route unmounts within the same tab, keyed by the exact configuration. A separate journal is still required for durable local history. Session storage may fail due to private-mode/quota and must never be described as guaranteed persistence.

### Analytics
- The new factory insights engine derives expense groups from existing exact production entity IDs and operation records.
- User-entered material and labor totals reconcile independently; workcenter hours, data coverage, missing items, unresolved units and top expense lines are disclosed.
- A fully entered scenario is *not* a verified factory quote. approvedCostRUB and actualCostRUB are not populated, and productionRelease.allowed is always false.
- No invented supplier measurements, upholstery markers, machine settings, raw-material conversions or mechanism certifications.

## Candidate verification
- The pure factory-insights engine was exercised against fetched production modules under an isolated V8 runner with injected module imports and structuredClone polyfill: **22/22** focused assertions passed, including empty families, completed input, reconciliation, invalid input and rejection of production release.
- In-memory session scratch tests **6/6** passed for per-config survival, updating, clearing, and non-overwrite of corrupt storage.
- Added repository Node tests for factory insights and scratch, but they must execute on an actual Node/Vite runner before CI can be marked green.
- No real browser screenshot or WebGL/SVG fallback acceptance occurred in this iteration.
- Production CI runner issue #3 still requires investigation; failed GitHub Actions without steps do not prove the code itself passed or failed.

## Next release gate
1. Exact head `npm ci && npm test && npm run build`, plus SSR and browser tests of form update, journal, session scratch, revision compare, corrupt JSON, file upload, CSV download.
2. Desktop/mobile screenshots at 375/768/1440, keyboard and focus order, SVG fallback and WebGL.
3. Supplier-backed reference product and measured CAD/pattern/fastener/load evidence; remain Production HOLD until independent authority verifies.
