# GABER — карта кода и правила размещения модулей

Версия карты: 07.11.2026. Интеграция ведётся в [PR #2](https://github.com/PetrFedin/gaber/pull/2). На момент базового аудита в этой ветке было 181 отслеживаемый файл; новое число определяется по Git, а не берётся из текста. Важнее функциональное разделение и обратная совместимость, чем искусственно большое количество директорий.

## Фактическая структура (без выдуманных пакетов)

| Путь | Назначение | Контроль |
| --- | --- | --- |
| src/ | React UI, Three.js, геометрия, конструкция, расчёты и локальный демо-журнал | tests/*.test.js, DOM-скрипты |
| server/ | серверные политики, допуск команд, HTTP-адаптер, ролевые DTO, журнал | тесты server/ и tests/ |
| server/auth/, server/httpServer.js, server/index.js, server/dev/ | вход, сессии, точка запуска, dev-база ([SERVER-AUTH](SERVER-AUTH.md)) | tests/auth-service.test.js, server/tests/auth-http-e2e.mjs |
| server/migrations/ | последовательные staging SQL 001–008, не миграции production | scripts/verify-postgres-staging.sh |
| server/tests/ | PostgreSQL/HTTP фикстуры и E2E-контракт | отдельный CI job postgres-staging |
| tests/ | доменные, инженерные, ролевые и визуально-структурные регрессии | npm run test:node и test:ui |
| scripts/ | контроль исходников, структуры, staging, браузера и релиза | npm run verify:repository |
| docs/ | действующие контракты, схемы и датированные доказательства | docs/INDEX.md |
| docs/evidence/ | хеш-инвентаризация и протоколы проверок | npm run verify:source |
| .github/workflows/ | exact-SHA CI с отдельными verify, postgres-staging, browser-smoke | GitHub Actions, не локальная имитация |

Пока исходники src/ и server/ преимущественно плоские. Насильственный перенос всех файлов без проверки импортов, тестов и сборки запрещён: он способен разрушить работающую связность и затруднить анализ истории.

## Функциональные границы внутри существующих каталогов

| Контур | Главные файлы | Источник истины и ограничения |
| --- | --- | --- |
| Каталог и конфигурация | src/domain.js, src/ConfiguratorPanel.jsx, src/DesignExperience.jsx | параметры демо-изделия, не фабричный мастер-SKU |
| 3D и материалы | src/Scene.jsx, src/previewLayout.js, src/visualDetailing.js, src/upholsteryGeometry.js | физически ориентированный эскиз, не сертифицированный CAD |
| Инженерия и BOM | src/engineering.js, src/manufacturing.js, src/traceability.js, src/EngineeringAssembly.js | проектная спецификация, требуется утверждение технолога |
| Деньги и калькуляция | src/costing.js, src/factoryCosting.js, src/partnerEconomics.js, src/orderMoney.js | целые копейки, демонстрационные нормативы, без PSP settlement |
| Клиент и предложение | src/OrderExperience.jsx, src/ClientOfferAssurance.jsx, src/orderWorkflow.js | ревизии, фабричное подтверждение перед публикацией цены |
| Фабрика и партнёр | src/OrderWorkspace.jsx, src/OperationsPage.jsx, src/FactoryDraftWorkspace.jsx | демонстрационное взаимодействие и операторская экономика |
| Серверные ACL/DTO | server/accessPolicy.js, server/orderCommandAdmission.js, server/orderReadModel.js | ровно client/factory/partner, tenant isolation |
| HTTP/журнал/SQL | server/orderHttpApi.js, server/orderJournalService.js, server/postgresOrderRepository.js | библиотечные адаптеры; полноценное развёртывание и auth не подтверждены |
| Локальные данные | src/storage.js, src/orderStorage.js, src/factoryDraftStorage.js | localStorage — не надёжная серверная БД |

## Правила нового кода

1. Не вводить четвёртую аккаунтную роль. Партнёр — оператор GABER, а не сторонний реселлер. Клиент не получает заводскую стоимость/комиссию; фабрика не получает цену клиента/комиссию.
2. Для новой функции определить границу UI → домен → серверные права → хранение → тесты → документация; не вводить скрытую вторую бизнес-логику в UI.
3. Денежные значения хранить целыми копейками, отделять план от подтверждённой оплаты. Нельзя открывать production.start по записи о намерении оплатить.
4. Добавлять соответствующие тесты в tests/; SQL миграции — в server/migrations/ с очередным номером и тестом на одноразовой PostgreSQL.
5. Перемещение исходника — отдельная проверяемая механическая операция: обновить все импорты, фикстуры и относительные пути, выполнить npm run verify:repository, npm test, npm run build и браузерные проверки на одном SHA.
6. Исторические протоколы не переписывать задним числом; новые результаты привязывать к конкретному Git SHA. Старые документы маркировать архивными, не использовать как контракты.

## Целевая модульная структура — план, НЕ реализованная миграция

После восстановления стабильного CI допустимо последовательное разделение src/ на app/, features/configurator/, features/visualization/, features/engineering/, features/pricing/, features/orders/ и shared/; server/ на auth/, orders/ и persistence/. У каждого переносимого модуля должны остаться рабочие публичные импорты или предусмотренная миграция потребителей. Не создавать пустые папки ради внешнего вида.

## Повторяемая проверка

Из чистого checkout точного SHA: npm ci → npm run verify:repository → npm test → npm run build. На каждый новый SHA необходимы результаты реального CI, PostgreSQL и браузера. [Точный актуальный статус](STATUS.md) отличает архивный PASS от проверки нового коммита.
