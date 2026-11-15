# GABER: backup, import and explicit recovery

Base commit: `3cf5297d52571364e6960cbdda45a6973fb59317`. PR #2, `feat/production-engineering-v04`.

## Delivered behavior

The **Мои проекты** page includes a backup/recovery panel with named file input, inline status messages, preview counts, explicit Apply and Cancel controls.

- **Скачать все проекты** creates a `gaber-projects-backup/1` JSON envelope containing the exact localStorage string in `raw`. Invalid JSON and duplicate entries are preserved without filtering. A download being initiated is not confirmation that the user saved the file.
- **Импорт JSON** accepts that backup format or a raw project array, up to 10 MiB. It validates and normalizes every incoming record before presenting the result. Unknown formats, broken JSON, rejected records, duplicate incoming IDs, IDs already in the current list, empty imports and results exceeding 100 projects are refused. Import adds records without replacing existing IDs.
- **Проверить восстановление** previews the healthy records retained and the number of invalid/duplicate records removed from the working list. For completely unreadable JSON the preview explicitly states that the repaired working list will be empty. The original string is preserved separately.
- Applying either operation first stores and reads back a unique backup of the current raw string, registers it for download and checks the observed working snapshot again. If backup registration, quota, access or stale-state checks fail, the working list is not replaced. If the final list write fails, its backup remains available. Older unique backups are not overwritten.
- **Скачать копию до восстановления** downloads the backup preceding the latest applied/attempted operation. On a failed final write the pointer can refer to that attempt's backup; it still contains the pre-operation string.
- Preview plans are bound to their observed project list. Mutable UI counters cannot alter the private validated proposal. Reusing a consumed plan, changing the raw list in another tab or refreshing the parent project state invalidates the operation/preview.
- The UI guards late asynchronous file reads with a request counter. A superseded read cannot replace a newer proposal. File selection and validation do not write storage.

## Financial and engineering boundaries

Valid saved estimate snapshots retain their rows, rates, costs and source strings through export/import. Missing/malformed snapshots retain the existing explicit `estimateRecovered` warning and use current **demonstration default rates**; historical missing rates cannot be reconstructed.

Imported statuses and quotes remain local demo metadata, not server permissions. Manufacturing packages are rebuilt from the validated configuration with the existing stable scene/part links and `productionRelease.allowed=false`. There is no factory submission or authentication added here.

## Validation

Reproducible project checks: `npm ci --ignore-scripts --no-audit --no-fund`, `npm test`, `npm run build`.

- **57 Node test cases**: existing engineering/math/scene/storage suite plus 10 recovery cases. Recovery tests include exact raw backup round-trip, actual manufacturing package equality after import, cost-source retention, repair preview/removal counts, corrupted-root reset, stale previews, failed backup/pointer/main writes, silent backup failures, injected changes during backup, invalid/oversized/colliding imports, capacity limits, preview tampering, inaccessible storage and retained earlier backups.
- **52 SSR scenarios**, including actual projects/factory App rendering from invalid and legacy data. The projects route asserts the recovery panel and accessible file input are present.
- **DOM interaction acceptance**, run by `tests/project-storage-ui.mjs` using jsdom: export; repair preview, cancel and apply; pre-recovery backup download; file import and application; duplicate/JSON/size refusals; stale-write refusal; preview invalidation; superseded asynchronous file read.
- Vite production build. jsdom is a development-only dependency; no browser binary is included in the application bundle.

## Remaining limits

DOM emulation and SSR do **not** establish browser/WebGL rendering, download completion, focus behavior, mobile layout or physical furniture correctness. These remain unverified; the predecessor Chromium installation failed because its download was not a valid ZIP.

The localStorage snapshot comparison is best effort, not an atomic transaction between simultaneous tabs. There is no server recovery journal or multi-user concurrency control. Backups share browser quota with the working list; insufficient space blocks recovery. Backups cannot survive browser storage clearing unless downloaded, and no backup pruning UI is included.

The predecessor GitHub CI run `39297787422` failed with no assigned runner/executed steps. Inspect exact-commit CI for this follow-up independently; local passing checks cannot establish remote CI success. Keep PR Draft and production release blocked until CI/browser and supplier-backed engineering acceptance are complete.
