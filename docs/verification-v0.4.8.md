# GABER v0.4.8 - draft supplier costing integrity

Engineering change committed at `aa4cbfc25ba8a0efe8f2e745e975c8bb804895ba` on `feat/production-engineering-v04`.

## Implemented
- Reject multiple cost consumption records for the same entity even when the prices belong to different suppliers. A multi-lot allocation mechanism remains future work.
- Reject multiple active quotes for the same normalized supplier/SKU and different active hourly rates for the same normalized work center (no priority/shift model exists).
- Verify optional `measuredUnit` against the selected price unit. Legacy drafts missing this field are still readable, but flagged in `coverage.unitReviewRefs`.
- Include quote supplier, revision and validity dates in every provisional material line, preserving a transparent source trail.
- Add CSV export of required material/route IDs and unit-review display to the draft cost UI.
- Preserve actual and approved cost values as null, and manufacturing release as false.
- Add `tests/factory-costing-v048.test.js` covering legacy compatibility, duplicate suppliers, unit conflicts and report tampering.

## Evidence / limits
Before commit, executing the candidate JS source loaded from GitHub and locally patched in an isolated V8 tool with injected ES-module dependencies passed 102/102 configurations and detected 8/8 negative scenarios. This does not replace actual Node/npm tests, a Vite build or browser QA. Source commit and file readback were confirmed via GitHub; GitHub Actions status for exact commit is not yet verified. Production release stays HOLD.

## Market feature benchmark
Research priorities for GABER from official vendor documentation:
- Roomle Rubens: https://www.roomle.com/ - real-time parametric configuration, visual BOM/price linkage, ecommerce/ERP integrations.
- Threekit: https://www.threekit.com/ - 3D product rules, CPQ and configuration.
- imos iX: https://www.imos3d.com/ - CAD/CAM and furniture production.
- BAZIS: https://bazissoft.ru/ - Russian CAD, BOM, nesting and production management modules.
- bCAD: https://www.bcad.ru/ - detailed furniture modeling and manufacturing documentation.
- ASSOL: https://assol.org/ - upholstery patterns and materials.
- Lectra: https://www.lectra.com/en/furniture - upholstery material cutting and production optimization.

These are documentation-derived feature themes, not completed installed-product functional acceptance tests or a claim of feature parity.

## Next P0
Reconcile GitHub Actions job startup, then execute exact-SHA `npm ci`, `npm test`, `npm run build`; test browser 375/768/1440 layouts, WebGL/SVG fallback, local backup/restore and CSV downloads. Obtain factory evidence before approving actual costs, hole patterns, upholstery markers or production.
