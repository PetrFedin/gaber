# GABER client experience — visual and interaction increment

Status: **SOURCE CHANGE / FULL CI PENDING / TARGETED BROWSER QA PASSED / PRODUCTION HOLD**.
Canonical integration: PR #2, `feat/production-engineering-v04`.

## Product intent

This pass improves the client-facing presentation and purchase journey without changing engineering, pricing, order, or production-release rules:

- a more readable editorial home page with an asymmetric product stage and a factual capability strip;
- clearer hierarchy, typography, spacing, control states, and touch targets in the configurator;
- six labelled configuration stages with current-step context and `aria-current="step"`;
- a stronger preliminary-price area with an explicit **Проверить и продолжить** action;
- a pre-request checklist in the project summary;
- accessible labels and expanded state for the mobile menu;
- an SVG favicon and updated metadata.

The visual system uses the existing Golos Text / Manrope / Georgia pairing, warm neutral surfaces, deep forest actions, ruled separators, and short interruptible transitions. Reduced-motion rules remain in force. No third-party design code or new runtime dependency was introduced.

## Targeted verification evidence

Verified on 2026-10-31 with local Node.js 20.20.2. The repository still declares its existing Node 24 runtime; this is not a clean Node 24 CI run.

- An isolated Vite visual harness built successfully. It used the real changed `App.jsx`, `main.jsx`, `atelierExperience.css`, metadata, and favicon with stand-ins for unavailable repository modules. This is **not** a full application production build.
- `tests/client-experience-ui.mjs` passed against that harness: home capability content, studio navigation, current-step progress, summary checklist, and mobile-menu state. Local Node 20 compatibility required jsdom 26 in the disposable harness only; repository dependencies were not downgraded.
- Real Chromium checks covered **375×812, 768×1024, 1024×900, and 1440×1000**. Home, studio, and summary states were captured and visually inspected.
- The exercised client path included home → configurator → dimensions → material → summary → save, plus mobile summary scroll and demo-request feedback. Final runs reported no horizontal document overflow, application console errors, page errors, or HTTP 404 responses.
- The first mobile render exposed missing column direction and an intercepted stage-navigation click. Both defects were corrected and the complete matrix was rerun.
- Rendered-color measurements on the home page produced **13.45:1** for body text and **5.49:1** for secondary text against the paper background.
- Mobile primary controls use 44 px minimum targets; internal tool/stage strips may scroll without creating document overflow.

## Evidence boundaries

The visual harness did not contain the complete repository or the real Three.js scene, so it proves the changed application shell and interaction contract only. It does not prove full `npm ci`, source-inventory verification, complete `npm test`, full production build, complete role-based E2E, WebGL acceptance, factory acceptance, or production readiness. Demo storage, demo pricing, and demo requests remain local product demonstrations. **PRODUCTION HOLD** remains unchanged.
