// The Somm replay. See README.md — every run is a paid Claude call.
//
//   node scripts/somm-replay/replay.mjs --dry                 shapes only, free
//   node scripts/somm-replay/replay.mjs                       every case, 5 runs each
//   node scripts/somm-replay/replay.mjs --runs 1 --only "e2e_2wine,example"
//   node scripts/somm-replay/replay.mjs --tag after-my-change

import { mkdirSync, writeFileSync } from "node:fs";
import { CASES } from "./cases.mjs";

const arg = (name, fallback) => {
  const k = process.argv.indexOf(`--${name}`);
  return k === -1 ? fallback : process.argv[k + 1];
};
const runs = Number(arg("runs", 5));
const only = arg("only", null)?.split(",").map((s) => s.trim());
const tag = arg("tag", new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-"));
const dry = process.argv.includes("--dry");

const jobs = [];
for (const [label, build] of CASES) {
  if (only && !only.includes(label)) continue;
  let built;
  try {
    built = await build();
  } catch (err) {
    console.log(`skipping "${label}": ${err.message.split("\n")[0]}`);
    continue;
  }
  if (dry) {
    const s = built.shape;
    console.log(label.padEnd(38), `candidates ${String(s.candidates).padStart(2)} · page asks ${s.asked} → Somm asked ${s.pickCount}`);
    continue;
  }
  for (let n = 0; n < runs; n++) jobs.push({ label, ...built });
}
if (dry) process.exit(0);
if (jobs.length === 0) { console.log("nothing to run — check --only against the labels in cases.mjs"); process.exit(1); }

const { runJobs, compact, CLAUDE_MODEL, estimateClaudeCostUSD, hasKey } = await import("./runner.mjs");
if (!hasKey) { console.log("No ANTHROPIC_API_KEY in the environment or .env.local — nothing was run."); process.exit(1); }

console.log(`${jobs.length} runs · model ${CLAUDE_MODEL} · about $${(jobs.length * 0.02).toFixed(2)} at ~$0.02 a run\n`);
const results = await runJobs(jobs, {
  concurrency: Number(arg("concurrency", 6)),
  onRun: (r) =>
    console.log(
      `${r.label.padEnd(38)} ${String(r.shape.candidates).padStart(2)} cand · asked ${r.shape.pickCount} → ${r.outcome.padEnd(13)} ` +
      `${String(r.meta?.attempts ?? 0)} call(s) ${String(Math.round(r.wallMs / 100) / 10).padStart(5)}s  ${r.reasons.map((x) => `«${x}»`).join(" then ")}`
    ),
});

const dir = new URL("./results/", import.meta.url);
mkdirSync(dir, { recursive: true });
writeFileSync(new URL(`${tag}.full.json`, dir), JSON.stringify(results, null, 1));   // with every reply
writeFileSync(new URL(`${tag}.json`, dir), JSON.stringify(results.map(compact), null, 1));

const tokens = results.flatMap((r) => r.calls || []).reduce((t, c) => ({ in: t.in + (c.usage?.in || 0), out: t.out + (c.usage?.out || 0) }), { in: 0, out: 0 });
const count = (o) => results.filter((r) => r.outcome === o).length;
console.log(
  `\nfirst attempt ${count("first_attempt")} · salvaged ${count("salvaged")} · retried ${count("retried")} · ` +
  `fallback ${count("fallback")} · silent ${count("silent")} · spent $${estimateClaudeCostUSD(tokens.in, tokens.out).toFixed(2)}`
);
console.log(`wrote scripts/somm-replay/results/${tag}.json (and ${tag}.full.json, with the replies)`);
console.log(`compare:  node scripts/somm-replay/compare.mjs scripts/somm-replay/baselines/2026-11-12-after.json scripts/somm-replay/results/${tag}.json`);
