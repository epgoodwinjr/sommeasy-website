// sourceTag.js — where an account came from (launch measurement, Nov 2026).
//
// A link that carries ?ref=<tag> (an invitation, an Instagram post, a shared
// palate card) leaves the tag on the device; the account made on that device
// carries it in user_metadata.ref. Nothing else: no migration, no event, no
// cookie, no identity stitching — one short word on the account, read by
// docs/auth-watchtower.md §11g.
//
// The rules:
//   1. A tag is lowercase letters, digits and hyphens, 1–24 characters.
//      Anything else is ignored — never trimmed, lowercased or cut into one.
//   2. The FIRST tag wins: a stored tag is never replaced while it's
//      unexpired. It expires 30 days after it was set; after that the next
//      tag takes its place.
//   3. Email signup carries the stored tag as options.data.ref (AuthForm).
//      Any other signup (Google) gets it on the first signed-in load: only an
//      account made in the last 24 hours, only one with no ref, written once
//      and never over a ref the server already holds.
//   4. The stored tag is cleared once the account carries it.
//   5. Storage can be missing, junk or throwing: every call here degrades to
//      "no tag" and never throws.
//
// Dependency-free, so its tests load the real module in plain node.

export const REF_KEY = "sommeasy.ref";
export const REF_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
export const NEW_ACCOUNT_MS = 24 * 60 * 60 * 1000; // 24 hours
const REF_PATTERN = /^[a-z0-9-]{1,24}$/;

/** The tag, or null when the value isn't one (rule 1). */
export function cleanRef(value) {
  return typeof value === "string" && REF_PATTERN.test(value) ? value : null;
}

/** The tag a page's query string carries, or null. */
export function refFromSearch(search) {
  try {
    if (typeof search !== "string" || !search) return null;
    return cleanRef(new URLSearchParams(search).get("ref"));
  } catch {
    return null;
  }
}

/** The stored { tag, setAt }, or null when there's none, it's junk or it has
 *  expired (an expired or junk entry is removed on the way). */
export function readStoredRef(storage, now = Date.now()) {
  try {
    const raw = storage?.getItem?.(REF_KEY);
    if (raw == null) return null;
    let entry = null;
    try { entry = JSON.parse(raw); } catch { entry = null; }
    const tag = cleanRef(entry?.tag);
    const setAt = entry?.setAt;
    const age = now - setAt;
    if (tag && Number.isFinite(setAt) && age >= 0 && age < REF_MAX_AGE_MS) return { tag, setAt };
    storage.removeItem?.(REF_KEY);
    return null;
  } catch {
    return null;
  }
}

/** Keep a tag unless an unexpired one is already kept (rule 2). Returns the
 *  tag the device now holds, or null. */
export function rememberRef(storage, value, now = Date.now()) {
  try {
    const held = readStoredRef(storage, now);
    if (held) return held.tag;
    const tag = cleanRef(value);
    if (!tag || !storage?.setItem) return null;
    storage.setItem(REF_KEY, JSON.stringify({ tag, setAt: now }));
    return tag;
  } catch {
    return null;
  }
}

export function clearStoredRef(storage) {
  try { storage?.removeItem?.(REF_KEY); } catch { /* nothing to clear */ }
}

/** The ref an account carries, or null. */
export function accountRef(user) {
  const ref = user?.user_metadata?.ref;
  return typeof ref === "string" && ref ? ref : null;
}

/** Made in the last 24 hours (a clock a little behind the server's still
 *  counts a brand-new account as new). */
export function isNewAccount(user, now = Date.now()) {
  const created = Date.parse(user?.created_at);
  if (!Number.isFinite(created)) return false;
  return now - created < NEW_ACCOUNT_MS && created - now < 5 * 60 * 1000;
}

let inFlight = null;

/**
 * Put the stored tag on the signed-in account when rule 3 allows it, and
 * clear it once the account carries it (rule 4). Returns what happened, for
 * tests: "none" | "signed_out" | "carried" | "other_ref" | "old" | "tagged" |
 * "failed". Never throws, and one call at a time (StrictMode runs effects
 * twice; a page change mid-write waits for the same answer).
 */
export function tagAccount({ supabase, storage, now = Date.now() }) {
  if (inFlight) return inFlight;
  inFlight = runTagAccount({ supabase, storage, now }).finally(() => { inFlight = null; });
  return inFlight;
}

async function runTagAccount({ supabase, storage, now }) {
  try {
    const held = readStoredRef(storage, now);
    if (!held) return "none";
    // The cached session first: no request for a signed-out visitor, an
    // older account or one that already says where it came from
    const { data: { session } = {} } = await supabase.auth.getSession();
    const cached = session?.user;
    if (!cached) return "signed_out";
    const seen = settled(storage, held, accountRef(cached));
    if (seen) return seen;
    if (!isNewAccount(cached, now)) return "old";
    // A session is a cache: ask the server before writing, so a ref set on
    // another device is never written over
    const { data, error } = await supabase.auth.getUser();
    if (error || !data?.user) return "failed";
    const onServer = settled(storage, held, accountRef(data.user));
    if (onServer) return onServer;
    if (!isNewAccount(data.user, now)) return "old";
    const { error: writeErr } = await supabase.auth.updateUser({ data: { ref: held.tag } });
    if (writeErr) return "failed";
    clearStoredRef(storage);
    return "tagged";
  } catch {
    return "failed";
  }
}

// An account with a ref is never written again. Its own tag on this device
// has done its job and is cleared; a different tag stays (it may yet be
// another new account's on this device, until it expires).
function settled(storage, held, ref) {
  if (!ref) return null;
  if (ref === held.tag) {
    clearStoredRef(storage);
    return "carried";
  }
  return "other_ref";
}
