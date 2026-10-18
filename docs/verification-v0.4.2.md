# GABER v0.4.2 — Continuation: Chaise load path and fully linked support layout

Status: **prototype / draft PR #2 / NOT approved for production**. Updated 2026-10-18.

## Architectural correction

Prior branches established a frame-instance contract but the chaise front 650 mm was merely a skin extension; it had no independent frame BOM or rated support. The spring/strap/slat geometry was also calculated directly inside the Three.js renderer without matching manufacturing entries.

v0.4.2 makes the concept deterministic and auditable:

1. `src/engineering.js` — chaise front rail, 2 side rails, 1 intermediate brace and 2 gusset envelopes; explicit support hardware proposal; `CHAISE_LOAD_PATH` and `CHAISE_SUPPORT` production blockers. No structural clearance or strength is claimed.
2. `src/frameLayout.js` — exactly six additional named geometry instances for each left/right chaise. `CHAISE-F-001`, `CHAISE-S-001/002`, `CHAISE-X-001`, `CHAISE-K-001/002`.
3. `src/manufacturing.js` — six additional instance-linked joint proposals (attachment/front corners/intermediate braces), vendor hardware placeholder refs, matching soft-layer refs, and an independent support register linked by `sceneNodeRef`.
4. `src/supportLayout.js` — a single authoritative positioning algorithm for zigzag supports, webbing, chaise support extensions and bed slats, shared by the renderer and manufacturing. Vendor parts and spring-force properties remain unverified.
5. `src/EngineeringAssembly.js` — exact named meshes for frame, support, upholstery foam and supporting placeholders. Visible chaise padding reaches the exterior footprint rather than incorrectly stopping at the shorter structural rail.
6. `src/TechnicalPage.jsx` — inspectable support and foam links, manufacturing joint register, production gates, JSON/CSV exports.
7. `tests/chaise-structure.test.js`, `tests/render-smoke.mjs` — scenarios for left/right, depth changes, module counts, varying arms, supports, bed slats and explicit mesh/registry matching.

## Geometry formula and provenance

The existing GABER domain defines the chaise outer product depth as `depthCm + 65`. The old interpretation of 650 mm as a beam length was invalid because the original seat rail is inset behind the upholstery. The prototype now uses:

- Outer front edge: `depthCm * 5 + 650` mm in the centred coordinate system.
- Front rail nominal inset from outer edge: **40 mm** (design assumption, **not** manufacturing tolerance).
- Existing front rail: `-depthCm*5 + backDepthCm*10 + seatDepthCm*5 + frameDepthCm*5 - 20` mm.
- Forward rail centre: outer front edge **minus 40 mm**.
- Structural extension: forward rail centre **minus** existing rail centre.
- Side rail nominal envelope length: structural extension **minus 40 mm**.

For the default LINEA sofa (`depth=100 cm`, `backDepth=23 cm`, `seatDepth=55 cm`) this gives an existing rail at +335 mm, new rail at +1110 mm and **structural extension of 775 mm**, despite the exterior depth increase being 650 mm. These are arithmetically derived from demo geometry, *not* approval of the 40 mm inset, rail joints, or loading.

The chaise adds six schematic lumber/gusset parts, six joint interfaces, and either two unresolved front feet or an unresolved plinth placeholder. Their SKUs, drilling patterns, strength and cost **remain null/unapproved**.

## Scene-node contract

- `GABER_PART:<partId>` — frame/plywood detail; one matching manufacturing part and route.
- `GABER_SOFT:SEAT:<module>:<layerId>` — module foam/batting; recorded in manufacturing layers.
- `GABER_SOFT:CHAISE:<layerId>` — chaise cushion extension, reaching outer depth.
- `GABER_SOFT:BACK:<partId>:<layerId>` / `GABER_SOFT:HEADBOARD:<partId>:<layerId>` — layered back/bed headboard surfaces.
- `GABER_SUPPORT:MODULE|CHAISE|BED:<module>:<ordinal>` — spring/webbing/slat, one support record each.
- `GABER_HW:chaiseFoot|chaisePlinth:<ordinal>` — visible unapproved hardware placeholder.

No real manufacturer-approved model, scan, foam force curve, structural result or texture calibration is created by these conceptual meshes. Unmodelled pillow fill and other hardware remains explicitly labelled `not-modelled`.

## Acceptance and remaining blocking work

To reproduce: `npm ci`, `npm test`, `npm run build`; then verify GUI interactions, camera, WebGL/SVG fallback, left/right switching, saving/reloading, 3D inspection, technical downloads, and responsive layouts on real browsers.

**Verification status at publication of this patch:** regression test source is added, but the full suite and build have **not** been executed in this session. GitHub Actions runs for predecessor commits have failed before runner assignment, reporting `steps=[]`, `runner_id=0`, zero billable minutes; this is not evidence of code correctness or an identified root cause. New queued runs must be inspected when resolved. No claim of green CI or browser visual QA is made.

Manufacturing remains **fail closed**: `productionRelease.allowed=false`, unverified materials and test evidence, no server authentication/authority, no signoff or production file release. We must obtain one real GABER model with approved CAD, joint details, fabric markers, supplier bills, spring/foam test reports and final product load tests before moving towards validated manufacturing.

The `main` branch and hosted public Site remain unchanged by the draft PR.
