# GABER v0.4.1 — assembly links and verification

Date: 2026-10-18. Base: `703cb0cdeca0392c0743ad60ff433b58cbbb6dcb`, PR #2.

## Defects corrected

- Inspection geometry previously repeated its own dimensional formulas, omitted frame corner plates and did not assign the Scene Node IDs advertised by manufacturing exports.
- Manufacturing route references named a group while route records used a different, instance-specific ID.
- Joint proposals referenced only part groups, rather than identifiable physical instances.
- Manufacturing release checks omitted the engineering model's unresolved checks.
- Having zero decorative pillows incorrectly waived furniture upholstery review.
- Roll-fit checking silently permitted a 90-degree rotation despite a fixed grain direction.

## Resulting behavior

`src/frameLayout.js` converts the engineering cut list into millimetre box envelopes and placements. Both the inspection scene and manufacturing registry use these instances. Every frame member has one `partId`, one matching `sceneNodeRef`, cut-list dimensions, a scene transform and one resolving route ID. Joint proposals carry concrete `partInstanceRefs`. The technical table exposes route IDs and joint membership.

Identity is scoped to the current concept configuration: an ordinal is not a permanent ERP asset identity across redesigns. The manufacturing schema is now `gaber-production-concept/0.4.1`.

## Checks performed locally

- `npm ci --ignore-scripts --no-audit --no-fund` succeeded with the existing dependency lockfile.
- `npm test`: 28 passing Node test cases, followed by 40 server-render smoke scenarios.
- `npm run build`: Vite production build succeeded.
- The six new regression test cases cover actual Three.js meshes versus the cut list and manufacturing registry, routes, joint membership, changed configuration parameters, engineering blockers, upholstery without pillows, fixed textile direction and export snapshot isolation.
- Scene-link tests instantiate 17 configurations across all five families, boundary widths, module/arm variants and changed panel count. They inspect real geometry objects and dispose their resources; no GPU is used.

## Verification limits

Browser interaction, WebGL rendering, mobile layout and downloads have not been verified in this pass. Server rendering does not establish hydration or browser behavior. The earlier GitHub Actions run `39061762955` failed; its job log fetch returned BlobNotFound, so its failure cause is not established by these local checks. Do not describe the remote CI result as green without observing a subsequent successful run.

The placement geometry remains a concept: box envelopes are not drilled joinery CAD; the corner plates are rectangular envelopes. Slats, suspension and filling remain schematic, and frame traceability does not claim complete supplier assembly traceability. Chaise-specific frame construction, real tolerances, forces, fabric deformation and factory drawings still need engineering work.

Production release remains disabled. Client-supplied document metadata does not establish independent approval. No manufacturing authorization or verified factory cost is introduced by this change. This work updates the draft development branch; it does not itself deploy the hosted Site.

## Next verification step

Observe CI for the updated branch, then test the inspection switch, dimensional edits, undo/redo, project reload, technical-page exports and SVG fallback in desktop/mobile browsers. Resolve any failures before publication or merge. Subsequent geometry development should model the chaise-specific frame from approved drawings instead of treating the straight modules as its complete construction.
