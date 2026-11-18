#!/usr/bin/env bash
# Own disposable PostgreSQL 17 instance only; never select or reuse another container.
set -euo pipefail
repo_dir="$(cd "$(dirname "$0")/.." && pwd)"
cd "$repo_dir"
container='gaber-e2e-isolated-qa'
port="${GABER_TEST_PG_PORT:-55491}"
if ! [[ "$port" =~ ^[0-9]{4,5}$ ]] || (( 10#$port < 1024 || 10#$port > 65535 )); then
 echo 'INVALID_DISPOSABLE_POSTGRES_PORT' >&2; exit 1
fi
if [[ -n "$(git status --porcelain)" ]]; then
 echo 'GABER_E2E_REQUIRES_CLEAN_COMMITTED_SHA' >&2; exit 1
fi
if docker inspect "$container" >/dev/null 2>&1; then
 echo 'ISOLATION_CONTAINER_NAME_OCCUPIED' >&2; exit 1
fi
password_file="$(mktemp "${TMPDIR:-/tmp}/gaber-pg-qa.XXXXXX")"
chmod 600 "$password_file"
secret="$(openssl rand -hex 24)"
printf 'POSTGRES_PASSWORD=%s\n' "$secret" > "$password_file"
created=0
cleanup(){
 if [[ "$created" == '1' ]]; then docker rm -f "$container" >/dev/null 2>&1 || true; fi
 rm -f "$password_file"
}
trap cleanup EXIT
sha="$(git rev-parse HEAD)"
echo "GABER_DISPOSABLE_POSTGRES_BEGIN SHA=$sha PORT=$port"
docker run -d --rm --name "$container" -p "127.0.0.1:$port:5432" \
 --env-file "$password_file" -e POSTGRES_DB=gaber_staging postgres:17 >/dev/null
created=1
ready=0
for ((i=0;i<40;i++));do
 if docker exec -e "PGPASSWORD=$secret" "$container" psql -X -q -t -A -v ON_ERROR_STOP=1 -U postgres -d gaber_staging -c 'SELECT 1' 2>/dev/null | grep -qx 1;then
  ready=1;break
 fi
 sleep 1
done
if [[ "$ready" != '1' ]];then echo 'DISPOSABLE_DATABASE_NOT_READY' >&2;exit 1;fi
for file in server/migrations/0[0-9][0-9]_*.sql;do
 docker exec -e "PGPASSWORD=$secret" -i "$container" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d gaber_staging < "$file"
 echo "GABER_MIGRATION_OK $(basename "$file")"
done
docker exec -e "PGPASSWORD=$secret" -i "$container" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d gaber_staging < server/tests/postgres-staging-v007.sql
docker exec -e "PGPASSWORD=$secret" -i "$container" psql -X -q -v ON_ERROR_STOP=1 -U postgres -d gaber_staging < server/tests/postgres-http-e2e-fixtures.sql
GABER_TEST_PG_PASSWORD="$secret" GABER_TEST_PG_PORT="$port" node server/tests/postgres-http-e2e.mjs
echo "GABER_DISPOSABLE_POSTGRES_GREEN SHA=$sha"
