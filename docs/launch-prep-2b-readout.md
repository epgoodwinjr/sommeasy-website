# Launch prep, Session 2b — readout (Nov 22, 2026)

Branch `launch-prep-2`, cut from main after #38 (launch prep S1) and #39
(producer initials). Five items, one commit each, plus the docs.

---

## 1. The first signed-in load: ~18s → ~2s (launch blocker)

### What was slow

Home's loading view waits on `restorePendingPalate`, and that waits on
`saveQuizProfile`. The signed-in reveal waits on the same save. Inside it:

- `syncQuizSelections` read and then wrote each quiz item in turn: two
  sequential requests per item.
- `reconcileQuizPromotions` wrote each stale row in turn.
- The merge, the reconcile and the sync each read `dna_accumulation` on
  their own, and two of those reads came after the profile write.

### The fix

- **`syncQuizSelections`**: one read, then at most two bulk upserts sent
  together on the `(user_id, dimension, dimension_value)` unique key:
  - **Rows that exist**: `ON CONFLICT DO UPDATE` sets only the quiz columns
    (source, promoted, promoted_at, display_name, mappable). The upsert
    never names `points` or `interaction_count`, so they're untouched.
  - **Rows that don't**: created at zero with `ignoreDuplicates`. The old
    loop's insert failed alone on a conflict; this keeps that behavior if a
    rating lands in between.
  - **Earned rows** (promoted, source `auto`) are skipped as before, so the
    ✦ survives.
  - **An item listed twice** (an estate filed under two regions) is one row.
- **`reconcileQuizPromotions`**: one read, then one
  `update … .in("id", stale)`.
- **`saveQuizProfile`**:
  - **One** accumulation read goes out beside the milestone reads and serves
    the merge, the reconcile and the sync. If it fails, each step reads for
    itself, as before.
  - After the profile write, the reconcile and sync writes go out beside the
    restore's claim. They touch disjoint rows: reconcile only rows outside
    `merged`, sync only rows inside `quizRaw` ⊆ `merged`.
  - Failures are now thrown and logged per step. The old loop dropped write
    errors silently. The save has landed either way.
- **Session 1's exactly-once claim is untouched.** It still runs only after
  the profile write lands. `pendingPalateRestore.test.js` still passes 14 of
  14, including a page dying at every network call.

The save's critical path went from 3 + 2·(quiz items) round trips to **3**:
(accumulation read ∥ milestone reads) → profile write → (claim ∥
accumulation writes).

### Measured

`e2e/quiz-save-speed.spec.ts`, rich test account, a 45-item quiz waiting
on the account (both carriers). Every Supabase request is held so that
it totals ~150 ms: the spec measures this machine's own latency and adds
the rest. Each run below is timed from home's profile read to the palate
on screen.

| | Requests | On `dna_accumulation` | Time |
|---|---|---|---|
| Before (main's two files) | 98 | 91 | **17.9 s** (own RTT 231 ms) |
| After | 18 | 4 | **1.9 s** (own RTT ~150 ms) |
| After | 20 | 4 | **2.2 s** (own RTT 259 ms) |

About seven of the "after" requests are home's own reads once the palate
lands (timeline, events, journal, doubled by dev StrictMode). They're in the
window because the crest waits for them.

### Guards

- **`e2e/quiz-save-speed.spec.ts`** (permanent, hard-fail). It caps
  `dna_accumulation` requests at **6** whatever the quiz size, caps the
  whole window at 24 requests, and requires the palate within 2.5 s.
  - It also checks there's exactly one restore event, every quiz item is in
    the DNA, and the earned Chenin Blanc stays `auto`.
  - On the old code it fails with "Received 91".
  - `afterEach` puts the profile row and every accumulation row back
    exactly, and deletes the rows the fold-in added. Verified: the account
    has its 8-item palate and 11 rows, and no carrier.
- **`src/lib/__tests__/quizSave.test.js`** (15 tests). The oracle is the
  old loop, copied verbatim from 7848671. It runs against a scripted
  Postgres that keeps the unique key, the column defaults and `ON
  CONFLICT`'s refusal to touch one row twice in a statement.
  - **Equivalence:** the batched functions leave `dna_accumulation` exactly
    as the loop did, row for row and column for column, over **400 seeded
    states**. That covers both entry points: reading for themselves, and
    handed the save's pre-read rows.
  - **The merge:** the same result from its query or from the save's own
    read (120 states).
  - **Request counts:** the sync makes one read and at most two writes, the
    reconcile one read and one write, and the whole save at most eight
    requests with one accumulation read. Each holds for four items or
    forty-four.
  - **Critical path:** three round trips at 40 ms a request, measured with
    a gate that costs a round trip, as the claim does.
  - **Failures:** each is said and never undoes the save.
  - **Source scans:** neither function awaits in a loop; the save shares
    one read and sends the writes beside the claim.
  - **Mutation check:** 13 mutants, 12 caught. The 13th, "the FIRST listing
    of a twin estate names the row", is **equivalent on today's data**:
    every estate filed under two regions carries one name in both, and an
    id repeated inside one region always resolves to its first entry. The
    batch keeps the loop's last-listing rule anyway.
- `dnaEvolution.test.js`'s CJS mirror of the two functions still has the
  loop's shape. Its semantics are identical, and `quizSave.test.js` holds
  the real module to them.

---

## 2. Self-hosted fonts

- **`src/app/fonts.js`** loads Playfair Display and Source Sans 3 through
  `next/font/google`, which is built into Next 14, so there's no new
  dependency.
  - They're downloaded at build time and served from `/_next/static/media`.
  - Playfair includes its italic axis.
  - Both are variable fonts, each one file per style, covering the old
    weights (400–700 Playfair, 300–700 Source Sans).
  - `display: swap`, as before.
- **The family names change.** `next/font` hashes every family name it
  emits (`'__Playfair_Display_86297e'`), and Next 14.2 has no option to
  keep a literal one. So:
  - the faces are reached through two CSS variables on `<html>`:
    `--font-playfair` and `--font-source-sans`;
  - the house tokens **`SERIF` and `SANS`**, the names every component
    sets its type through, now name those variables;
  - the two inline styles that typed a family literally (home's footer
    wordmark, a line in AuthForm) use the tokens, and so does the body rule
    in `globals.css`.
- **The canvas.** A canvas can't read a CSS variable, so `canvasFont()`
  (tokens.js) resolves them. The share card uses it before drawing and
  before `document.fonts.load`. `launch-kit.spec` resolves them the same
  way in the page, and fails if a variable is missing, so both sides can't
  quietly fall back to Georgia.
- The link-preview image keeps its checked-in WOFF files, untouched.
- **Verified:**
  - Welcome makes no third-party request.
  - `motion.spec` and `launch-kit.spec` pass 48 of 48. That covers
    WelcomeDemo's frame (measured to its tallest state at 320/375/430),
    LeaderEntry's fit (24 px from 344 px up, inside the gutter below), and
    the palate card pixel for pixel.
  - The production build is clean.
- The Google Fonts sentence is gone from the privacy policy.

---

## 3. The legal pages (still drafts — `LEGAL_DRAFT = true`)

### New claims and what proves them

| Claim | Page | Proof |
|---|---|---|
| "Sommeasy is run by Ed Goodwin, an individual. 'We' and 'us' here mean him." | both, under "Who we are" | Your instruction (`LEGAL_OPERATOR`) |
| Effective date | both, beside Last updated | `LEGAL_EFFECTIVE` (see review) |
| Governed by Pennsylvania law, without regard to conflict-of-laws rules | Terms, The fine print | Your instruction |
| Do Not Track / Global Privacy Control: we don't read either signal, and Sommeasy works the same with or without them | Privacy, On your device | Nothing in `src/` reads `doNotTrack`, `Sec-GPC`, `globalPrivacyControl` or DNT (grep, Nov 22). `@vercel/analytics` 2.0.1's dist has none of them either. |
| …because nothing tracks you across sites: no advertising or third-party trackers | same | Session 1's dependency list (no ad or tracker packages, no third-party scripts). Since item 2, Welcome loads **no** third-party resource (Performance entries, Nov 22). |
| "Our page counts set no cookies" | same | `@vercel/analytics` is cookieless (Session 1's proof) |
| A weekly encrypted backup of our database | Privacy, How long we keep it | `epgoodwinjr/sommeasy-backups` (private): `.github/workflows/db-backup.yml` `cron: "17 7 * * 1"`; `backup.sh` encrypts with `age` |
| Each kept 90 days; deleted data leaves the backups within 90 days | same | `retention-days: 90` (GitHub deletes older artifacts); `BACKUP_RETENTION_DAYS` feeds the copy |
| GitHub stores it, encrypted before it leaves the backup job, with a key only we hold, so GitHub can't read it | Privacy, Who helps us | `backup.sh`: plaintext only in a private temp dir; only the `.age` file is uploaded; the header is checked before upload; the private key is never in GitHub |
| *Removed:* fonts load from Google Fonts | Privacy, Who helps us | `src/app/fonts.js`; the `@import` is gone from `globals.css` |

Two caveats:

- "Once a week we make an encrypted backup" becomes true when you add the
  secrets to sommeasy-backups and the schedule runs. Flip `LEGAL_DRAFT`
  after the first green run.
- `e2e/legal.spec.ts` pins the new lines: "Who we are" first on both pages,
  the operator line, the dates line, Pennsylvania, Do Not Track, the 90
  days, and no "Google Fonts".

---

## 4. The consent line and Google

Google makes a new account for a new address from **either** form, so no
one can make one without seeing the line. The line is said once per page.

- **Create account: one line, above Create account, and so above Continue
  with Google too.**
  - With the Google flag on (`SIGNUP_CONSENT_WITH_GOOGLE`): *By creating an
    account, here or with Google, you confirm you're of legal drinking age
    where you live and agree to our Terms and Privacy Policy.*
  - With the flag off it reads exactly as before (`SIGNUP_CONSENT`).
- **Sign in: `GOOGLE_CONSENT` right under Continue with Google.** *By
  continuing with Google you confirm…* is worded for the button, since
  there it may be an existing account.
- Both use the shared `ConsentLine` component (AuthForm.js).
- **Specs:**
  - `legal.spec` asserts create account's one line (the old words exactly
    with the flag off), no `google-consent`, a single "legal drinking age"
    on the page, both links, and that the line sits above the button and
    above Google.
  - `auth-flows` asserts sign in's line under Google (words, links, under
    40 px below), and create account's single line before Google. With the
    flag off it asserts there's no Google line.

---

## 5. The weekly encrypted backup

### What it is, and where

The job lives in a **private** repository you asked for:
**[epgoodwinjr/sommeasy-backups](https://github.com/epgoodwinjr/sommeasy-backups)**.
Nothing in this public repository backs anything up. The workflow only ever
existed here on the PR branch, and scheduled workflows run only from the
default branch, so it never ran here.

| Where | File | Job |
|---|---|---|
| sommeasy-backups | `.github/workflows/db-backup.yml` | Mondays 07:17 UTC + Run workflow; installs pg_dump 17 (PostgreSQL's apt repo) and age; runs `./backup.sh`; uploads the one `.age` file for 90 days. Actions pinned to commit SHAs (checkout v7.0.1, upload-artifact v7.0.2); `contents: read`; no credentials persisted. |
| sommeasy-backups | `backup.sh` | Writes `public-schema.sql`, `auth-schema.sql`, and `data.sql` (public and auth in one snapshot, all but `auth.schema_migrations`). Adds a manifest of rows per table counted from the dump itself, and versions. Then tar → gzip → age, to one or more recipients. Prints no rows or counts. |
| sommeasy-backups | `.gitignore`, `README.md` | Never commit a backup, a dump or a key. The README points back here for the runbook. |
| here | `scripts/db-backup/restore-drill.sh` | Decrypts and restores into a fresh **local** database, refusing a remote `PGHOST`. Checks rows per table against the manifest, foreign keys for orphans, RLS on every table that had it, every policy, `claim_pending_palate` still SECURITY DEFINER, and that the accounts are present. |
| here | `scripts/db-backup/test/drill-test.sh` | End to end on a throwaway Postgres 17 cluster: migrations 001–014 over a stand-in auth schema, seeded rows, backup (`../sommeasy-backups/backup.sh`, or `BACKUP_SH`), the opacity check, drill, then every table, policy, function, trigger, view and grant compared. **Passes** with the moved script. |
| here | `scripts/db-backup/README.md` | The runbook: key, the private repo's secrets, first run, drill, real restore. |

The workflow is active in sommeasy-backups. Until the secrets are added, a
scheduled run stops at "SUPABASE_DB_URL is not set" and touches nothing.

### The connection string

The direct host `db.zugunlctgpytgyxftllv.supabase.co` has an AAAA record
and **no A record**: it's IPv6-only, and GitHub-hosted runners have no
IPv6. The workflow uses the **session pooler**: port 5432, IPv4, and it
supports pg_dump. Both us-west-1 pooler hosts (`aws-0-…` and `aws-1-…`)
resolve to IPv4. Copy the exact one from Supabase → Connect → Session
pooler. Production is Postgres 17, so the workflow installs client 17.

### Secrets to add — on sommeasy-backups (Settings → Secrets and variables → Actions)

| Name | Value |
|---|---|
| `SUPABASE_DB_URL` | the session pooler string, with the database password and `?sslmode=require` |
| `BACKUP_AGE_RECIPIENT` | the `age1…` public key from `age-keygen` (comma-separate more than one) |

### The drill, tested

The drill test passes. It fails when it should:

- **A backup without `auth.users` rows**: six orphaned foreign keys, plus
  "the dump has no auth.users".
- **A restore that skips the data**: every table reports "0 restored, N
  dumped".

A third mutant (no replica mode) was malformed by my edit and proves
nothing; it isn't counted. Production was not touched: no dump, no
connection.

One thing the test can't prove: the stand-in auth schema is small (users,
identities, schema_migrations, `uid()`). Your first real run, followed by
the drill on its artifact, is the test of Supabase's real auth schema.

---

## Tests

- **Unit:** 37 suites, all passing. New: `quizSave.test.js` (15). Changed:
  `pendingPalateRestore.test.js`'s scripted client learned `.in()` and bulk
  upserts.
- **e2e:** the full suite with both sign-in flags on
  (`NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=1 NEXT_PUBLIC_MAGIC_LINK_ENABLED=1`):
  **186 passed** (with setup), 5 env-gated skipped, 0 failed, 17.4 min.
  Run separately: auth-flows with the flags off, 25 of 25.
- **After the move and the single consent line:** 37 unit suites green;
  auth-flows + legal 30 of 30 with the flags on and 30 of 30 with them off;
  the drill test passes with `backup.sh` from sommeasy-backups.
- **Build:** `npm run build` is clean; the faces land in
  `.next/static/media`.

---

## For your review

1. **The backup lives in the private sommeasy-backups.** On the free
   plan, a private repository gets 2,000 Actions minutes a month and 500 MB
   of artifact storage. A run takes about two minutes; thirteen weekly
   archives of today's database are a sliver of the storage.
2. **The workflow is active there with no secrets.** Monday's scheduled run
   fails harmlessly until you add them. Add them first, or expect one red
   run.
3. **Create account's one line** names Google only when the flag is on.
   Sign in's line stays under Google, worded "By continuing with Google…".
4. **Governing law only.** There's no venue, forum or arbitration clause.
   Tell me if you want courts named.
5. **`LEGAL_EFFECTIVE` reads November 22, 2026** as a placeholder. Set it
   to the day you flip `LEGAL_DRAFT`.
6. **The fonts are now the variable versions** of the same faces. The
   motion and pixel guards pass, but a variable instance can rasterize a
   hair differently from Google's static 400/600/700 files. Look at the
   type on a phone.
7. **The quiz save now says when an accumulation write fails** (it's
   logged; the save still lands). Before, those errors vanished.
8. **On this Mac:** Homebrew `postgresql@17` and `age` are installed (with
   your OK). Brew made a default cluster at `/opt/homebrew/var/postgresql@17`;
   it isn't running. `brew uninstall postgresql@17 age` removes both.
9. **A probe of mine signed the e2e test account out globally once**
   (supabase-js's default `signOut` scope). That's harmless, since every
   spec signs in fresh, and every later probe used `scope: "local"`.

## What to check on the preview

- **Fonts:**
  - Welcome, the quiz, /palate (Playfair italic in the narrative), sign
    in and create account all look as they did.
  - In the browser's network panel, nothing goes to `fonts.googleapis.com`
    or `fonts.gstatic.com`.
  - /palate → Share your palate: the card's title is in Playfair.
- **/privacy and /terms:**
  - "Who we are" first, with the Effective · Last updated line.
  - Pennsylvania in the Terms; the Do Not Track line and the 90 days in
    the policy; no Google Fonts.
- **With `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=1` on Preview:**
  - /login: the consent line right under Continue with Google.
  - /signup: ONE line above Create account, naming Google.
- **On a phone:** an anonymous quiz → create a throwaway account → confirm →
  the palate should be up in about two seconds.
