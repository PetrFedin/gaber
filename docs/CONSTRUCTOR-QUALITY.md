# GABER Constructor — quality engineering and acceptance

**Engineering change in existing PR #2; no new release or production approval.**
Source branch: `feat/production-engineering-v04`.
Status: **SOURCE CHANGE / CI BLOCKED / BROWSER QA PENDING / PRODUCTION HOLD**.

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

**Important distinction:** dimensions are the conceptual source-of-truth inputs in centimetres (`domain.js`), factory draft uses millimetres (`engineering.js`), and Three.js preview uses metres. Current display follows engineering stack height, but a rounded or organically deformed mesh and a rotated back panel are not exact manufactured surfaces. No claim of photorealism or production-ready CAD is made.

## Regression and release gates

Run on the **same checked-out SHA**:

```bash
nvm use
npm ci
npm run verify:source
node --test tests/preview-layout.test.js tests/visual-detailing.test.js tests/upholstery-geometry.test.js tests/lead-time.test.js
npm test
npm run build
```

Tests cover: factory-derived seat heights for sofa, chair and chair-bed; seat depth and tilt input effects; UV dimensions per face; geometry bounds of trim; double seams vs piping; cylindrical bolster UV and groups; deterministic upholstery profiles; finite position/normal/UV attributes; six material groups; exact configured envelopes; identical cushion/detail transforms; shared-geometry safety; thin/wide/high-detail boundary envelopes; malformed-transform rejection; fail-closed geometry inputs; and deterministic, bounded, fail-closed indicative lead-time ranges.

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
