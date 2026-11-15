# GABER Constructor — quality engineering and acceptance

**Engineering change in existing PR #2; no new release or production approval.**
Source branch: `feat/production-engineering-v04`.
Status: **SOURCE CHANGE / FULL CI PENDING / TARGETED BROWSER QA PASSED / PRODUCTION HOLD**.

The cross-role product and acceptance target is defined in [MVP Quality Contract](./MVP-QUALITY-CONTRACT.md).

## What changes in this quality pass

| Area | Implemented in source | What is not yet proven |
| --- | --- | --- |
| Visual seat stack | `src/previewLayout.js` derives top height, seat thickness, and base top from `getEngineeringModel()` in real units | Comfort, fatigue, ergonomics and compressed shape require measured foam data |
| Parametric depth and backrest | Seat cushion depth uses `seatDepth`; back angle uses `backLeanDeg` in radians | No calibrated human ergonomics or approved CAD |
| Organic upholstery form | `src/upholsteryGeometry.js` deforms rounded-box topology into deterministic tailored/soft/relaxed profiles, then restores the exact configured envelope; `Scene.jsx` applies it only to full-quality physical upholstery and conforms local-space seams/piping with the same transform | No foam compression, fabric drape, measured comfort, approved CAD surface, or complete application screenshot matrix |
| Upholstery texture | `src/visualDetailing.js` rescales each side of rounded boxes, and cylindrical bolster ends, by physical dimensions and nominal material tile mm | Procedural canvas bump is NOT measured PBR and has no verified UV cutting grain |
| Stitching and piping | Local-space double/single stitched paths and 3D tubular piping follow top/front upholstery surface; full-quality soft details inherit the cushion's exact deformation and normalization | No pattern sewing tolerances, stitch density measured from samples, or physical fabric simulation |
| Cushion variants | Square/lumbar cushions plus true cylindrical bolster with cap trim, in the visual preview | Fabric drape, fill pressure and compressibility not physically modelled |
| Preview quality | Existing studio can choose full/budget geometry quality; WebGL render only on changed scene/controls; local WebP project preview improved | GPU frame time, actual FPS and memory use have not been measured |
| 3D visual export | `Scene.exportPreviewGLB()` uses Three.js `GLTFExporter`; studio UI offers **3D GLB**; output intentionally excludes room and production approval | Must be opened in separate glTF viewer and visually verified; **NOT** STEP/CAD/BOM/production document |
| Indicative lead time | `src/leadTime.js` derives a working-day range from product family, labour hours and selected options; `ConfigurationDetails.jsx` shows the range, start event and stage breakdown | Demo norms only: no factory capacity calendar, supplier confirmation, delivery date, or production commitment |
| Cross-role production schedule | `src/productionSchedule.js` derives contiguous working-day stages, gates, contingency and option-aware work packages from the same lead-time result; the shared configuration card exposes it in client, partner and factory order views | No calendar dates, reserved capacity, supplier availability, operation-level durations, MES integration or production release |
| Client offer assurance | `src/clientOffer.js` binds a client-safe acknowledgement projection to the exact offered revision; `ClientOfferAssurance.jsx` shows its local concept-TZ status, reference and record date without factory notes or deal economics, and labels the due date as an unconfirmed project date | Local simulation only: no verified factory identity, capacity, calendar commitment, bank confirmation or production release |
| 360° and reversible exploded view | `Scene.jsx` adds explicit auto-rotation, assembled/inspection/exterior modes, a 0–100% separation control and pointer selection; `assemblyExplosion.js` applies bounded transforms from saved local origins without rebuilding geometry for every slider update | Visual explanation only: no assembly kinematics, collision solver, approved assembly sequence or manufacturing CAD |
| Configuration-aware part guide | `designGuidance.js` and `DesignExperience.jsx` describe the actually selected seat, back, arms, legs, pillows, frame, filling and support; both a labelled select and raycast selection are available | Descriptions are generated from concept inputs, not supplier certificates, measured construction or factory approval |
| Gentle design advisories | Proportion, cushion depth, moving covers, plinth clearance, panel width, leather/soft-form and integrated-electrics rules explain the risk and next step; arm-free seating now clears and disables stranded USB/lights | Advisories are not a structural calculation, ergonomic certification or substitute for factory review; hard validation remains separate |

**Important distinction:** dimensions are the conceptual source-of-truth inputs in centimetres (`domain.js`), factory draft uses millimetres (`engineering.js`), and Three.js preview uses metres. Current display follows engineering stack height, but a rounded or organically deformed mesh and a rotated back panel are not exact manufactured surfaces. No claim of photorealism or production-ready CAD is made.

## Regression and release gates

Run on the **same checked-out SHA**:

```bash
nvm use
npm ci
npm run verify:source
node --test tests/preview-layout.test.js tests/visual-detailing.test.js tests/upholstery-geometry.test.js tests/lead-time.test.js tests/production-schedule.test.js tests/client-offer.test.js
npm test
npm run build
```

Tests cover: factory-derived seat heights for sofa, chair and chair-bed; seat depth and tilt input effects; UV dimensions per face; geometry bounds of trim; double seams vs piping; cylindrical bolster UV and groups; deterministic upholstery profiles; finite position/normal/UV attributes; six material groups; exact configured envelopes; identical cushion/detail transforms; shared-geometry safety; thin/wide/high-detail boundary envelopes; malformed-transform rejection; fail-closed geometry inputs; deterministic, bounded, fail-closed indicative lead-time ranges; schedule/lead-time reconciliation, contiguous stages, option-aware work packages, null operation durations and fail-closed schedule inputs; and exact-revision client acknowledgement projection, pending/fail-closed states and exclusion of factory notes and economics.

### Local targeted evidence for the upholstery increment

On 2026-10-30, using local Node.js 20.20.2 rather than the repository's declared Node 24 runtime:

- `node --test tests/upholstery-geometry.test.js`: **5 tests passed** in the isolated Three.js harness, including exact seam/piping conformance, single processing of shared detail geometry, malformed-transform rejection, and a 48-case permanent boundary matrix.
- An additional exploratory **360-case** matrix covered all profiles, both surfaces, three segment levels, four radii, and five dimension sets; all cases preserved finite centred envelopes and six material groups.
- Per-vertex temporary arrays were removed from the deformation path. The optimized vertex output retained the exact pre-optimization SHA-256 hash, and a cold-start Chromium render had **zero mean pixel difference** from the conformed-piping reference.
- The integrated `src/Scene.jsx` passed Vite's esbuild JSX parsing check.
- An isolated Chromium/WebGL harness rendered tailored, soft, and relaxed cushions. Two initial render iterations were inspected; exposure and fill lighting were corrected after the first. A subsequent render with conformed piping showed continuous detail alignment without observed surface breaks or floating piping.
- The repository copy fidelity check reproduced the original `Scene.jsx` Git blob SHA before applying the integration edits.

This is targeted local evidence, **not** full repository CI, not full application browser E2E, not mobile/desktop acceptance, and not manufacturing approval.

### Local targeted evidence for the indicative lead-time increment

On 2026-10-30, using local Node.js 20.20.2 rather than the repository's declared Node 24 runtime:

- `node --test tests/lead-time.test.js tests/domain.test.js tests/upholstery-geometry.test.js`: **20 tests passed, 0 failed**. This covered the new range formula, existing costing/domain regressions, and the upholstery suite.
- The integrated `ConfigurationDetails.jsx` was bundled with esbuild and server-rendered for sofa, armchair, and headboard. Each render contained the working-day range, factory-acceptance start event, queue/material/production/QC breakdown, and the explicit unconfirmed-demo disclaimer.
- A complete repository checkout was not available in the local harness, so full `npm ci`, source-inventory verification, complete `npm test`, production build, and real browser E2E remain unproven. The new UI check is server-render evidence, not browser acceptance.

### Local targeted evidence for the cross-role schedule increment

On 2026-10-30, using local Node.js 20.20.2 rather than the repository's declared Node 24 runtime:

- `node --test tests/production-schedule.test.js tests/lead-time.test.js tests/domain.test.js tests/upholstery-geometry.test.js`: **24 tests passed, 0 failed**. This covered schedule/lead-time reconciliation, all five product families, boundary labour inputs, option-aware work packages and the existing domain/upholstery regressions.
- The integrated `ConfigurationDetails.jsx` was bundled with esbuild and server-rendered for sofa, armchair, and headboard. Each render contained the same visible range in the summary and schedule, contiguous stage days, work packages, the unconfirmed capacity/calendar disclosure and the explicit no-production-release statement.
- Source inspection confirmed that `OrderWorkspace.jsx` renders this shared card for client, partner and factory order roles. This establishes the integration path, not real role-based browser acceptance.
- A complete repository checkout was not available in the local harness, so full `npm ci`, source-inventory verification, complete `npm test`, production build, and real browser E2E remain unproven. The UI check is server-render evidence, not browser or factory acceptance.

### Local targeted evidence for the client offer-assurance increment

On 2026-10-30, using local Node.js 20.20.2 rather than the repository's declared Node 24 runtime:

- `node --test tests/client-offer.test.js tests/production-schedule.test.js tests/lead-time.test.js tests/domain.test.js tests/upholstery-geometry.test.js`: **28 tests passed, 0 failed**. The new cases cover exact revision/spec binding, pending and incomplete acknowledgements, malformed-state rejection, and the absence of factory notes and economics from the client-safe projection.
- The integrated `ClientOfferAssurance.jsx` was bundled with esbuild and server-rendered. The confirmation reference was visible while the internal factory note and factory cost were absent.
- The existing `tests/order-workspace-ui.mjs` three-role DOM scenario passed with additional assertions for pending/confirmed client status, the exact acknowledgement reference, the unconfirmed project-date label, and no stale contradictory message. The local harness used the real order UI/workflow/storage/pricing modules but stand-ins for the unavailable manufacturing package and factory configuration-key dependency; this is targeted DOM evidence, not full application or manufacturing integration.
- Local Node 20 compatibility required jsdom 26 and a navigator shim in the test harness only; repository dependencies and declared runtime were not changed.
- Copy-fidelity checks reproduced the original `OrderWorkspace.jsx` and `tests/order-workspace-ui.mjs` Git blob SHAs before editing. Full checkout, clean `npm ci`, complete source verification, complete `npm test`, production build, real browser E2E and factory acceptance remain unproven.

### Local targeted evidence for 360°, exploded assembly and design guidance

On 2026-10-30, using local Node.js 20.20.2 rather than the repository's declared Node 24 runtime:

- `node --test tests/assembly-explosion.test.js tests/design-guidance.test.js tests/domain.test.js tests/upholstery-geometry.test.js tests/lead-time.test.js tests/production-schedule.test.js tests/client-offer.test.js`: **39 tests passed, 0 failed**. The new checks cover bounded reversible transforms, 50 cycles without transform drift, room/trim preservation, five-family part descriptions, dynamic configuration text, advisory thresholds and the arm-free electrics guard.
- `tests/design-experience-ui.mjs` passed against the real React components: 360° start/stop, disassembly, 100% and intermediate slider states, assembly, exterior mode, dynamic seat-core description, detail close, USB/light reset and disabled states, and advisory rendering. The test is included in `npm test`.
- A real Chromium/WebGL harness rendered the exterior and 100% inspection views. Normal pointer clicks operated the overlay controls; automatic rotation, direct raycast selection of the frame, select-based seat description and arm-free electrics reset were exercised. A 375×812 run had no horizontal overflow and no WebGL fallback. Desktop and mobile screenshots were visually inspected. The first visual pass exposed an active-button hover contrast defect; the hover rule was corrected and the active state was rechecked with a dark background and light text.
- Browser console had no application errors in the final desktop/mobile runs. Three.js reported its existing shadow-map deprecation warning; this does not constitute a zero-warning performance audit.
- The harness used locally reconstructed engineering dependencies for rendering; those dependencies are not part of this commit. Full checkout, clean `npm ci`, source-inventory verification, complete `npm test`, production build, the complete application shell, all five categories in browser, 768/1440 screenshot matrix, touch/keyboard/SVG/lost-context checks and factory acceptance remain unproven.

Visual acceptance (evidence required before merge): Chromium screenshots at **375/768/1440** for five category presets and two non-default dimensions; compare same material swatch on wide/narrow cushions, camera rotation and zoom, Pillow bolster vs square/lumbar, single/double/piping/none, full/draft quality, all three upholstery profiles, back lean 4° and 20°, GLB import on another glTF viewer and snapshot color/detail. Run WebGL + SVG fallback, keyboard and touch selection; check lost-context behavior and line/piping artifacts. Record exact SHA, browser version, device/GPU info, visual diffs, and uploaded output samples without any real client data.

Additional performance acceptance to **measure, not assume**: frame duration and GPU draw calls on a low-end mobile profile, memory after 30 material changes, stable controls, and no leaked geometries/materials/textures on rebuild or GLB export.

## Further engineering work, prioritized after CI stabilizes

1. **Unified surface registry**: shared versioned part/scene IDs, length-width-height, local transforms, seams and material assignments; 3D exterior and factory-cut views must fail validation if geometry disagree. Add invariant comparison against manufacturing package and CAD part IDs.
2. **Measured material library**: real supplier SKU/batch + calibrated baseColor, roughness, normal and displacement maps at declared physical repeat; fabric orientation, UV seam continuity, approved samples and lighting calibration. Include low-res LOD for mobile. No one-shot AI-generated fake fabric substitutes for proof.
3. **Cushion physics**: geometry control mesh/shape keys, fill volume and measured compression curves (CLD/IFD), seam stress zones and cloth response; reference fitted cushions against photos and test pieces.
4. **Parametric construction**: joints, fasteners, drill patterns, tolerances, and collision checks; keep an explicit bridge to CAD/STEP implementation. Open Cascade / FreeCAD are *candidates to evaluate*, not embedded engines.
5. **Upholstery patterns and nesting**: grain/repeat, allowance, shrinkage, panel adjacency, true fabric width, defect zones and BOM roll reconciliation; validate against factory cutting markers.
6. **Model QA and delivery**: separate low/high fidelity geometry; inspect GLB in independent viewers, implement geometry checks and automated screenshots; measure triangle budgets and BVH gains before adding third-party acceleration.
7. **Transaction handoff**: server-authenticated revision of configuration → signed quote/BOM → verified payment event → factory release with QC and dispatch events. Client-side export alone does NOT start production.

## Upstream APIs/technology references

- [Three.js RoundedBoxGeometry](https://threejs.org/docs/pages/RoundedBoxGeometry.html) — rounded preview boxes and unit parameters.
- [Three.js GLTFExporter](https://threejs.org/docs/pages/GLTFExporter.html) — glTF / GLB export API and limitations.
- [three-mesh-bvh](https://github.com/gkjohnson/three-mesh-bvh) — optional raycast/collision acceleration; benchmark and audit dependencies before adoption.
- [glTF Transform](https://gltf-transform.dev/) — candidate optimization and validation pipeline.
- [Open Cascade Technology](https://dev.opencascade.org/) — candidate geometry kernel for separate engineering/CAD workstream.

These are technical references, not evidence of a completed integration. License and compatibility reviews are required before adopting any new dependencies.

## Absolute stop conditions

Keep `productionRelease.allowed=false` and **PRODUCTION HOLD** until CI (same SHA), tenant-scoped PostgreSQL and server identities, independent browser E2E, approved engineering geometry, measured materials, supplier quotes, QC and physical fabrication proofs are present. Do not claim the GLB preview is a manufacturing file or a commercial product ready for orders.
