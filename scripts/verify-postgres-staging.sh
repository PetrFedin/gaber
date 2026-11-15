#!/usr/bin/env bash
# Real PostgreSQL 17 contract check in a disposable GitHub-hosted service.
# No production data, paid databases, migrations against external systems,
# payment credentials or factory claims are involved.
set -euo pipefail
: "${GABER_TEST_PG_PASSWORD:?Test-only password must be configured}"
# GABER_PG_CONTAINER позволяет указать контейнер явно (локальный шлюз на Mac); иначе берётся первый postgres:17.
container_id="${GABER_PG_CONTAINER:-$(docker ps --filter 'ancestor=postgres:17' --format '{{.ID}}' | head -n 1)}"
if [ -z "$container_id" ]; then
  echo 'POSTGRES_17_SERVICE_NOT_FOUND' >&2
  exit 1
fi
echo "GABER_POSTGRES_STAGING_BEGIN source_sha=$(git rev-parse HEAD)"
for file in server/migrations/0[0-9][0-9]_*.sql; do
  [ -f "$file" ] || { echo 'POSTGRES_STAGING_NO_MIGRATIONS' >&2; exit 1; }
  echo "Applying staging migration: $file"
  docker exec -e "PGPASSWORD=$GABER_TEST_PG_PASSWORD" -i "$container_id" \
    psql -X -v ON_ERROR_STOP=1 -U postgres -d gaber_staging < "$file"
done
echo 'Checking staging tenant RLS, immutable factory and journal evidence'
docker exec -e "PGPASSWORD=$GABER_TEST_PG_PASSWORD" -i "$container_id" \
  psql -X -v ON_ERROR_STOP=1 -U postgres -d gaber_staging < server/tests/postgres-staging-v007.sql
echo "GABER_POSTGRES_STAGING_GREEN source_sha=$(git rev-parse HEAD)"
echo 'NOTICE: PostgreSQL schema/RLS contract only; server authentication, real browser, payment and production remain HOLD.'
