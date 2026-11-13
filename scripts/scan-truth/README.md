# scan-truth

What a scanned wine list becomes, measured — the harness behind "Scans tell
the truth" (Nov 12, 2026). Nothing here is run by the unit suites, Playwright
or the build. Only `scan.mjs` touches the network (the Anthropic API, through
the real scan route); nothing touches Supabase, an account or `wine_events`.

## Why it exists

Two real scans read 14 and 25 wines and matched nothing. The ledger kept
counts, not lists, so the cause had to be reproduced:

- **The page heading decided what was a bottle.** Under "WINES BY THE GLASS &
  BOTTLE" the route flagged every wine `is_btg: true` — bottle price and all —
  in 14 of 14 and 25 of 25 wines, every run. Under "WINE", none. The engine
  dropped every flagged wine: 25 read, 0 scored, 0 matched.
- **The photo scorer had its own lookups.** "Syrah", "Pinot Grigio",
  "Grenache", "USA", "California", "Western Cape" and "Loire" resolved to
  nothing; a pasted line with the same words scored.

## The pieces

| file | what it does | cost |
|---|---|---|
| `lists.json` | The lists (reconstructions: every wine with a glass and a bottle price), the two headings each is drawn under, a control list with a real by-the-glass section, and palates modeled on the accounts that drew the blanks | — |
| `render.py <dir>` | Draws each list as a JPEG (`sept19-plain.jpg`, `sept19-glass.jpg`, …) | free |
| `scan.mjs <dir> <out.json> [runs] [only]` | Sends each image through the REAL `/api/parse-wine-list` handler and keeps what came back; prints `is_btg` / `price` / `glass_price` tallies per run | ~$0.03–0.05 a scan |
| `measure.mjs <before>` | Each list × palate, before and after: read, left out, scored, matched, picks — photographed (the captured replies) and pasted | free |
| `corpus-diff.mjs <before> [out.json]` | The before/after diff CLAUDE.md prescribes for a matcher change: ~22k pasted lines and ~10.7k photographed wines built from wineUnified, through both engines; lists every wine that scores lower | free, ~1 min |

`<before>` is the engine as it was:

```bash
mkdir -p /tmp/before && git archive d3e7e09 src/lib | tar -x -C /tmp/before
```

## The captured scans

`src/lib/__tests__/fixtures/scanTruthCaptured.json` holds the first run of
each image — `before` under the prompt as it stood at d3e7e09, `after` under
the prompt that asks for the bottle price and the glass price apart.
`scanTruth.test.js` reads it. To re-capture after a prompt or model change:

```bash
python3 scripts/scan-truth/render.py /tmp/scan-images
```

```bash
node scripts/scan-truth/scan.mjs /tmp/scan-images /tmp/captured.json 3
```

then put run 1 of each image under `after` (keep `before` as it is — it is
the record of what the old prompt did). Never edit a captured reply by hand.

## What was measured (Nov 12, 2026, claude-sonnet-4-6)

`is_btg: true` per scan, old prompt → new prompt:

| image | old | new |
|---|---|---|
| sept19, "WINE", two price columns | 0 of 14 (5 runs) | 0 of 14 (3 runs) |
| sept19, "WINES BY THE GLASS & BOTTLE" | **14 of 14** (3 runs) | 0 of 14 (3 runs) |
| aug8, "WINE", "13 / 50" | 0 of 25 (3 runs) | 0 of 25 (3 runs) |
| aug8, "WINES BY THE GLASS & BOTTLE" | **25 of 25** (5 runs) | 0 of 25 (3 runs) |
| mixed: six glass pours, eight bottles | 6 of 14 (3 runs) | 6 of 14 (3 runs) |

Under the new prompt every pair came back with both `price` and
`glass_price` (78 of 78 wines per round, 12 scans), and the six real glass
pours came back `price: null`, `glass_price` set.

The lists under the by-the-glass heading, before → after (`measure.mjs`):

| list, palate | read | scored | matched | picks |
|---|---|---|---|---|
| sept19, palate a | 14 | 0 → 14 | 0 → 10 | 0 → 5 |
| sept19, palate b | 14 | 0 → 14 | 0 → 13 | 0 → 5 |
| aug8 | 25 | 0 → 25 | 0 → 23 | 0 → 5 |
| aug8, pasted | 26 → 25 | 1 → 25 | 0 → 22 | 0 → 5 |

The prompt is what rescues a photographed page (old prompt + new engine is
still 0: a flagged wine with one price and no glass price can't be told from
a real glass pour). The engine change is what rescues the pasted page, and
what the photo scorer reads once the wines are scored (aug8 under "WINE":
21 → 23 matched, scores total 46.2 → 52.2).
