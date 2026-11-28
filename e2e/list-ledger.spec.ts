import { test, expect, type Page, type Request } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import path from "path";
import { RecommendPage } from "./fixtures/sommeasy-page";
import { testDb, countEvents, latestEvent } from "./fixtures/test-db";

/**
 * The List Ledger (hard-fail guard) — Nov 27, 2026.
 *
 * A photographed, uploaded or linked list is kept in a de-identified
 * catalog (migration 015): one sitting, one observation, on the fullest
 * version of the list the sitting read. This guard holds the page to it:
 *
 *   - a scan writes ONE test-origin list and ONE observation, keyed by the
 *     list_ref the sitting's menu_analyzed carries
 *   - "Add another page" leaves one observation, on the fuller list; the
 *     partial version is gone
 *   - a list with no printed restaurant makes no restaurant; a printed name
 *     and city do — and a linked list names its host
 *   - a pasted list writes nothing (no request, list_ref null)
 *   - a catalog that never answers changes nothing on the page
 *
 * The scan, link and Somm routes are SCRIPTED (no Claude calls) — the
 * picks on screen are the engine's own. The catalog is read with the
 * SERVICE ROLE (SUPABASE_SERVICE_ROLE_KEY from .env.local), the only role
 * that can see it; afterEach removes exactly the rows this file wrote. The
 * dev server writes origin "test" (no VERCEL_ENV), so nothing here can reach
 * the admin views. Rich account; nothing rated or chosen; menu_analyzed by
 * delta.
 */

const FIXTURES = path.join(__dirname, "fixtures", "images");

type Wine = Record<string, string | number | boolean | null>;
const wine = (name: string, f: Wine = {}): Wine => ({
  name, vintage: null, price: 60, glass_price: null, section: "Red", is_btg: false,
  color: "red", variety: null, region: null, country: null, producer: null, ...f,
});

// Distinct wines per test, so no two tests share a list version
const PAGE_ONE: Wine[] = [
  wine("Kanonkop Pinotage, Stellenbosch 2019", { price: 68, glass_price: 17, vintage: "2019", variety: "Pinotage", region: "Stellenbosch", country: "South Africa", producer: "Kanonkop" }),
  wine("Meerlust Rubicon, Stellenbosch 2018", { price: 95, vintage: "2018", variety: "Cabernet Sauvignon blend", region: "Stellenbosch", country: "South Africa", producer: "Meerlust" }),
  wine("Ledger Test House Red", { price: 41, glass_price: 11 }),
];
const PAGE_TWO: Wine[] = [
  wine("Louis Michel Chablis 2022", { price: 66, vintage: "2022", color: "white", section: "White", variety: "Chardonnay", region: "Burgundy", country: "France", producer: "Louis Michel" }),
  wine("Joseph Drouhin Chorey-les-Beaune 2021", { price: 74, vintage: "2021", variety: "Pinot Noir", region: "Burgundy", country: "France", producer: "Joseph Drouhin" }),
  wine("Ledger Test House White", { price: 39, color: "white", section: "White" }),
];
const NAMELESS: Wine[] = [
  wine("Mullineux Syrah, Swartland 2020", { price: 72, variety: "Syrah", region: "Swartland", country: "South Africa" }),
  wine("Hamilton Russell Pinot Noir, Hemel-en-Aarde 2021", { price: 88, variety: "Pinot Noir", region: "Hemel-en-Aarde", country: "South Africa" }),
];
const BLACKHOLE: Wine[] = [
  wine("Ken Forrester Old Vine Chenin Blanc 2022", { price: 52, color: "white", section: "White", variety: "Chenin Blanc", region: "Stellenbosch", country: "South Africa" }),
  wine("Kanonkop Kadette Cape Blend 2021", { price: 48, variety: "Pinotage blend", region: "Stellenbosch", country: "South Africa" }),
];

// Invented restaurants, marked so a stray row is recognizable
const PRINTED = { name: "[e2e] Ledger Harbour Table", city: "Testville", website: null };
const NOTHING_PRINTED = { name: null, city: null, website: null };
const LINK = "https://www.ledger-harbour.e2e-example.com/wine-list";
const LINK_HOST = "ledger-harbour.e2e-example.com";

function catalogDb(): SupabaseClient {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("list-ledger.spec needs SUPABASE_SERVICE_ROLE_KEY in .env.local — the catalog is service-role only");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

const blockSomm = (page: Page) => page.route("**/api/somm-picks", (route) => route.abort());
/** Script the scan route: each call answers with the next page. */
function scriptScans(page: Page, pages: { wines: Wine[]; restaurant: Record<string, string | null> }[]) {
  let call = 0;
  return page.route("**/api/parse-wine-list", (route) => {
    const p = pages[Math.min(call++, pages.length - 1)];
    return route.fulfill({ json: { wines: p.wines, metadata: { restaurant: p.restaurant }, rawText: "", source: "vision" } });
  });
}
const listBody = (req: Request) => JSON.parse(req.postData() || "{}");
const isListWrite = (r: { url(): string; request?: () => Request }) => r.url().includes("/api/lists");

// Everything this file wrote, removed after each test: its observations,
// then any list version and restaurant nothing points at any more
const written: string[] = [];
async function removeWritten() {
  if (written.length === 0) return;
  const db = catalogDb();
  const refs = [...new Set(written.splice(0))];
  const { data: obs } = await db.from("wine_list_observations").select("list_id").in("list_ref", refs);
  const listIds = [...new Set((obs || []).map((o) => o.list_id))];
  await db.from("wine_list_observations").delete().in("list_ref", refs);
  for (const id of listIds) {
    const { count } = await db.from("wine_list_observations").select("id", { count: "exact", head: true }).eq("list_id", id);
    if ((count ?? 0) > 0) continue;
    const { data: list } = await db.from("wine_lists").select("restaurant_id, origin").eq("id", id).maybeSingle();
    if (!list || list.origin !== "test") continue;
    await db.from("wine_lists").delete().eq("id", id);
    if (list.restaurant_id) {
      const { count: left } = await db.from("wine_lists").select("id", { count: "exact", head: true }).eq("restaurant_id", list.restaurant_id);
      if ((left ?? 0) === 0) await db.from("restaurants").delete().eq("id", list.restaurant_id);
    }
  }
}

async function observation(listRef: string) {
  const { data } = await catalogDb()
    .from("wine_list_observations")
    .select("list_id, observed_on, source_kind, origin, wine_lists(id, wine_count, priced_count, btg_count, origin, source_kind, source_host, read_name, read_city, restaurant_id, times_seen, parser_version)")
    .eq("list_ref", listRef);
  return data || [];
}

async function startScan(page: Page, pages: Parameters<typeof scriptScans>[1]) {
  await blockSomm(page);
  await scriptScans(page, pages);
  const rec = new RecommendPage(page);
  await rec.goto();
  await expect(page.getByRole("heading", { name: "Match the wine list" })).toBeVisible({ timeout: 20_000 });
  return rec;
}

// A run that died (or a mutant that minted refs this file never saw) can
// leave this file's lists behind; they'd turn a fresh read into a second
// sighting. Every fixture list carries one of these lines, so stale test
// rows are found by them and removed before the file runs.
const MARKERS = ["Ledger Test House Red", "Ledger Test House White", "Mullineux Syrah, Swartland 2020",
  "Ken Forrester Old Vine Chenin Blanc 2022", "Kanonkop Paul Sauer, Stellenbosch 2019", "Ledger Test Text Red"];
async function removeStale() {
  const db = catalogDb();
  const { data: items } = await db.from("wine_list_items").select("list_id").in("name", MARKERS);
  const ids = [...new Set((items || []).map((i) => i.list_id))];
  if (ids.length === 0) return;
  const { data: obs } = await db.from("wine_list_observations").select("list_ref").in("list_id", ids).eq("origin", "test");
  written.push(...(obs || []).map((o) => o.list_ref));
  await removeWritten();
}

test.describe("The List Ledger", () => {
  test.beforeAll(async () => { await removeStale(); });
  // Every list_ref the page sends is recorded, awaited or not, so afterEach
  // removes everything the test wrote
  test.beforeEach(async ({ page }) => {
    page.on("request", (r) => {
      if (!isListWrite(r)) return;
      try { const ref = JSON.parse(r.postData() || "{}").list_ref; if (ref && !written.includes(ref)) written.push(ref); } catch { /* not ours */ }
    });
  });
  test.afterEach(async () => { await removeWritten(); });

  test("a scan keeps one test-origin list and one observation, keyed by the sitting's list_ref", async ({ page }) => {
    const { supabase, userId } = await testDb();
    const before = await countEvents(supabase, userId, "menu_analyzed");
    const rec = await startScan(page, [{ wines: PAGE_ONE, restaurant: NOTHING_PRINTED }]);

    const write = page.waitForResponse(isListWrite, { timeout: 30_000 });
    await rec.uploadFile("label-test-01.jpg");
    await expect(rec.resultsHeading).toBeVisible({ timeout: 30_000 });
    const res = await write;
    expect(res.status(), "the catalog write lands").toBe(200);
    const body = listBody(res.request());
    written.push(body.list_ref);

    // The request is about the list — nothing about who read it
    expect(Object.keys(body).sort()).toEqual(["items", "list_ref", "restaurant", "source_host", "source_kind"]);
    expect(body.list_ref).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(JSON.stringify(body)).not.toMatch(new RegExp(`${userId}|user_?id|email`, "i"));
    expect(body.source_kind).toBe("scan");
    expect(body.items).toHaveLength(3);
    expect(body.items[0]).toMatchObject({ name: "Kanonkop Pinotage, Stellenbosch 2019", price: 68, glass_price: 17, producer: "Kanonkop", region: "Stellenbosch", vintage: "2019" });

    // menu_analyzed carries the same key — the diner's own note of the list
    await expect.poll(() => countEvents(supabase, userId, "menu_analyzed"), { timeout: 15_000 }).toBe(before + 1);
    const event = await latestEvent(supabase, userId, "menu_analyzed");
    expect((event!.payload as Record<string, unknown>).list_ref).toBe(body.list_ref);

    // One list, one observation, test origin, no restaurant
    const obs = await observation(body.list_ref);
    expect(obs).toHaveLength(1);
    expect(obs[0]).toMatchObject({ source_kind: "scan", origin: "test" });
    expect(obs[0].observed_on).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const list = obs[0].wine_lists as unknown as Record<string, unknown>;
    expect(list).toMatchObject({ wine_count: 3, priced_count: 3, btg_count: 0, origin: "test", source_kind: "scan", restaurant_id: null, read_name: null });
    const { data: items } = await catalogDb().from("wine_list_items")
      .select("position, name, bottle_price, glass_price, vintage, producer, region").eq("list_id", obs[0].list_id).order("position");
    expect(items!.map((i) => [i.position, i.name, Number(i.bottle_price)])).toEqual([
      [1, "Kanonkop Pinotage, Stellenbosch 2019", 68], [2, "Meerlust Rubicon, Stellenbosch 2018", 95], [3, "Ledger Test House Red", 41],
    ]);
    expect(Number(items![0].glass_price)).toBe(17);
  });

  test("Add another page: one observation, on the fuller list — the partial version is gone; a printed name and city name the restaurant", async ({ page }) => {
    const rec = await startScan(page, [
      // The first page prints nothing; the second prints the restaurant — the first page that prints one wins
      { wines: PAGE_ONE, restaurant: NOTHING_PRINTED },
      { wines: PAGE_TWO, restaurant: PRINTED },
    ]);

    const first = page.waitForResponse(isListWrite, { timeout: 30_000 });
    await rec.uploadFile("label-test-01.jpg");
    await expect(rec.resultsHeading).toBeVisible({ timeout: 30_000 });
    const firstRes = await first;
    const ref = listBody(firstRes.request()).list_ref;
    written.push(ref);
    const [obsOne] = await observation(ref);
    const partialId = obsOne.list_id;
    expect((obsOne.wine_lists as unknown as Record<string, unknown>).wine_count).toBe(3);

    const second = page.waitForResponse(isListWrite, { timeout: 30_000 });
    const [chooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.getByRole("button", { name: /Add another page/ }).click(),
    ]);
    await chooser.setFiles(path.join(FIXTURES, "label-test-01.jpg"));
    const secondRes = await second;
    expect(secondRes.status()).toBe(200);
    const secondBody = listBody(secondRes.request());
    expect(secondBody.list_ref, "the same sitting, the same key").toBe(ref);
    expect(secondBody.items, "each commit sends the whole list read so far").toHaveLength(6);
    expect(secondBody.restaurant).toEqual(PRINTED);

    const obs = await observation(ref);
    expect(obs, "one sitting, one observation").toHaveLength(1);
    const list = obs[0].wine_lists as unknown as Record<string, unknown>;
    expect(obs[0].list_id).not.toBe(partialId);
    expect(list).toMatchObject({ wine_count: 6, times_seen: 1, read_name: PRINTED.name, read_city: PRINTED.city });
    const { data: gone } = await catalogDb().from("wine_lists").select("id").eq("id", partialId);
    expect(gone, "the partial version nothing points at is removed").toHaveLength(0);

    // A printed name with a printed city names the restaurant
    expect(list.restaurant_id).toBeTruthy();
    const { data: restaurant } = await catalogDb().from("restaurants").select("name, name_key, city, website_host").eq("id", list.restaurant_id as string).single();
    expect(restaurant).toEqual({ name: PRINTED.name, name_key: "e2e ledger harbour table", city: "Testville", website_host: null });
  });

  test("a list with nothing printed makes no restaurant; a printed name alone stays on the list as read", async ({ page }) => {
    const rec = await startScan(page, [{ wines: NAMELESS, restaurant: { name: "[e2e] Ledger Name Alone", city: null, website: null } }]);
    const write = page.waitForResponse(isListWrite, { timeout: 30_000 });
    await rec.uploadFile("label-test-01.jpg");
    const res = await write;
    const ref = listBody(res.request()).list_ref;
    written.push(ref);
    const [obs] = await observation(ref);
    const list = obs.wine_lists as unknown as Record<string, unknown>;
    expect(list).toMatchObject({ restaurant_id: null, read_name: "[e2e] Ledger Name Alone", read_city: null });
    const { count } = await catalogDb().from("restaurants").select("id", { count: "exact", head: true }).eq("name", "[e2e] Ledger Name Alone");
    expect(count, "a name alone is never a restaurant").toBe(0);
  });

  test("a linked list names its host; a pasted list writes nothing", async ({ page }) => {
    const { supabase, userId } = await testDb();
    await blockSomm(page);
    await page.route("**/api/fetch-menu", (route) => route.fulfill({
      json: { text: "REDS\nKanonkop Paul Sauer, Stellenbosch 2019    $120\nMullineux Syrah, Swartland 2020    $72\n", source: "html" },
    }));
    const rec = new RecommendPage(page);
    await rec.goto();
    await expect(page.getByRole("heading", { name: "Match the wine list" })).toBeVisible({ timeout: 20_000 });

    const write = page.waitForResponse(isListWrite, { timeout: 30_000 });
    await rec.fetchUrl(LINK);
    const res = await write;
    const body = listBody(res.request());
    written.push(body.list_ref);
    expect(body).toMatchObject({ source_kind: "url", source_host: LINK_HOST });
    const [obs] = await observation(body.list_ref);
    const list = obs.wine_lists as unknown as Record<string, unknown>;
    expect(list).toMatchObject({ source_kind: "url", source_host: LINK_HOST, wine_count: 2 });
    const { data: restaurant } = await catalogDb().from("restaurants").select("website_host").eq("id", list.restaurant_id as string).single();
    expect(restaurant!.website_host).toBe(LINK_HOST);
    await expect(rec.resultsHeading).toBeVisible({ timeout: 30_000 });

    // A new sitting, pasted: nothing is sent, and menu_analyzed says so
    await rec.reset();
    const listWrites: string[] = [];
    page.on("request", (r) => { if (isListWrite(r)) listWrites.push(r.url()); });
    const before = await countEvents(supabase, userId, "menu_analyzed");
    await rec.pasteAndAnalyze("REDS\nKanonkop Pinotage, Stellenbosch 2019    $68\nMeerlust Rubicon, Stellenbosch 2018    $95\n");
    await expect(rec.resultsHeading).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => countEvents(supabase, userId, "menu_analyzed"), { timeout: 15_000 }).toBe(before + 1);
    const event = await latestEvent(supabase, userId, "menu_analyzed");
    expect((event!.payload as Record<string, unknown>).list_ref, "a pasted list has no catalog key").toBeNull();
    expect(listWrites, "a pasted list is never sent").toEqual([]);
  });

  test("a scan that fell back to editable text is never kept — even though it began as a photo", async ({ page }) => {
    const { supabase, userId } = await testDb();
    await blockSomm(page);
    // Path B: the scan route answers with text, which opens for review — text the diner can edit
    await page.route("**/api/parse-wine-list", (route) => route.fulfill({
      json: { rawText: "REDS\nKanonkop Pinotage, Stellenbosch 2019    $68\nLedger Test Text Red    $44\n", source: "vision_text" },
    }));
    const listWrites: string[] = [];
    page.on("request", (r) => { if (isListWrite(r)) listWrites.push(r.url()); });
    const rec = new RecommendPage(page);
    await rec.goto();
    await expect(page.getByRole("heading", { name: "Match the wine list" })).toBeVisible({ timeout: 20_000 });
    await rec.uploadFile("label-test-01.jpg");
    await expect(rec.wineListTextarea).toBeVisible({ timeout: 30_000 });
    const before = await countEvents(supabase, userId, "menu_analyzed");
    await rec.analyzeButton.click();
    await expect(rec.resultsHeading).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => countEvents(supabase, userId, "menu_analyzed"), { timeout: 15_000 }).toBe(before + 1);
    const event = await latestEvent(supabase, userId, "menu_analyzed");
    expect((event!.payload as Record<string, unknown>).source, "it began as a scan").toBe("scan");
    expect((event!.payload as Record<string, unknown>).list_ref, "but went through editable text").toBeNull();
    expect(listWrites).toEqual([]);
  });

  test("a catalog that never answers changes nothing on the page", async ({ page }) => {
    const { supabase, userId } = await testDb();
    const rec = await startScan(page, [{ wines: BLACKHOLE, restaurant: NOTHING_PRINTED }]);

    // The same list twice: first with the catalog answering, then never answering
    const write = page.waitForResponse(isListWrite, { timeout: 30_000 });
    await rec.uploadFile("label-test-01.jpg");
    await expect(rec.resultsHeading).toBeVisible({ timeout: 30_000 });
    const firstRef = listBody((await write).request()).list_ref;
    written.push(firstRef);
    const heading = await rec.resultsHeading.textContent();
    const picks = await rec.getPickNames();
    expect(picks.length).toBeGreaterThan(0);

    const held: Request[] = [];
    await page.route("**/api/lists", (route) => { held.push(route.request()); /* never answered */ });
    await rec.reset();
    const before = await countEvents(supabase, userId, "menu_analyzed");
    await rec.uploadFile("label-test-01.jpg");
    await expect(rec.resultsHeading).toBeVisible({ timeout: 30_000 });
    await expect.poll(() => held.length, { timeout: 15_000 }).toBe(1);
    expect(listBody(held[0]).list_ref, "Scan another list is a new sitting, with a new key").not.toBe(firstRef);
    await expect(rec.resultsHeading).toHaveText(heading || "");
    expect(await rec.getPickNames()).toEqual(picks);
    await expect(rec.errorMessage).toHaveCount(0);
    await expect(page.getByTestId("add-page-error")).toHaveCount(0);
    // the ledger still records the analysis, with the (unwritten) key
    await expect.poll(() => countEvents(supabase, userId, "menu_analyzed"), { timeout: 15_000 }).toBe(before + 1);
    const event = await latestEvent(supabase, userId, "menu_analyzed");
    expect((event!.payload as Record<string, unknown>).list_ref).toBe(listBody(held[0]).list_ref);
    // …and the page still works: Scan another list returns to the input
    await rec.reset();
    await expect(rec.scanButton).toBeVisible();
  });
});
