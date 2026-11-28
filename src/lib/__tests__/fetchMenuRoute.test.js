// Route tests for POST /api/fetch-menu — the host a link finally led to
// Run with: node src/lib/__tests__/fetchMenuRoute.test.js
//
// The REAL route module (the authRoutes pattern: the alias loader resolves
// "@/" and "next/server" for plain node). DNS is stubbed on the very object
// ssrfGuard reads (node:dns/promises' default export) so every name resolves
// to a public address, and globalThis.fetch is the web: each scripted site
// answers a page or a redirect. What these pin, for The List Ledger: the
// route says which host the page FINALLY came from, after every redirect —
// a QR code or short link is the restaurant's site it led to, never the
// shortener; a page served by the shortener itself is reported as the
// shortener (which the ledger names no one by); the SSRF guard still stops a
// redirect into a private address.

import { register } from "node:module";
register("./helpers/alias-loader.mjs", import.meta.url);

process.env.E2E_DISABLE_RATE_LIMIT = "1";

const dns = (await import("node:dns/promises")).default;
const privateHosts = new Set(["metadata.internal.example"]);
dns.lookup = async (hostname) =>
  privateHosts.has(hostname) ? [{ address: "169.254.169.254", family: 4 }] : [{ address: "93.184.216.34", family: 4 }];

let passed = 0, failed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.log(`  ✗ ${name}\n    ${err.message}`);
  }
}
function assert(cond, msg) { if (!cond) throw new Error("ASSERT FAILED: " + msg); }

const LIST_HTML = `<html><body><h1>Wine</h1><p>REDS</p><p>Kanonkop Paul Sauer, Stellenbosch 2019 $120</p>
<p>Mullineux Syrah, Swartland 2020 $72</p><p>Meerlust Rubicon, Stellenbosch 2018 $95</p></body></html>`;
const page = () => new Response(LIST_HTML, { status: 200, headers: { "content-type": "text/html" } });
const redirect = (to) => new Response(null, { status: 302, headers: { location: to } });

// A one-page text PDF, written by hand (header, four objects, xref, trailer)
function textPdf(lines) {
  const content = "BT /F1 12 Tf 72 720 Td 14 TL " + lines.map((l) => `(${l}) '`).join(" ") + " ET";
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets = [];
  objs.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offsets.map((n) => String(n).padStart(10, "0") + " 00000 n \n").join("");
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(out);
}
const pdfPage = () => new Response(textPdf(["REDS", "Kanonkop Paul Sauer, Stellenbosch 2019 120", "Mullineux Syrah, Swartland 2020 72"]),
  { status: 200, headers: { "content-type": "application/pdf" } });

let sites = {};
let fetched = [];
globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === "string" ? input : input.url;
  fetched.push({ url, redirect: init.redirect });
  const answer = sites[url];
  if (!answer) throw new Error(`unscripted fetch: ${url}`);
  return answer();
};

const { POST } = await import("../../app/api/fetch-menu/route.js");
const { restaurantHost } = await import("../listLedger.js");

async function call(url) {
  const res = await POST(new Request("http://localhost/api/fetch-menu", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url }),
  }));
  return { status: res.status, body: await res.json() };
}

console.log("\n=== /api/fetch-menu — where a link finally led ===\n");

await test("a QR code's link is the restaurant site it led to, never the shortener", async () => {
  fetched = [];
  sites = {
    "https://qrco.de/bfXyZ": () => redirect("https://bit.ly/3abcDEF"),
    "https://bit.ly/3abcDEF": () => redirect("https://www.harbourtable.example/menus"),
    "https://www.harbourtable.example/menus": () => redirect("/menus/wine"),
    "https://www.harbourtable.example/menus/wine": page,
  };
  const { status, body } = await call("https://qrco.de/bfXyZ");
  assert(status === 200 && body.text?.includes("Kanonkop"), `the page was read: ${status}`);
  assert(body.host === "harbourtable.example", `the final host: ${body.host}`);
  assert(restaurantHost(body.host) === "harbourtable.example", "and it names the restaurant");
  assert(fetched.length === 4 && fetched.every((f) => f.redirect === "manual"), "every hop followed by hand");
});

await test("a restaurant's own link is its own host, www and case dropped", async () => {
  sites = { "https://www.vineandfig.example/wine-list": page };  // the URL parser lowercases the host
  const { body } = await call("https://WWW.VineAndFig.example/wine-list");
  assert(body.host === "vineandfig.example", `host: ${body.host}`);
});

await test("a QR code that leads to a PDF list says the PDF's host too", async () => {
  sites = {
    "https://qrco.de/pdfList": () => redirect("https://files.harbourtable.example/wine-list.pdf"),
    "https://files.harbourtable.example/wine-list.pdf": pdfPage,
  };
  const { status, body } = await call("https://qrco.de/pdfList");
  assert(status === 200 && body.source === "pdf" && body.text?.includes("Kanonkop"), `the PDF was read: ${status} ${JSON.stringify(body).slice(0, 160)}`);
  assert(body.host === "files.harbourtable.example", `the final host: ${body.host}`);
});

await test("a page the shortener serves itself is reported as the shortener — which names no one", async () => {
  sites = { "https://flow.page/harbourtable": page };
  const { status, body } = await call("https://flow.page/harbourtable");
  assert(status === 200 && body.host === "flow.page", `host: ${body.host}`);
  assert(restaurantHost(body.host) === null, "a shortener names no restaurant");
});

await test("a redirect into a private address is still refused, and says no host", async () => {
  fetched = [];
  sites = { "https://bit.ly/steal": () => redirect("http://metadata.internal.example/latest") };
  const { status, body } = await call("https://bit.ly/steal");
  assert(status === 422 && body.error && body.host === undefined && body.text === undefined, `refused: ${status} ${JSON.stringify(body)}`);
  assert(fetched.length === 1, "the private hop is never fetched");
});

await test("a page that fails says no host", async () => {
  sites = { "https://harbourtable.example/gone": () => new Response("nope", { status: 404 }) };
  const { status, body } = await call("https://harbourtable.example/gone");
  assert(status === 422 && body.host === undefined, `no host on a failure: ${JSON.stringify(body)}`);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
