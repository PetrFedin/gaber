# GABER server article/engineering bridge — 2026-11-18

Status: **DRAFT / production HOLD**. This change is stacked on PR #41, which contains five *local* simulated order histories. This PR **does not** import those histories into the server.

## New linked workflow

1. A signed-in server Client may explicitly choose one of the five validated furniture **product templates** from the existing demo definitions, or the current studio configuration. Only \`config\`, fresh order ID and an optional client-entered name cross the boundary. The command has expectedVersion=0 and type=create, so the server starts at \`requested\`, never at paid, ready or shipped.
2. If a network response to create is lost, the UI retains the exact orderId/requestId/payload and retries them unchanged. Git journal idempotency remains the authoritative enforcement. An explicit change to name or selected template begins a new candidate request.
3. After the customer requests a change, Partner's server \`prepare_spec\` form now allows editing exact width/depth/height, fabric/colour, sofa module count, chair-bed fold/slide or bed storage. \`buildServerSpecConfig\` rejects invalid furniture constraints and any invented price/approval fields; the existing server reducer separately revalidates specs, economics, roles and current version. Factory confirmation and customer consent are required again for the revised offer.
4. Each protected order role can navigate to a concept technical passport using **its own server role-projected configuration** and revision; opening it no longer overwrites the existing studio draft. Export provenance in the technical passport remains unverified and factory release blocked. Client access to detailed construction documents should undergo independent commercial/privacy review before production release.

## Acceptance criteria

- Pure regression tests for five product presets, construction changes and typed guards, fixed same-request retries, and withholding local financial/execution history.
- Server Orders DOM regression must exercise an R1→R2 width change (300 cm), factory acknowledgement and revised client consent. Invalid step must not send any server command.
- Existing Node / DOM / Vite build / Chrome / real PostgreSQL 17 and security tests must be rerun **on the exact committed SHA**. Mac was offline when authoring this branch. Do not claim full GREEN until it is back online.
- Production and main remain unchanged. Browser-local role navigation is not server authentication. Neither this module nor the investor presets verifies payments, physical engineering, AR/VR or factory readiness.

## Known blockers

Production-grade customer upload of local sketches, verified materials/factory catalogs, production authorization, bank/PSP confirmation, v0.7 archive source and WebXR hardware validation remain open.
