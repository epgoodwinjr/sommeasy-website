// Two replays side by side. No API calls.
//
//   node scripts/somm-replay/compare.mjs <before.json> <after.json>
//
// Reads the compact files replay.mjs writes (results/<tag>.json) and the
// baselines kept in baselines/.

import { readFileSync } from "node:fs";

const [beforePath, afterPath] = process.argv.slice(2);
if (!beforePath || !afterPath) {
  console.log("usage: node scripts/somm-replay/compare.mjs <before.json> <after.json>");
  process.exit(1);
}
const before = JSON.parse(readFileSync(beforePath, "utf8"));
const after = JSON.parse(readFileSync(afterPath, "utf8"));

const PRICE = { in: 3, out: 15 }; // $/MTok — rateLimit.js's table, for a number to compare, not a bill
const cost = (rs) => rs.reduce((s, r) => s + (r.tokens.in * PRICE.in + r.tokens.out * PRICE.out) / 1e6, 0);

const kind = (r) =>
  /^pick count/.test(r) ? "pick count N < asked"
  : /not parseable/.test(r) ? "not parseable JSON"
  : /truncated/.test(r) ? "truncated at max_tokens"
  : /duplicate/.test(r) ? "duplicate index"
  : /non-splurge/.test(r) ? "non-splurge over budget max"
  : /^splurge/.test(r) ? "splurge over 2x max"
  : /format rejected/.test(r) ? "output format rejected"
  : r;

const OUTCOMES = ["first_attempt", "salvaged", "retried", "fallback", "silent"];
const tally = (rs) => Object.fromEntries(OUTCOMES.map((o) => [o, rs.filter((r) => r.outcome === o).length]));
const cells = (rs) => OUTCOMES.map((o) => tally(rs)[o]).join("/");
const sorted = (rs) => rs.map((r) => r.wallMs).sort((a, b) => a - b);
const median = (rs) => (rs.length ? sorted(rs)[Math.floor(rs.length / 2)] : 0);
const slowest = (rs) => (rs.length ? sorted(rs).at(-1) : 0);
const secs = (rs) => (rs.length ? `${Math.round(median(rs) / 1000)}/${Math.round(slowest(rs) / 1000)}s` : "—");

console.log("outcomes are first/salvaged/retried/fallback/silent; seconds are median/slowest\n");
console.log("case".padEnd(38), "cand", "asked".padEnd(7), "BEFORE".padEnd(22), "AFTER");
const labels = [...new Set([...before, ...after].map((r) => r.label))];
for (const label of labels) {
  const b = before.filter((r) => r.label === label), a = after.filter((r) => r.label === label);
  const shape = (a[0] || b[0]).shape;
  const asked = b[0] && a[0] && b[0].shape.pickCount !== a[0].shape.pickCount ? `${b[0].shape.pickCount}→${a[0].shape.pickCount}` : String(shape.pickCount);
  console.log(
    label.padEnd(38), String(shape.candidates).padStart(4), asked.padEnd(7),
    (b.length ? `${cells(b)} ${secs(b)}` : "—").padEnd(22),
    a.length ? `${cells(a)} ${secs(a)}` : "—"
  );
}

for (const [name, rs] of [["BEFORE", before], ["AFTER", after]]) {
  const t = tally(rs);
  const first = {}, second = {};
  for (const r of rs) (r.reasons || []).forEach((reason, k) => { const b = k === 0 ? first : second; b[kind(reason)] = (b[kind(reason)] || 0) + 1; });
  const starts = {};
  for (const r of rs) for (const c of r.replyStarts || []) starts[c || "∅"] = (starts[c || "∅"] || 0) + 1;
  console.log(`\n${name}: ${rs.length} runs — ${OUTCOMES.map((o) => `${o} ${t[o]}`).join(" · ")}`);
  console.log(`  median ${(median(rs) / 1000).toFixed(1)}s · slowest ${(slowest(rs) / 1000).toFixed(1)}s · $${(cost(rs) / rs.length).toFixed(4)} a run · ${rs.reduce((s, r) => s + r.calls, 0)} calls`);
  console.log("  1st rejection:", first);
  console.log("  2nd rejection:", second);
  console.log("  replies beginning with:", starts, "· models:", [...new Set(rs.map((r) => r.model).filter(Boolean))]);
}
