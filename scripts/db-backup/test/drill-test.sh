#!/usr/bin/env bash
# drill-test.sh — the backup and the restore drill, end to end, on a
# throwaway local Postgres (launch prep 2b). Touches nothing outside a temp
# folder: no production, no Supabase, no running Postgres service.
#
#   scripts/db-backup/test/drill-test.sh
#
#  1. a fresh Postgres 17 cluster in a temp folder (its own port and socket);
#  2. a "source" database: the drill roles, a stand-in for Supabase's auth
#     schema, the repo's migrations 001–014 in order, synthetic rows;
#  3. backup.sh against it with a throwaway age key → one .age file, which
#     must not contain a seeded email address in the clear;
#  4. restore-drill.sh from that file into a second database → must pass;
#  5. every table compared between source and restore, row for row
#     (auth.schema_migrations aside, which the backup leaves out on purpose).
#
# Needs Postgres 17 (initdb, pg_ctl, pg_dump, psql) and age. Set PG_BIN if
# the Postgres binaries aren't at Homebrew's postgresql@17 path or on PATH.

set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../../.." && pwd)"
PG_BIN="${PG_BIN:-/opt/homebrew/opt/postgresql@17/bin}"
[ -x "$PG_BIN/initdb" ] && export PATH="$PG_BIN:$PATH"
for tool in initdb pg_ctl pg_dump psql createdb age age-keygen; do
  command -v "$tool" >/dev/null || { echo "$tool is not installed" >&2; exit 1; }
done

# macOS: a postmaster with no valid LC_ALL stops at startup ("became
# multithreaded during startup")
export LC_ALL="${LC_ALL:-en_US.UTF-8}"
tmp="$(mktemp -d)"
port=54329
cleanup() { pg_ctl -D "$tmp/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$tmp"; }
trap cleanup EXIT

echo "1. A throwaway cluster"
initdb -D "$tmp/data" -U postgres -A trust -E UTF8 --locale=C >/dev/null
pg_ctl -D "$tmp/data" -o "-p $port -k $tmp -c listen_addresses=''" -l "$tmp/pg.log" -w start >/dev/null \
  || { cat "$tmp/pg.log" >&2; exit 1; }
export PGHOST="$tmp" PGPORT="$port" PGUSER=postgres

echo "2. The source database: stand-in auth, migrations 001–014, synthetic rows"
createdb source
run() { psql -X -q -v ON_ERROR_STOP=1 -d source "$@" >/dev/null; }
run -f "$here/../drill-roles.sql"
run -f "$here/fake-supabase-auth.sql"
for m in "$root"/supabase/migrations/0*.sql; do run -f "$m"; done
run -f "$here/seed.sql"

echo "3. backup.sh, with a throwaway key"
age-keygen -o "$tmp/key.txt" 2>/dev/null
recipient="$(age-keygen -y "$tmp/key.txt")"
SUPABASE_DB_URL="postgresql:///source?host=$tmp&port=$port&user=postgres" \
  BACKUP_AGE_RECIPIENT="$recipient" "$here/../backup.sh" "$tmp/out"
archive="$(ls "$tmp"/out/*.tar.gz.age)"
[ "$(ls "$tmp"/out | wc -l | tr -d ' ')" = 1 ] || { echo "FAIL: backup.sh left more than one file" >&2; exit 1; }
if grep -a -q "drill-one@example.test" "$archive" || gzip -dc < "$archive" >/dev/null 2>&1; then
  echo "FAIL: the archive is readable without the key" >&2; exit 1
fi
echo "   opaque without the key: ok"

echo "4. restore-drill.sh into a second database"
"$here/../restore-drill.sh" "$archive" "$tmp/key.txt" drill

echo "5. Source and restore, table by table"
tables="$(psql -X -A -t -d source -c "
  select format('%I.%I', schemaname, tablename) from pg_tables
   where schemaname in ('public', 'auth') and tablename <> 'schema_migrations' order by 1")"
fail=0
for t in $tables; do
  digest="select coalesce(md5(string_agg(r::text, '|' order by r::text)), 'empty') from $t r"
  a="$(psql -X -A -t -d source -c "$digest")"
  b="$(psql -X -A -t -d drill -c "$digest")"
  if [ "$a" = "$b" ]; then printf '   ok   %s\n' "$t"; else printf '   FAIL %s\n' "$t"; fail=1; fi
done
for what in \
  "select count(*) from pg_policies where schemaname = 'public'" \
  "select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'" \
  "select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and not t.tgisinternal" \
  "select count(*) from pg_views where schemaname = 'public'" \
  "select string_agg(grantee || ':' || privilege_type, ',' order by grantee, privilege_type) from information_schema.role_table_grants where table_schema = 'public' and table_name = 'wine_events'"; do
  a="$(psql -X -A -t -d source -c "$what")"; b="$(psql -X -A -t -d drill -c "$what")"
  if [ "$a" = "$b" ]; then printf '   ok   %s\n' "$(echo "$what" | cut -c1-70)…"; else printf '   FAIL %s (%s vs %s)\n' "$what" "$a" "$b"; fail=1; fi
done

if [ "$fail" = 0 ]; then echo "DRILL TEST PASSED"; else echo "DRILL TEST FAILED"; fi
exit "$fail"
