# GABER v0.4.19 — atomic creation + HTTP order transport (Draft)

## Changes
- `server/orderJournalService.js`: the first order head is created only **after** the local reducer accepts the initial command. This avoids persisting an empty head on a rejected `create` request. The existing tenant/order lock and CAS remain.
- `server/orderHttpApi.js`: lightweight Node HTTP adapter, no new dependencies; server-resolved opaque session token, allowlisted order reads, path-bound order ID, rejection of client-supplied role and actor, version conflict HTTP 409, no success on uncertain DB errors.
- `tests/order-http-api-v0419.test.js`: HTTP transport regression scenarios.

## Proven vs unproven
- During development, a first locally executed HTTP variant passed **7/7 tests** in Node 22, using a test session source, mocked order repository and real loopback HTTP requests. The final source was re-authored and recorded in GitHub after a container reset, so the earlier 7/7 **must not** be treated as an exact-SHA pass. These new tests require independent rerun.
- GitHub Actions previously failed before executing any steps, rather than demonstrating a test/code failure.
- No live PostgreSQL migration, real auth provider, secure TLS deployment, actual bank confirmation, factory execution, or production authorization.
- Parallel development added scoped order reads immediately before this commit. This patch preserves those changes, rather than resetting to an old HEAD.

## Acceptance gates
1. Run `node --test tests/order-http-api-v0419.test.js tests/order-journal-v0418.test.js` and the full `npm ci && npm test && npm run build` on exact SHA.
2. Obtain at least two real independent tenant accounts, six server role identities and a transaction-safe PostgreSQL 17 test instance.
3. Test zero leaked order records, missing/expired sessions, duplicated writes and replay on two devices, concurrent create/modify, rollback and ambiguous COMMIT.
4. Run browser checks at 375/768/1440 for client, factory, brand, partner and owner.
5. Keep `productionRelease.allowed=false`; no real money, order acceptance or physical production sign-off claimed.

**Status: Engineering Draft / PRODUCTION HOLD.**
