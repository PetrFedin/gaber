# GABER engineering v0.4.12 — revision cost variance

Base: `0da3ee00acd165b95d88d269fec48f633d71a54e`, PR #2.

## Behavior

Revision comparison now recalculates both input drafts and bridges the change in entered direct costs through material quantity, waste allowance, price, operation time, work-center rate, scope changes and rounding. Materials match by engineering entity ID, so changing a quote ID does not turn a continuing part into an added and removed part. A different SKU or measurement unit is a basis change, not a claimed price effect. Supplier/document/quote-revision changes remain visible even at zero net cost change.

The bridge is sequential, not causal attribution: quantity uses old waste and price; waste uses new quantity and old price; price uses new quantity and waste. Time uses old rate; rate uses new time. The final factor holds the kopeck rounding residual. Integer kopecks reconcile rows and totals. Invalid input or unsafe money ranges expose no factor report. No actual cost, margin or verified saving is inferred.

The history comparison shows the seven factors as a ruled ledger, with reconciliation status, source-change notice and keyboard focus styling. Removed the obsolete UI version suffix from history heading.

## Baseline defect

The preexisting capacity test constructed raw journal records without required `authority: LOCAL_UNVERIFIED`. Strict journal validation correctly rejected the fixture. Fixed that fixture, preserving production validation and append-only semantics.

## Local verification — 23 October 2026

- Dependencies installed with `npm ci --ignore-scripts`; Vite/esbuild subsequently executed successfully. This is not evidence that exact CI `npm ci` ran.
- `npm test`: 123/123 Node tests; 52 server render scenarios; project-storage DOM checks; factory editor configuration isolation; new seven-factor comparison DOM check.
- Seven new Node tests cover combined factors, zero-cost source changes, SKU/unit substitutions, added/removed rows, invalid input, 100 fractional reconciliation cases, and unsafe aggregates.
- `npm run build`: PASS.
- Source reconstructed from exact GitHub blobs in a clean working directory; dependencies were not taken from an older project.

## Outstanding acceptance

GitHub Actions for the final commit must still be checked independently. Browser Chromium/WebGL and physical 375/768/1440 screenshots have not run here (browser binary unavailable). No authenticated server/PostgreSQL integration, factory input validation or production-release approval was added. PR remains Draft; production HOLD remains in force.
