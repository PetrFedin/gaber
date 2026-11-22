# GABER G1: DEV-only SKU, stock reservation and partial batch ledger (2026-11-23)

Status: EXPERIMENTAL DRAFT. Follows PR #45 (GREEN at \`b82286b137912da972ddfd1337c7a9cb7ab45d55\`). No merge or production deployment.

## Data authority and what is NOT implemented

No external factory ERP, WMS, supplier catalog, barcodes, physical counting, proof of shipment, product acceptance signature or bank settlement is connected. There are **no real supplier SKUs** here. Synthetic \`DEVSKU-<hash>\` identifiers deterministically bind each group of the concept frame BOM to its category, dimensions and proposed material. Source fields \`supplierSku=null\` and \`approvedForRealPurchase=false\`. This separation prevents fictitious warehouse movements from becoming verified procurement.

The original \`orderWorkflow\` concept BOM remains the authoritative *planned* product structure and financial quotation history. The new \`dev_stock_*\` tables are a separate DEV-only *claimed* physical-flow ledger linked by tenant, order ID, accepted revision, partRef and SKU. ProductionRelease.allowed always false. This is a staged prerequisite to real WMS integration, **not** a replacement for approved production BOM.

## New executable pathways

1. The privileged disposable DEV database seeder inserts original five investor article configurations: LINEA, CAMBIO, NOTTE, TELA and FORMA. Stock counts are fake and inserted only the first time; rerunning bootstrap uses \`ON CONFLICT DO NOTHING\` and **does not replenish stock**.
2. Factory authenticates with server-held httpOnly session, assigned factory membership and required MFA. It reserves the exact current accepted revision against \`dev_stock_skus.on_hand_qty - reserved_qty\` in the same SERIALIZABLE PostgreSQL transaction as the locked order resource and *cryptographically verified existing order journal*. No direct client role may reserve.
3. Factory may issue multiple \`ship_batch\` documents **only** after the independent conceptual quality/packout gates and within remaining unshipped reservation. Per-SKU \`on_hand_qty\` and \`reserved_qty\` are reduced atomically; shipment document and rows are immutable. These are DEMO claims, not carrier acknowledgement.
4. Client (not factory or partner) may issue an independent \`receive_batch\` document exactly once per dispatch batch. Quantities must satisfy \`0 <= damaged <= received <= shipped\`; missing quantities are derived. This does not magically add missing physical inventory, release real payment or alter externally verified delivery status.
5. Partner may document release of the **unused** reservation after the accepted order revision has been withdrawn. Already shipped units are never put back by a plan-only action. Release is recorded by an immutable document.
6. Read DTO exposes plan, reservations, receipt and dispatch documents under the same tenant/order membership and redacts actual purchase price (none is available). The DEV-only UI exposes reserve, partial pick and independent receiving forms only while the server advertises dev-simulation.
7. Idempotent \`requestId\` prevents double receipt/reservation, and duplicate \`batchId\` is explicitly rejected. Concurrent reservers lock stock rows in stable SKU order and run SERIALIZABLE retry on 40001 / 40P01.

## Data model

PostgreSQL migration \`011_dev_sku_reservation_batch_documents_hold.sql\` adds:

- \`dev_stock_skus\`: synthetic SKU fingerprint, group/material concept, onHand and reserved, supplierSKU forced NULL, tenant/factory FK.
- \`dev_stock_reservations\`: order/revision/partRef/SKU, required, reserved and cumulative shipped counts. Unshipped reservation can decrease but dispatched count never decreases.
- \`dev_stock_documents\`: append-only scoped reserve/release/ship_batch/receive_batch with requestHash, actor ID, unique document ID, batch ID and reference, current order version.
- \`dev_stock_document_lines\`: immutable item-level quantities and stated damaged quantities.
- RLS ENABLE+FORCE for all four tables. Restricted application role cannot mint a supplier stock catalog, only read and adjust existing synthetic stock quantities through trusted server transactions.

This is **not** an accounting journal: no COGS valuation, legal shipment note or physical stock verification. The stock data and event payloads are not independently signed by factory/receiver; they are self-reported user records.

## Regression / acceptance

- Node unit: all five BOMs produce stable source-bound synthetic part IDs and forbid fabricated/excess partial picks and damage reports.
- PostgreSQL 17: real migration 011, FORCE RLS, runtime cannot insert a fake SKU.
- Real HTTP with independent client/partner/factory cookies: all five articles through quote, consent, reserve, simulated production/QC/packout, two separate batch dispatches, customer receiving, document immutability, idempotency and role denials.
- Parallel oversell: two orders try to reserve one shared set of SKUs. Only one wins; second rejects with insufficient stock. After customer withdraws the first revision, partner releases remaining unused reservation and second reserve can proceed.
- Existing Node + DOM + Chromium user flows at widths 375, 768 and 1440 and exact-source file inventory must pass on the same SHA.

## Next dependencies before real procurement

Supplier master (tenant/factory/SKU/UOM/approved specification), purchase orders with independent GRN/ISSUE, stock count and lot/barcode traceability, reservation allocation policy, true positive stock receipts and returns, carrier proof, financial and VAT documents, reconciliation to actual manufacturing BOM and user sign-off. Never auto-upgrade DEV stock claims to real procurement evidence.

**Production HOLD. Main unchanged.**
