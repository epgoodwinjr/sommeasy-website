# Where people come from — readout (Nov 23, 2026)

Branch `source-tags`, PR #46. Preview: https://sommeasy-website-git-source-tags-epgoodwinjrs-projects.vercel.app (behind Vercel's login). Launch measurement only, two changes. No migration, no
new event type, no new dependency.

## 1. Every account records where it came from

- **The tag.** Any page visited with `?ref=<tag>` keeps the tag in
  `localStorage` as `sommeasy.ref` = `{ tag, setAt }`. A tag is lowercase
  letters, digits and hyphens, 1–24 characters; anything else is ignored
  (never lowercased, trimmed or cut down). The FIRST tag wins: a later one
  never replaces an unexpired one; it expires 30 days after it was set.
  Storage that's missing, full, junk or throwing reads as "no tag" and
  never throws. Rules: `src/lib/sourceTag.js` (dependency-free).
- **Where it's read.** `SourceTag` (`src/components/SourceTag.js`), mounted
  once in the root layout, renders nothing and runs on every page change. It
  loads the Supabase client (a dynamic import) only when a tag is waiting on
  the device, so a plain visit to a page that has no other use for it ships
  none of it.
- **Email signup.** `AuthForm` adds `ref` to `options.data` beside `name` and
  `pending_palate`. The pending palate's 8KB guard is untouched (it's its own;
  the tag is at most 24 characters). No tag → no `ref` key at all.
- **Google (any signup that isn't the form).** On a signed-in load with a tag
  waiting: the cached session decides first, with no request: an account
  older than 24 hours, or one that already has a ref, stops there. A new
  account with no ref asks the server (`getUser`) — a session is a cache and
  could predate a ref written on another device — and only then writes
  `updateUser({ data: { ref } })`. One call at a time (StrictMode's double
  effect writes once). A failure is silent and keeps the tag for the next
  load. The page never waits on any of it.
- **Clearing.** The stored tag is cleared once the account carries THAT tag
  (an email signup's first confirmed load, or right after the Google write).
  A different tag on an account that already has a ref stays on the device
  (it could still be another new account's here) until it expires.
- **Watchtower.** `docs/auth-watchtower.md` §11g: accounts by ref, and by ref
  × a first `menu_analyzed` within 21 days (with `still_in_window` so a young
  tag's rate reads as a floor). Ran read-only against production today:
  11 accounts, all `untagged`, as expected.

### The privacy sentence, as shipped

Appended to the usage item of the Privacy Policy (`legalCopy.js`):

> If you arrived through a tagged link, such as an invitation or Instagram,
> we note where you came from.

`LEGAL_UPDATED` already reads November 23, 2026 (today). **If this merges on a
later day, change it to that day** — it's the one line to touch.

**For Ed — one paragraph the brief told me not to touch is now inexact.** The
policy's "On your device" paragraph lists what Sommeasy keeps in browser
storage and ends "None of it leaves your device except the quiz, which joins
your account when you sign up or sign in." The tag is now also kept there and
also joins the account. I left it as the brief says ("change nothing else");
a suggested fix, if you want it: add "a link's tag (for up to 30 days)" to the
list, and end "…except the quiz and a link's tag, which join your account
when you sign up or sign in." Similarly "Share your palate makes an image…"
is still true (no personal data rides with the link), so I left it.

## 2. The link on shared palate cards

`navigator.share` now gets `{ files: [card], url: "https://sommeasy.wine/?ref=card" }`
(`SHARE_LINK` in `palateCard.js`) — but only where `navigator.canShare` says
the browser can share the file AND the link together; anywhere else the file
goes alone, as before. The picture is never dropped for the link by our code.
The download fallback is unchanged and the tap still records nothing (no
route, no event; launch-kit.spec still asserts no `/api/` or Supabase request
on the tap).

### Which share targets kept the picture — NOT TESTED ON DEVICES

I could not run this on a real iPhone or Android phone from here (the iOS
Simulator has no Messages, Mail, WhatsApp or Instagram). **Nothing in this
readout claims any target keeps the picture.** What's verified is the page's
side: Chromium's share is handed the file plus the link, and a browser that
says it can't share both gets the file alone.

What to check on the preview, `/palate` → Share your palate, on an iPhone
(Messages, Mail, WhatsApp, Instagram) and Android Chrome (same apps): does the
recipient get the image? If any target drops it, make the share file-only by
deleting the `withLink` lines in `shareData()` (`src/components/SharePalate.js`)
— the launch-kit test that expects `url` then needs its expectation back to
`keys: ["files"]`. A known risk worth checking first: on iOS a `url` can turn
into a link-preview bubble in Messages and some apps keep only one of the two.

## Tests

- `node src/lib/__tests__/sourceTag.test.js` — 20 tests: what a tag is (and
  what's ignored), the query string, first tag wins, 30-day expiry, junk /
  throwing / full storage, which accounts are new, and the signed-in write
  against a scripted auth — once, two calls at once write once, old accounts
  ask nothing, never over a cached or server-only ref, a carried tag cleared
  with no write, failures silent with the tag kept, the server's age winning.
- `palateCard.test.js` +1: the link, and that its tag is one the site keeps.
- `e2e/source-tags.spec.ts` — 7 tests, EVERY `/auth/v1/*` call intercepted, no
  real user created: a visit keeps the first valid tag; email signup carries
  `data.ref` beside the name and the palate (hard-fail guard); no tag → no
  `ref` key; a new account with no ref gets the tag once on its first
  signed-in load, cleared after, never written again (hard-fail guard); an
  older account is never tagged and asks the server nothing; the server's
  "old" beats a cache that says new. The signed-in tests answer the password
  grant with a made-up session — the write doesn't ask which provider made
  the account, and a real Google round trip can't be intercepted.
  Mutation-checked in the browser: tagging every account fails two tests;
  dropping the signed-in write fails two.
- `launch-kit.spec.ts`: the share now carries the link (the one expectation
  this change moves), plus a test that a browser that can't share the link
  with a file shares the file alone.
- Every unit suite passes (39 files), and the full `npm run test:e2e`: 194 passed, 5 skipped (the env-gated seeder and screenshot specs), 0 failed, 18.0 min.

## What I chose not to do

- No web app manifest, no wine-data credit line (out of scope, as briefed).
- The `?ref=` stays in the address bar (nothing strips it); a shared address
  can carry its tag onward, which is fine for first-touch counting.
- The signed-in write doesn't check the provider: any account under 24 hours
  old with no ref gets the device's tag. In practice that's Google (email
  signup sends it already); a magic link never creates an account.
- A tag that arrives on a client-side navigation to the SAME path (`/` →
  `/?ref=x` without leaving `/`) isn't read until the next page change. Tagged
  links arrive from outside, as full loads.
- The "On your device" paragraph (above) — Ed's call.
