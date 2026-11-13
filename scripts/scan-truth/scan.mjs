// Sends the rendered lists through the REAL /api/parse-wine-list handler —
// imported from src/, unmodified — against the real Anthropic API, and keeps
// the wines it returned.
//
//   python3 scripts/scan-truth/render.py <image-dir>
//   node scripts/scan-truth/scan.mjs <image-dir> <out.json> [runs=3] [only]
//
// Every .jpg in <image-dir> is scanned `runs` times (`only`: just the images
// whose name contains it).
//
// The only network host this touches is api.anthropic.com. No Supabase
// client, no account, no wine_events. About $0.03–0.05 a scan.

import { register } from "node:module";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const REPO = new URL("../../", import.meta.url);
register(new URL("src/lib/__tests__/helpers/alias-loader.mjs", REPO));

const envFile = new URL(".env.local", REPO);
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const m = line.match(/^(ANTHROPIC_API_KEY|ANTHROPIC_MODEL)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}
process.env.E2E_DISABLE_RATE_LIMIT = "1";
if (!process.env.ANTHROPIC_API_KEY) {
  console.error("No ANTHROPIC_API_KEY (environment or .env.local) — nothing scanned.");
  process.exit(1);
}

const [imageDir, outFile, runsArg, only] = process.argv.slice(2);
const runs = Number(runsArg) || 3;
const keys = readdirSync(imageDir).filter((f) => f.endsWith(".jpg")).map((f) => f.slice(0, -4))
  .filter((k) => !only || k.includes(only)).sort();

// The route narrates each call and each wine; keep the terminal for the tallies
const log = console.log.bind(console);
console.log = (...args) => {
  const line = args.map(String).join(" ");
  if (/^\[(parse-wine-list|wine \d+)\]/.test(line) || line.startsWith('{"type":"claude_usage"')) return;
  log(...args);
};

const { POST } = await import(new URL("src/app/api/parse-wine-list/route.js", REPO).href);
const { CLAUDE_MODEL } = await import(new URL("src/lib/anthropicConfig.js", REPO).href);

const out = { capturedAt: new Date().toISOString().slice(0, 10), model: CLAUDE_MODEL, scans: {} };
for (const key of keys) {
  const imageBase64 = readFileSync(join(imageDir, `${key}.jpg`)).toString("base64");
  out.scans[key] = [];
  for (let run = 0; run < runs; run++) {
    const started = Date.now();
    const res = await POST(new Request("http://localhost/api/parse-wine-list", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageBase64, mimeType: "image/jpeg" }),
    }));
    const data = await res.json();
    const wines = Array.isArray(data.wines) ? data.wines : [];
    out.scans[key].push({ status: res.status, source: data.source || null, error: data.error || null, metadata: data.metadata || null, wines });
    const count = (test) => wines.filter(test).length;
    log(`${key} run ${run + 1}: ${wines.length} wines in ${((Date.now() - started) / 1000).toFixed(1)}s — `
      + `is_btg true ${count((w) => w.is_btg === true)}, price ${count((w) => typeof w.price === "number")}, `
      + `glass_price ${count((w) => typeof w.glass_price === "number")}, both ${count((w) => typeof w.price === "number" && typeof w.glass_price === "number")}`
      + `${data.error ? ` — ERROR ${data.error}` : ""}`);
  }
}
writeFileSync(outFile, JSON.stringify(out, null, 1) + "\n");
log("wrote", outFile);
