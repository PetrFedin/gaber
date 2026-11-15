# GABER v0.4.4 — Integrity contract repair

**Draft PR #2, branch `feat/production-engineering-v04`. Production authorization: HOLD.**

## Confirmed problem
The v0.4.3 digital auditor mistakenly treated support element sizes
(`width/height/length`) as Cartesian box sizes (`x/y/z`), making healthy
support objects fail the `SUPPORT_GEOMETRY` check. Executing the actual GitHub JS modules
found 32 failures in 34 v0.4.3 examples; the two headboard examples without
support pieces passed.

## Repairs
1. Different validators for support dimensions and frame/foam box dimensions.
2. Shared `geometry.moduleWidthCm * 10` nominal module width for frame, soft
envelopes and support centers; the residual nominal-width rounding error is
explicitly **not** a factory cutting tolerance or certified fit.
3. Each `layers[].envelopes` now has its own scene node ID, size, position,
rotation and geometry kind; the auditor detects individual mismatches.
4. `tests/traceability-v044.test.js` adds 190 family-width-module-arm source
cases, module-center alignment, actual Three.js geometry assertions when npm
dependencies are available, negative corruption cases and release hold tests.

## Verification before commit
- In-memory V8 execution of GitHub JS modules with explicit injected ESM
dependencies and JSON `structuredClone` polyfill: **214/214** candidate
configuration tests passed.
- **10/10** deliberate corruption tests correctly triggered an audit failure.
- Assembly source run with structural Three.js **stand-ins**, not actual Three.js:
**34/34** scenarios passed. Checked 1,144 frame IDs/transforms, 566 soft
identities/positions/sizes, 928 support IDs, and 24 hardware placeholders.
- These checks do not establish `npm test`, `npm run build`, WebGL, 
SVG fallback, browser QA, strength or manufacturing eligibility.
- An authorized remote Mac was listed but is offline.
- GitHub Actions v0.4.3 runs 39338005552 and 39337952306 both failed
without published steps. P0 issue #3 remains open; exact root cause unknown.

## Ongoing BLOCKERS
Measured supplier data, approved CAD/hole patterns, tolerances, cutting
markers, foam test curves, mechanism geometry, costs, finished product load/
stability tests, authenticated signoff and authoritative server control are
still absent. `productionRelease.allowed` remains false. Do not merge,
publish production documents or deploy from this patch alone.
