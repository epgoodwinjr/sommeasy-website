#!/usr/bin/env bash
# backup.sh — dump Sommeasy's database and encrypt it (launch prep 2b).
#
#   SUPABASE_DB_URL=postgresql://… BACKUP_AGE_RECIPIENT=age1… scripts/db-backup/backup.sh OUT_DIR
#
# Writes ONE file to OUT_DIR: sommeasy-db-<UTC stamp>.tar.gz.age, an age
# archive of:
#   public-schema.sql  tables, functions, views, triggers, RLS policies, grants
#   auth-schema.sql    Supabase's auth tables — for a LOCAL drill only; a new
#                      Supabase project brings its own (see README)
#   data.sql           every row of public and auth (COPY), but
#                      auth.schema_migrations (a new project has its own)
#   manifest.tsv       rows per table, counted from data.sql itself, so the
#                      drill can prove a restore put back exactly what was dumped
#   versions.txt       pg_dump's and the server's versions
#
# Nothing readable leaves this script: the plaintext lives in a private temp
# directory that is removed on exit, and the archive is checked to BE an age
# file before the script says it's done. It prints no counts: the workflow's
# log is public (the repository is), and the counts are business data.
#
# Needs pg_dump/psql at least as new as the server (17) and age.

set -euo pipefail
umask 077

out="${1:?usage: backup.sh OUT_DIR}"
: "${SUPABASE_DB_URL:?SUPABASE_DB_URL is not set}"
: "${BACKUP_AGE_RECIPIENT:?BACKUP_AGE_RECIPIENT is not set}"

# One or more age public keys, separated by spaces, commas or newlines
recipients=()
for key in $(printf '%s' "$BACKUP_AGE_RECIPIENT" | tr ',\n' '  '); do
  case "$key" in
    age1*) recipients+=(-r "$key") ;;
    *) echo "BACKUP_AGE_RECIPIENT holds something that isn't an age public key (age1…)" >&2; exit 1 ;;
  esac
done
[ "${#recipients[@]}" -gt 0 ] || { echo "BACKUP_AGE_RECIPIENT is empty" >&2; exit 1; }

for tool in pg_dump psql age tar gzip; do
  command -v "$tool" >/dev/null || { echo "$tool is not installed" >&2; exit 1; }
done

stamp="$(date -u +%Y-%m-%dT%H%MZ)"
name="sommeasy-db-$stamp"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
dir="$work/$name"
mkdir "$dir"
mkdir -p "$out"

dump=(pg_dump --dbname="$SUPABASE_DB_URL" --no-password --quote-all-identifiers)

"${dump[@]}" --schema-only --schema=public --no-owner --file="$dir/public-schema.sql"
"${dump[@]}" --schema-only --schema=auth --no-owner --no-privileges --file="$dir/auth-schema.sql"
# pg_dump writes CREATE SCHEMA for a schema it was asked for by name, and
# every database it would go back into (a new Supabase project, a drill
# database) already has public: make both statements safe to replay
for f in "$dir/public-schema.sql" "$dir/auth-schema.sql"; do
  sed -i.orig -E 's/^CREATE SCHEMA ("public"|"auth");$/CREATE SCHEMA IF NOT EXISTS \1;/' "$f"
  rm -f "$f.orig"
done
# ONE pg_dump for all the data: one snapshot, so the rows agree with each other
"${dump[@]}" --data-only --schema=public --schema=auth \
  --exclude-table-data='auth.schema_migrations' --file="$dir/data.sql"

# Rows per table, from the dump itself. In COPY's text format every row is
# one line (a newline inside a value is written \n), ended by a "\." line
awk '
  /^COPY / { table = $2; n = 0; inside = 1; next }
  inside && /^\\\.$/ { print table "\t" n; inside = 0; next }
  inside { n++ }
' "$dir/data.sql" | tr -d '"' | sort > "$dir/manifest.tsv"
[ -s "$dir/manifest.tsv" ] || { echo "the data dump holds no tables" >&2; exit 1; }

{
  echo "dumped_at	$stamp"
  echo "pg_dump	$(pg_dump --version)"
  echo "server	$(psql "$SUPABASE_DB_URL" -X -A -t -v ON_ERROR_STOP=1 -c 'show server_version')"
} > "$dir/versions.txt"

archive="$out/$name.tar.gz.age"
tar -C "$work" -cf - "$name" | gzip -9 | age "${recipients[@]}" -o "$archive"

# The one check that matters before anything is uploaded: it is an age file
header="$(head -c 21 "$archive")"
if [ "$header" != "age-encryption.org/v1" ]; then
  rm -f "$archive"
  echo "the archive is not age-encrypted; nothing written" >&2
  exit 1
fi

echo "wrote $(basename "$archive")"
