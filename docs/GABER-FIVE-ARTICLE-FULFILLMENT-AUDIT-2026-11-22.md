# GABER: five-article fulfillment and evidence continuity
Date: 2026-11-22. Parent candidate: PR #44, exact SHA \`e718529eab45283fc0d75edc044115916c9f7a10\`.

## Purpose

The initial secure five-article matrix proved intake, partner/factory approval and customer consent, while only the generic sofa DEV lifecycle exercised packing, shipment, damage and customer reinspection. This increment extends that **exact protected HTTP + PostgreSQL 17** process to the five original article configurations.

## Repaired defect 1: correction request vs actual available units

The previous \`validateCorrectionProposal\` allowed \`kind:repair\` for a missing item if its requested quantity was at most \`missingQty+damagedQty\`. A part that never arrived cannot be physically repaired in place. Now:

- \`repair\`: quantity is strictly positive and at most **damagedQty**.
- \`replace\` / \`investigate\`: quantity can cover missing and/or damaged units, never beyond their total.
- Neither proposal is automatically an approved repair or actual warehouse movement.

An explicit unit test checks missing-only, damaged-only, mixed, and excessive quantities. The same boundary is checked over authorized Partner HTTP commands in PostgreSQL.

## Repaired defect 2: original claim lost its independent reinspection link

Previously customer \`record_receipt\` made \`s.issue=null\` on a matched follow-up, while the older \`issues[]\` entry could still read \`correction_plan_accepted\`. That left no explicit join between the planned correction and the subsequent customer evidence.

On a reinspection:

- Existing original issue receives \`reinspectionReceiptId\`, \`reinspectionAt\`, \`reinspectionOutcome\`.
- Old issue status advances to \`reinspected_matched_unverified\` or \`reinspected_still_disputed\`.
- Every \`receipt\` is appended to immutable \`receipts[]\` (the journal events remain append-only).
- New discrepancy creates a **new** independent issue and retains historical link of the previous incident.
- The current \`issue\` can become null only after the reinspection reports no discrepancies; this is a **self-reported** match, not external proof.

Role-projected DTOs expose a read-only \`packoutHistory\`, \`receiptHistory\`, \`issueHistory\` without introducing private price or bank access into Factory.

## Repaired defect 3: receipt form can submit impossible damaged counts

React ReceiptForm now caps damaged count by received count. When the operator reduces received quantity below existing damaged quantity, it clamps the damage draft and the native \`max\` input limit to the actual received count. **Server validation still rechecks** \`damagedQty <= receivedQty <= packedQty\`; UI constraints are not authority.

## Five-article PostgreSQL exercise

Using actual \`getInvestorDemoTemplates()\` configurations for LINEA/sofa, CAMBIO/chairbed, NOTTE/bed, TELA/headboard and FORMA/chair:

1. Fresh protected HTTP \`create\` with exact engineering configuration and customer cookie.
2. Partner factory assignment and concept quote; independently verified factory confirmation; client approval.
3. DEV-simulated advance/full payment, production, QC; factory packout from each unique BOM.
4. Assert shipment forbidden before full packout; then simulated shipment and delivery.
5. Assert delivery cannot close before independent client receipt.
6. For alternating articles create one missing or damaged component, cause a client dispute.
7. Reject impossible repair proposals (and explicitly reject repairing a missing component).
8. Partner proposes bounded correction and Client approves the plan, which **does not prove fulfillment**.
9. Assert no closure before second independent customer receipt.
10. After a new receipt, verify history linkage, unverified provenance, final accepted stage and factory cannot see confidential prices.

## Release conditions and limits

- Entire PR candidate must pass Node+DOM+Vite, migrations 001–010, tenant RLS, auth/MFA, actual Chromium (client/partner/factory), PostgreSQL acceptance and responsive screens 375/768/1440 on **one exact SHA**.
- This is not physical inventory, signed acceptance, verified carrier delivery, proven repair, bank verification or factory-approved CAD/BOM. Production authority remains false.
- **Draft / RELEASE HOLD.** No auto-merge or production deployment.
