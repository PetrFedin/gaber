# GABER v0.4.7 — factory-input draft and measured-cost preview

This patch adds src/factoryCosting.js. It does not authorize manufacturing, invoicing or purchases.

The engine maps entered supplier price documents and measured consumption to exact production entity IDs and entered operation minutes to actual routing IDs. A missing rate, unidentified component, expired quote, stale configuration, duplicate item or incorrect operation fails closed. Full coverage means only that all required fields have been entered by the user, NOT that a supplier or factory verified them. Real approved and actual costs remain null, even in an apparently complete input register.

Inputs: configuration, date and revision, supplier quotes with SKU/unit/RUB price/document/revision/effective dates, consumption with exact entity ID/measured quantity/waste/source document, workcenter rates and route-operation minutes.

Outputs: partial entered costs, complete provisional direct cost only if required entries are present and valid, lists of missing material and routing refs, failure reasons, local immutable copies of draft snapshots, and comparative deltas. All productionRelease.allowed are false.

Acceptance: exact-SHA npm ci, npm test, npm run build; browser UI, backup, legacy data, WebGL/SVG; independent factory measurement, correct stock unit conversion, overlap and supplier duplicate controls, authorized approval service. A browser-owned draft is never authoritative. CI runner issue #3 remains unresolved.

Follow-up: implement visible input editor, revision comparison, and server-side approval with authoritative supplier data; do not infer vendor evidence from a reference string.