# GABER 0.7 — mechanisms and inspection

Дата фиксации: 2026-11-17.

## Проверяемые идентификаторы

- Локальный release commit: `5a4e106aef73bc803995f143306669959d189f89`
- Архив поставки: `GABER-v0.7.zip`
- SHA-256 архива: `cf9f571ef499b719e0a648d789450ad7f56329f8c864c9556a04475143415f2a`
- Размер архива: 202 998 bytes
- Product Graph: `product-graph/1.3`

## Реализовано

- Корневые `mechanisms` для fold, recliner и bed-storage-lift.
- Эталонные presentation poses 0%, 25%, 50%, 75% и 100%.
- Fixed-step presentation controller с шагом 1/120 секунды и deterministic результатом при разной частоте кадров.
- Отдельная проверка mechanism definitions и связей lift anchors.
- Deterministic procedural normal maps для fabric materials с metadata `calibrated: false`.
- Presentation-режимы «Рентген» и «Сечение» для осмотра слоёв изделия.
- Таблица эталонных поз механизмов в техническом паспорте.
- Документация Product Graph 1.3, архитектуры, визуализации, сборки и roadmap.
- Текстовая SVG-иконка вместо бинарных PNG, чтобы release branch мог быть полностью записан текстовым GitHub API.

## Проверки

- 26 unit-тестов — pass.
- 40 SSR smoke-сценариев — pass.
- Prettier — pass.
- Production build Vite — pass.
- `git diff --check` — pass.
- Browser QA: обычный вид, «Рентген», «Сечение», mechanism reference table, mobile 375×812, viewport и placeholder links — pass.
- Pixel diff подтверждает видимое различие normal/xray/section frames.
- Console: 0 errors; только известные software-renderer warnings `GPU stall due to ReadPixels`.
- ZIP CRC — pass; исключённые пути не найдены; secret scan — 0 findings.

## Границы

Mechanism definitions и fixed-step controller являются presentation reference, а не dynamic physics, CCD, расчётом привода, нагрузки, ресурса или безопасности. «Рентген» и «Сечение» являются визуальными режимами осмотра, а не CAD section и не производственной проверкой внутренней геометрии.

## Ограничение GitHub-переноса

В среде выполнения локальный `git push` не имеет GitHub credentials. Доступный GitHub MCP может записывать текстовые файлы, но не может напрямую принять локальный ZIP или целиком синхронизировать локальную git-историю. Поэтому эта ветка содержит проверяемый release record; полный исходный пакет зафиксирован локальным commit и архивом с указанным SHA-256.
