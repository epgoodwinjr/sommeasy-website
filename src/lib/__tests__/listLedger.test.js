// The List Ledger's rules — real module (listLedger.js is dependency-free).
// Run with: node src/lib/__tests__/listLedger.test.js
//
// What these pin: what a kept list is (payload shaping, caps, junk dropped,
// never a throw), the fingerprint, web-address normalization and the
// hosting-platform list, the restaurant identity rules (strong evidence
// only), the origin rule, the page's fire-and-forget send, and a SOURCE
// SCAN that nothing on the catalog write path carries a user field.

import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const L = await import("../listLedger.js");

let passed = 0, failed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.log(`  ✗ ${name}\n    ${err.message}`);
  }
}
function assert(cond, msg) { if (!cond) throw new Error("ASSERT FAILED: " + msg); }
const eq = (a, b, msg) => assert(JSON.stringify(a) === JSON.stringify(b), `${msg}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`);

const REF = "6f1c2b9e-3d4a-4b5c-9d6e-7f8a9b0c1d2e";
const line = (name, extra = {}) => ({ name, price: 60, ...extra });
const body = (extra = {}) => ({ list_ref: REF, source_kind: "scan", items: [line("Kanonkop Pinotage 2019")], ...extra });
const sha = (s) => createHash("sha256").update(s).digest("hex");

console.log("\n=== The List Ledger ===\n");

console.log("--- what a kept list is ---");

await test("a body becomes the list it may keep — only the fields named survive", () => {
  const s = L.shapeListBody({
    ...body({
      items: [{
        name: "  Domaine Jamet   Côte-Rôtie  ", producer: "Jamet", vintage: 2018, price: 140, glass_price: 30,
        is_btg: false, section: "Rhône", color: "red", grape: "Syrah", region: "Côte-Rôtie", country: "France",
        user_id: "u-1", email: "a@b.c", ip: "1.2.3.4",
      }],
    }),
    user_id: "u-1", email: "someone@example.com", ip: "1.2.3.4", location: "home",
  });
  eq(Object.keys(s).sort(), ["counts", "items", "listRef", "read", "sourceHost", "sourceKind"], "top-level keys");
  eq(Object.keys(s.items[0]).sort(), ["bottle_price", "color", "country", "glass_price", "grape", "is_btg", "name", "name_key", "position", "producer", "region", "section", "vintage"].sort(), "item keys");
  assert(s.items[0].name === "Domaine Jamet Côte-Rôtie", "trimmed, single spaces, accents kept");
  assert(s.items[0].vintage === "2018", "a numeric vintage becomes text");
  assert(s.items[0].position === 1, "positions from 1");
  eq(s.counts, { wines: 1, priced: 1, btg: 0 }, "counts");
});

await test("no list_ref, a short session id, or an unknown source keeps nothing", () => {
  assert(L.shapeListBody(body({ list_ref: null })) === null, "null ref");
  assert(L.shapeListBody(body({ list_ref: "a1b2c3d4" })) === null, "an 8-character session id is not a list ref");
  assert(L.shapeListBody(body({ source_kind: "paste" })) === null, "pasted text is never kept");
  assert(L.shapeListBody(body({ source_kind: undefined })) === null, "no source");
});

await test("junk lines are dropped, never thrown; a list with no named line is nothing", () => {
  const s = L.shapeListBody(body({ items: [null, 7, "x", [], { name: "   " }, { name: 42 }, line("Real Wine"), { price: 80 }] }));
  eq(s.items.map((i) => [i.position, i.name]), [[1, "Real Wine"]], "only the named line, renumbered");
  assert(L.shapeListBody(body({ items: [{ name: "" }, null] })) === null, "nothing named");
  assert(L.shapeListBody(body({ items: "lots" })) === null, "items not an array");
  for (const junk of [undefined, null, 0, "x", [], () => 1, { get list_ref() { throw new Error("boom"); } }]) {
    assert(L.shapeListBody(junk) === null, `junk ${typeof junk} → null`);
  }
});

await test("caps: 1,000 lines, and every string trimmed and capped", () => {
  const many = Array.from({ length: 1500 }, (_, i) => line(`Wine ${i}`));
  const s = L.shapeListBody(body({ items: many }));
  assert(s.items.length === 1000, `1,000 lines at most (${s.items.length})`);
  assert(s.items[999].name === "Wine 999", "the first thousand, in order");
  const long = "x".repeat(5000);
  const t = L.shapeListBody(body({
    items: [{ name: long, producer: long, vintage: long, section: long, color: long, grape: long, region: long, country: long }],
    restaurant: { name: long, city: long, website: long },
  }));
  const i = t.items[0];
  assert(i.name.length === L.LIST_CAPS.name, "name capped");
  for (const k of ["producer", "section", "grape", "region", "country"]) assert(i[k].length === L.LIST_CAPS.field, `${k} capped`);
  assert(i.vintage.length === L.LIST_CAPS.vintage && i.color.length === L.LIST_CAPS.color, "vintage and color capped");
  assert(t.read.name.length === L.LIST_CAPS.restaurantName && t.read.city.length === L.LIST_CAPS.city && t.read.website.length === L.LIST_CAPS.website, "the restaurant as read is capped");
});

await test("prices are finite, positive and sane, to the cent; anything else is no price", () => {
  eq([60, 59.999, "48", " 12.5 ", 50000].map(L.priceOrNull), [60, 60, 48, 12.5, 50000], "kept");
  for (const bad of [0, -5, NaN, Infinity, 50000.01, 1e9, "12/48", "$60", "", null, undefined, {}, true]) {
    assert(L.priceOrNull(bad) === null, `${JSON.stringify(bad)} is no price`);
  }
  const s = L.shapeListBody(body({ items: [{ name: "A", price: -1, glass_price: Infinity }, { name: "B", price: 1e7, glass_price: 15 }] }));
  eq(s.items.map((i) => [i.bottle_price, i.glass_price]), [[null, null], [null, 15]], "bad prices dropped, the line kept");
  eq(s.counts, { wines: 2, priced: 0, btg: 0 }, "an unpriced line is not counted as priced");
});

await test("by the glass is strictly true", () => {
  const s = L.shapeListBody(body({ items: [{ name: "A", is_btg: true }, { name: "B", is_btg: "true" }, { name: "C", is_btg: 1 }] }));
  eq(s.items.map((i) => i.is_btg), [true, false, false], "only true");
  assert(s.counts.btg === 1, "counted");
});

await test("a source host is kept only for a linked list, and only as a host", () => {
  assert(L.shapeListBody(body({ source_kind: "url", source_host: "HTTPS://WWW.Harbour-Table.example/wine.pdf?x=1" })).sourceHost === "harbour-table.example", "normalized");
  assert(L.shapeListBody(body({ source_kind: "scan", source_host: "harbour-table.example" })).sourceHost === null, "a photo has no host");
  assert(L.shapeListBody(body({ source_kind: "url", source_host: "10.0.0.1" })).sourceHost === null, "an IP is not a host");
});

console.log("\n--- the page's side ---");

await test("catalogItems reads a photographed line (entriesFromVision's shape) as Vision read it", () => {
  const [i] = L.catalogItems([{
    name: "Chateau X 2015", price: 90, glassPrice: 22, isByTheGlass: false, section: "Bordeaux", vintage: "2015",
    sectionColor: "red", visionData: { color: "red", variety: "Merlot", region: "Pomerol", country: "France", producer: "Chateau X", vintage: "2015" },
    score: 3, reasons: ["x"],
  }]);
  eq(i, { name: "Chateau X 2015", producer: "Chateau X", vintage: "2015", price: 90, glass_price: 22, is_btg: false, section: "Bordeaux", color: "red", grape: "Merlot", region: "Pomerol", country: "France" }, "the raw fields, no score");
});

await test("catalogItems reads a linked page's line (parseWineList's shape): its section's color and grape", () => {
  const [i] = L.catalogItems([{ name: "Raats Chenin Blanc", price: 48, glassPrice: 12, isByTheGlass: false, sectionColor: "white", sectionVarietal: "Chenin Blanc", originalLine: "Raats Chenin Blanc 12/48" }]);
  eq(i, { name: "Raats Chenin Blanc", producer: null, vintage: null, price: 48, glass_price: 12, is_btg: false, section: null, color: "white", grape: "Chenin Blanc", region: null, country: null }, "text-parsed line");
  eq(L.catalogItems("junk"), [], "junk → no lines");
  eq(L.catalogItems([null])[0].name, null, "a junk entry becomes a nameless line the route drops");
});

await test("the request body is about the list — and round-trips through the route's shaping", () => {
  const b = L.listRequestBody({ listRef: REF, sourceKind: "pdf", restaurant: { name: "Vine & Fig", city: "Stellenbosch", website: null, extra: 1 }, entries: [{ name: "A", price: 40 }] });
  eq(Object.keys(b).sort(), ["items", "list_ref", "restaurant", "source_host", "source_kind"], "body keys");
  eq(b.restaurant, { name: "Vine & Fig", city: "Stellenbosch", website: null }, "only what was printed");
  const s = L.shapeListBody(b);
  assert(s && s.sourceKind === "pdf" && s.items[0].bottle_price === 40, "the route keeps it");
});

await test("mintListRef: a full v4 UUID, every time — with or without crypto.randomUUID", () => {
  const refs = new Set(Array.from({ length: 200 }, () => L.mintListRef()));
  assert(refs.size === 200, "unique");
  for (const r of refs) assert(L.isListRef(r), `uuid: ${r}`);
  const saved = Object.getOwnPropertyDescriptor(globalThis, "crypto");
  try {
    Object.defineProperty(globalThis, "crypto", { value: undefined, configurable: true });
    const r = L.mintListRef();
    assert(L.isListRef(r) && r[14] === "4", `fallback is a v4 uuid: ${r}`);
  } finally {
    Object.defineProperty(globalThis, "crypto", saved);
  }
});

await test("hasRestaurant: anything printed at all", () => {
  assert(L.hasRestaurant({ name: "X", city: null, website: null }), "a name");
  assert(L.hasRestaurant({ website: "x.example" }), "a website");
  for (const none of [null, undefined, {}, { name: null, city: "", website: "  " }, "Harbour", []]) assert(!L.hasRestaurant(none), `${JSON.stringify(none)} printed nothing`);
});

await test("sendList never throws or rejects, and sends nothing without a list ref", async () => {
  const calls = [];
  const ok = async (url, init) => { calls.push({ url, init }); return { ok: true }; };
  assert(await L.sendList(L.listRequestBody({ listRef: REF, sourceKind: "scan", entries: [{ name: "A" }] }), ok) === true, "sent");
  assert(calls[0].url === "/api/lists" && calls[0].init.method === "POST" && calls[0].init.headers["Content-Type"] === "application/json", "a JSON POST to /api/lists");
  assert(await L.sendList({ list_ref: null }, ok) === false && calls.length === 1, "no ref, no call");
  assert(await L.sendList(body(), async () => { throw new Error("offline"); }) === false, "a network failure resolves false");
  assert(await L.sendList(body(), async () => ({ ok: false, status: 500 })) === false, "a 500 resolves false");
  assert(await L.sendList(body(), () => { throw new Error("sync"); }) === false, "a throwing fetch resolves false");
  assert(await L.sendList(undefined) === false, "junk");
});

console.log("\n--- web addresses ---");

await test("normalizeHost: lowercase, no www, no port, no path; not a public name → null", () => {
  const cases = {
    "https://www.HarbourTable.example/wine.pdf": "harbourtable.example",
    "http://www2.harbourtable.example:8080/x": "harbourtable.example",
    "WWW.vineandfig.co.za/winelist": "vineandfig.co.za",
    "vineandfig.co.za": "vineandfig.co.za",
    "//cdn.example.com/a.pdf": "cdn.example.com",
    "harbourtable.example.": "harbourtable.example",
  };
  for (const [input, want] of Object.entries(cases)) assert(L.normalizeHost(input) === want, `${input} → ${L.normalizeHost(input)}`);
  for (const bad of ["", "   ", "localhost", "http://127.0.0.1/x", "192.168.0.1", "http://[::1]/", "not a host", "harbour", "@@@", null, 42, "x".repeat(3000)]) {
    assert(L.normalizeHost(bad) === null, `${JSON.stringify(bad)} → null`);
  }
});

await test("the hosting platforms name no restaurant — the host or any subdomain", () => {
  for (const h of ["static1.squarespace.com", "images.squarespace-cdn.com", "abc.wixstatic.com", "docs.google.com", "drive.google.com",
    "lh3.googleusercontent.com", "www.dropbox.com", "dl.dropboxusercontent.com", "binwise.com", "app.binwise.com",
    "mybucket.s3.amazonaws.com", "s3.us-east-1.amazonaws.com", "d111111abcdef8.cloudfront.net", "restaurant.wixsite.com", "issuu.com"]) {
    assert(L.isHostingPlatform(h), `${h} is a platform`);
    assert(L.restaurantHost(h) === null, `${h} names no restaurant`);
  }
  for (const h of ["harbourtable.example", "squarespacebistro.com", "notbinwise.com", "google.com.example"]) {
    assert(!L.isHostingPlatform(h), `${h} is not a platform (no substring matching)`);
  }
  assert(L.restaurantHost("https://www.harbourtable.example/wine") === "harbourtable.example", "a restaurant's own host");
  assert(new Set(L.HOSTING_PLATFORMS).size === L.HOSTING_PLATFORMS.length, "the platform list has no duplicates");
  for (const p of L.HOSTING_PLATFORMS) assert(p === p.toLowerCase() && !p.startsWith("www.") && L.normalizeHost(p) === p, `${p} is written as a normalized host`);
});

console.log("\n--- who the list belongs to ---");

const shaped = (extra) => L.shapeListBody(body(extra));

await test("a shared link's host names the restaurant", () => {
  const e = L.restaurantEvidence(shaped({ source_kind: "url", source_host: "www.harbourtable.example" }));
  eq(e, { website_host: "harbourtable.example", name: null, name_key: null, city: null }, "host");
});

await test("a hosting platform's link names no one — and falls back to what's printed", () => {
  assert(L.restaurantEvidence(shaped({ source_kind: "url", source_host: "static1.squarespace.com" })) === null, "a platform alone");
  const e = L.restaurantEvidence(shaped({ source_kind: "url", source_host: "docs.google.com", restaurant: { website: "www.vineandfig.co.za" } }));
  assert(e?.website_host === "vineandfig.co.za", "the printed website instead");
});

await test("a website printed on the list names it (and never a printed platform address)", () => {
  const e = L.restaurantEvidence(shaped({ restaurant: { name: "The Harbour Table", website: "HarbourTable.example/wine" } }));
  eq(e, { website_host: "harbourtable.example", name: "The Harbour Table", name_key: "harbour table", city: null }, "printed website, name kept beside it");
  assert(L.restaurantEvidence(shaped({ restaurant: { website: "instagram.com/harbourtable" } })) === null, "a printed Instagram names no one");
});

await test("a printed name with a printed city names it; a name alone, or a city alone, names no one", () => {
  eq(L.restaurantEvidence(shaped({ restaurant: { name: "Vine & Fig", city: "Stellenbosch" } })),
    { website_host: null, name: "Vine & Fig", name_key: "vine and fig", city: "Stellenbosch" }, "name + city");
  assert(L.restaurantEvidence(shaped({ restaurant: { name: "Vine & Fig" } })) === null, "a name alone");
  assert(L.restaurantEvidence(shaped({ restaurant: { city: "Stellenbosch" } })) === null, "a city alone");
  assert(L.restaurantEvidence(shaped({ restaurant: { name: "   ", city: "Stellenbosch" } })) === null, "a blank name");
  assert(L.restaurantEvidence(shaped({})) === null, "nothing printed");
  assert(L.restaurantEvidence(null) === null && L.restaurantEvidence("x") === null, "junk");
});

await test("a photo's host never counts — a host means a shared link", () => {
  assert(L.restaurantEvidence({ sourceKind: "scan", sourceHost: "harbourtable.example", read: {} }) === null, "scan + host");
});

await test("a shared link's host comes before a printed website", () => {
  const e = L.restaurantEvidence(shaped({ source_kind: "url", source_host: "harbourtable.example", restaurant: { website: "other.example" } }));
  assert(e.website_host === "harbourtable.example", "link first");
});

await test("nameKey: folded, & as and, no leading The — the same restaurant however it's printed", () => {
  const same = ["The Harbour Table", "HARBOUR TABLE", "Harbour  Table.", "the harbour-table"];
  for (const n of same) assert(L.nameKey(n) === "harbour table", `${n} → ${L.nameKey(n)}`);
  assert(L.nameKey("Café Rosé") === "cafe rose", "accents folded");
  assert(L.nameKey("Vine & Fig") === L.nameKey("Vine and Fig"), "& is and");
  assert(L.nameKey("The") === null && L.nameKey("!!") === null && L.nameKey(null) === null, "nothing left → null");
});

await test("bottleKey: the same bottle across lists, its vintage and NV taken out", () => {
  assert(L.bottleKey("Kanonkop Pinotage 2019") === L.bottleKey("KANONKOP  Pinotage, 2021"), "vintage-free");
  assert(L.bottleKey("Krug Grande Cuvée NV") === "krug grande cuvee", "NV out");
  assert(L.bottleKey("Château Margaux") === "chateau margaux", "accents folded");
  assert(L.bottleKey("Penfolds Bin 389") === "penfolds bin 389", "a bin number is not a vintage");
});

console.log("\n--- the fingerprint ---");

await test("the same list is the same fingerprint — in any order, however it's spaced or cased", () => {
  const a = shaped({ items: [line("Kanonkop Pinotage 2019"), line("Raats Chenin", { price: 48, glass_price: 12 })] });
  const b = shaped({ items: [line("Raats  chenin", { price: "48", glass_price: 12 }), line("KANONKOP PINOTAGE 2019")] });
  assert(L.fingerprintText(a, "test") === L.fingerprintText(b, "test"), "same list");
  assert(sha(L.fingerprintText(a, "test")) === sha(L.fingerprintText(b, "test")), "same hash");
});

await test("a different price, vintage, glass price, by-the-glass flag, line or origin is a different list", () => {
  const base = shaped({ items: [line("A", { vintage: "2019", glass_price: 12 })] });
  const fp = (s, o = "test") => L.fingerprintText(s, o);
  const variants = [
    shaped({ items: [line("A", { vintage: "2019", glass_price: 12, price: 61 })] }),
    shaped({ items: [line("A", { vintage: "2020", glass_price: 12 })] }),
    shaped({ items: [line("A", { vintage: "2019", glass_price: 13 })] }),
    shaped({ items: [line("A", { vintage: "2019", glass_price: 12, is_btg: true })] }),
    shaped({ items: [line("A", { vintage: "2019", glass_price: 12 }), line("B")] }),
  ];
  for (const v of variants) assert(fp(v) !== fp(base), "differs");
  assert(fp(base, "live") !== fp(base, "test"), "origin is part of it — a test read never joins a live list");
  assert(fp(base, "junk") === fp(base, "test"), "anything but live is test");
});

await test("the restaurant is not part of the fingerprint (a list read with and without its header is one list)", () => {
  const a = shaped({ restaurant: { name: "Vine & Fig", city: "Stellenbosch" } });
  const b = shaped({});
  assert(L.fingerprintText(a, "test") === L.fingerprintText(b, "test"), "same list");
});

console.log("\n--- origin, and the write's arguments ---");

await test("origin is live only when VERCEL_ENV is production", () => {
  assert(L.listOrigin({ VERCEL_ENV: "production" }) === "live", "production");
  for (const env of [{ VERCEL_ENV: "preview" }, { VERCEL_ENV: "development" }, {}, { NODE_ENV: "production" }, { VERCEL_ENV: "Production" }, null, undefined]) {
    assert(L.listOrigin(env) === "test", `${JSON.stringify(env)} → test`);
  }
});

await test("observedOn is a day in UTC, never a time", () => {
  assert(L.observedOn(new Date("2026-11-24T23:59:59-05:00")) === "2026-11-25", "UTC day");
  assert(/^\d{4}-\d{2}-\d{2}$/.test(L.observedOn()), "YYYY-MM-DD");
});

await test("listWriteArgs: exactly the database function's arguments — none about a person", () => {
  const s = shaped({ source_kind: "url", source_host: "harbourtable.example", restaurant: { name: "Harbour Table", city: "Hermanus", website: "x" } });
  const args = L.listWriteArgs(s, { origin: "live", observedOn: "2026-11-24", fingerprint: "f" });
  eq(Object.keys(args), ["p_list_ref", "p_observed_on", "p_source_kind", "p_source_host", "p_origin", "p_parser_version", "p_fingerprint",
    "p_wine_count", "p_priced_count", "p_btg_count", "p_read_name", "p_read_city", "p_read_website", "p_restaurant", "p_items"], "argument names");
  assert(args.p_origin === "live" && args.p_parser_version === L.LIST_PARSER_VERSION, "origin and parser version");
  eq(args.p_restaurant, { website_host: "harbourtable.example", name: "Harbour Table", name_key: "harbour table", city: "Hermanus" }, "the evidence");
  assert(L.listWriteArgs(s, { origin: "anything" }).p_origin === "test", "origin is live or test");
  const json = JSON.stringify(args).toLowerCase();
  for (const word of ["user", "email", "\"ip\"", "location", "session"]) assert(!json.includes(word), `no ${word} in the write`);
});

console.log("\n--- no user field on the write path (source scan) ---");

await test("listLedger, listCatalog, the route and migration 015 write nothing about who read a list", () => {
  const root = new URL("../../../", import.meta.url);
  const read = (p) => readFileSync(new URL(p, root), "utf8");
  // Code, comments stripped (the files explain the rule in words)
  const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/--.*$/gm, "");
  const ledger = code(read("src/lib/listLedger.js"));
  const catalog = code(read("src/lib/listCatalog.js"));
  const route = code(read("src/app/api/lists/route.js"));
  const sql = code(read("supabase/migrations/015_list_ledger.sql"));
  for (const [file, src] of [["listLedger.js", ledger], ["listCatalog.js", catalog], ["migration 015", sql]]) {
    for (const re of [/user_?id/i, /\buser\b/i, /email/i, /\bip\b/i, /getClientIp/, /x-forwarded-for/i, /location/i, /auth\.uid/i, /session/i]) {
      assert(!re.test(src), `${file} mentions ${re}`);
    }
  }
  // The route reads the session and the IP — only to decide and to limit.
  // What it writes is recordListObservation(admin, shaped): the list alone
  const call = route.match(/recordListObservation\(([^)]*)\)/);
  assert(call && call[1].replace(/\s/g, "") === "admin,shaped", `the route writes (admin, shaped) only: ${call?.[1]}`);
  assert(/shaped\s*=\s*shapeListBody\(JSON\.parse\(text\)\)/.test(route), "what it writes is shaped from the body alone");
  assert((route.match(/getClientIp\(/g) || []).length === 1 && /checkRateLimit\("lists", getClientIp\(request\)/.test(route), "the IP is read once, for the limiter");
  assert(!/\.from\(/.test(route + catalog), "no table is written directly — only the one function");
  // The catalog tables have no column that could name a reader
  const tables = sql.split(/create table/i).slice(1).join("\n");
  assert(!/\b(user|email|ip_address|ip|location|device|session)\w*\s+(uuid|text|inet)/i.test(tables), "no reader column in the tables");
});

console.log("\n--- the Privacy Policy says so ---");

await test("the policy names the catalog, what it keeps and what it never does — and drops the old claims", async () => {
  const { PRIVACY } = await import("../legalCopy.js");
  const text = JSON.stringify(PRIVACY);
  for (const claim of [
    "catalog of restaurant wine lists",
    "never store the photo, the file or the text you paste",
    "Nothing in the catalog says who read a list",
    "that note is part of your account and leaves with it",
    "Lists stay in the catalog after you delete your account, with nothing pointing to you",
    "A list you paste is never kept",
  ]) assert(text.includes(claim), `missing: ${claim}`);
  for (const gone of ["not the list", "only the wines read from them, while you use the page", "paste a list or share a link, we send it to Anthropic"]) {
    assert(!text.includes(gone), `still says: ${gone}`);
  }
  assert(text.includes("We don’t ask for or track your location."), "the location sentence stays as it is");
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
