# GABER v0.4.3 — digital traceability, soft envelopes and release HOLD

## Scope / exact source
- Branch: `feat/production-engineering-v04`
- Implementation commit: `77ae25c57a03e43b856727494d102ce486cca3b4`.
- Draft PR: https://github.com/PetrFedin/gaber/pull/2
- Production status: **HOLD**. There is no approved factory CAD or real material/fastener/kinematics evidence.

## Added or modified
1. `src/softLayout.js` provides a deterministic millimetre-level conceptual *rectangular envelope* instance registry for seat, chaise, back and headboard.
2. `src/EngineeringAssembly.js` constructs corresponding Three.js meshes from that exact registry instead of duplicating calculations.
3. `src/manufacturing.js` derives layer scene IDs, uncompressed envelope volume and theoretical mass (only where density is specified). These fields explicitly are **not** supplier material consumption, cutting patterns or compressed material estimates.
4. `src/traceability.js` independently compares frame IDs, cut sizes, scene transforms, routing, support and soft registries, hardware placeholders, joinery references, config, envelope and release lock.
5. `src/TechnicalPage.jsx` shows the digital audit result and conceptual layer volumes.
6. `tests/traceability-v043.test.js` adds family/configuration checks, negative mutation probes and costing change/snapshot checks.

## Verification and limitations
- Before writing, prior commit `649824497252178231562fda2a14566a91f5a09b` showed Actions FAIL in run 39308559919, with **zero executed steps**. Logs were unavailable. Root cause is unknown.
- The new commit and audit source were read back successfully from GitHub. GitHub Actions run **39337952306** was **queued** at the initial check; its final result is not yet established.
- Source files with plain JS were parser-checked using JavaScript `Function` syntax validation after import/export stripping. JSX build, tests against actual npm dependencies and real-browser rendering have **not** been run in this iteration. New test source is committed but not yet proven to pass.
- No actual fastener SKU, hole pattern, vendor mechanism trajectory, approved upholstery cutting marker or real supplier rate exists; this code does not fabricate any.
- Each external approval remains fail-closed. The digital auditor's PASS is only an internal identity/envelope check.

## Release criteria still mandatory
1. Exact-head green `npm ci`, `npm test`, `npm run build` with inspectable runner/step logs.
2. Browser checks at mobile/tablet/desktop, 3D WebGL and SVG fallback, project backup/import/recovery and exported technical files.
3. Independent physical/CAD checks: joints, holes, hardware, real foam compression, upholstery marker, tolerance stack-ups, mechanism collision, load tests and written approvals by the factory.
4. Authenticated authoritative server-side production approval; browser/client cannot authorize manufacture.

The feature branch remains a draft. Do not merge or deploy solely on the basis of static inspection.
