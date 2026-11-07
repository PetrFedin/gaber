# GABER — статус интеграции и доказательств

Срез: 07.11.2026. Репозиторий [PetrFedin/gaber](https://github.com/PetrFedin/gaber) (private), рабочая ветка feat/production-engineering-v04, [PR #2](https://github.com/PetrFedin/gaber/pull/2) — Draft. main остаётся старым прототипом. **PRODUCTION HOLD.**

Содержимое этого документа — датированная фиксация, не автоматический статус. Текущий HEAD и Actions всегда сверять непосредственно в PR.

## Базовый аудит до организационного изменения

- Исходный HEAD: b64faa8d6af02ff3a3b90688e7a5d3aa55fee0fa от 02.11.2026.
- Git tree содержал 181 файл, включая docs/evidence/source-inventory.json с 180 записями.
- Прямая сверка инвентаризации с Git-объектами выявила два несовпадения: docs/verification-v0.4.17.md и tests/preview-layout.test.js. Новый manifest следует формировать только по фактическим blob SHA.
- Ветки feat/gaber-decision-workbench-v050 и feature/visual-materials-production-gates-v0420 являются предками интеграционного HEAD (Git compare: 0 behind). Переносить их повторно не нужно.
- [Actions #41486747038](https://github.com/PetrFedin/gaber/actions/runs/41486747038) на исходном SHA: completed/failure, у jobs verify/postgres-staging/browser-smoke отсутствуют исполненные шаги. Логи verify недоступны: 404 BlobNotFound. Это не доказательство падения тестов кода и не GREEN.

## Подтверждённая ранее точка

[Протокол 01.11.2026](VERIFIED-CANDIDATE-2026-11-01.md) описывает GREEN трёх jobs на **другом** SHA 6c5c966f7859c3a6d54f03f1ee0859a1021b378d. Он не удостоверяет новый HEAD, включая этот организационный коммит.

## Что есть в коде, но нельзя выдавать за запуск

- UI конструктора, проектный BOM и 3D, локальные кабинеты трёх ролей, калькуляция и версии заказов.
- Серверные библиотеки ACL, журнал, HTTP-адаптер, PostgreSQL-репозитории и staging SQL 001–007.
- Сценарии Node, DOM, браузера и одноразовой PostgreSQL в CI.

## Что пока НЕ подтверждено для коммерческой эксплуатации

- Авторизация и отзыв реальных независимых сессий клиента/фабрики/партнёра; завершённый UI → HTTP → постоянная PostgreSQL.
- Реальный PSP settlement/refund, фабричное принятие CAD/BOM/норм и безопасный допуск в производство.
- Независимое код-ревью, восстановление из backup, браузерная и финансовая приёмка последнего SHA.
- GREEN всех CI jobs после данного изменения.

## Критерий смены статуса

Только после exact-SHA npm ci, проверки хешей и структуры, Node/DOM/build, одноразовой PostgreSQL/RLS, Chromium 375/768/1440, отдельного независимого ревью и устранения P0/P1 допустимо обсуждать интеграцию PR в main. Реальная эксплуатация потребует дополнительных G4–G7 по [воротам релиза](RELEASE-REVIEW-GATES.md).

Блокеры: [CI #3](https://github.com/PetrFedin/gaber/issues/3), [PostgreSQL #4](https://github.com/PetrFedin/gaber/issues/4), [серверная авторизация #5](https://github.com/PetrFedin/gaber/issues/5), [браузерная приёмка #6](https://github.com/PetrFedin/gaber/issues/6), [фабричный эталон #7](https://github.com/PetrFedin/gaber/issues/7).
