#!/usr/bin/env bash
# Локальный шлюз проверки на Mac вместо GitHub Actions (платные минуты недоступны).
# Повторяет три job'а CI: структура и тесты и сборка, PostgreSQL 17 (RLS, HTTP E2E, вход, MFA, заказы),
# реальный Chromium. Результат привязан к точному SHA и пишется в .local-verification/<sha>.json.
# Это локальное доказательство, а не независимое ревью и не допуск в production.
#
#   scripts/verify-local.sh            полный шлюз (нужны Docker и playwright с Chromium)
#   scripts/verify-local.sh --quick    без Docker и браузера: структура, Node-тесты, UI-тесты, сборка
#   scripts/verify-local.sh --allow-skip  пропущенные шаги не считаются отказом (для машины без Docker)
set -uo pipefail
cd "$(dirname "$0")/.."
MODE=full; ALLOW_SKIP=0
for a in "$@"; do case "$a" in --quick) MODE=quick;; --allow-skip) ALLOW_SKIP=1;; *) echo "Неизвестный флаг: $a" >&2; exit 2;; esac; done

SHA="$(git rev-parse HEAD)"
DIRTY="$(git status --porcelain | grep -c . || true)"
OUT=".local-verification"; mkdir -p "$OUT/logs"
RESULTS=()
FAILED=0; SKIPPED=0
PORT="${GABER_GATE_PG_PORT:-55490}"
NAME="gaber-gate-pg-$$"
PGPASS="gate-$(LC_ALL=C tr -dc 'a-z0-9' </dev/urandom | head -c 16)"

step() { # step <id> <описание> <команда...>
  local id="$1" label="$2"; shift 2
  local log="$OUT/logs/$id.log" t0=$(date +%s)
  printf '→ %-28s' "$label"
  if "$@" >"$log" 2>&1; then
    printf 'OK (%ss)\n' "$(( $(date +%s) - t0 ))"; RESULTS+=("{\"id\":\"$id\",\"status\":\"pass\",\"seconds\":$(( $(date +%s) - t0 ))}")
  else
    printf 'FAIL (см. %s)\n' "$log"; tail -n 8 "$log" | sed 's/^/    /'; RESULTS+=("{\"id\":\"$id\",\"status\":\"fail\",\"log\":\"$log\"}"); FAILED=$((FAILED+1))
  fi
}
skip() { printf '→ %-28sПРОПУЩЕНО (%s)\n' "$2" "$3"; RESULTS+=("{\"id\":\"$1\",\"status\":\"skipped\",\"reason\":\"$3\"}"); SKIPPED=$((SKIPPED+1)); }
cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "GABER local gate · $MODE · $SHA$([ "$DIRTY" -gt 0 ] && echo " (+$DIRTY незакоммиченных файлов: результат НЕ относится к чистому SHA)")"
step repository   "структура и инвентаризация" npm run --silent verify:repository
step node-tests   "Node-тесты"                 npm run --silent test:node
step ui-tests     "UI-тесты (jsdom)"           npm run --silent test:ui
step build        "сборка Vite"                npm run --silent build

if [ "$MODE" = quick ]; then
  skip postgres "PostgreSQL 17 + E2E" "режим --quick"; skip browser "Chromium" "режим --quick"
else
  if ! docker info >/dev/null 2>&1; then
    skip postgres "PostgreSQL 17 + E2E" "Docker не запущен"
  else
    docker run -d --rm --name "$NAME" -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD="$PGPASS" -e POSTGRES_DB=gaber_staging \
      -p "127.0.0.1:$PORT:5432" postgres:17 >/dev/null 2>&1
    # Образ postgres сначала поднимает временный сервер только на сокете, потом перезапускается: ждём TCP,
    # он открывается лишь у итогового сервера.
    for _ in $(seq 1 60); do docker exec "$NAME" pg_isready -h 127.0.0.1 -U postgres -d gaber_staging >/dev/null 2>&1 && break; sleep 1; done
    sleep 1
    psqlf() { docker exec -e PGPASSWORD="$PGPASS" -i "$NAME" psql -X -v ON_ERROR_STOP=1 -U postgres -d gaber_staging; }
    step pg-migrations "миграции 001–009 и контракт RLS" env GABER_PG_CONTAINER="$NAME" GABER_TEST_PG_PASSWORD="$PGPASS" bash scripts/verify-postgres-staging.sh
    fixtures() { psqlf < server/tests/postgres-http-e2e-fixtures.sql; }
    step pg-fixtures   "фикстуры HTTP E2E"       fixtures
    step http-e2e      "HTTP → PostgreSQL, 3 роли" env GABER_TEST_PG_PASSWORD="$PGPASS" GABER_TEST_PG_PORT="$PORT" node server/tests/postgres-http-e2e.mjs
    export GABER_DEV_SKIP_MIGRATIONS=1 GABER_DEV_DB_ORDERS_PASSWORD="o-$PGPASS" GABER_DEV_DB_AUTH_PASSWORD="a-$PGPASS" GABER_TENANT_ID=TENANT-DEV
    export GABER_DEV_ADMIN_DATABASE_URL="postgres://postgres:$PGPASS@127.0.0.1:$PORT/gaber_staging"
    export GABER_ORDERS_DATABASE_URL="postgres://gaber_app_orders:o-$PGPASS@127.0.0.1:$PORT/gaber_staging"
    export GABER_AUTH_DATABASE_URL="postgres://gaber_app_auth:a-$PGPASS@127.0.0.1:$PORT/gaber_staging"
    export GABER_AUTH_ENC_KEY="$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")"
    step auth-setup    "роли БД и вымышленные пользователи" node server/dev/setup.mjs
    for t in auth-http-e2e order-lifecycle-e2e order-simulated-lifecycle-e2e mfa-e2e; do
      step "$t" "E2E $t" node "server/tests/$t.mjs"
    done
  fi
  if node -e "require.resolve('playwright')" >/dev/null 2>&1; then
    step browser "реальный Chromium (3 роли)" node scripts/browser-smoke.mjs
  else
    skip browser "реальный Chromium" "playwright не установлен: npm i --no-save playwright && npx playwright install chromium"
  fi
fi

printf '{"sha":"%s","dirtyFiles":%s,"mode":"%s","finishedAt":"%s","node":"%s","steps":[%s]}\n' \
  "$SHA" "$DIRTY" "$MODE" "$(date -u +%FT%TZ)" "$(node -v)" "$(IFS=,; echo "${RESULTS[*]}")" > "$OUT/$SHA.json"
echo "Итог: отказов $FAILED, пропусков $SKIPPED. Запись: $OUT/$SHA.json"
[ "$FAILED" -gt 0 ] && exit 1
[ "$SKIPPED" -gt 0 ] && [ "$ALLOW_SKIP" -eq 0 ] && { echo "Есть пропущенные шаги: полный шлюз не пройден (--allow-skip, чтобы принять)."; exit 3; }
[ "$DIRTY" -gt 0 ] && { echo "Рабочее дерево не чистое: результат не относится к SHA."; exit 4; }
echo "GATE PASSED для $SHA"
