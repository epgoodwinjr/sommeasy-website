#!/usr/bin/env bash
# restore-drill.sh — prove a backup restores (launch prep 2b).
#
#   scripts/db-backup/restore-drill.sh BACKUP.tar.gz.age IDENTITY_FILE [DB_NAME]
#
# Decrypts the archive with your age identity (the private key), restores
# it into a FRESH database on a LOCAL Postgres (default name sommeasy_drill;
# it is dropped and recreated), and checks:
#   - every table in the manifest holds exactly the rows the dump held;
#   - no foreign key points at a missing row (the data loads with triggers
#     and foreign-key checks off, as Supabase's own restore guide does, so
#     the drill checks them itself);
#   - the security pieces came back: row-level security on every public
#     table that had it, the policies, and claim_pending_palate as SECURITY
#     DEFINER.
# The database is left in place for a look around; the command to drop it
# is printed at the end.
#
# Connection: the usual libpq variables (PGHOST, PGPORT, PGUSER). It refuses
# any host that isn't this machine, so it can't touch production.
#
# Needs age, psql, createdb and dropdb (Postgres 17 client tools).

set -euo pipefail
umask 077

archive="${1:?usage: restore-drill.sh BACKUP.tar.gz.age IDENTITY_FILE [DB_NAME]}"
identity="${2:?usage: restore-drill.sh BACKUP.tar.gz.age IDENTITY_FILE [DB_NAME]}"
db="${3:-sommeasy_drill}"
here="$(cd "$(dirname "$0")" && pwd)"

case "${PGHOST:-}" in
  ""|localhost|127.0.0.1|::1|/*) ;;
  *) echo "PGHOST=$PGHOST is not this machine. The drill only restores locally." >&2; exit 1 ;;
esac
case "$db" in
  postgres|template0|template1) echo "refusing to drop $db" >&2; exit 1 ;;
esac
for tool in age psql createdb dropdb tar gzip; do
  command -v "$tool" >/dev/null || { echo "$tool is not installed" >&2; exit 1; }
done

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

echo "Decrypting $(basename "$archive")"
age -d -i "$identity" "$archive" | gzip -dc | tar -C "$work" -xf -
dir="$(find "$work" -mindepth 1 -maxdepth 1 -type d -name 'sommeasy-db-*' | head -1)"
[ -n "$dir" ] || { echo "no sommeasy-db-* folder in the archive" >&2; exit 1; }
for f in public-schema.sql auth-schema.sql data.sql manifest.tsv versions.txt; do
  [ -s "$dir/$f" ] || { echo "the archive has no $f" >&2; exit 1; }
done
sed 's/^/  /' "$dir/versions.txt"

echo "Restoring into a fresh local database: $db"
dropdb --if-exists "$db"
createdb "$db"
psql -X -q -v ON_ERROR_STOP=1 -d "$db" -f "$here/drill-roles.sql"
# One transaction: the schema, then the rows with triggers and FK checks off
psql -X -q -v ON_ERROR_STOP=1 --single-transaction -d "$db" \
  -f "$dir/auth-schema.sql" \
  -f "$dir/public-schema.sql" \
  -c 'set session_replication_role = replica' \
  -f "$dir/data.sql" > /dev/null

fail=0
echo "Rows per table"
while IFS=$'\t' read -r table expected; do
  got="$(psql -X -A -t -v ON_ERROR_STOP=1 -d "$db" -c "select count(*) from $table")"
  if [ "$got" = "$expected" ]; then
    printf '  ok   %-40s %s\n' "$table" "$got"
  else
    printf '  FAIL %-40s %s restored, %s dumped\n' "$table" "$got" "$expected"
    fail=1
  fi
done < "$dir/manifest.tsv"

echo "Foreign keys"
orphans="$(psql -X -A -t -v ON_ERROR_STOP=1 -d "$db" 2>&1 <<'SQL'
do $$
declare
  c record;
  n bigint;
  bad text := '';
begin
  for c in
    select con.conname,
           format('%I.%I', ns.nspname, cl.relname) as child,
           format('%I.%I', fns.nspname, fcl.relname) as parent,
           (select string_agg(format('c.%I', a.attname), ',' order by k.ord)
              from unnest(con.conkey) with ordinality k(attnum, ord)
              join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.attnum) as ccols,
           (select string_agg(format('p.%I', a.attname), ',' order by k.ord)
              from unnest(con.confkey) with ordinality k(attnum, ord)
              join pg_attribute a on a.attrelid = con.confrelid and a.attnum = k.attnum) as pcols
      from pg_constraint con
      join pg_class cl on cl.oid = con.conrelid
      join pg_namespace ns on ns.oid = cl.relnamespace
      join pg_class fcl on fcl.oid = con.confrelid
      join pg_namespace fns on fns.oid = fcl.relnamespace
     where con.contype = 'f' and ns.nspname in ('public', 'auth')
  loop
    execute format(
      'select count(*) from %s c where (%s) is not null and not exists (select 1 from %s p where (%s) = (%s))',
      c.child, replace(c.ccols, ',', ') is not null and ('), c.parent, c.pcols, c.ccols
    ) into n;
    if n > 0 then bad := bad || format('%s: %s orphan row(s); ', c.conname, n); end if;
  end loop;
  raise notice '%', coalesce(nullif(bad, ''), 'none');
end
$$;
SQL
)" || true
orphans="$(printf '%s' "$orphans" | sed -n 's/.*NOTICE: *//p')"
if [ "$orphans" = "none" ]; then echo "  ok   no orphaned rows"; else echo "  FAIL $orphans"; fail=1; fi

echo "Security"
check() { # label, query that must return t
  if [ "$(psql -X -A -t -v ON_ERROR_STOP=1 -d "$db" -c "$2")" = "t" ]; then
    echo "  ok   $1"
  else
    echo "  FAIL $1"; fail=1
  fi
}
expected_rls="$(grep -c 'ENABLE ROW LEVEL SECURITY' "$dir/public-schema.sql" || true)"
check "row-level security on all $expected_rls public tables that had it" \
  "select count(*) = $expected_rls from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relrowsecurity"
expected_policies="$(grep -c '^CREATE POLICY' "$dir/public-schema.sql" || true)"
check "all $expected_policies policies" \
  "select count(*) = $expected_policies from pg_policies where schemaname = 'public'"
check "claim_pending_palate is SECURITY DEFINER" \
  "select coalesce(bool_and(prosecdef), false) from pg_proc where proname = 'claim_pending_palate'"
if grep -q "^auth\.users$(printf '\t')" "$dir/manifest.tsv"; then
  echo "  ok   the accounts (auth.users) are in the dump"
else
  echo "  FAIL the dump has no auth.users"; fail=1
fi

echo
if [ "$fail" = 0 ]; then
  echo "DRILL PASSED — $db holds the backup, row for row."
else
  echo "DRILL FAILED — see the FAIL lines above."
fi
echo "Look around:  psql $db      Drop it:  dropdb $db"
exit "$fail"
