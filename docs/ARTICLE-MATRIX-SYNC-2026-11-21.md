# Server article matrix and safe cross-role auto-refresh (2026-11-21)

Status: DRAFT PR stacked on verified #42. Real production HOLD.

- Baseline PR #42 verified NOTTE via independent Chromium cookie sessions, HTTP, PostgreSQL 17 and R2 BOM.
- New browser/PostgreSQL matrix executes LINEA / CAMBIO / TELA / FORMA as separate server-authenticated Client → Partner → Factory → Client R1 orders. Checks fresh configurations, approved factory membership, cost privacy, role denials, model-to-factory task linkage, immutability, and external production HOLD. No local simulated payments, shipping or "complete" stage can be imported.
- Server Orders polls role-projected GET /api/v1/orders every 7 seconds while visible, authenticated, idle and not editing. Tab refocus/visibility activation triggers a read. A stable versioned order key preserves unfinished form drafts. A changed revision resets amendment forms. Manual refresh remains available.
- **This is polling, not WebSocket/push.** It does not promise simultaneous updates when tabs are hidden or a form is active. Server version checks still govern writes (409 conflict on outdated changes).
- Do not read a customer's different order or cross-tenant data; every refresh uses the same protected server endpoint and real httpOnly cookie. On logout/session expiry, stale reads must not rehydrate an old user's list.

Still missing: physical warehouse evidence, approved CAD/factory materials, external bank and carrier confirmations, testing on real AR/VR devices.
