// ssrfGuard.js — SSRF defense for /api/fetch-menu (auth overhaul, Session 4).
//
// The route fetches an arbitrary user-supplied URL. Without this, that URL
// could point at cloud metadata (169.254.169.254), the loopback interface,
// or the private network the function runs inside — the classic SSRF that
// turns "fetch a restaurant menu" into "read our infra."
//
// The IP-classification core is dependency-free so the unit suite exercises
// the REAL module (the sommPicks pattern). assertPublicUrl takes an
// injectable `lookup` so the resolver logic is testable without real DNS.
//
// Defense-in-depth, not a silver bullet: resolve-then-validate has a
// theoretical DNS-rebinding TOCTOU window. We shrink it by re-validating
// every redirect hop and capping hops — and by relying on getaddrinfo to
// normalize numeric/octal/hex IPv4 bypasses (http://2130706433 → 127.0.0.1)
// through the SAME validation.

import dns from "node:dns/promises";

export const SSRF_BLOCK_MESSAGE =
  "We can only reach public restaurant sites — that address points somewhere we can't fetch. Double-check the link, or paste the list instead.";

export class SsrfError extends Error {
  constructor(reason, detail) {
    super(detail || reason);
    this.name = "SsrfError";
    this.reason = reason; // "bad_protocol" | "blocked_host" | "dns_failed" | "too_many_redirects"
  }
}

// ─── IPv4 ───

/** "a.b.c.d" → unsigned 32-bit integer, or null if not dotted-quad. */
function ipv4ToLong(ip) {
  const parts = String(ip).split(".");
  if (parts.length !== 4) return null;
  let long = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const n = Number(p);
    if (n > 255) return null;
    long = long * 256 + n;
  }
  return long >>> 0;
}

function inRange(long, cidrBase, maskBits) {
  const mask = maskBits === 0 ? 0 : (0xffffffff << (32 - maskBits)) >>> 0;
  return (long & mask) === (cidrBase & mask);
}

// Every non-public IPv4 range: this-host, private, CGNAT, loopback,
// link-local (incl. 169.254.169.254 metadata), IETF, benchmarking,
// multicast, and reserved/broadcast.
const BLOCKED_V4 = [
  [ipv4ToLong("0.0.0.0"), 8],
  [ipv4ToLong("10.0.0.0"), 8],
  [ipv4ToLong("100.64.0.0"), 10],
  [ipv4ToLong("127.0.0.0"), 8],
  [ipv4ToLong("169.254.0.0"), 16],
  [ipv4ToLong("172.16.0.0"), 12],
  [ipv4ToLong("192.0.0.0"), 24],
  [ipv4ToLong("192.0.2.0"), 24],
  [ipv4ToLong("192.168.0.0"), 16],
  [ipv4ToLong("198.18.0.0"), 15],
  [ipv4ToLong("198.51.100.0"), 24],
  [ipv4ToLong("203.0.113.0"), 24],
  [ipv4ToLong("224.0.0.0"), 4], // multicast
  [ipv4ToLong("240.0.0.0"), 4], // reserved + 255.255.255.255 broadcast
];

function isBlockedIpv4(ip) {
  const long = ipv4ToLong(ip);
  if (long === null) return false;
  return BLOCKED_V4.some(([base, bits]) => inRange(long, base, bits));
}

// ─── IPv6 ───

/**
 * Expand a (possibly compressed, possibly IPv4-embedded) IPv6 string into 8
 * hextet integers, or null if it isn't a valid IPv6 literal.
 */
function expandIpv6(input) {
  let ip = String(input).toLowerCase().trim();
  if (ip === "" || !ip.includes(":")) return null;

  // Fold an embedded IPv4 tail (::ffff:192.168.0.1) into two hextets first.
  if (ip.includes(".")) {
    const cut = ip.lastIndexOf(":");
    const long = ipv4ToLong(ip.slice(cut + 1));
    if (long === null) return null;
    const hi = ((long >>> 16) & 0xffff).toString(16);
    const lo = (long & 0xffff).toString(16);
    ip = ip.slice(0, cut + 1) + hi + ":" + lo;
  }

  const halves = ip.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 ? (halves[1] ? halves[1].split(":") : []) : null;

  let groups;
  if (tail === null) {
    groups = head;
  } else {
    const missing = 8 - head.length - tail.length;
    if (missing < 1) return null; // "::" must stand for at least one 0 group
    groups = [...head, ...Array(missing).fill("0"), ...tail];
  }
  if (groups.length !== 8) return null;

  const out = groups.map((g) => (/^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16) : NaN));
  return out.some((x) => Number.isNaN(x)) ? null : out;
}

function isBlockedIpv6(ip) {
  const h = expandIpv6(ip);
  if (!h) return false;

  const allZeroThrough = (n) => h.slice(0, n).every((x) => x === 0);

  // :: unspecified, ::1 loopback
  if (allZeroThrough(8)) return true;
  if (allZeroThrough(7) && h[7] === 1) return true;

  // IPv4-mapped (::ffff:x.x.x.x) and IPv4-compatible (deprecated) — judge by
  // the embedded IPv4 so ::ffff:169.254.169.254 is blocked as link-local.
  if (allZeroThrough(5) && h[5] === 0xffff) {
    return isBlockedIpv4(`${h[6] >> 8}.${h[6] & 0xff}.${h[7] >> 8}.${h[7] & 0xff}`);
  }

  if (h[0] === 0x0100 && h[1] === 0 && h[2] === 0 && h[3] === 0) return true; // 100::/64 discard
  if ((h[0] & 0xff00) === 0xff00) return true;   // ff00::/8 multicast
  if ((h[0] & 0xffc0) === 0xfe80) return true;   // fe80::/10 link-local
  if ((h[0] & 0xfe00) === 0xfc00) return true;   // fc00::/7 unique-local
  if (h[0] === 0x2001 && h[1] === 0x0db8) return true; // 2001:db8::/32 documentation
  return false;
}

/**
 * True if `ip` (IPv4 or IPv6 literal) is NOT a public, routable address —
 * i.e. we must refuse to fetch it. Unrecognized input is treated as blocked
 * (fail closed).
 */
export function isBlockedIp(ip) {
  if (typeof ip !== "string" || ip === "") return true;
  if (ip.includes(":")) return isBlockedIpv6(ip);
  if (ipv4ToLong(ip) !== null) return isBlockedIpv4(ip);
  return true;
}

// ─── URL validation + safe fetch ───

async function defaultLookup(hostname) {
  const records = await dns.lookup(hostname, { all: true });
  return records.map((r) => r.address);
}

/**
 * Validate a URL is safe to fetch: http(s) only, host resolves, and EVERY
 * resolved address is public. Throws SsrfError otherwise. Returns
 * { url, hostname, addresses }.
 *
 * `lookup(hostname) → Promise<string[]>` is injectable for tests.
 */
export async function assertPublicUrl(urlString, { lookup = defaultLookup } = {}) {
  let parsed;
  try {
    parsed = new URL(urlString);
  } catch {
    throw new SsrfError("bad_protocol", "unparseable URL");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new SsrfError("bad_protocol", `protocol ${parsed.protocol}`);
  }

  // Strip brackets from an IPv6 literal host for classification.
  const hostname = parsed.hostname.replace(/^\[|\]$/g, "");

  let addresses;
  try {
    addresses = await lookup(hostname);
  } catch {
    throw new SsrfError("dns_failed", `could not resolve ${hostname}`);
  }
  if (!addresses || addresses.length === 0) {
    throw new SsrfError("dns_failed", `no addresses for ${hostname}`);
  }

  for (const addr of addresses) {
    if (isBlockedIp(addr)) {
      throw new SsrfError("blocked_host", `${hostname} → ${addr}`);
    }
  }

  return { url: parsed.toString(), hostname, addresses };
}

/**
 * fetch() with SSRF validation on the initial URL AND every redirect hop.
 * Redirects are followed manually (redirect: "manual") so each Location is
 * re-validated before we connect — a public URL that 302s to
 * 169.254.169.254 is stopped at the hop. Caps total hops.
 *
 * Throws SsrfError on any unsafe hop or when the cap is exceeded; otherwise
 * returns the final (non-redirect) Response.
 */
export async function safeFetch(urlString, fetchOptions = {}, { maxHops = 4, lookup, fetchImpl = fetch } = {}) {
  let current = urlString;
  for (let hop = 0; ; hop++) {
    const { url } = await assertPublicUrl(current, { lookup });
    const res = await fetchImpl(url, { ...fetchOptions, redirect: "manual" });

    const isRedirect = res.status >= 300 && res.status < 400 && res.headers.get("location");
    if (!isRedirect) return res;

    if (hop >= maxHops) {
      throw new SsrfError("too_many_redirects", `exceeded ${maxHops} hops`);
    }
    current = new URL(res.headers.get("location"), url).toString();
  }
}
