// Runs payloads through the REAL /api/somm-picks handler — imported from
// src/, unmodified — against the real Anthropic API, and keeps what happened:
// the route's own meta (outcome, attempts, reasons, candidates, pickCount,
// model), the route's log lines, and a copy of every reply Claude wrote.
//
// The only network host this touches is api.anthropic.com. No Supabase
// client is created and nothing is written outside scripts/somm-replay/results/.

import { AsyncLocalStorage } from "node:async_hooks";
import { existsSync, readFileSync } from "node:fs";
import { REPO } from "./cases.mjs"; // also registers the alias loader

const at = (path) => new URL(path, REPO).href;

// The key the dev server uses — read, never printed. An ANTHROPIC_MODEL set
// in the environment (or .env.local) is honored, so another model can be
// replayed without touching anthropicConfig.js.
const envFile = new URL(".env.local", REPO);
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const m = line.match(/^(ANTHROPIC_API_KEY|ANTHROPIC_MODEL)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}
// The limiter's own switch for plain-node harnesses (rateLimit.test.js): a
// replay calls the route far more than ten times an hour from one "IP"
process.env.E2E_DISABLE_RATE_LIMIT = "1";

const als = new AsyncLocalStorage();

// The route's log lines, attributed to the run that wrote them
for (const level of ["log", "error"]) {
  const original = console[level].bind(console);
  console[level] = (...args) => {
    const run = als.getStore();
    const line = args.map(String).join(" ");
    if (run && (line.startsWith("[somm-picks]") || line.startsWith('{"type":"claude_usage"'))) {
      if (line.startsWith("[somm-picks]")) run.routeLogs.push(line);
      return;
    }
    original(...args);
  };
}

// A pass-through fetch that keeps a copy of what Claude said. To probe a
// change before touching the route, amend `init.body` here (add a request
// parameter, drop one) — the handler still runs as it is.
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const res = await realFetch(input, init);
  const run = als.getStore();
  const url = typeof input === "string" ? input : input.url;
  if (run && url.includes("api.anthropic.com")) {
    try {
      const body = await res.clone().json();
      run.calls.push({
        status: res.status,
        model: body.model,
        stop_reason: body.stop_reason,
        usage: body.usage && { in: body.usage.input_tokens, out: body.usage.output_tokens },
        text: (body.content || []).filter((b) => b.type === "text").map((b) => b.text).join(""),
        error: body.error?.type || null,
      });
    } catch (err) {
      run.calls.push({ status: res.status, unreadable: String(err) });
    }
  }
  return res;
};

const { POST } = await import(at("src/app/api/somm-picks/route.js"));
export const { CLAUDE_MODEL } = await import(at("src/lib/anthropicConfig.js"));
export const { estimateClaudeCostUSD } = await import(at("src/lib/rateLimit.js"));
export const hasKey = Boolean(process.env.ANTHROPIC_API_KEY);

async function runOnce(label, payload) {
  const run = { label, routeLogs: [], calls: [] };
  const started = Date.now();
  const res = await als.run(run, () =>
    POST(new Request("http://localhost/api/somm-picks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }))
  );
  const data = await res.json();
  run.wallMs = Date.now() - started;
  run.httpStatus = res.status;
  // "silent" = a fallback with no meta: the route never asked Claude
  run.outcome = data.fallback ? (data.meta ? "fallback" : "silent") : data.meta?.outcome || "error";
  run.meta = data.meta || null;
  run.picks = data.picks ? data.picks.map((p) => ({ i: p.i, role: p.role, noteLen: p.note.length })) : null;
  // Every rejection, in order. Since Nov 12, 2026 the route reports them in
  // meta; before that they could only be read from its log lines.
  run.reasons = run.meta?.reasons
    ?? run.routeLogs.map((l) => l.match(/^\[somm-picks\] (?:retrying after|validation failed|error): ?(.*)$/s)?.[1]).filter(Boolean);
  return run;
}

/** jobs: [{ label, payload, shape }] → one result per job, in finishing order. */
export async function runJobs(jobs, { concurrency = 6, onRun } = {}) {
  const results = [];
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const job = jobs[next++];
      let run;
      try {
        run = await runOnce(job.label, job.payload);
      } catch (err) {
        run = { label: job.label, outcome: "harness_error", error: String(err), calls: [], reasons: [], wallMs: 0 };
      }
      run.shape = job.shape;
      results.push(run);
      onRun?.(run);
    }
  };
  await Promise.all(Array.from({ length: concurrency }, worker));
  return results;
}

/** A run without the replies — small enough to keep as a baseline. */
export function compact(run) {
  const calls = run.calls || [];
  return {
    label: run.label,
    shape: run.shape,
    outcome: run.outcome,
    attempts: run.meta?.attempts ?? calls.length,
    reasons: run.reasons || [],
    wallMs: run.wallMs,
    model: run.meta?.model ?? calls[0]?.model ?? null,
    tokens: { in: calls.reduce((s, c) => s + (c.usage?.in || 0), 0), out: calls.reduce((s, c) => s + (c.usage?.out || 0), 0) },
    calls: calls.length,
    // The first character of each reply: "{" is JSON, anything else is prose
    replyStarts: calls.map((c) => (c.text || "").trim().slice(0, 1)),
  };
}
