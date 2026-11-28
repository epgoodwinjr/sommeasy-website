// listCatalog.js — the List Ledger's one server-side write (Nov 2026).
//
// Server-only (it hashes with node:crypto and needs the service-role client).
// It takes a list, never a person: whoever calls it — today the signed-in
// /api/lists route, perhaps one day a signed-out path — hands it what
// shapeListBody kept, and it writes the catalog through the one database
// function (migration 015: restaurant, list version, lines and the sitting's
// observation in one transaction). Nothing here reads a session, a user or
// an IP.

import { createHash } from "node:crypto";
import { fingerprintText, listOrigin, listWriteArgs, observedOn } from "@/lib/listLedger";

export const LIST_WRITE_FUNCTION = "record_list_observation";

/** sha256 of the list's canonical text, hex. */
export function listFingerprint(shaped, origin) {
  return createHash("sha256").update(fingerprintText(shaped, origin)).digest("hex");
}

/**
 * Write one sitting's list. Resolves { ok: true, result } or
 * { ok: false, reason } — never throws.
 */
export async function recordListObservation(admin, shaped, { env = process.env, now = new Date() } = {}) {
  try {
    const origin = listOrigin(env);
    const args = listWriteArgs(shaped, {
      origin,
      observedOn: observedOn(now),
      fingerprint: listFingerprint(shaped, origin),
    });
    const { data, error } = await admin.rpc(LIST_WRITE_FUNCTION, args);
    if (error) return { ok: false, reason: error.code || error.message || "rpc_error" };
    return { ok: true, result: data ?? null, origin };
  } catch (err) {
    return { ok: false, reason: err?.code || err?.name || "unknown" };
  }
}
