# GABER — CI runner recovery and release verification

> Status (2026-10-31): **BLOCKED BY RUNNER PROVISIONING / UNDIAGNOSED PREFLIGHT**.
> This is a recovery runbook, **not proof** that the application passes any test.
> Protected target: `PetrFedin/gaber`, PR #2, branch
> `feat/production-engineering-v04`; `main` and production MUST NOT be changed.

## Evidence on the exact code revision

- SHA: `cd6e683fb5e3c437abd3453741c3d2a70aa22373`.
- Actions [run #41198113261](https://github.com/PetrFedin/gaber/actions/runs/41198113261)
  - Attempt 1: `failure`, `verify.runner_id=0`, `steps=[]`.
  - Attempt 2, manually rerun with the GitHub API: **also** `failure`,
    `verify.runner_id=0`, `steps=[]`.
  - Attempt 1 billed `UBUNTU.total_ms=0` (run 3 seconds).
  - There are **no executed checkout, npm, test, build or browser steps**.
  - The connector was unable to download job logs. Without the run-summary
    banner or repository/owner-level settings the exact reason is **UNKNOWN**.
- Workflow `.github/workflows/ci.yml` declares `runs-on: ubuntu-latest`,
  which is a supported standard GitHub-hosted runner label for private repos.
  Its source alone does **not** prove that the private account can schedule it.
- Repository is private; the linked GitHub account has repository admin
  permission. The available connector has no reliable operation to inspect or
  change the owner's billing/runner access settings.
- MacBook Desktop Commander is online but the plugin account's remaining
  remote-call quota is 0%; no code was executed on that machine.

## Owner/admin diagnostic path — inspect; do not buy resources

1. Open **[Actions run #41198113261](https://github.com/PetrFedin/gaber/actions/runs/41198113261)**.
   Look for the error banner **above the workflow graph**, and inspect the
   `verify` job summary. Record its **verbatim** text and the screenshot in
   issue [#3](https://github.com/PetrFedin/gaber/issues/3).
2. Open [repository Actions settings](https://github.com/PetrFedin/gaber/settings/actions):
   check whether Actions are enabled, which actions can run, and whether
   GitHub-hosted runners are available to the repository.
   The `ubuntu-latest` label is valid (see official documentation below).
3. Open the account's **Settings → Billing and licensing / Budgets and alerts**
   (names may differ by GitHub account plan). Inspect payment/usage notices,
   Actions minutes quota, spending limits, and billing restrictions.
   **Do not increase any budget or attach a paid payment method without
   separate authorization.** Billing is a possibility, **not a verified cause**.
4. If no actionable warning is visible, use
   [GitHub Actions troubleshooting](https://docs.github.com/en/actions/how-tos/troubleshoot-workflows)
   or [GitHub Support](https://support.github.com/). Include the full run
   URL, job ID `124536009241` for attempt 2, commit and timestamps.
5. Alternative entirely free route: provision a **self-hosted runner**
   on an authorized machine, after choosing, securely installing and registering
   the runner from repository Settings → Actions → Runners. This is a
   **contingency**, not an action performed by this runbook. Do not paste a
   registration token into the repository, issue body or chat. First verify
   OS/Node/npm compatibility. Keep `ubuntu-latest` until an actual runner
   is registered and separately verified.

**Do not** change repository privacy to public to obtain runner minutes.
Do not infer a CI code failure from 0-step failed jobs.
Avoid repeated blind reruns while the preflight/runner condition is unchanged.

## Required same-SHA release-gate evidence

Upon recovery, the existing workflow must execute to completion on the
**same exact SHA**:

1. `actions/checkout@v4`, `actions/setup-node@v4` from `.nvmrc`;
2. `npm ci` from committed `package-lock.json`;
3. `npm run verify:source` (Git blob source manifest);
4. `npm test` — every `tests/*.test.js` including three-role, financial,
   factory-intake HTTP and race tests, and all included jsdom smoke scenarios;
5. `npm run build`;
6. record the workflow URL, exact SHA, runner version, executable steps,
   failures/fixes, actual test counts and build outcome.

**RED means stop**: fix root cause in the same PR, verify manifest, then
repeat the **entire** suite on the **new** SHA. No stale GREEN from a parent SHA.

Once real CI passes: independent code/security review by another reviewer
(with review evidence), followed by a clean-clone `npm ci / test / build`
recovery exercise; **only then** consider merging to `main`.
Afterwards check PostgreSQL 17 migrations 001–006, RLS and independent
server sessions, then real browsers at 375/768/1440 and finance/production
evidence. These are separate, presently **unverified**, gates.

## Official documentation

- [GitHub: troubleshooting workflows](https://docs.github.com/en/actions/how-tos/troubleshoot-workflows)
- [GitHub: GitHub-hosted runner reference](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)
- [GitHub: Actions usage and billing](https://docs.github.com/en/actions/concepts/billing-and-usage)
- [GitHub: rerunning workflow jobs](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/re-run-workflows-and-jobs)
