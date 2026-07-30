# Sommeasy Email Templates (Session 1 — The Front Door)

Ready-to-paste branded HTML for the Supabase auth emails, written for the
`token_hash` confirm flow. **These must be flipped together with the Session 1
deploy** — the code ships first (it handles both the old and new link styles),
then these templates replace the defaults in the dashboard.

## Where to paste

Supabase Dashboard → project `zugunlctgpytgyxftllv` → **Authentication →
Email Templates**. Paste the full file contents (including `<!DOCTYPE html>`)
into the matching template slot:

| File | Dashboard template slot | Suggested subject |
|---|---|---|
| `confirm-signup.html` | Confirm signup | Confirm your email — your palate awaits |
| `reset-password.html` | Reset password | Set a new password for Sommeasy |
| `magic-link.html` | Magic Link | Your Sommeasy sign-in link |
| `email-change.html` | Change Email Address | Confirm your new email for Sommeasy |

## How the links work

Every button points at the token_hash confirm route:

```
{{ .SiteURL }}/api/auth/confirm?token_hash={{ .TokenHash }}&type=<type>&next=<path>
```

- `type` per template: `signup`, `recovery` (→ `next=/update-password`),
  `magiclink`, `email_change`.
- `token_hash` is verified server-side via `verifyOtp` — **the link works in
  any browser**, not just the one that started the flow. This is the whole
  point of moving off `{{ .ConfirmationURL }}`: the old PKCE `?code=` links
  only work in the originating browser.
- `next` is validated server-side (same-origin paths only) — a tampered
  `next` falls back to `/`.

## Sequencing / rollback safety

- **Until these are pasted**, the default `{{ .ConfirmationURL }}` templates
  keep working *same-browser* through the rebuilt `/api/auth/callback`.
  Cross-browser clicks (sign up on laptop, open email on phone) only work
  after the flip.
- **Site URL** (Auth → URL Configuration) must be `https://sommeasy.wine`
  before flipping, or `{{ .SiteURL }}` will mint links pointing at the wrong
  host. `http://localhost:3000` links for local testing come from the
  redirect allowlist, not these templates.
- Rollback is pasting the previous template back — the code path for
  `?code=` links stays live either way.

## Design notes

- Georgia serif stack echoes the Playfair Display brand type without relying
  on web fonts (most email clients won't load them).
- Brand palette: burgundy `#8B2332`, forest `#1B3D2F`, cream `#F5F0E8`.
- Table layout + inline styles for email-client compatibility; single-column,
  480px card, mobile-safe.
