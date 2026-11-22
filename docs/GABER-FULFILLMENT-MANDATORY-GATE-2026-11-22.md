# GABER QA increment: mandatory fulfillment and dispute reinspection
Date: 2026-11-22. Source: feature/gaber-fulfillment-authority-qa-20261122.
Base: feature/gaber-matrix-sync-receiving-20261121, verified PR #43 @ 200ca7742215ee078b682dec5cb9de8c382604b5.

## Confirmed gap addressed

Before this change, a **new authoritative server** order could call \`ship\` without a concept BOM packout (the previous guard only blocked an *incomplete* packout), and \`accept_delivery\` without customer receipt (unless a receipt had already been recorded with a discrepancy). This undermined the new UI workflow, because HTTP commands could skip its forms.

## Contract and migration strategy

Only new server-created order events receive a server-ONLY marker \`REQUIRED_INDEPENDENT_RECEIPT_V1\`. Browser input \`fulfillmentPolicy\` is not accepted in server HTTP request schema; server code stamps it into the hash-chained \`create\` command in the same serializable transaction. The reducer replays that persisted marker deterministically. Existing local demo event streams and legacy server event journals remain replayable *without rewriting the original event/hash chain*. There is no data migration for historical rows. This decision is a compatibility boundary, not validation of old manufacturing/receipt evidence.

**Mandatory for the new server policy**
- Factory-reported complete concept packout, derived from the exact current revision's engineering BOM, before the DEV-only \`ship\` command.
- Fresh client-reported receipt with all lines and zero damages, after delivered, before \`accept_delivery\`.
- If the client reports a problem after delivery (including a quality issue reported after previously matched receipt), agreeing on a proposed resolution *does not prove repair*. Prior receipt is marked \`correction_pending_reinspection\` and cannot authorize closure; Client must perform a new receipt, new document reference, and explicitly accept delivery.
- Duplicate command clicks are synchronously suppressed in React. After an action succeeds, a new server list read is guaranteed to follow any preexisting in-flight poll, to avoid showing a stale version and self-generated 409.
- These controls remain server-first; UI buttons communicate blockers and cannot grant external permissions.

## QA required for final SHA

1. Node unit contracts: mandatory new order, old event replay, attempts to stamp policy on non-create command, completed/new vs absent packout/receipt, customer reinspection after both shortage and separate post-delivery quality complaint.
2. DOM UI: same-tick double-click sends only one order command, no erasure of form state and exact money handling.
3. PostgreSQL 17 migrations 001-010, tenant RLS, role verification and immutable order events; DEV lifecycle A/B/C with missing packing/receipt negative tests.
4. Real Chromium with independent client, partner and factory cookies; all five furniture article categories; forged policy request rejected 400, auto-poll factory assignment, NOTTE revision R2 → technical BOM; responsive 375/768/1440.
5. Exact final candidate HEAD verified by all three GitHub Actions jobs. Never inherit GREEN status from a parent commit.

## Limitations / honest provenance

These are demo-only self-reported quantities and repairs, **not** verified warehouse stock, a factory-approved shop drawing, measured material behavior, signed receipt, real bank payment, real logistics API or manufacture permit. The DEV simulated external actions are denied for production and non-dev tenants; \`productionRelease.allowed\` stays false.

**PR remains Draft. Main and production remain unchanged; RELEASE HOLD applies.**
