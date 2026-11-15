# GABER MVP Quality Contract

**Normative target for the existing integration PR #2.** This document defines acceptance criteria; it does not certify that they have been met. The repository remains on **PRODUCTION HOLD**.

## 1. Product promise

GABER is a managed custom-furniture configurator connecting three roles:

- **Client:** creates a permitted configuration, understands the design, receives an assembly overview, indicative or confirmed price, and expected timing.
- **Factory:** receives a separate, revisioned technical package, checks feasibility and cost, plans production, and records QC and completion.
- **Partner / GABER:** manages the catalogue rules, quotation handoff, exceptions, commission, and order communication without exposing another role's private financial data.

The first accepted customer-facing product family is **sofa, armchair, and bed headboard**. Other legacy categories may remain in source for compatibility, but are not accepted as part of this MVP promise until they pass the same gates.

## 2. Non-negotiable behaviour

### Configuration and manufacturability

1. A client can select only a combination permitted by a versioned product rule set: dimensions, heights, depths, modules, arms, back form, mechanism, upholstery, colour, seams, pillows, legs, and options.
2. A disabled or rejected combination must explain the constraint in plain language. The UI must not silently repair a configuration into a different product.
3. Every saved configuration and quotation carries product-rule and revision identifiers. Factory acceptance refers to the same immutable revision.
4. Visual plausibility is not manufacturability approval. No geometry, price, lead time, or mechanism may be labelled production-approved without factory evidence.
5. Structural parts and soft exterior surfaces are separate concepts. Preview deformation must not alter configured overall dimensions or engineering inputs.

### Calculations and commercial states

1. Money uses integer minor units; quantities and dimensions have explicit units. Rounding happens at declared boundaries, not ad hoc in components.
2. Material use, labour, options, logistics, commission, taxes, discounts, and totals are traceable to named inputs and rule versions.
3. **Indicative estimate**, **factory-confirmed quotation**, **paid amount**, and **payout/commission** are different states and different DTOs. A client calculation is never presented as factory confirmation.
4. Lead time is a range with a basis and status. It starts only from the defined commercial and technical event, not from opening the configurator.
5. Server commands are authenticated, tenant-scoped, idempotent where required, and checked against the current revision. The browser is not the authority for price, role, payment, or production release.

### Visualization

1. Sofa, armchair, and headboard must remain recognizable and visually coherent at every permitted configuration, not only at the default preset.
2. Upholstery uses deterministic soft forms with readable curvature, seams/piping attached to the actual part, physically scaled material mapping, stable normals, and no unexpected intersections.
3. Overall mesh envelopes remain equal to requested dimensions within numerical tolerance. Shape and comfort controls have deterministic, documented visual semantics.
4. Draft and no-WebGL modes preserve configuration and calculation workflows. A rendering failure must not erase the project or misstate feasibility.
5. GLB/snapshot exports are labelled **concept visualization**. They are not STEP, approved CAD, cutting patterns, a BOM, or authorization to manufacture.
6. Visual acceptance requires real application screenshots on desktop and mobile, rotation/zoom, non-default dimensions, all accepted upholstery families, and GLB inspection in an independent viewer. Isolated geometry renders do not replace application E2E.

## 3. Role-specific experience

| Role | Required workflow | Must not happen |
| --- | --- | --- |
| Client | Guided choices, immediate valid preview, transparent constraints, saved revisions, assembly overview, price/timing status | Engineering clutter, hidden option changes, false final-price or in-stock claims |
| Factory | Revisioned technical queue, feasibility review, cost and lead-time response, production schedule, exceptions, QC | Client/partner private ledger exposure, anonymous revisions, visual-only technical handoff |
| Partner | Catalogue/rule governance, quote coordination, exception handling, commission view, cross-role status | Unrestricted tenant access, unversioned rule changes, commission treated as client payment |

Interfaces may share design tokens, but information density and terminology must match the role. Accessibility, keyboard operation, readable focus/error states, and responsive layouts are acceptance requirements rather than optional polish.

## 4. Customer and factory deliverables are separate

**Customer package:** selected design and options, overall dimensions, care/material information available to the client, assembly overview, commercial status, price status, timing range, and revision.

**Factory draft/package:** exact configuration revision, part/option identifiers, dimensions and units, material/SKU references, construction and mechanism requirements, tolerances where approved, costing inputs, open questions, schedule, and QC checkpoints.

A factory package becomes production-releasable only after authenticated factory approval. Missing engineering data must remain an explicit open item, never an inferred zero or an empty successful export.

## 5. Acceptance gates

An MVP candidate is acceptable only when all applicable gates pass on the same commit SHA:

1. **Source integrity:** clean source inventory, dependency lockfile, documented runtime, no secrets or real customer data.
2. **Automated correctness:** unit, domain, role-policy, API, repository, calculation, geometry, and UI regression suites pass in CI on the declared Node runtime.
3. **Real vertical slice:** browser → authenticated API → PostgreSQL → role-scoped read model works for client, factory, and partner; browser-local storage is not presented as server persistence.
4. **Product-rule coverage:** every permitted option combination has validation tests; boundary and invalid combinations fail closed with useful messages.
5. **Visual application QA:** accepted products and responsive viewports pass the visualization checklist, including fallback and export inspection.
6. **Performance and resource safety:** measured frame/draw-call budgets on target hardware and stable memory after repeated configuration changes and exports.
7. **Factory engineering review:** a real factory approves the technical package and identifies unresolved tolerances, materials, construction, and schedule assumptions.
8. **Physical validation:** at least one representative product per accepted family passes fit, finish, mechanism, durability, packaging, and assembly review against the same revision.
9. **Commercial reconciliation:** indicative/confirmed prices, payment events, factory payout, and GABER commission reconcile without cross-role data leakage.

Until gates 1–9 are satisfied, keep `productionRelease.allowed=false`, do not merge as a production release, and describe the application as an engineering MVP/prototype rather than a proven manufacturing service.

## 6. Current visualization increment

`src/upholsteryGeometry.js` implements deterministic `tailored`, `soft`, and `relaxed` preview profiles over Three.js rounded-box topology. `src/Scene.jsx` applies them to physical-material upholstery while leaving the darker structural base, timber, mattress, simplified rendering, and engineering inspection assembly on their existing paths.

The implementation preserves UV attributes and six material groups, recomputes normals and bounds, and normalizes each deformed mesh back to its requested width, height, and depth. Local-space seams and piping inherit the identical warp and normalization rather than remaining on the original box contour; shared detail geometries are processed once. It is an exterior visualization improvement only: it contains no foam model, cloth simulation, approved CAD surface, tooling data, or manufacturing certification.
