# Database backup

Supabase's free plan keeps no backups, so we make our own. The job lives in
a **private** repository, **[epgoodwinjr/sommeasy-backups](https://github.com/epgoodwinjr/sommeasy-backups)**:

- **When:** every Monday at 07:17 UTC, and whenever you run it by hand.
- **What:** its workflow dumps the `public` and `auth` schemas, so accounts
  restore too.
- **How it's protected:** the dump is encrypted with an **age** public key
  whose private half only you hold.
- **What's kept:** one encrypted file per run, as a workflow artifact for
  **90 days**.

The Privacy Policy promises those 90 days (`BACKUP_RETENTION_DAYS` in
`src/lib/legalCopy.js`). Change both together.

Why a separate repository: this one is public, and anyone signed in to
GitHub can download a public repository's workflow artifacts. Nothing in
this repository backs anything up.

| Where | File | What it does |
|---|---|---|
| sommeasy-backups | `.github/workflows/db-backup.yml` | The schedule; installs pg_dump 17 and age; uploads the one encrypted file. Actions pinned to commit SHAs. |
| sommeasy-backups | `backup.sh` | Dumps and encrypts. Prints no rows or counts. Fails rather than finish if its file isn't an age file. |
| here | `restore-drill.sh` | Decrypts a backup, restores it into a **local** Postgres, and proves it. |
| here | `drill-roles.sql` | The Supabase roles a plain Postgres lacks (drill only). |
| here | `test/drill-test.sh` | The two repositories' scripts end to end on a throwaway local cluster. Touches nothing else. |

## One-time setup

### 1. Make the key pair (on your Mac)

```bash
brew install age
```

```bash
age-keygen -o ~/sommeasy-backup-key.txt
```

It prints `Public key: age1…`. That line is the **recipient**. The file is
the **identity**, the private key. Keep it somewhere you'd still have if this
laptop died: your password manager (as a secure note), plus one offline
copy. Without it no backup can be read, by anyone, ever. Then delete the
file from your home folder.

To give a second key (a spare, or someone you trust) the same access,
separate the public keys with commas in the secret below.

### 2. Find the connection string GitHub can reach

The direct host `db.zugunlctgpytgyxftllv.supabase.co` has only an IPv6
address (checked Nov 22, 2026: an AAAA record, no A record), and
GitHub-hosted runners have no IPv6. Use Supavisor's **session pooler**, which
is IPv4 and supports `pg_dump`. Don't use the transaction pooler (port 6543).

Supabase → the project → **Connect** → **Session pooler**. It looks like

```
postgresql://postgres.zugunlctgpytgyxftllv:[YOUR-PASSWORD]@aws-0-us-west-1.pooler.supabase.com:5432/postgres
```

The host may read `aws-1-…`. Copy whatever the dashboard shows. Both
us-west-1 pooler hosts resolve to IPv4. Put in the **database password**
(Project Settings → Database; reset it there if you don't have it). Append
`?sslmode=require`.

### 3. Add two secrets to the PRIVATE repository

Put them on **sommeasy-backups**, not this repository: GitHub →
epgoodwinjr/sommeasy-backups → Settings → Secrets and variables → Actions →
**New repository secret**.

| Name | Value |
|---|---|
| `SUPABASE_DB_URL` | the session pooler string from step 2, with the password and `?sslmode=require` |
| `BACKUP_AGE_RECIPIENT` | the `age1…` public key from step 1 (not secret, but kept beside the other) |

### 4. Run it once by hand

In **sommeasy-backups**: Actions → **Database backup** → **Run workflow**
(branch `main`). A green
run ends with one artifact, `sommeasy-db-<date>-run<n>`. Then run the
drill on it (below). That first drill is the real test of the real schema:
`test/drill-test.sh` uses a small stand-in for Supabase's auth tables.

A private repository on the free plan has 2,000 Actions minutes a month
(a run takes about two) and 500 MB of artifact storage; thirteen weekly
backups of today's database are a small fraction of that.

## The restore drill

Do this after the first run, and then every few months.

1. Download the artifact (sommeasy-backups → Actions → the run →
   Artifacts). GitHub zips it, so
   unzip it to get `sommeasy-db-….tar.gz.age`.
2. Have a local Postgres 17 running, for example `brew install
   postgresql@17 && brew services start postgresql@17`.
3. Run:

   ```bash
   scripts/db-backup/restore-drill.sh ~/Downloads/sommeasy-db-2026-11-23T0717Z.tar.gz.age ~/path/to/sommeasy-backup-key.txt
   ```

It restores into a fresh local database, `sommeasy_drill`, and checks it:

- every table holds exactly the rows the dump held;
- no foreign key points at a missing row;
- row-level security is on for every public table that had it;
- every policy came back;
- `claim_pending_palate` is still SECURITY DEFINER;
- the accounts are there.

It ends `DRILL PASSED` or `DRILL FAILED`. It refuses any `PGHOST` that isn't
this machine. Drop the database afterwards with `dropdb sommeasy_drill`: it
holds real accounts.

To check the scripts themselves without any backup, clone the private
repository next to this one, then run the test:

```bash
git clone git@github.com:epgoodwinjr/sommeasy-backups.git ../sommeasy-backups
```

```bash
scripts/db-backup/test/drill-test.sh
```

It builds a source database from `supabase/migrations/`, backs it up with
`../sommeasy-backups/backup.sh` (or `BACKUP_SH`), drills it, and compares
every table, policy, function, trigger, view and grant.

## A real restore (the database is gone)

1. Create a new Supabase project (Postgres 17), or restore into the old one
   if it can be brought back empty.
2. Decrypt and unpack:

   ```bash
   age -d -i key.txt backup.tar.gz.age | tar -xzf -
   ```

3. Restore with the new project's **session pooler** string:

   ```bash
   psql "$NEW_DB_URL" -v ON_ERROR_STOP=1 --single-transaction -f public-schema.sql -c 'set session_replication_role = replica' -f data.sql
   ```

   Don't apply `auth-schema.sql`: a Supabase project brings its own auth
   tables, and `data.sql` fills them. Two things can go wrong here:

   - If the auth rows fail because Supabase's auth schema has moved on
     since the backup, restore `public` first, then `auth.users` and
     `auth.identities` with matching columns.
   - Restored users keep their passwords (the hashes are in `auth.users`),
     their Google links (`auth.identities`) and their ids, so every row in
     `public` still belongs to its owner.
4. Point the app at the new project: the `NEXT_PUBLIC_SUPABASE_*` and
   `SUPABASE_SERVICE_ROLE_KEY` variables in Vercel. Then set up auth again
   in the dashboard:
   - URL configuration and redirect URLs;
   - email templates (`docs/email-templates/`);
   - custom SMTP;
   - the Google provider.

   The launch-prep readout has the click-lists. Then redeploy.
