// The retry probe — the corrective retry alone. See README.md.
//
// A replay shows how often the first reply is rejected; this shows what the
// route's corrective message does about it. It takes the rejected first
// replies a replay recorded (results/<tag>.full.json), hands each one back to
// the real route as its first answer (no API call), and lets the route send
// its real retry to the real API. One paid call per run.
//
//   node scripts/somm-replay/retry-probe.mjs --from <tag>            list them, free
//   node scripts/somm-replay/retry-probe.mjs --from <tag> --save     keep them WITH their payloads
//   node scripts/somm-replay/retry-probe.mjs --set <file> --reps 2 --tag my-retry
//
// --save writes results/<tag>.rejected.json: each rejected reply beside the
// payload it answered, as cases.mjs builds it TODAY. Save before changing the
// builder — a reply's indices mean nothing against a different slate.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { CASES } from "./cases.mjs";

const arg = (name, fallback) => {
  const k = process.argv.indexOf(`--${name}`);
  return k === -1 ? fallback : process.argv[k + 1];
};
const dir = new URL("./results/", import.meta.url);
const from = arg("from", null), setFile = arg("set", null);
const reps = Number(arg("reps", 1));
const tag = arg("tag", `retry-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}`);

let set;
if (setFile) {
  // { cases: { label: { payload, shape } }, rejected: [{ label, firstReply, firstReason }] }
  const saved = JSON.parse(readFileSync(setFile, "utf8"));
  set = saved.rejected.map((r) => ({ ...saved.cases[r.label], ...r }));
} else if (from) {
  const runs = JSON.parse(readFileSync(new URL(`${from}.full.json`, dir), "utf8"));
  const built = new Map();
  set = [];
  for (const run of runs) {
    const first = run.calls?.[0];
    if (!run.reasons?.length || !first?.text || first.replayed) continue;
    if (!built.has(run.label)) {
      const found = CASES.find(([label]) => label === run.label);
      built.set(run.label, found ? await found[1]() : null);
    }
    const b = built.get(run.label);
    if (b) set.push({ label: run.label, payload: b.payload, shape: b.shape, firstReply: first.text, firstReason: run.reasons[0] });
  }
} else {
  console.log("usage: retry-probe.mjs --from <replay tag> [--save] | --set <rejected.json> [--reps N] [--tag name]");
  process.exit(1);
}

const tally = {};
for (const s of set) tally[`${s.label} · ${s.firstReason}`] = (tally[`${s.label} · ${s.firstReason}`] || 0) + 1;
console.log(`${set.length} rejected first replies`);
for (const [k, v] of Object.entries(tally)) console.log(`  ${String(v).padStart(3)}×  ${k}`);
if (from && process.argv.includes("--save")) {
  mkdirSync(dir, { recursive: true });
  // Each case's payload once, then the replies that answered it
  const cases = {};
  for (const s of set) cases[s.label] = { payload: s.payload, shape: s.shape };
  const rejected = set.map(({ label, firstReply, firstReason }) => ({ label, firstReply, firstReason }));
  writeFileSync(new URL(`${from}.rejected.json`, dir), JSON.stringify({ cases, rejected }, null, 1));
  console.log(`wrote scripts/somm-replay/results/${from}.rejected.json`);
}
if (!setFile || set.length === 0) process.exit(0);

const { runJobs, compact, CLAUDE_MODEL, estimateClaudeCostUSD, hasKey } = await import("./runner.mjs");
if (!hasKey) { console.log("No ANTHROPIC_API_KEY in the environment or .env.local — nothing was run."); process.exit(1); }
const jobs = [];
for (let n = 0; n < reps; n++) for (const s of set) jobs.push(s);
console.log(`\n${jobs.length} retries · model ${CLAUDE_MODEL} · about $${(jobs.length * 0.013).toFixed(2)}\n`);
const results = await runJobs(jobs, {
  concurrency: Number(arg("concurrency", 6)),
  onRun: (r) => console.log(`${r.label.padEnd(38)} ${r.outcome === "retried" ? "recovered" : r.outcome.padEnd(9)} ${String(Math.round(r.wallMs / 100) / 10).padStart(5)}s  ${r.reasons.map((x) => `«${x}»`).join(" then ")}`),
});
mkdirSync(dir, { recursive: true });
writeFileSync(new URL(`${tag}.full.json`, dir), JSON.stringify(results, null, 1));
writeFileSync(new URL(`${tag}.json`, dir), JSON.stringify(results.map(compact), null, 1));
const tokens = results.flatMap((r) => r.calls || []).reduce((t, c) => ({ in: t.in + (c.usage?.in || 0), out: t.out + (c.usage?.out || 0) }), { in: 0, out: 0 });
const recovered = results.filter((r) => r.outcome === "retried").length;
console.log(`\nthe retry recovered ${recovered} of ${results.length} · fell back ${results.filter((r) => r.outcome === "fallback").length} · spent $${estimateClaudeCostUSD(tokens.in, tokens.out).toFixed(2)}`);
console.log(`wrote scripts/somm-replay/results/${tag}.json (and ${tag}.full.json: each run's "sent" is the corrective message as the route wrote it)`);
