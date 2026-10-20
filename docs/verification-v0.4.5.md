# GABER v0.4.5 — complete conceptual joinery audit and closed cutting-marker gate

Changes:
- `src/jointLayout.js` is a shared deterministic proposal and instance-level
  joinery registry imported by manufacturing and traceability audit.
- Export `jointProposals` from manufacturing is preserved as a re-export.
- Digital audit rejects missing, duplicated, spurious or relocated joints;
  also mismatched part refs, joint kind and conceptual clearance assumptions.
- Upholstery release gate no longer treats drawing metadata and roll width
  as proof of a cutting marker. The current conceptual panel pattern is
  `layout-required`, not `verified-layout` and has no measured marker length.
- Includes `tests/joint-contract-v045.test.js` for 53 scenario combinations,
  7 adverse mutations and deliberately misleading evidence inputs.

Checks performed on candidate (prior to GitHub commit): fetched GitHub JavaScript
modules executed in a V8 isolate with injected imports and structuredClone polyfill;
54/54 scenarios passed; cumulative 1,066 joint instances verified; 7/7
deliberate corrupted joinery variants detected. This is **not** Node npm test,
a true Three.js/WebGL acceptance, or factory certification.

Release stays HOLD. Actual drilling CAD, fastener SKUs, materials and physical
load/strength tests, full upholstery markers, tolerance stacks and authoritative
server-side approvals remain absent. Existing GitHub Actions runner issue #3
remains a production blocker.
