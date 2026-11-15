# GABER: project persistence hardening, 2026-10-19

Base: `8f484481af24d6a454c2995054dc1adae49eee84`, branch `feat/production-engineering-v04`, Draft PR #2.

## User story and data boundary

Configure furniture → save a local project → reload → inspect its estimate in the factory demo → save a proposal/status/event → reload or delete. The application uses browser localStorage, not an authenticated factory server. Proposal status is still demonstrative and cannot authorize manufacturing.

## Fixed behavior

- A null/invalid record no longer causes the entire project list to disappear. Healthy records remain visible. Duplicate IDs are detected. When any record is rejected, writes are blocked and the original stored string remains untouched.
- Malformed JSON, invalid root containers and unavailable storage now produce an application alert and block persistence instead of silently overwriting unreadable data with an empty list.
- Legacy project records receive safe name/date/event/image defaults. Missing or malformed estimates are reconstructed as **demonstration estimates using current default rates**, explicitly identified in the UI and persisted with `estimateRecovered=true`. They are not represented as original historical financial snapshots.
- Existing well-shaped estimate snapshots retain their rows, rates, costs and sources; only supported project metadata is persisted. Image previews accept embedded PNG/JPEG/WebP data, not remote URLs. Invalid quote metadata is discarded.
- Writes compare the current raw stored string with the string observed by the UI's project list. An already observed stale tab cannot replace newer stored data. This is a synchronous best-effort check, **not an atomic cross-tab transaction**: simultaneous read/write races still require Web Locks or a transactional backend.
- The 100-project limit refuses additions instead of silently evicting older projects. Previously oversized lists remain readable and allow gradual deletion.
- Configuration normalization rejects arrays, and validation handles null/non-object input.
- The UI uses the validated returned snapshot and surfaces persistence errors; it does not show a success toast following a failed write.

## Executed validation

On the implementation source set saved with this report:

- Dependency installation: `npm ci --ignore-scripts --no-audit --no-fund`, passed with the existing lockfile.
- `npm test`: **47 Node test cases passed**, including 11 persistence regression cases; **52 SSR scenarios passed**, including the actual App's projects/factory routes with corrupt JSON, null records and incomplete legacy records.
- `npm run build`: passed, Vite 7.3.7. No dependency or lockfile changes.
- Existing frame, scene-node, manufacturing, upholstery, beam and chaise tests remain in the full test run. These instantiate Three.js geometry without GPU rendering.

## Boundaries not verified

- Browser click flows, hydration, mobile layout, downloads, WebGL and screenshots/video: **not verified**. A local Vite server started on 127.0.0.1; the Chromium install failed because its download was not a valid ZIP. No browser acceptance result is inferred from SSR or unit tests.
- GitHub Actions run `39162092269` on the base SHA failed: job `117777332841`, `steps=[]`, `runner_id=0`, empty runner name. Exact platform cause remains unconfirmed. Local green results do not replace remote exact-commit CI.
- Corrupt raw data is preserved, but there is no user-facing repair/import workflow yet. Recovery of missing estimates cannot reconstruct missing original rates.
- No CAD, factory authentication, supplier evidence, physical testing or production release has been established. `productionRelease.allowed=false` remains enforced.

## Next work

1. Restore remote CI execution on the new exact commit and inspect its result.
2. Browser acceptance of save/reload/proposal/delete, shared configurations and exports on desktop/mobile, both WebGL and fallback.
3. Add explicit raw-data export/recovery and a transactional storage path before supporting real multi-user factory workflows.
