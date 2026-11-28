#!/usr/bin/env bash
# sql-test.sh — migration 015's record_list_observation() and admin views on
# a throwaway local Postgres 17 (the drill-test pattern): a cluster in a temp
# folder, the stand-in Supabase roles and auth schema, migrations 001–015,
# then sql-test.sql. Touches nothing outside the temp folder.
#
#   scripts/list-ledger/sql-test.sh
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../.." && pwd)"
PG_BIN="${PG_BIN:-/opt/homebrew/opt/postgresql@17/bin}"
[ -x "$PG_BIN/initdb" ] && export PATH="$PG_BIN:$PATH"
for tool in initdb pg_ctl psql createdb; do
  command -v "$tool" >/dev/null || { echo "$tool is not installed" >&2; exit 1; }
done
export LC_ALL="${LC_ALL:-en_US.UTF-8}"
tmp="$(mktemp -d)"
port=54331
cleanup() { pg_ctl -D "$tmp/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$tmp"; }
trap cleanup EXIT
initdb -D "$tmp/data" -U postgres -A trust -E UTF8 --locale=C >/dev/null
pg_ctl -D "$tmp/data" -o "-p $port -k $tmp -c listen_addresses=''" -l "$tmp/pg.log" -w start >/dev/null \
  || { cat "$tmp/pg.log" >&2; exit 1; }
export PGHOST="$tmp" PGPORT="$port" PGUSER=postgres
createdb ledger
run() { psql -X -q -v ON_ERROR_STOP=1 -d ledger "$@"; }
run -f "$root/scripts/db-backup/drill-roles.sql" >/dev/null
run -f "$root/scripts/db-backup/test/fake-supabase-auth.sql" >/dev/null
# Supabase grants every new table and function in public to the API roles by
# default; a plain Postgres doesn't — so the migration's revokes are only
# tested if the defaults are Supabase's
run -c "alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
        alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;" >/dev/null
for m in "$root"/supabase/migrations/0*.sql; do run -f "$m" >/dev/null; done
run -f "$here/sql-test.sql" 2>&1 | sed -n 's/^psql:[^:]*:[0-9]*: NOTICE:  /  /p; /ERROR\|FAILED/p'
echo "sql-test: passed"
