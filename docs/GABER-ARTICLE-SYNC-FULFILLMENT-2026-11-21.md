# GABER: five articles, role synchronization and concept fulfillment checks
Date: 2026-11-21. Implementation branch: feature/gaber-matrix-sync-receiving-20261121

## 1. Five article matrix (server / PostgreSQL 17)

The existing NOTTE R1→R2 Chrome→cookie→HTTP→PostgreSQL test is extended with four distinct server orders: LINEA, CAMBIO, TELA and FORMA. Each has its own generated order ID, original engineering config, partner factory assignment, factory concept review, customer offer/consent, isolated hash-chain and negative unauthorized-command checks. Local investor scenario payment/production states must NOT be copied into the authenticated server.

## 2. Safe operator and factory auto-refresh

Authenticated role-projected orders are re-read every 7 seconds while the cabinet is visible, idle and no text/form field is being edited. Also re-read on tab refocus/visibility activation. Stable orderId React keys and version-only state reconciliation avoid losing unfinished form drafts. Changed revision keys invalidate stale amendment forms. The server is still authoritative for access, idempotency and 409 conflict handling. This is polling, not push/WebSocket or instantaneous synchronization.

## 3. Concept-only packing, receiving and correction chain

All three roles remain strictly Client / GABER Partner / Factory. On the existing **DEV-simulated** logistics path:

1. Once QC reaches \`ready\`, Factory can submit \`record_packout\` then \`amend_packout\` with actual-count CLAIMS per group derived from deterministic engineering frame BOM sourceGroup references. Bad quantities, unknown groups, duplicate references and packing amendments out of order are denied. A recorded under-packed order cannot pass \`ship\`.
2. Once the existing simulated carrier marks \`delivered\`, Client can submit \`record_receipt\` by identical group references with claimed received/damaged counts. A mismatch creates a separate immutable discrepancy record and a \`disputed\` order, NOT a successful delivery.
3. Factory or Partner must provide specific partRef/kind/quantity correction proposals in \`respond_issue\`; the server rejects fabricated or excessive corrections. Client may reject a proposed resolution. On \`confirm_resolution\`, the **proposal alone** is marked accepted; it is NOT physical correction, financial credit or customer receipt.
4. The accepted plan returns the order to \`delivered\` but **blocks** final \`accept_delivery\` until a new independent \`record_receipt\` confirms every conceptual group, with a fresh unique receipt reference. Only then may Client close the DEV route.
5. All events are persisted via the existing versioned hash-chained transactional PostgreSQL journal with three role claims, MFA requirements, tenant scopes and factory directory membership. Read DTOs show only concept group quantities and authority tags, not unverified real supplier SKU, CAD or internal factory costs to Client.

## Intentional limits / safety

- New packing/receiving notes are *claims by simulated parties*, not physical inventory movements, verified acceptance documents, bank settlement, refund, credit note, replacement completion or factory production permission.
- The legacy demo simulation remains usable even if no packout has been recorded; packaging gates apply when a packout record exists. Real production remains HARD HOLD regardless.
- No real PSP, transporter API, e-signature, supplier SKU, material measurements, approved drawings or WebXR headset validations are connected. Any commercial deployment requires these plus independent review.
- The previous external-authority DEV simulator remains restricted to DEV tenant + non-production; \`productionRelease.allowed\` always remains false.
- Acceptance must include Node, DOM, Vite, actual Chromium, PostgreSQL RLS/HTTP and simulated lifecycle with new short receipt, role denials, correction and reinspection, **all on the exact same SHA**. See GitHub Actions for evidence, not simply these statements.
