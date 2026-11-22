# Launch prep, Session 1 — readout (Nov 22, 2026)

Branch `launch-prep`, cut from `claude-md-marks-live` (main plus the
"PR #36 is live" CLAUDE.md commit). Three items, plus a migration.

---

## 1. The waiting palate is folded in exactly once (launch blocker)

### What happened in production (read-only)

The account created 2026-11-12 23:34:53 UTC (quiz only, no journal rows):

| Fact | Value |
|---|---|
| `quiz_completed` with mode `restore` | 23, in five bursts (Nov 12 23:35 → Nov 17 01:30), all `occurred_at` 2026-11-12 23:34:26 — the same stash |
| Gaps inside a burst | 2–17 seconds |
| Profile `updated_at` / last restore event | 2026-11-17 01:30:43.93 / 01:30:44.07 |
| `auth.users.updated_at` | **2026-11-17 01:30:58.71** — the metadata clear, 14.6 s after the profile write |
| Sessions now | none (signed out since) |

### Root cause

Lead (a), with (c)'s ordering. The 14.6 s is measured, not guessed: after the
profile write, `saveQuizProfile` recorded the event, then ran
`reconcileQuizPromotions` and `syncQuizSelections`. The second makes **two
sequential requests per quiz item**, about 88 round trips for this palate.
Then it re-read the profile, and only then did the restore clear
`user_metadata.pending_palate`. `init()` awaits all of it on the loading
screen. A reload or a tap away in those ~15 s left the carrier in place and
the event already written, and the next load folded the quiz in again. The
fifth burst ended because that load was left alone long enough.

Leads (c) and (d) were real too, and both are fixed:

- **(c)** An empty read-back after a landed write turned the save into a
  "failure": the event was already written, the stash was put back, and the
  clear was skipped.
- **(d)** `getSession()` is a cache. A device signed in before the fold-in
  keeps a session user that still carries the palate.

Lead (b), a failed clear only logged, is moot now: the clear is the claim,
and the claim decides the record.

### The fix

- **`src/lib/pendingPalateRestore.js`** (moved out of `page.js` so plain node
  can test it):
  1. Claim the local stash synchronously, as before.
  2. If the cached session carries a palate, ask the server (`getUser`). A
     carrier is only ever added at signup, so a session without one costs
     no request.
  3. Save. The write is a union, so repeating it is harmless.
  4. Right after the write lands, call **`claim_pending_palate()`**. It
     removes the carrier **and inserts the `quiz_completed` row in the same
     transaction**, and hands the palate back to exactly one caller across
     tabs, devices and reloads. Only that load shows welcome-back. No crash
     point can leave a claim without its record, or the reverse.
- **`saveQuizProfile`**: the upsert returns its row (`.select().single()`),
  and that row is the result, so the trailing re-read is gone. A
  `beforeEvent(row, event)` gate lets the restore withhold the client-side
  event. The live quiz is unchanged: no gate, so it records as before.
- **Fallback**: if the function is missing (app deployed before the
  migration), the claim clears the key through the auth API and the client
  records the event. That is safe for reloads and sequential devices, not
  atomic for two devices in the same instant.

### Migrations (both applied to production with your OK)

- `013_claim_pending_palate.sql`: `claim_pending_palate(p_payload jsonb,
  p_occurred_at timestamptz)`. SECURITY DEFINER, `search_path ''`. It
  touches only the caller's own `auth.users` row and only that key. The
  event type is fixed in SQL. The insert sits in its own sub-block, so a
  failed event never undoes a claim. Signed-in users only (anon has no
  EXECUTE). Production history shows two entries: a no-argument draft
  (`claim_pending_palate`) replaced the same hour by
  `claim_pending_palate_records_event`. The file drops the draft, so it is
  correct either way.
- `014_pin_update_updated_at_search_path.sql`: lint 0011 is gone from the
  security advisor.

The advisor now shows **0029** ("signed-in users can execute a SECURITY
DEFINER function") for `claim_pending_palate`. That is intended; it's the
point of the function. **Leaked password protection is disabled** (a
dashboard toggle, Auth → Providers → Email); worth turning on before launch.

### Tests

- `node src/lib/__tests__/pendingPalateRestore.test.js` (14). The real
  restore and `saveQuizProfile` run against a scripted Supabase: one server,
  devices each with their own storage and cached session, and a page that
  can die after any network call.
  - Written first against the moved-but-unchanged restore: 8 of 13 failed,
    including the production window (2 events) and almost every crash point
    (2 events).
  - Now: a page that dies at **every** network call, then reloads three
    times, ends with exactly one event, at most one welcome-back, the
    palate kept and the carrier gone.
  - Stale caches, two devices at once, two tabs at once, the fallback, a
    failed write, an empty read-back, a failed server check, local-only,
    no carrier.
  - 7 of 7 mutants caught.
- `e2e/palate-once.spec.ts`, a **permanent hard-fail guard**. Both carriers
  are seeded, and a second device signs in first (to /journal, so its
  session goes stale). The page is reloaded the instant the profile write
  lands: the production window. It asserts exactly one restore event, the
  carrier gone from the real auth record, and the stash gone. Then three
  more reloads, a second tab and the stale device must show no
  welcome-back and make **no profile write and no claim**.
  - Fails on the old restore: Received 2.
  - Fails on a stale-cache mutant: 8 writes on reloads. That mutant also
    showed the folding device's own session going stale whenever a reload
    beats the cache refresh, which the server check covers.
- `docs/auth-watchtower.md` §11a counts **users** per quiz mode. It adds a
  by-mode `users / rows / repeat_rows` view and an alarm query for any
  repeated `restore` after 2026-11-23. The 23 rows stay.

### Not changed, worth knowing

The loading screen still waits on those ~88 accumulation requests on every
quiz save (~15 s on a phone for a 44-item palate). It no longer causes
duplicates, but it is slow, and it's what made a real user reload five
times. Batching `syncQuizSelections` (one read, one upsert) is a follow-up.

---

## 2. Privacy Policy and Terms (drafts for your review)

`/privacy` and `/terms`, House List look, copy as data in
`src/lib/legalCopy.js`. `LEGAL_DRAFT = true` prints "Draft for review — not
yet in effect." on both. **Flip it to false when you approve them.**
Contact: hello@sommeasy.wine (the mailbox needs to exist).

Linked from:

- Welcome's footer, under the demo.
- Sign in, under Forgot your password.
- Account, under Delete account.
- Create account, in one line above its button: *By creating an account
  you confirm you're of legal drinking age where you live and agree to our
  Terms and Privacy Policy.*

Guard: `e2e/legal.spec.ts`.

### Every factual claim and what proves it

| Claim (Privacy unless noted) | Proof |
|---|---|
| We keep your email and the name you give | `AuthForm.js` signUp `options.data.name`; `account/page.js` name edit (`updateUser`) |
| Your password goes to Supabase, never through our code | `AuthForm.js` calls `supabase.auth.signUp` / `signInWithPassword` from the browser; no route reads a password |
| Supabase stores the password hashed | Supabase Auth's documented behavior, not our code |
| Google shares name and email when you continue with Google | `AuthForm.js` `signInWithOAuth({ provider: "google" })`; the fields are Supabase's Google identity data, not our code |
| Quiz answers (countries, regions, estates, grapes, named wines), title, signature, narrative, mark | `saveQuizProfile.js` upsert columns; `wine_profiles.identity` (migration 006) |
| Journal: ratings, want/pass, notes, place, the Somm's note, the night's steer | `wine_interactions` columns (migrations 002, 005, 012: `note`, `place`, `somm_note`, `occasion`) |
| Usual spend and color | `wine_profiles.preferences` (012); `account/page.js` At the table |
| Usage record: counts, terms, up to 15 names when nothing matched, Somm costs | `wineEvents.js` `menuAnalyzedPayload` (sample ≤15 only at match_count 0), `sommCurationPayload` (est. cost) |
| Lists, files, pasted text and label photos go to Anthropic | `api/parse-wine-list/route.js`, `api/scan-label/route.js` |
| We don't store photos, files or pasted text | No Storage uploads anywhere in `src/` (`storage.from` / `.upload` absent); results live in page state (`MatchList.js`) |
| A shared link is fetched by our server | `api/fetch-menu/route.js` (`safeFetch`) |
| The Somm receives palate, loved/not-for-me bottles, terms, the list | `sommPicks.js` `buildSommPayload` (dna, feedback, budget, color, steer, candidates) |
| The narrative receives title, signature, palate, recent ratings | `api/palate-narrative/route.js` system prompt inputs and its reads |
| Anthropic never receives name or email | None of the four Claude routes reads `email` or `user_metadata`; payload builders carry neither |
| Resend delivers sign-in email | Supabase custom SMTP, configured in the dashboard (CLAUDE.md "Custom SMTP (Resend) is live"), not our code |
| Fonts load from Google Fonts | `globals.css` line 1 `@import url('https://fonts.googleapis.com/…')` |
| Vercel hosts; Web Analytics is cookieless | `layout.js` `<Analytics />` (`@vercel/analytics`); hosting is the deploy target |
| Session in cookies | `@supabase/ssr` (`supabase.js`, `middleware.js`) |
| Device storage: quiz up to seven days, five recent searches, dismissals, back trail | `pendingPalate.js` `STASH_MAX_AGE_MS`; `searchView.js` `RECENT_SEARCHES_CAP = 5`; `firstPour.js` / `tableVerdict.js` dismissals; `navTrail.js` (sessionStorage) |
| The stashed quiz joins the account at signup/sign-in | `AuthForm.js` metadata carry; `pendingPalateRestore.js` |
| IP kept up to one hour by the limiter | `rateLimit.js` `WINDOW_MS = 1h`, keyed `${route}:${ip}`, in memory |
| No ads, no trackers, no advertising cookies | `package.json` dependencies: anthropic, supabase ×2, vercel analytics, next, react ×2, unpdf; no `next/script`, no third-party script tags |
| No location | No `geolocation` anywhere in `src/`; `place` is free text |
| Share card has title, signature, mark; no name or email; made on device | `palateCard.js` header + layout; `SharePalate.js` draws in the browser, no route |
| Export your journal (spreadsheet) | `account/page.js` + `journalExport.js` (CSV) |
| Remove a wine reverses its pull on the palate | `wine/WinePage` remove → `reverseAccumulation` (dnaEvolution.js) |
| Start fresh resets the quiz | `StartFreshConfirm` → `/?quiz=fresh` |
| Delete account removes everything | `api/account/delete/route.js` `deleteUser`; every user table `REFERENCES auth.users ON DELETE CASCADE` (migrations 001, 002, 003, 009) |
| Providers' backups and logs on their own schedule | Not provable from code; deliberately vague |
| Legal drinking age, 21 in the US (both) | Your instruction; no age check in code — the consent line is the gate |
| Sommeasy is free (Terms) | No payment code or dependency |
| AI-written notes can be wrong (Terms) | Somm notes (`somm-picks`), narrative (`palate-narrative`) |

### For your review

- **Google sign-in skips the consent line.** "Continue with Google" on
  **sign in** creates an account for a new email without ever showing the
  create-account line. On create account the line sits above the button,
  so it's seen. Options:
  - the same line under the Google action on sign in, worded for Google;
  - or leave it, since the Terms bind on use.
  Your call. Not built.
- **No governing-law or venue clause** in the Terms. Tell me the state.
- **Google Fonts** is a third-party request on every page. Self-hosting the
  two faces (`next/font` or the WOFF files already in `assets/fonts/`)
  would let the policy drop that line.
- "Export" covers the journal only; the policy says to write for the rest.
- Wording is yours: the age line, "Fair use", the liability paragraph.

---

## 3. Sign-in at launch: magic links and Google

**Verified behind the flags.** The auth-related e2e specs (auth-flows,
palate-handoff, palate-once, legal, account) ran with
`NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=1 NEXT_PUBLIC_MAGIC_LINK_ENABLED=1`:
**44 passed**.

- `auth-flows`' Google test now follows its flag. Off: hidden (unchanged).
  On: shown on both forms, and a click hands off to
  `…/auth/v1/authorize?provider=google` with
  `redirect_to=<origin>/api/auth/callback?next=/journal` and a PKCE
  `code_challenge`. Intercepted, so Google is never contacted.
- Both magic-link tests ran with the flag on.
- The full suite also ran with both flags on (see Tests below).

**In Vercel**, set both flags to `1` for Production (and Preview if you want
them there), then redeploy. `NEXT_PUBLIC_*` values are inlined at build.

### The magic-link template

Paste **`docs/email-templates/magic-link.html`** into Supabase →
Authentication → Email Templates → **Magic Link**. Subject: *Your Sommeasy
sign-in link*. Its button is
`{{ .SiteURL }}/api/auth/confirm?token_hash={{ .TokenHash }}&type=magiclink&next=/`,
and the confirm route handles `magiclink`.

Two notes:

- It always lands on `/`; a `?next=` from the sign-in page isn't carried.
- Because it uses `{{ .SiteURL }}`, a magic link requested on a preview
  signs you in on **sommeasy.wine**.

### Google, the click-list (nothing changed in any dashboard)

**Google Cloud Console** (console.cloud.google.com, a project for
Sommeasy):

1. **APIs & Services → OAuth consent screen**
   - User type **External**.
   - App name *Sommeasy*, user support email, developer contact.
   - App domain:
     - Home page `https://sommeasy.wine`
     - Privacy policy `https://sommeasy.wine/privacy`
     - Terms `https://sommeasy.wine/terms`
     - (Publish item 2 first: Google reads these.)
   - Authorized domains: `sommeasy.wine` and `supabase.co`.
   - Scopes: `openid`, `.../auth/userinfo.email`,
     `.../auth/userinfo.profile` only. These are non-sensitive, so no
     verification review.
   - Skip the logo unless you want brand verification; a logo triggers it.
   - **Publishing status → In production.** Testing mode lets only listed
     test users in.
2. **APIs & Services → Credentials → Create credentials → OAuth client ID**
   - Application type **Web application**, name *Sommeasy (Supabase)*.
   - Authorized JavaScript origins: `https://sommeasy.wine` (and
     `https://www.sommeasy.wine` if www resolves). Optional for this
     redirect flow, harmless.
   - **Authorized redirect URIs:**
     `https://zugunlctgpytgyxftllv.supabase.co/auth/v1/callback`. This is
     the only one. Google returns to Supabase, never to us or a preview.
   - Copy the Client ID and Client secret.

**Supabase** (project `zugunlctgpytgyxftllv`):

3. **Authentication → Sign In / Providers → Google**
   - Enable.
   - Paste the Client ID and Client secret.
   - Leave "Skip nonce checks" off.
   - Leave "Allow users without an email" off.
   - The callback URL it shows must match step 2's redirect URI.
4. **Authentication → URL Configuration**
   - Site URL: `https://sommeasy.wine`
   - Redirect URLs:
     - `https://sommeasy.wine/**`
     - `https://www.sommeasy.wine/**` (only if www resolves)
     - `https://sommeasy-website-*-epgoodwinjrs-projects.vercel.app/**`
       (previews: both the hash and `-git-<branch>-` hostnames)
     - `http://localhost:3000/**`
   - The `/**` covers the `?next=` on `/api/auth/callback`.

**Then**:

5. Set `NEXT_PUBLIC_GOOGLE_AUTH_ENABLED=1` in Vercel and redeploy. In
   that order: a button before the provider is enabled gives "provider is
   not enabled", which a real user hit twice before.

Google's consent screen will read "to continue to
zugunlctgpytgyxftllv.supabase.co" unless the project gets a Supabase custom
domain (a paid add-on). Cosmetic, but it's the first thing a Google
sign-up sees.

---

## Tests

- 36 unit suites, 1,071 tests, all passing (new:
  `pendingPalateRestore.test.js` 14; `houseList` updated for the two page
  titles).
- Full e2e with both flags on: 184 run, 183 passed, 5 env-gated skipped, 1
  failed. The failure: motion.spec's "no usable genome" reveal intercepted
  the save's trailing `GET …select=*` read, which this branch removed; it
  now intercepts the upsert's own `POST …select=*` response (same intent:
  the row the save hands back). That test and the rest of motion.spec then
  passed: 38 of 38.
- One intermittent failure seen while re-running motion.spec: "Pass strikes
  the rec's name in pencil" failed once in three file runs and passed in the
  full run and alone. Nothing in this branch touches it; worth watching.
