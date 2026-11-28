// listLedger.js — The List Ledger's rules (Nov 2026): what a kept wine list
// is, how it's capped, when it names a restaurant, and how the page sends it.
//
// Dependency-free on purpose (the sommPicks / matchTerms pattern): the page
// imports it to build the request, the route imports it to shape what
// arrived, and its tests run on the real module in plain node.
//
// The catalog is DE-IDENTIFIED (Ed, Nov 24, 2026). Nothing built here
// carries a user id, an email, an IP or a location, and nothing the page
// sends is trusted: `shapeListBody` keeps only the fields it names, trims
// and caps every string, drops junk lines, and never throws.
// listLedger.test.js source-scans the catalog write path for user fields.
//
// Restaurant identity is STRONG EVIDENCE ONLY — never a guess:
//   1. a shared link's web address (lowercase, no www), unless the host is a
//      hosting platform rather than the restaurant (HOSTING_PLATFORMS);
//   2. a website printed on the list (same rule);
//   3. a printed name TOGETHER with a printed city.
// A printed name alone stays on the list row as read and names no one.

// What the scan prompt and this module read lists with; rides every list row
export const LIST_PARSER_VERSION = "2026-11-27";

export const LIST_SOURCE_KINDS = ["scan", "pdf", "url"];

export const LIST_CAPS = Object.freeze({
  items: 1000,
  name: 200,
  field: 100,     // producer, grape, region, country, section
  vintage: 12,
  color: 20,
  restaurantName: 120,
  city: 80,
  website: 200,
  host: 253,
  price: 50000,   // a bottle or a glass above this isn't a price
});

// Hosts that carry other people's files — a list served from one says
// nothing about whose list it is. Matched as the host or any subdomain.
export const HOSTING_PLATFORMS = Object.freeze([
  // site builders and their file CDNs
  "squarespace.com", "squarespace-cdn.com", "sqspcdn.com", "wix.com", "wixsite.com", "wixstatic.com",
  "weebly.com", "editmysite.com", "godaddysites.com", "img1.wsimg.com", "wsimg.com", "square.site",
  "webflow.io", "website-files.com", "framer.website", "framerusercontent.com", "carrd.co",
  "wordpress.com", "wp.com", "sites.google.com", "canva.site", "canva.com",
  // documents and file shares
  "docs.google.com", "drive.google.com", "googleusercontent.com", "storage.googleapis.com",
  "firebasestorage.googleapis.com", "dropbox.com", "dropboxusercontent.com", "box.com", "onedrive.live.com",
  "1drv.ms", "sharepoint.com", "icloud.com", "issuu.com", "scribd.com", "yumpu.com", "flipsnack.com",
  "notion.site", "notion.so",
  // cloud storage and CDNs
  "amazonaws.com", "cloudfront.net", "blob.core.windows.net", "azureedge.net", "cloudinary.com",
  "imgix.net", "ctfassets.net", "filesusr.com", "shopify.com", "shopifycdn.com", "cdn.shopify.com",
  "github.io", "githubusercontent.com", "netlify.app", "vercel.app", "pages.dev",
  // wine-list and menu platforms
  "binwise.com", "sevenrooms.com", "toasttab.com", "popmenu.com", "popmenucloud.com", "getbento.com",
  "bentobox.com", "bbot.menu", "menufy.com", "singleplatform.com", "allmenus.com", "menupages.com",
  "opentable.com", "resy.com", "tock.com", "exploretock.com", "yelp.com", "tripadvisor.com",
  "untappd.com", "wine-searcher.com", "instagram.com", "facebook.com", "linktr.ee",
]);

const str = (v, max) => {
  if (typeof v !== "string") return null;
  const t = v.replace(/\s+/g, " ").trim();
  return t ? t.slice(0, max) : null;
};

const fold = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** A restaurant name for comparison: folded, "&" as "and", no leading "the". */
export function nameKey(name) {
  const k = fold(name).replace(/^the(\s+|$)/, "").trim();
  return k || null;
}

/** A wine's name for comparison across lists: folded, its vintage and "NV" taken out. */
export function bottleKey(name) {
  return fold(name)
    .replace(/\b(19|20)\d{2}\b/g, " ")
    .replace(/\bn v\b|\bnv\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** A price, or null: a finite positive number no larger than LIST_CAPS.price, to the cent. */
export function priceOrNull(v) {
  const n = typeof v === "string" && /^\s*\d+(\.\d+)?\s*$/.test(v) ? Number(v) : v;
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0 || n > LIST_CAPS.price) return null;
  return Math.round(n * 100) / 100;
}

const HOST_RE = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/**
 * A web address's host: lowercase, no "www.", no port, no path. Takes a
 * URL or a bare "www.example.com/wine". Not a public hostname → null
 * (an IP address, "localhost", junk).
 */
export function normalizeHost(input) {
  if (typeof input !== "string") return null;
  let s = input.trim().toLowerCase();
  if (!s || s.length > 2048) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//.test(s)) s = "http://" + s.replace(/^\/+/, "");
  let host;
  try {
    host = new URL(s).hostname;
  } catch {
    return null;
  }
  host = host.replace(/\.$/, "").replace(/^www\d*\./, "");
  return HOST_RE.test(host) ? host : null;
}

/** Whether a (normalized) host belongs to a platform that carries other people's files. */
export function isHostingPlatform(host) {
  if (typeof host !== "string" || !host) return false;
  return HOSTING_PLATFORMS.some((p) => host === p || host.endsWith("." + p));
}

/** A host that can name a restaurant: normalized, and not a hosting platform. */
export function restaurantHost(input) {
  const host = normalizeHost(input);
  return host && !isHostingPlatform(host) ? host : null;
}

/** "live" only on the production deployment; e2e, dev and previews write "test". */
export function listOrigin(env = {}) {
  return env && env.VERCEL_ENV === "production" ? "live" : "test";
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const isListRef = (v) => typeof v === "string" && UUID_RE.test(v);

/** A full v4 UUID for one sitting (the verdict session id is 8 characters — too short for a catalog key). */
export function mintListRef() {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  } catch { /* an insecure context — fall through */ }
  const bytes = new Array(16);
  try {
    if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
      const b = crypto.getRandomValues(new Uint8Array(16));
      for (let i = 0; i < 16; i++) bytes[i] = b[i];
    }
  } catch { /* fall through */ }
  for (let i = 0; i < 16; i++) if (bytes[i] == null) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Whether a scan's metadata.restaurant printed anything at all. */
export function hasRestaurant(r) {
  return Boolean(r && typeof r === "object" && ["name", "city", "website"].some((k) => str(r[k], 400)));
}

const row = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});

/**
 * The page's side: the wines as the engine holds them (entriesFromVision /
 * parseWineList) → the lines the catalog keeps, as they were read. A photo
 * line carries what Vision read; a linked page's line what the text parser
 * read (its section's color and grape — it keeps no section name or vintage).
 */
export function catalogItems(entries) {
  if (!Array.isArray(entries)) return [];
  return entries.map((e) => {
    const w = row(e);
    const vd = row(w.visionData);
    return {
      name: w.name ?? null,
      producer: vd.producer ?? null,
      vintage: w.vintage ?? vd.vintage ?? null,
      price: w.price ?? null,
      glass_price: w.glassPrice ?? null,
      is_btg: w.isByTheGlass === true,
      section: w.section ?? null,
      color: vd.color ?? w.sectionColor ?? null,
      grape: vd.variety ?? w.sectionVarietal ?? null,
      region: vd.region ?? null,
      country: vd.country ?? null,
    };
  });
}

/** The request body the page sends — everything here is about the LIST. */
export function listRequestBody({ listRef, sourceKind, sourceHost, restaurant, entries } = {}) {
  const r = row(restaurant);
  return {
    list_ref: listRef ?? null,
    source_kind: sourceKind ?? null,
    source_host: sourceHost ?? null,
    restaurant: { name: r.name ?? null, city: r.city ?? null, website: r.website ?? null },
    items: catalogItems(entries),
  };
}

function shapeItem(raw, position) {
  const w = row(raw);
  const name = str(w.name, LIST_CAPS.name);
  if (!name) return null;
  const vintage = typeof w.vintage === "number" && Number.isInteger(w.vintage) ? String(w.vintage) : str(w.vintage, LIST_CAPS.vintage);
  return {
    position,
    name,
    name_key: bottleKey(name),
    producer: str(w.producer, LIST_CAPS.field),
    vintage,
    bottle_price: priceOrNull(w.price),
    glass_price: priceOrNull(w.glass_price),
    is_btg: w.is_btg === true,
    section: str(w.section, LIST_CAPS.field),
    color: str(w.color, LIST_CAPS.color),
    grape: str(w.grape, LIST_CAPS.field),
    region: str(w.region, LIST_CAPS.field),
    country: str(w.country, LIST_CAPS.field),
  };
}

/**
 * The route's side: a request body → the list it may keep, or null when
 * there is nothing to keep (no valid list_ref, an unknown source, no line
 * with a name). Only the fields named here survive; nothing throws.
 */
export function shapeListBody(body) {
  try {
    const b = row(body);
    if (!isListRef(b.list_ref)) return null;
    if (!LIST_SOURCE_KINDS.includes(b.source_kind)) return null;
    const lines = Array.isArray(b.items) ? b.items.slice(0, LIST_CAPS.items) : [];
    const items = [];
    for (const raw of lines) {
      const item = shapeItem(raw, items.length + 1);
      if (item) items.push(item);
    }
    if (items.length === 0) return null;
    const r = row(b.restaurant);
    return {
      listRef: b.list_ref.toLowerCase(),
      sourceKind: b.source_kind,
      // a host only means something for a list that came from a link
      sourceHost: b.source_kind === "url" ? normalizeHost(b.source_host) : null,
      read: {
        name: str(r.name, LIST_CAPS.restaurantName),
        city: str(r.city, LIST_CAPS.city),
        website: str(r.website, LIST_CAPS.website),
      },
      items,
      counts: {
        wines: items.length,
        priced: items.filter((i) => i.bottle_price != null).length,
        btg: items.filter((i) => i.is_btg).length,
      },
    };
  } catch {
    return null;
  }
}

/**
 * Who the list belongs to, on strong evidence only (see the header), or
 * null. Returns what the database keys a restaurant by.
 */
export function restaurantEvidence(shaped) {
  const s = row(shaped);
  const read = row(s.read);
  const name = str(read.name, LIST_CAPS.restaurantName);
  const key = name ? nameKey(name) : null;
  const city = str(read.city, LIST_CAPS.city);
  const host = (s.sourceKind === "url" && restaurantHost(s.sourceHost)) || restaurantHost(read.website);
  if (host) return { website_host: host, name, name_key: key, city };
  if (key && city) return { website_host: null, name, name_key: key, city };
  return null;
}

/**
 * The text a list version is fingerprinted from: its origin and its lines
 * (name folded, vintage, bottle and glass price, by the glass), sorted — the
 * same list read twice in another order is the same list. The route hashes it.
 */
export function fingerprintText(shaped, origin) {
  const s = row(shaped);
  const items = Array.isArray(s.items) ? s.items : [];
  const lines = items.map((i) => [fold(i.name), fold(i.vintage), i.bottle_price ?? "", i.glass_price ?? "", i.is_btg ? 1 : 0].join("|"));
  lines.sort();
  return [`origin:${origin === "live" ? "live" : "test"}`, ...lines].join("\n");
}

/**
 * The database function's arguments — the whole write, and nothing about
 * who read the list. listLedger.test.js pins these keys.
 */
export function listWriteArgs(shaped, { origin, observedOn, fingerprint } = {}) {
  const s = row(shaped);
  return {
    p_list_ref: s.listRef,
    p_observed_on: observedOn,
    p_source_kind: s.sourceKind,
    p_source_host: s.sourceHost ?? null,
    p_origin: origin === "live" ? "live" : "test",
    p_parser_version: LIST_PARSER_VERSION,
    p_fingerprint: fingerprint,
    p_wine_count: s.counts?.wines ?? 0,
    p_priced_count: s.counts?.priced ?? 0,
    p_btg_count: s.counts?.btg ?? 0,
    p_read_name: s.read?.name ?? null,
    p_read_city: s.read?.city ?? null,
    p_read_website: s.read?.website ?? null,
    p_restaurant: restaurantEvidence(s),
    p_items: Array.isArray(s.items) ? s.items : [],
  };
}

/** Today in UTC as YYYY-MM-DD — a day, never a time. */
export const observedOn = (now = new Date()) => new Date(now).toISOString().slice(0, 10);

/**
 * Send a list from the page. Same contract as recordEvent: never awaited on
 * the page's path, never throws, never rejects — resolves false on any
 * failure, and a failure changes nothing on screen.
 */
export async function sendList(body, fetchImpl) {
  try {
    const f = fetchImpl || (typeof fetch === "function" ? fetch : null);
    if (!f || !body || !isListRef(body.list_ref)) return false;
    const res = await f("/api/lists", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return Boolean(res && res.ok);
  } catch {
    return false;
  }
}
