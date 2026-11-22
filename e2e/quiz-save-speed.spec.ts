import { test, expect, type Page, type Request } from "@playwright/test";
import { testDb, countEvents } from "./fixtures/test-db";

/**
 * HARD-FAIL GUARD — the first signed-in load after signup shows the palate
 * in about two seconds, on a phone's connection (launch prep Session 2b,
 * Nov 2026).
 *
 * Home's loading view waits on the pending-palate fold-in, and the fold-in
 * waits on saveQuizProfile. Its accumulation sync made two SEQUENTIAL
 * requests per quiz item: ~88 round trips for a full quiz, ~15s on a phone
 * — long enough that a real user reloaded five times. The sync and the
 * reconcile now batch, so the save is a handful of requests whatever the
 * quiz size.
 *
 * The shape: a 45-item quiz waiting on the account (both carriers, as a
 * same-browser signup leaves it), every Supabase request held 150ms (one
 * phone round trip), then sign in and land on "/". The guard counts the
 * Supabase requests from home's profile read to the palate on screen, and
 * times the same window. A request count above the cap means a per-item
 * loop came back; it fails whatever the clock says.
 *
 * Data discipline: the 45 items are a SUPERSET of the rich account's
 * founding answers, so the fold-in writes new rows. afterEach puts the
 * profile row and every dna_accumulation row back exactly as they were and
 * deletes the rows the fold-in added. The one quiz_completed "restore" row
 * stays (wine_events is append-forever: guards read deltas).
 */

const STASH_KEY = "sommeasy.pendingPalate";
const RTT_MS = 150;
// The per-item loop lived on dna_accumulation: the merge's read, then the
// reconcile (a read, at most one write) beside the sync (a read, at most two
// writes) — six at most, whatever the quiz size. It was 2 per quiz item.
const MAX_ACCUMULATION_REQUESTS = 6;
// Everything Supabase from home's profile read to the palate on screen: the
// save (eleven or twelve), the cache refresh, and home's own reads once the
// layout is chosen (timeline, events, journal). It was ~100 for this quiz.
const MAX_REQUESTS = 24;
const TARGET_MS = 2_500;

const LARGE_QUIZ = {
  countries: ["south_africa", "france", "italy", "spain", "us", "australia"],
  regions: {
    south_africa: ["stellenbosch", "swartland", "robertson"],
    france: ["burgundy", "bordeaux", "alsace"],
    italy: ["tuscany", "piedmont", "veneto"],
    spain: ["rioja", "ribera_del_duero", "cava"],
    us: ["sonoma", "columbia_valley", "napa_valley"],
    australia: ["mclaren_vale", "barossa", "margaret_river"],
  },
  estates: {
    stellenbosch: ["kanonkop", "meerlust", "rust_en_vrede"],
    burgundy: ["louis_latour", "albert_bichot"],
    tuscany: ["carpineto", "mazzei"],
    napa_valley: ["v_sattui", "robert_mondavi"],
  },
  varietals: [
    "pinot_noir", "chardonnay", "chenin_blanc", "cabernet_sauvignon", "syrah", "merlot",
    "sauvignon_blanc", "riesling", "nebbiolo", "sangiovese", "tempranillo", "malbec",
  ],
  specificWines: [] as string[],
};
const ITEMS =
  LARGE_QUIZ.countries.length +
  Object.values(LARGE_QUIZ.regions).flat().length +
  Object.values(LARGE_QUIZ.estates).flat().length +
  LARGE_QUIZ.varietals.length;

async function signIn(page: Page) {
  await page.goto("/login");
  await expect(page.locator('button[type="submit"]')).toBeEnabled({ timeout: 15_000 });
  await page.locator('input[type="email"]').fill(process.env.TEST_USER_EMAIL!);
  await page.locator('input[type="password"]').fill(process.env.TEST_USER_PASSWORD!);
  await page.locator('button[type="submit"]').click();
}

const isSupabase = (url: string) => url.includes("/rest/v1/") || url.includes("/auth/v1/");

test.describe("The first signed-in load is quick", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  let snapshot: { profile: Record<string, unknown>; acc: Record<string, unknown>[] } | null = null;

  test.afterEach(async () => {
    const { supabase, userId } = await testDb();
    await supabase.auth.updateUser({ data: { pending_palate: null } });
    if (!snapshot) return;
    const { id: _id, user_id: _u, created_at: _c, updated_at: _up, ...profile } = snapshot.profile;
    const { error: pErr } = await supabase.from("wine_profiles").update(profile).eq("user_id", userId);
    expect(pErr, `profile restore: ${pErr?.message}`).toBeNull();
    const keep = new Set(snapshot.acc.map((r) => r.id as string));
    const { data: now } = await supabase.from("dna_accumulation").select("id").eq("user_id", userId);
    const added = (now || []).map((r) => r.id as string).filter((id) => !keep.has(id));
    if (added.length) {
      const { error } = await supabase.from("dna_accumulation").delete().in("id", added);
      expect(error, `accumulation cleanup: ${error?.message}`).toBeNull();
    }
    for (const row of snapshot.acc) {
      const { id, user_id: _uid, updated_at: _t, ...cols } = row;
      const { error } = await supabase.from("dna_accumulation").update(cols).eq("id", id as string);
      expect(error, `accumulation restore: ${error?.message}`).toBeNull();
    }
    snapshot = null;
  });

  test("HARD-FAIL GUARD: a 45-item quiz folds in at 150ms a round trip in a handful of requests", async ({ page }) => {
    test.setTimeout(120_000);
    expect(process.env.TEST_USER_EMAIL, "TEST_USER_EMAIL missing").toBeTruthy();
    expect(ITEMS, "the quiz is large").toBeGreaterThanOrEqual(44);
    const { supabase, userId } = await testDb();

    const { data: profile } = await supabase.from("wine_profiles").select("*").eq("user_id", userId).single();
    const { data: acc } = await supabase.from("dna_accumulation").select("*").eq("user_id", userId);
    expect(profile, "the rich account has a profile").toBeTruthy();
    snapshot = { profile: profile!, acc: acc || [] };
    const before = await countEvents(supabase, userId, "quiz_completed");

    const createdAt = Date.now();
    const { error: seedErr } = await supabase.auth.updateUser({
      data: { pending_palate: { version: 1, createdAt, answers: LARGE_QUIZ } },
    });
    expect(seedErr, `seeding pending_palate failed: ${seedErr?.message}`).toBeNull();

    // A phone's round trip on every Supabase request, from here on: this
    // machine's own latency to Supabase (measured), topped up to RTT_MS
    const samples: number[] = [];
    for (let i = 0; i < 5; i++) {
      const t = Date.now();
      await supabase.from("wine_profiles").select("user_id").eq("user_id", userId).limit(1);
      samples.push(Date.now() - t);
    }
    const ownRtt = samples.sort((a, b) => a - b)[2];
    const addMs = Math.max(0, RTT_MS - ownRtt);
    await page.route(
      (url) => isSupabase(url.toString()),
      async (route) => {
        if (addMs) await new Promise((r) => setTimeout(r, addMs));
        await route.continue();
      }
    );

    await page.goto("/login");
    await expect(page.locator('button[type="submit"]')).toBeEnabled({ timeout: 15_000 });
    await page.evaluate(
      ([key, answers, at]) =>
        window.localStorage.setItem(key as string, JSON.stringify({ version: 1, createdAt: at, answers, profile: null })),
      [STASH_KEY, LARGE_QUIZ, createdAt] as const
    );

    // The window: home's profile read → the palate on screen
    let start = 0;
    let done = false;
    const requests: string[] = [];
    const onRequest = (req: Request) => {
      const url = req.url();
      if (!isSupabase(url) || done) return;
      if (!start && req.method() === "GET" && url.includes("/rest/v1/wine_profiles") && url.includes("select=*")) {
        start = Date.now();
      }
      if (start) requests.push(`${req.method()} ${new URL(url).pathname.replace(/^.*\/(rest|auth)\/v1\//, "")}`);
    };
    page.on("request", onRequest);

    await signIn(page);
    await page.waitForURL("/", { timeout: 15_000 });
    await expect(page.getByTestId("palate-strip")).toBeVisible({ timeout: 60_000 });
    done = true;
    const elapsed = Date.now() - start;
    await expect(page.getByTestId("welcome-back"), "the fold-in landed").toBeVisible();

    console.log(JSON.stringify({ items: ITEMS, rttMs: RTT_MS, ownRtt, addMs, requests: requests.length, elapsedMs: elapsed, list: requests }));

    expect(start, "home read the profile").toBeGreaterThan(0);
    const accumulation = requests.filter((r) => r.includes("dna_accumulation"));
    expect(accumulation.length, `accumulation requests: ${accumulation.join(", ")}`).toBeLessThanOrEqual(MAX_ACCUMULATION_REQUESTS);
    expect(requests.length, `requests from home's read to the palate: ${requests.join(", ")}`).toBeLessThanOrEqual(MAX_REQUESTS);
    expect(elapsed, "the palate shows in about two seconds").toBeLessThan(TARGET_MS);

    // And it is the save it always was: one restore, every item in the DNA
    await expect
      .poll(async () => (await countEvents(supabase, userId, "quiz_completed")) - before, { timeout: 20_000 })
      .toBe(1);
    const { data: rows } = await supabase
      .from("dna_accumulation").select("dimension, dimension_value, promoted, source").eq("user_id", userId);
    const quizValues = [
      ...LARGE_QUIZ.countries, ...Object.values(LARGE_QUIZ.regions).flat(),
      ...Object.values(LARGE_QUIZ.estates).flat(), ...LARGE_QUIZ.varietals,
    ];
    for (const v of quizValues) {
      const row = (rows || []).find((r) => r.dimension_value === v);
      expect(row?.promoted, `${v} is in the DNA`).toBe(true);
    }
    // The earned fixture keeps its provenance (the ✦)
    const chenin = (rows || []).find((r) => r.dimension === "varietal" && r.dimension_value === "chenin_blanc");
    expect(chenin?.source, "the earned Chenin Blanc stays earned").toBe("auto");
  });
});
