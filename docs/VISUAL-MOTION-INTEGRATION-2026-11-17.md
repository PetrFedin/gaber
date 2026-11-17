# GABER — consolidation of visual and presentation timing (2026-11-17)

Branch: feature/visual-motion-consolidation-20261117, based on PR #2 at 5f2826085da67ec82eaadc7034140c5f2fa37be0. This is a safe integration increment, **not v0.7 restored**.

## Implemented in this branch

1. A fixed 1/120-second presentation timeline now drives the existing exploded-view interpolation in Scene.jsx. Its 0–1 amount still passes through the existing assemblyExplosion.js / engineering model. The previous frame-dependent 0.22 blend has been removed.
2. The day, evening and cool lighting values are sourced from visual-fidelity/src/fidelity.js at 746015a41fc9181d75886c2726409b32f92ae933. They now control the existing Three.js lights and exposure through a user-facing studio selector without replacing the engineering mesh or order logic.
3. Pure Node regression tests cover 30/60/90/120 Hz progress, bounds/reversal, reduced motion and lighting preset validation. Existing render smoke / DOM / WebGL and full release verification still need to run on this exact SHA.
4. All changes remain in a dedicated branch. main, the original PR #2 head and production are unchanged.

## Not restored or claimed

- The v0.7 release record at feature/gaber-v07-release-record/docs/releases/GABER-v0.7.md refers to a local ZIP and commit 5a4e106a, neither of which can be retrieved from the GitHub branch. The connected Mac was offline on 2026-11-17. Full v0.7 Product Graph 1.3, mechanisms and XR code **have not been reconstructed from a release description**.
- The visual-fidelity branch includes ArPreview, QualityDock, procedural upholstery, GTAO and high-res capture. Only the light values have been ported in this increment. Three.js rendering, materials, physical-layer engineering and existing scene ownership stay in the main engineering branch.
- This is deterministic **presentation animation**, not rigid-body physics, foam compression, cloth simulation, joint-force calculations, manufacturing certification or physically verified kinematics.
- Lighting remains **uncalibrated**. Do not claim photorealistic colour fidelity from these presets.

## Exact-SHA verification gates

- node --test tests/presentation-timeline.test.js tests/visual-lighting.test.js
- npm ci, npm run verify:repository, npm run test:node, npm run test:ui, npm run build
- Chromium/WebGL on 375/768/1440: verify three lighting profiles, explosion 0/25/50/75/100, animation timing, 360° controls, reduced-motion, SVG fallback and GLB export
- Real handheld mobile, AR and headset XR separately; hardware tests are not simulated by Chromium.
- Independent review of the integration diff before updating PR #2 or main.

## Recovery path when the Mac is online

Find the locally recorded GABER-v0.7.zip and the original working tree containing commit 5a4e106aef73bc803995f143306669959d189f89. Verify the archive SHA-256 against docs/releases/GABER-v0.7.md; inspect the LICENSE and secrets before importing. Compare local 0.7 tree against this integration branch, preserve the actual Product Graph revision contract, then port complete source plus tests and asset provenance into a separate reviewable commit. Never fabricate the missing source from markdown.

Next priorities: recover true v0.7, assess connector/socket and mechanism contracts, introduce kinematic clearance + BVH, validate one mechanism against factory reference poses, calibrate real PBR materials, then hardware-test XR/AR.
