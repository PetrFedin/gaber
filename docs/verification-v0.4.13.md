# GABER v0.4.13 — linked client and factory order workspace

Base commit: `7db8aed13d7db017646b072624f4b57473a2a034`. Engineering branch / Draft PR #2. Production HOLD.

## Implemented behavior

Both the client projects screen and factory screen now mount an order workspace backed by one versioned local journal (`gaber.order-workflow.v1`). It is independent of the older sketch status and survives route changes and reloads. Sidebar navigation and the old sketch decision area lead to the shared workspace. Legacy factory approve/change buttons were removed so they cannot act as a second order approval engine. Sketch cost previews remain preliminary and clearly separate.

The order reducer derives current state exclusively by replaying validated commands. Offers freeze the complete normalized configuration, price in integer kopecks, advance in basis points, planned readiness date and scope note. Each offer creates R1/R2/etc. Previous snapshots remain visible. Current order configuration feeds the existing manufacturing package engine; its digital integrity and release blockers remain separate from commercial consent.

### Local permission and transition matrix

| Action | Perspective | Required state / guard |
| --- | --- | --- |
| Create from an existing submitted project | Client | New order; exact project ID and valid config |
| Offer / replacement offer | Factory | Before production; complete terms and valid config |
| Accept offer | Client | Latest revision; explicit UI checkbox |
| Request correction | Client | Before production; note; clears previous consent |
| Report payment | Client | Accepted current revision; claim never funds balance |
| Record payment | Factory | Local unverified entry; unique normalized reference; cannot overpay current balance |
| Move prior-revision credit | Client | New revision accepted; explicit transfer; cannot exceed available credit or balance |
| Start production scenario | Factory | Accepted latest revision and full advance recorded locally |
| Complete / QC | Factory | Sequential work stage; QC document reference required |
| Record shipment | Factory | QC complete, full current price recorded, carrier/tracking/document reference |
| Record delivery | Factory | Existing shipment; delivery reference |
| Accept delivery | Client | Delivery recorded; separate from factory delivery status |
| Report issue | Client | Shipment/delivery stage; prevents normal closure |
| Message | Both | Preserves author perspective and revision context |

These perspective checks are reducer contracts, **not authentication or access control**. Any local user can edit localStorage or select another perspective. No bank, carrier or real factory system is contacted. All productionRelease fields remain false. A completed local workflow never opens the real manufacturing gate.

## Calculation and persistence guarantees / limits

- Advance = ceil(priceKopecks × advanceBps / 10000), calculated with BigInt before conversion to a safe integer.
- Financial overview separates client claims, local payment entries, current-revision balance and prior-revision credits. Bank-verified amount remains null.
- New revision never inherits consent or automatically spends previous funds. Explicit credit transfers conserve recorded money; surplus credit stays visible.
- Duplicate command IDs return an idempotent result only for identical command content. Reuse with another payload fails. Expected version, revision identity and non-decreasing timestamps are checked.
- Storage validates/replays every event, keeps private observed snapshots, rejects stale writes, checks size/count bounds and readback, and offers exact-raw backup even for damaged JSON.
- Limits: 100 local orders, 500 events/order, 4 MiB aggregate. No silent eviction.
- localStorage does not offer atomic cross-tab compare-and-swap. Optimistic stale checks and storage events improve local behavior but are not a PostgreSQL transaction guarantee.
- Incoming storage events replace current displayed state and reset revision consent. Corrections are blocked after production begins in this first workflow.
- Payment records cannot be reversed yet; cancellation/refund, dispute resolution, partial shipments, actual document upload and ERP integrations are not implemented. References are text, not independently verified files.
- This iteration offers width editing plus commercial terms in factory revisions; the frozen snapshot carries all existing configurator options. A full factory configuration editor is not added here.

## Verification — 23 October 2026

- `npm test`: 136/136 Node tests (13 new order/storage cases), 52 server-render smoke scenarios, existing project/revision DOM checks, new full order-workspace DOM lifecycle.
- New DOM checks exercise both perspectives, explicit consent, payment claim versus local payment entry, amendment, credit transfer, QC, full balance, shipment, delivery, messages, client acceptance and reload.
- Separate DOM checks verify cross-tab replacement invalidates the previous acceptance checkbox and corrupt journals expose no mutation controls.
- `npm run build`: PASS. Final verification is rerun before recording the code commit.
- React skill review informed memoization of engineering projection, independent form state, labeled inputs, explicit keyboard focus and storage subscription cleanup.
- Chromium download was attempted but returned invalid/truncated ZIP archives; no browser/WebGL screenshots, video or responsive visual acceptance are claimed.
- Latest-commit GitHub Actions status is checked separately in PR #2. Local tests do not establish CI success.

## Server integration still required

Replace this local adapter with an authenticated order service using tenant/order membership checks per request, a version-locked immutable command journal, authoritative configuration revision hashes and transactional payment allocation. Derive actor identity from the verified server session, never the submitted role. Financial and production events need independent bank/factory authority and audit evidence. Carrier events and customer acceptance must remain separate. Connect the client and production accounts to that service for cross-device synchronization, then run concurrent database, authorization and browser acceptance tests before any production release.
