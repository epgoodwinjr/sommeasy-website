# The List Ledger — readout (Nov 27, 2026)

Branch `list-ledger`, its own PR. Ed's decisions of Nov 24, 2026 are the
brief: keep lists, de-identified; a restaurant only on strong evidence;
prices stored but out of the picks; no paid data; nothing on screen changes.

## What was built

| Piece | Where |
|---|---|
| Four tables, one write function, two admin views — RLS on, no policies, no table privileges for anon/authenticated; **applied in production Nov 27, 2026** as `list_ledger` | `supabase/migrations/015_list_ledger.sql` |
| The rules: shaping and caps, the fingerprint text, hosts and the hosting-platform list, restaurant evidence, origin, the page's send | `src/lib/listLedger.js` (dependency-free) |
| The one server write (sha256 fingerprint, the RPC) — takes a list, never a person | `src/lib/listCatalog.js` |
| `POST /api/lists`: limiter (60/hour/IP) → JSON only (415) → session (401) → body ≤ 1MB, shaped (400) → service key (503) → write (500 on failure) | `src/app/api/lists/route.js` |
| The page: a full-UUID `list_ref` per sitting (mount and Scan another list, beside the verdict session), the scan's `metadata.restaurant` threaded (first page that has one wins), one fire-and-forget write per committed analysis, `list_ref` on `menu_analyzed` | `src/app/recommend/MatchList.js`, `src/lib/wineEvents.js` |
| The scan prompt asks for `metadata.restaurant { name, city, website }`, printed only | `src/app/api/parse-wine-list/route.js` |
| `checkRateLimit(route, ip, max)` — optional per-route limit (default unchanged) | `src/lib/rateLimit.js` |
| **Review round:** the restaurant's `created_at` / `updated_at` timestamps become `first_seen` / `last_seen` DAYS, set from the observation's day — **applied in production Nov 27, 2026** as `list_ledger_days` | `supabase/migrations/016_list_ledger_days.sql` |
| **Review round:** `/api/fetch-menu` reports `host` — where the page FINALLY came from, after every redirect (`safeFetchFinal`); the page keeps that host, never the address typed. Link shorteners and QR-code redirect services join `HOSTING_PLATFORMS` | `src/lib/ssrfGuard.js`, `src/app/api/fetch-menu/route.js`, `MatchList.js` `handleUrlFetch`, `listLedger.js` |

### How a write works

One sitting has one `list_ref`. Each committed analysis of a photographed,
uploaded or linked list sends the whole list read so far. The database
function, in one transaction: finds or makes the restaurant (on the
evidence the route proved), finds the list version by fingerprint or makes
it with its lines, then puts the sitting's observation on it — **only if
it is at least as full** as the version the observation was on, so a late
page-1 write can never pull it back — and removes any version no
observation points at. `times_seen`, `first_seen`, `last_seen` are
recounted from the observations. A restaurant keeps the first and last
DAY a list named it (`first_seen` / `last_seen`, from the observation's
`observed_on` — never the clock; migration 016).

The fingerprint is sha256 of the origin plus the list's lines (name folded,
vintage, bottle price, glass price, by the glass), sorted. The restaurant is
not part of it: the same lines read with and without a header are one list.
The origin is: a test read never joins a live list.

### What is kept, and what is not

- Kept: only photographed (`scan`), uploaded (`pdf`) and linked (`url`)
  lists. **Not** pasted text, and not a sitting where any page went through
  the editable-text review (a scan that fell back to text, or a link whose
  page needed editing) — that text could be anything the diner typed. I
  chose the whole-sitting rule over keeping only the machine-read pages.
- A linked list's line carries what the text parser read (name, prices, its
  section's color and grape); it keeps no section name or vintage.
- `name_key` on each line (folded, vintage and "NV" removed) is the one
  derived column, for the repeat-bottles view.

## Privacy diff (`src/lib/legalCopy.js`, `LEGAL_UPDATED` → November 28, 2026, the merge day; `LEGAL_EFFECTIVE` kept)

| Where | Before | After |
|---|---|---|
| The short version | — | + "We also keep the wine lists you photograph, upload or link — the wines, their prices and, when the list or its link names it, the restaurant — in a catalog that never says who read them." |
| What we keep › Your journal (a claim missing since before this PR) | "…the Somm’s note for a pick you chose, and the direction you gave the Somm that night." | "…the Somm’s note for a pick you chose, the direction you gave the Somm that night and, for a pick from a list you shared by link, that link." |
| What we keep › usage record | "…we keep counts (…) and tonight’s terms, not the list." | "…counts (…), tonight’s terms and, for a list you photographed, uploaded or linked, a note of which list in our catalog it was (see “Wine lists and labels”)." |
| Wine lists and labels, ¶1 | "When you photograph a list, upload a file, paste a list or share a link, we send it to Anthropic… We don’t store the photos, files or pasted text — only the wines read from them, while you use the page, and the counts above." | "When you photograph a list or upload a file, we send it to Anthropic… A list you paste or link is read by Sommeasy itself. We never store the photo, the file or the text you paste." |
| Wine lists and labels, ¶2 (new) | — | What the catalog keeps, the restaurant evidence ("…or the website a shared link leads to"), its purpose ("to make Sommeasy better: to learn wines our data doesn’t know yet, to see which restaurants’ lists suit a palate, and to compare a bottle’s price across restaurants"), "A list you paste is never kept in the catalog." |
| Wine lists and labels, ¶3 (new) | — | "Nothing in the catalog says who read a list… only the day a list was read, never the time. Your own usage record notes which list in the catalog you read, and with it the restaurant when the catalog names one. That note is part of your account and leaves with it. Lists stay in the catalog after you delete your account, with nothing pointing to you." |
| Your choices › Delete account | …"It can’t be undone." | + "Wine lists you photographed, uploaded or linked stay in our catalog, with nothing pointing to you." |
| How long we keep it | — | + "The catalog of wine lists holds nothing about who read them, and we keep it." |

Unchanged on purpose: "We don’t ask for or track your location." and the
IP sentence (the limiter on `/api/lists` is "a feature that reads a list";
the IP is counted in memory for an hour and never stored).

**One word beyond the review's edits, for Ed:** ¶2 said the restaurant can be
"the website a shared link comes from"; it now says "leads to", because the
route keeps the host a link finally led to after its redirects, not the
short link typed.

**A correction beyond the brief, for Ed's review:** ¶1 used to say a pasted
list and a shared link are sent to Anthropic to be read. They aren't, and
weren't: a pasted list is read on the device (`parseWineList`), a link is
fetched by our server and read on the device (`/api/fetch-menu` has no
Claude call). Only their wines reach Anthropic, through the Somm — already
disclosed under "Who helps us run Sommeasy".

### Every new claim, and the file that proves it

| Claim | Proof |
|---|---|
| We keep lists you photograph, upload or link | `MatchList.js` `commitAnalysis` — `LIST_SOURCE_KINDS` (`scan`, `pdf`, `url`); `e2e/list-ledger.spec.ts` tests 1, 4 |
| A list you paste is never kept in the catalog | `LIST_SOURCE_KINDS` excludes `paste`; `shapeListBody` refuses any other kind; the edited-text sitting rule (`listMetaRef.edited`); list-ledger.spec test 4 (no request at all) |
| We never store the photo, file or pasted text | `listLedger.js` `shapeListBody` keeps named fields only; the 015 tables have no blob, image or raw-text column; `parse-wine-list` returns `rawText` to the page, which never sends it to `/api/lists` (`listRequestBody`) |
| Names, vintages, prices, producer, grape, region, country, color, section | `catalogItems` / `shapeItem` (`listLedger.js`); `wine_list_items` columns |
| The restaurant, when the list or its link names it: printed name/city/website, or the website a shared link leads to | `restaurantEvidence`; the prompt's printed-only rule; `HOSTING_PLATFORMS` (link shorteners and QR services included); `/api/fetch-menu`'s `host` = the final URL after every redirect (`safeFetchFinal`), kept by `handleUrlFetch` instead of the typed address; fetchMenuRoute.test.js; listLedger.test.js "who the list belongs to"; list-ledger.spec's link test (a typed `qrco.de` link kept as the restaurant's host, a page the shortener served itself naming no one) |
| What the catalog is for: to learn wines our data doesn't know, which restaurants' lists suit a palate, a bottle's price across restaurants | A statement of purpose, not of code: nothing reads the catalog yet (no scoring, Somm or copy change — Ed's Nov 24 decision; see CLAUDE.md "What remains" on the server keeping what it read itself before anything does) |
| A list you paste is never kept **in the catalog** (the zero-match sample still keeps up to 15 names in your own record) | As above; the sample is `menuAnalyzedPayload`'s, unchanged |
| Nothing in the catalog says who read a list (not your name, email, account, IP or location) | The 015 tables' columns (sql-test.sql §9 fails on any user/email/ip/location column); `listWriteArgs` (15 fixed arguments, pinned in listsRoute.test.js against the function's declaration); the source scan in listLedger.test.js; listsRoute.test.js "even when the body carries them" |
| Only the day, never the time | `observed_on`, and `first_seen` / `last_seen` on lists AND restaurants, are `date` (016 made the restaurant's two `date`s, set from `observed_on`); sql-test.sql §9 fails on any timestamp, time or interval column in all four tables and both views, and §10 on a restaurant day taken from the clock; `observedOn()` |
| Your usage record notes which list you read, and with it the restaurant when the catalog names one | `menuAnalyzedPayload` `list_ref` (wineEvents.js); `wine_list_observations.list_ref` → `wine_lists.restaurant_id` (015); list-ledger.spec test 1 |
| The journal keeps the link of a pick from a list shared by link | `MatchList.js` — the rating and the choose upserts write `source_url: menuUrl` when `extractedFrom === "url"` (`wine_interactions.source_url`, migration 004) |
| That note leaves with your account | `wine_events.user_id … ON DELETE CASCADE` (migration 009); `/api/account/delete` |
| Lists stay after you delete your account, with nothing pointing to you | No foreign key from the catalog to `auth.users` or `wine_events` (migration 015) |
| We keep the catalog | No delete path in the app; no retention job |

## Reading the restaurant off the page — measured

`scripts/list-ledger/render-headers.py` draws three scan-truth lists with an
invented restaurant's header and without one; `scripts/scan-truth/scan.mjs`
sent each through the real `/api/parse-wine-list` handler (claude-sonnet-4-6,
9 calls — headed pages twice, bare pages once). Record:
`scripts/list-ledger/names-2026-11-27.json`.

| Page | What was printed | Read (each run) | Wines |
|---|---|---|---|
| sept19, full header | SALT & CELLAR / Hermanus · Western Cape / saltandcellar.co.za | name "Salt & Cellar", city "Hermanus", website "saltandcellar.co.za" — 2 of 2 | 14, 14 |
| aug8, name + city | Fynbos Kitchen / Franschhoek | name, city — 2 of 2; website null | 25, 25 |
| mixed, name alone | The Long Table | name — 2 of 2; city **null**, website null | 14, 14 |
| sept19, bare | nothing | all null — 1 of 1 | 14 |
| aug8, bare | nothing | all null — 1 of 1 | 25 |
| mixed, bare | nothing | all null — 1 of 1 | 14 |

Name read when printed: 6 of 6. City: 4 of 4 printed, and never invented
(0 of 2 on the name-only page, though its wines are South African). Website:
2 of 2. Null when nothing was printed: 3 of 3. The header changed no
wine count and no price reading. Two things to know: the model normalized
"SALT & CELLAR" to "Salt & Cellar" (`nameKey` folds case anyway), and from
"Hermanus · Western Cape" it took the town as the city. Nine calls is a
sample, not a rate; the weekly read (watchtower §11h) is the real one.

## Tests

- `node src/lib/__tests__/listLedger.test.js` — 33 tests (link shorteners and QR services as platforms; a link that never left its shortener names no one; shaping, caps, junk, prices, by the glass; the page's `catalogItems` for photo and text lines; `mintListRef` with and without `crypto.randomUUID`; `sendList` never rejects; hosts and the platform list (no substring matching); the identity rules; `nameKey` / `bottleKey`; the fingerprint; origin; `observedOn`; `listWriteArgs`; the source scan; the Privacy Policy's claims)
- `node src/lib/__tests__/listsRoute.test.js` — 13 tests (401 with no write; 415 before the session; one service-role write; exactly the function's fifteen arguments; no user id, email or IP even when the body carries them; the same list_ref twice; junk 400; >1MB 413; origin; 503; 500 logged without the list; the success log; the limiter at 61)
- `node src/lib/__tests__/fetchMenuRoute.test.js` — 6 tests, new in the review round (the real route, DNS stubbed, the web scripted: a QR link through a shortener and two redirects says the restaurant's host; a restaurant's own link; a QR code leading to a PDF; a page the shortener served itself says the shortener; a redirect into a private address still refused; a failed page says no host)
- `ssrfGuard.test.js` (+2: `safeFetchFinal` says the final URL after three redirects; `safeFetch` is its response)
- `scripts/list-ledger/sql-test.sh` — migrations 015–016 on a throwaway Postgres 17 with Supabase's default grants: 36 checks (no catalog table or view holds a time; a restaurant's first and last days are its observations'; dedup, the fullest-version rule, a late partial, a shared list kept, restaurants by host / name+city / case / a later website, a name alone refused, live vs test in the views, privileges, no reader column)
- `wineEvents.test.js` (+1: `list_ref`), `rateLimit.test.js` (+1: a route's own limit)
- `e2e/list-ledger.spec.ts` — 6 tests (scan → one list + one observation keyed by menu_analyzed's list_ref; Add another page → one observation on the fuller list, the partial gone, the printed name + city naming the restaurant; nothing printed → no restaurant, a name alone kept as read; a typed QR-code link keeps the host it led to — never the short link — and a page the shortener served itself names no one, a paste writes nothing; a scan that fell back to editable text is never kept though its source is `scan`; a catalog that never answers changes nothing, and Scan another list is a new key). It records every `list_ref` the page sends and removes those rows after each test, and before the file runs it removes stale test lists that carry its marker lines (a crashed run, or a mutant that minted refs it never saw).

Mutation checks: unit 28 of 28 (one survived at first — an extra RPC
argument — and the route test now pins the argument set to the function's
declaration); SQL 10 of 10 (two survived at first: a case-sensitive
name+city lookup, and a missing revoke that plain Postgres hid because it
doesn't grant functions to `authenticated` by default — the harness now
applies Supabase's default grants); browser 8 of 9: restaurant not
threaded, a fresh key per commit, list_ref off menu_analyzed, the page
awaiting the write, the link host dropped, Scan another list keeping the
key, the edited-text rule ignored, and that rule never set. The ninth —
sending a pasted list — is equivalent: a paste reaches the page only
through the text review, which already marks the sitting edited, so the
source check and the edited rule each stop it alone. The edited-text test
was added because the first browser run showed that rule had no test of
its own.

## Review round (Nov 27, 2026)

Ed's review approved the build and asked for four changes before merge:

1. **Days, not times, everywhere.** `restaurants.created_at` / `updated_at`
   were timestamps, and `updated_at` moved on every write that named the
   restaurant — the minute a list was read. Migration 016 renames them
   `first_seen` / `last_seen`, makes them `date`, drops their defaults, and
   the function sets them from `p_observed_on` (a later list moves the last
   day, never the first). 015 is in production, so 016 is its own file; the
   table held no rows. **Applied in production Nov 27, 2026** as
   `list_ledger_days`, after the SQL test passed; verified there: every
   catalog column of a date kind is `date` and none holds a time, the
   function is the service role's alone, and its source names no clock;
   the advisors show only what they showed before. sql-test §9 now fails on
   ANY timestamp, time or interval column in the four tables and both
   views; §10 holds the restaurant's days to its observations'. Mutation-
   checked 8 of 8: the timestamps kept, `last_seen` kept as a timestamp, the
   clock on each insert, a later write that never moves `last_seen` or
   stamps the clock, `first_seen` moving forward, a catalog view gaining a
   `now()` column.
2. **Short links.** The page kept the host of the address the diner typed,
   so a QR code or short link would have become a "restaurant" and merged
   every list behind it. `safeFetchFinal` (ssrfGuard.js) returns the final
   URL after every redirect — each hop still re-validated — and
   `/api/fetch-menu` answers `host`, the normalized host the page FINALLY
   came from (HTML and PDF alike); `handleUrlFetch` keeps that and never the
   typed address. `HOSTING_PLATFORMS` gains the shorteners and QR services
   the review named and a few of the same kind (bitly.com, g.co, v.gd, rb.gy,
   shorturl.at, tiny.cc, buff.ly, lnkd.in, t.ly, s.id, short.io, ead.me,
   qr-codes.io, uqr.me, qrcode-monkey.com, qr-code-generator.com, qrfy.com,
   qrfy.io, beaconstac.com, scnv.io, qrstud.io, qr.page, qrd.by, qr.net,
   linkin.bio) — so a link that never left its shortener names no one.
   Unit mutants 8 of 8 (the typed address kept; the HTML or the PDF answer
   without `host`; the first URL reported as the final one; qrco.de,
   bit.ly or flow.page unlisted; a suffix match without its dot).
3. **Privacy copy** — Ed's five edits, word for word, plus one word of mine
   (above: "comes from" → "leads to"). Each is in the proof table.
   `LEGAL_UPDATED` is November 28, 2026 — the merge day (it was past
   midnight when the round finished).
4. **CLAUDE.md** — "What remains" under the List Ledger: `/api/lists`
   trusts the page for the paste rule, the host and the read restaurant;
   before anything users see reads the catalog, the server should keep what
   it read itself.

**Runs, after the round:** every unit suite (42, including the new
fetchMenuRoute) passes; the SQL test's 36 checks pass; `next build`
compiles; the full e2e suite passed 200, skipped 5 (17.5 min), with 18
`[lists] write ok` lines and no write failure. Browser mutant: the page
keeping the typed address instead of the route's `host` fails the link
test (the catalog was checked clean after it). Mutation totals across both
rounds: unit 36 of 36, SQL 18 of 18, browser 9 of 10 (the one survivor is
the equivalent paste mutant above).

Also: the route test now pins the write's arguments to the LATEST migration
that defines the function (016), the source scan covers 016 and fails if it
takes a day from the clock, and watchtower §11h's "restaurants added" reads
`first_seen`.

## For Ed to look at closely

1. **The privacy copy** — your edits are in word for word; the one word
   that isn't yours is "a shared link leads to" (was "comes from") in
   ¶2. The Terms are untouched.
2. **The link between a person and a list exists while the account does**,
   by design: `menu_analyzed.payload.list_ref` = `wine_list_observations.list_ref`.
   Watchtower §11h joins them for a count. Anyone with SQL-Editor access can
   see which restaurant's list an account read until that account is deleted.
3. **Test rows.** Every e2e run's scans (scripted and real) write `test`
   lists to production's catalog; only list-ledger.spec cleans up after
   itself. Recurring fixtures share a fingerprint, so this grows by
   observations, not lists. `DELETE FROM wine_lists WHERE origin = 'test'`
   (observations and lines cascade) clears it whenever you like.
4. **The shortener list is a list.** A QR service it doesn't know, whose
   own page serves the list (no redirect), would still become a
   "restaurant". The weekly read can catch one: a `website_host` with many
   lists across far-apart cities.
5. **The journal's link is the address typed.** `wine_interactions.source_url`
   keeps `menuUrl` — a QR code's short link, if that's what was typed — not
   the host it led to. Unchanged here (it predates this PR); the policy's new
   journal line is true either way.
6. `LEGAL_UPDATED` says November 28, 2026 — the merge day.
