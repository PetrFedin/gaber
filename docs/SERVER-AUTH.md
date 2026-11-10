# GABER — серверный вход и сессии (код-часть issue #5)

Ветка `gaber-v04-auth` добавляет к серверным библиотекам v0.4 то, чего им не хватало: настоящие учётные записи, пароли, сессии и точку запуска сервера. **PRODUCTION HOLD сохраняется.** Это не MFA, не проверка личности организаций, не онбординг фабрик и не готовность к реальным заказам.

## Что добавлено

| Часть | Файлы | Суть |
| --- | --- | --- |
| Схема | server/migrations/008_auth_sessions_hold.sql | `gaber_auth.users` и `sessions`; роль БД `gaber_auth_runtime` отдельно от роли заказов |
| Пароли | server/auth/passwords.js | argon2id, выравнивание времени для неизвестной почты |
| Сессии | server/auth/authStore.js | токен 32 байта, в базе только SHA-256; срок, отзыв, блокировка пользователя |
| Principal | server/auth/principal.js | роль, clientId и factoryId берутся из учётной записи, а не из запроса |
| Сервис | server/auth/authService.js | регистрация клиента, вход, выход, ограничитель попыток |
| HTTP | server/auth/authHttp.js, server/httpServer.js | `/api/v1/auth/*`; httpOnly-cookie превращается в Bearer для существующего адаптера заказов |
| Запуск | server/index.js, server/config.js | две отдельные DB-роли (заказы с RLS, вход) |
| Разработка | server/dev/ | PostgreSQL 17 в Docker, роли БД, вымышленные пользователи |

## Модель

- Три роли политики доступа: client, factory, partner. Публичная регистрация создаёт **только клиента**; фабрики и партнёры заводятся вне API (dev-seed или DBA). Поля `role`, `tenantId` в запросах отвергаются.
- Один tenant на процесс (`GABER_TENANT_ID`): партнёр GABER является оператором tenant.
- cookie `gaber_sid`: `HttpOnly`, `SameSite=Lax`, `Secure` в production; токен в теле ответа не возвращается. Изменяющие запросы с чужим `Origin` получают 403.
- Роль БД заказов не имеет доступа к `gaber_auth` (проверено тестом); роль входа не видит журнал заказов.
- **MFA не реализован.** Политика требует MFA для записей партнёра и фабрики, поэтому без него они отклоняются (`MFA_REQUIRED`). Для разработки есть флаг `GABER_DEV_ASSUME_MFA=1`, он запрещён при `NODE_ENV=production`.

## Запуск для разработки

```sh
cp server/dev/dev.env.example server/dev/dev.env   # не коммитится
npm run dev:db      # PostgreSQL 17, контейнер gaber-v04-pg, порт 55482
npm run dev:setup   # миграции 001-008, DB-роли, вымышленные пользователи
npm run server      # http://127.0.0.1:8788
npm run test:auth-e2e
```

Пользователи и пароли разработки лежат только в server/dev/seed-data.js.

## Проверка

- tests/auth-service.test.js: логика сервиса без базы (8 тестов).
- server/tests/auth-http-e2e.mjs: реальный HTTP, журнал заказов и PostgreSQL 17 с RLS: регистрация, вход, cookie, чужой заказ 404, истечение, выход, блокировка, ограничитель, MFA, разделение DB-ролей (41 проверка). В CI запускается в job postgres-staging.

## Что остаётся

- Интерфейс по-прежнему работает на localStorage и не вызывает HTTP: нужен экран входа и клиент API (issue #4/#5).
- Реальный MFA, сброс пароля, подтверждение почты, ограничитель входа не в памяти процесса, `trust proxy`, ротация сессий, аудит входов.
- Онбординг фабрик и партнёров, реестр организаций, независимое ревью и пентест.
