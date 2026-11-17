# GABER — kinematic clearance stage 1 (2026-11-18)

**Engineering scope:** implement a concrete, reusable, auditable collision **proxy** without inventing the original v0.7 Product Graph 1.3 source code or presenting it as a production mechanism.

## Confirmed source recovery status

- The connected Mac `macbook-air-2` became reachable on 18 Nov 2026. Checked `/Users/petr/Projects/gaber`, its worktrees, named `GABER` files in Projects/Downloads/Desktop/Documents/Backups/Archive/`work` and local Git reflogs.
- The purported local v0.7 commit `5a4e106aef73bc803995f143306669959d189f89` is **not** in the available local GABER Git object database. The release archive `GABER-v0.7.zip` with expected SHA-256 `cf9f571ef499b719e0a648d789450ad7f56329f8c864c9556a04475143415f2a` was **not located**. It may exist in a different working environment; this session cannot verify that.
- Source of truth remains `feat/production-engineering-v04`, improved in `feature/visual-motion-consolidation-20261117`. Do not replace code with prose from `docs/releases/GABER-v0.7.md`.

## New executable feature

- `src/kinematicClearance.js`: inspect an explicit pair of Three.js objects using oriented boxes calculated from their actual BufferGeometry vertex positions and **world transforms**. Detect geometric overlap and a configurable 0–100 mm proxy buffer zone. Reject invalid inputs, missing/duplicate roots, nonfinite/degenerate vertices and excessive pair counts.
- `inspectKinematicSweep`: sample any explicitly supplied motion callback at 0/25/50/75/100% (or strictly increasing custom samples); always restore the original root transform. Each sample provides distinct evidence about that pose; gaps between samples are **not checked**. This is not continuous collision detection (CCD) or mesh-triangle collision.
- `src/registeredClearance.js`: binds inspection to the exact 3D meshes from `buildInspectionAssembly` and manufacturing identifiers from `createManufacturingPackage`; rejects unknown part IDs and duplicated identifiers, reports engineering/manufacturing schema versions and keeps production HOLD.
- `src/ClearancePanel.jsx`: interactive pair selector in the existing technical passport **only for product variants with a mechanism or storage**, not a separate application. Uses production node IDs. Checks a static pose on request and reports overlaps/buffer-zone warnings without claiming engineering approval. Nominal contact between designed assembly layers may be legitimate and needs manual interpretation.

## Verification

- Independent macOS worktree checked out at exact base SHA `ec347b40c6508fbf5da1a1e602285e1db98dbbf1`; before this increment `npm ci`, `npm run verify:repository`, all 282 Node tests, all existing UI tests and Vite build passed on Node 22.22.3.
- Stage 1 newly added unit tests include geometrically rotated OBBs, proxy buffer-zone detection, collision during a sampled sweep, restoration after exception, invalid geometry and the real factory assembly registry for chairbed/bed/sofa.
- The new DOM regression covers selecting two different production nodes, rendering a result, maintaining factory HOLD and fail-closed invalid margin.

## Missing gates — explicit HOLD

1. Restore original v0.7 source/ZIP and SHA-256 from its **actual** source device, or recover the original Git objects and validate source completeness. Archive must pass secret/path/symlink review before import.
2. Obtain factory-authored part geometry, pivots, mechanical stops, reference poses and revision-controlled mechanism SKUs; link every moving body to `partId`, joint limits and geometry in the manufacturing register.
3. Replace proxy OBB sampled collision with BVH narrow phase and continuous/swept check where required; validate collisions and tolerances against approved mechanisms and physical measurements.
4. Verify foam load–deflection material curves and compression under loads; measured PBR textures, photometric/HDRI calibration, rendering on actual hardware, AR iOS/Android, WebXR headset controllers.
5. Repeat complete exact-SHA Node/UI/build and DB/HTTP/Chrome gates, independent review, production-release checks. No merger to `main` or production before all gates pass.

**No part of this stage authorizes fabrication or proves furniture safety.**
