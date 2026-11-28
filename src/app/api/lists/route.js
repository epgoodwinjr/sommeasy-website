// POST /api/lists — The List Ledger (Nov 2026): keep a wine list the page read.
//
// The page sends one sitting's list after each committed analysis of a
// photographed, uploaded or linked list (never pasted text), without waiting
// for the answer. This route checks the request, shapes the list
// (shapeListBody — capped, junk dropped, nothing trusted) and writes it with
// the service role through recordListObservation. The catalog is
// de-identified: the session only decides WHETHER the list may be written,
// never what is written — the write takes a list, not a person, so a future
// signed-out path can call it unchanged.
//
// Order: the limiter (by IP, which is counted for an hour and never
// stored), then JSON only (no cross-site form can send it), then the
// session (none → 401), then the body (≤ 1MB, a list or 400), then the
// service key (missing → 503). A failure logs its code, never the list.

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createRouteClient } from "@/lib/supabaseRoute";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { shapeListBody } from "@/lib/listLedger";
import { recordListObservation } from "@/lib/listCatalog";

export const dynamic = "force-dynamic";

// One write per page a sitting reads; the scan routes (10 an hour) bound it anyway
const LISTS_PER_HOUR = 60;
const BODY_MAX_BYTES = 1_000_000;

const answer = (status, body, headers) => NextResponse.json(body, { status, headers });

// May this request write the catalog? Today: a signed-in session.
async function mayWrite(request) {
  const { supabase, applyCookies } = createRouteClient(request);
  try {
    const { data } = await supabase.auth.getUser();
    return { allowed: Boolean(data?.user?.id), applyCookies };
  } catch {
    return { allowed: false, applyCookies };
  }
}

export async function POST(request) {
  const rate = checkRateLimit("lists", getClientIp(request), LISTS_PER_HOUR);
  if (!rate.allowed) {
    return answer(429, { ok: false }, { "Retry-After": String(rate.retryAfterSec) });
  }
  if (!(request.headers.get("content-type") || "").toLowerCase().startsWith("application/json")) {
    return answer(415, { ok: false });
  }

  const { allowed, applyCookies } = await mayWrite(request);
  if (!allowed) return answer(401, { ok: false });

  let shaped = null;
  try {
    const text = await request.text();
    if (text.length > BODY_MAX_BYTES) return applyCookies(answer(413, { ok: false }));
    shaped = shapeListBody(JSON.parse(text));
  } catch {
    shaped = null;
  }
  if (!shaped) return applyCookies(answer(400, { ok: false }));

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    console.error("[lists] write failed: no_service_key");
    return applyCookies(answer(503, { ok: false }));
  }
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const written = await recordListObservation(admin, shaped);
  if (!written.ok) {
    console.error(`[lists] write failed: ${written.reason}`);
    return applyCookies(answer(500, { ok: false }));
  }
  const r = written.result || {};
  console.log(`[lists] write ok: ${shaped.counts.wines} wines, list ${r.list || "?"}, observation ${r.observation || "?"}, restaurant ${r.restaurant === true}, ${written.origin}`);
  return applyCookies(answer(200, { ok: true }));
}
