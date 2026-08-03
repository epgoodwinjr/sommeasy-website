// Route tests for /api/somm-picks — the steer contract ("A Word with the Somm")
// Run with: node src/lib/__tests__/sommRoute.test.js
//
// Tests the REAL route module (no mirrors): the alias-loader hook resolves
// "@/" and "next/server" for plain node, and globalThis.fetch is patched so
// the real @anthropic-ai/sdk client talks to a scripted Claude. The point of
// these tests: the steer is untrusted diner text and MUST be trimmed/capped
// server-side before it reaches the prompt; the system prompt MUST carry the
// steer contract (budget > steer > DNA, steer can't override the output
// rules) and must no longer speak "occasion"; a legacy client still sending
// `occasion` keeps working through the deploy overlap.

import { register } from "node:module";
register("./helpers/alias-loader.mjs", import.meta.url);

process.env.ANTHROPIC_API_KEY = "test-key-never-used";

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

// ——— scripted Claude ———
let anthropicCalls = [];

const goodModelJson = () => ({
  picks: [
    { i: 0, role: "top", note: "A Chenin with the tension you love — bright, dry, alive." },
    { i: 2, role: "value", note: "Rioja that drinks far above its price for your palate." },
  ],
  sommSummary: "A short list with two clear lanes for you.",
});

const modelReply = (obj) =>
  new Response(
    JSON.stringify({
      id: "msg_test", type: "message", role: "assistant", model: "claude-test",
      content: [{ type: "text", text: JSON.stringify(obj) }],
      stop_reason: "end_turn",
      usage: { input_tokens: 100, output_tokens: 50 },
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );

globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === "string" ? input : input.url;
  if (!url.includes("api.anthropic.com")) throw new Error("unexpected fetch: " + url);
  anthropicCalls.push({ url, body: init.body ? JSON.parse(init.body) : null });
  return modelReply(goodModelJson());
};

const routePayload = (extra = {}) => ({
  candidates: [
    { i: 0, name: "Raats Original Chenin Blanc", price: 40, country: "South Africa" },
    { i: 1, name: "Meursault 1er Cru", price: 80, country: "France" },
    { i: 2, name: "Rioja Reserva", price: 35, country: "Spain" },
  ],
  algorithmicPicks: [0, 2],
  pickCount: 2,
  dna: { archetype: "The Cape Original" },
  feedback: { loved: [], notForMe: [] },
  menu: { totalWines: 3, distinctCountries: 3, distinctRegions: 3 },
  budget: { min: null, max: 100 },
  color: null,
  ...extra,
});

async function main() {
  const { POST } = await import("../../app/api/somm-picks/route.js");

  const callRoute = async (payload) => {
    anthropicCalls = [];
    const req = new Request("http://localhost:3000/api/somm-picks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const res = await POST(req);
    const data = await res.json();
    const sent = anthropicCalls[0]?.body || null;
    const sentPayload = sent ? JSON.parse(sent.messages[0].content) : null;
    return { res, data, sent, sentPayload };
  };

  console.log("\n═══ /api/somm-picks steer contract ═══");

  await test("an oversized steer is trimmed + capped server-side before reaching Claude", async () => {
    const { data, sentPayload } = await callRoute(routePayload({ steer: "  " + "s".repeat(5000) + "  " }));
    assert(sentPayload, "Claude was never called");
    assert(typeof sentPayload.steer === "string" && sentPayload.steer.length === 200, `steer length ${sentPayload?.steer?.length}`);
    assert(Array.isArray(data.picks) && data.picks.length === 2, "route should still return picks");
  });

  await test("absent steer reaches Claude as null and the route succeeds", async () => {
    const { data, sentPayload } = await callRoute(routePayload());
    assert(sentPayload.steer === null, `expected null, got ${JSON.stringify(sentPayload.steer)}`);
    assert(Array.isArray(data.picks) && data.picks.length === 2, "route should return picks");
  });

  await test("a non-string steer is coerced to null, never forwarded", async () => {
    const { sentPayload } = await callRoute(routePayload({ steer: { evil: "payload" } }));
    assert(sentPayload.steer === null, `expected null, got ${JSON.stringify(sentPayload.steer)}`);
  });

  await test("legacy occasion key maps onto steer through the deploy overlap", async () => {
    const { sentPayload } = await callRoute(routePayload({ occasion: "steak night" }));
    assert(sentPayload.steer === "steak night", `got ${JSON.stringify(sentPayload.steer)}`);
    assert(!("occasion" in sentPayload), "occasion must not reach the prompt");
  });

  await test("system prompt carries the steer contract, occasion framing is gone", async () => {
    const { sent } = await callRoute(routePayload({ steer: "focus on Chenin" }));
    const system = sent.system;
    assert(typeof system === "string" && system.includes('"steer"'), "prompt must describe the steer field");
    assert(/outranks the palate DNA/i.test(system), "prompt must state steer > DNA");
    assert(/budget remains the hard constraint/i.test(system), "prompt must keep budget above the steer");
    assert(/never change the pick count, the budget rules, or the output format/i.test(system), "prompt must fence the steer off from the output contract");
    assert(!/occasion/i.test(system), "occasion framing must be gone from the prompt");
  });

  console.log(`\nTotal: ${passed}/${passed + failed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => { console.error("Test runner crashed:", err); process.exit(1); });
