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
// This suite calls the route more than MAX_REQUESTS times from one "IP"; the
// limiter's own plain-node switch (rateLimit.test.js) keeps it out of the way
process.env.E2E_DISABLE_RATE_LIMIT = "1";

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

// A reply whose text is given verbatim — prose, fences, anything
const modelText = (text, extra = {}) =>
  new Response(
    JSON.stringify({
      id: "msg_test", type: "message", role: "assistant", model: "claude-test",
      content: [{ type: "text", text }],
      stop_reason: "end_turn",
      usage: { input_tokens: 100, output_tokens: 50 },
      ...extra,
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );

const apiError = (status, type, message) =>
  new Response(
    JSON.stringify({ type: "error", error: { type, message } }),
    { status, headers: { "content-type": "application/json" } }
  );

// Each test may queue replies: a Response, or a function of the request body
// that returns one. An empty queue answers with the good reply.
let script = [];

globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === "string" ? input : input.url;
  if (!url.includes("api.anthropic.com")) throw new Error("unexpected fetch: " + url);
  const body = init.body ? JSON.parse(init.body) : null;
  anthropicCalls.push({ url, body });
  const next = script.shift();
  if (!next) return modelReply(goodModelJson());
  return typeof next === "function" ? next(body) : next;
};

// The route logs every rejection; a scripted failure is not a test failure
const quiet = async (fn) => {
  const { log, error } = console;
  console.log = console.error = () => {};
  try { return await fn(); } finally { console.log = log; console.error = error; }
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

  const callRoute = async (payload, replies = []) => {
    anthropicCalls = [];
    script = [...replies];
    const req = new Request("http://localhost:3000/api/somm-picks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const res = await quiet(() => POST(req));
    const data = await res.json();
    const sent = anthropicCalls[0]?.body || null;
    const sentPayload = sent ? JSON.parse(sent.messages[0].content) : null;
    return { res, data, sent, sentPayload, calls: anthropicCalls.map((c) => c.body) };
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

  console.log("\n═══ /api/somm-picks — the ask the slate can supply ═══");

  const noteFor = (i, role = "wildcard") => ({ i, role, note: `Pick ${i} speaks to your palate. It earns its place tonight.` });

  await test("an ask larger than the slate is clamped server-side, whatever the caller sent", async () => {
    // Three candidates, five asked: Claude must be asked for three, and three must be accepted
    const { data, sentPayload } = await callRoute(
      routePayload({ pickCount: 5, budget: { min: null, max: null } }),
      [modelReply({ picks: [noteFor(0, "top"), noteFor(1, "splurge"), noteFor(2, "value")], sommSummary: "Three, all of them." })]
    );
    assert(sentPayload.pickCount === 3, `Claude was asked for ${sentPayload.pickCount}`);
    assert(!data.fallback && data.picks.length === 3, `expected 3 picks, got ${JSON.stringify(data)}`);
    assert(data.meta.pickCount === 3 && data.meta.candidates === 3, JSON.stringify(data.meta));
  });

  await test("a budget that makes the ask illegal is clamped to the in-budget wines plus one splurge", async () => {
    // max $36: only the $35 Rioja is in budget; $40 is a legal splurge, $80 is not (> 2×)
    const { data, sentPayload } = await callRoute(
      routePayload({ pickCount: 5, budget: { min: null, max: 36 } }),
      [modelReply({ picks: [noteFor(2, "value"), noteFor(0, "splurge")], sommSummary: "Two that fit." })]
    );
    assert(sentPayload.pickCount === 2, `Claude was asked for ${sentPayload.pickCount}`);
    assert(!data.fallback && data.picks.length === 2, JSON.stringify(data));
  });

  await test("unpriced candidates under a budget are supply: Claude is asked, and the answer is accepted", async () => {
    // A caller whose prices didn't parse. The validator accepts an unpriced
    // pick under any budget, so the clamp must not answer this slate with silence
    const unpriced = Array.from({ length: 6 }, (_, i) => ({ i, name: `Unpriced ${i}`, country: "France" }));
    const { data, sentPayload, calls } = await callRoute(
      routePayload({ candidates: unpriced, algorithmicPicks: [0, 1, 2, 3, 4], pickCount: 5, budget: { min: null, max: 60 } }),
      [modelReply({ picks: [noteFor(0, "top"), noteFor(1, "value"), noteFor(2, "adventure"), noteFor(3), noteFor(4)], sommSummary: "Five, prices or not." })]
    );
    assert(calls.length === 1, `Claude must be asked (${calls.length} calls)`);
    assert(sentPayload.pickCount === 5, `asked for ${sentPayload.pickCount}`);
    assert(!data.fallback && data.picks.length === 5, JSON.stringify(data).slice(0, 200));
    assert(data.meta.candidates === 6 && data.meta.pickCount === 5 && data.meta.reasons.length === 0, JSON.stringify(data.meta));
  });

  await test("a slate that can supply nothing legal never reaches Claude", async () => {
    // max $10: nothing in budget, nothing within 2× — there is no legal pick
    const { data, calls } = await callRoute(routePayload({ pickCount: 5, budget: { min: null, max: 10 } }));
    assert(data.fallback === true && calls.length === 0, `calls ${calls.length}, ${JSON.stringify(data)}`);
  });

  console.log("\n═══ /api/somm-picks — JSON-only output, and what happens if the API refuses it ═══");

  await test("every call asks for JSON-schema-constrained output", async () => {
    const { sent } = await callRoute(routePayload());
    const format = sent.output_config?.format;
    assert(format?.type === "json_schema", `output_config.format: ${JSON.stringify(sent.output_config)}`);
    const schema = format.schema;
    assert(schema.type === "object" && schema.additionalProperties === false, "closed object");
    assert(JSON.stringify(schema.required) === JSON.stringify(["picks", "sommSummary"]), "picks + sommSummary required");
    const item = schema.properties.picks.items;
    assert(JSON.stringify(item.required) === JSON.stringify(["i", "role", "note"]) && item.additionalProperties === false, "pick shape");
    assert(JSON.stringify(item.properties.role.enum) === JSON.stringify(["top", "value", "adventure", "splurge", "wildcard"]), "the five roles");
  });

  await test("the API rejects the output format → one more call WITHOUT it, and the Somm still answers", async () => {
    const { data, calls } = await callRoute(routePayload(), [
      apiError(400, "invalid_request_error", "output_config.format: this model does not support structured outputs"),
    ]);
    assert(calls.length === 2, `expected 2 calls, got ${calls.length}`);
    assert(calls[0].output_config && !("output_config" in calls[1]), "the second call must drop output_config");
    assert(!data.fallback && data.picks.length === 2, `the Somm must still answer: ${JSON.stringify(data)}`);
    assert(data.meta.reasons.length === 1 && /output format rejected/.test(data.meta.reasons[0]), JSON.stringify(data.meta.reasons));
    assert(data.meta.attempts === 1 && data.meta.outcome === "first_attempt", JSON.stringify(data.meta));
  });

  await test("once rejected, the corrective retry goes without the format too (three calls, never four)", async () => {
    const { data, calls } = await callRoute(routePayload(), [
      apiError(400, "invalid_request_error", "output_config: Extra inputs are not permitted"),
      modelReply({ picks: [noteFor(0, "top")], sommSummary: "One short." }),
    ]);
    assert(calls.length === 3, `expected 3 calls, got ${calls.length}`);
    assert(!("output_config" in calls[1]) && !("output_config" in calls[2]), "no format after the rejection");
    assert(!data.fallback && data.meta.outcome === "retried", JSON.stringify(data.meta));
    assert(data.meta.reasons.length === 2 && /output format rejected/.test(data.meta.reasons[0]) && data.meta.reasons[1] === "pick count 1 < 2", JSON.stringify(data.meta.reasons));
  });

  await test("a 400 that isn't about the format still ends in a fallback that says why", async () => {
    // Both the formatted call and the bare one are refused: nothing was spent, and the reason is recorded
    const { data, calls } = await callRoute(routePayload(), [
      apiError(400, "invalid_request_error", "max_tokens: too large"),
      apiError(400, "invalid_request_error", "max_tokens: too large"),
    ]);
    assert(calls.length === 2, `expected 2 calls, got ${calls.length}`);
    assert(data.fallback === true, "fallback");
    assert(data.meta && data.meta.attempts === 0, `meta must exist so the ledger sees it: ${JSON.stringify(data.meta)}`);
    assert(data.meta.reasons.length === 2 && /output format rejected/.test(data.meta.reasons[0]) && data.meta.reasons[1] === "error: api 400", JSON.stringify(data.meta.reasons));
  });

  console.log("\n═══ /api/somm-picks — the corrective retry names every pick over the max ═══");

  const budgetPayload = (extra = {}) => routePayload({
    candidates: [
      { i: 0, name: "Estate Pinotage", price: 68, score: 9.4 },
      { i: 1, name: "Chenin Blanc", price: 44, score: 5 },
      { i: 2, name: "Second Pinotage", price: 68, score: 2 },
      { i: 3, name: "Syrah", price: 88, score: 3.6 },
      { i: 4, name: "Cinsault", price: 42, score: 1.8 },
      { i: 5, name: "Chardonnay", price: 58, score: 1.6 },
      { i: 6, name: "Grenache", price: 54, score: 1.4 },
      { i: 7, name: "Colombard", price: 40, score: 0.8 },
    ],
    algorithmicPicks: [1, 0, 4, 5, 6], pickCount: 5, budget: { min: null, max: 60 }, ...extra,
  });
  // The reply the up-to-$60 replay kept getting: four good picks, then a second stretch in the last slot
  const twoOver = (last) => ({ picks: [noteFor(1, "top"), noteFor(0, "splurge"), noteFor(4, "value"), noteFor(5, "adventure"), noteFor(last, "wildcard")], sommSummary: "Five." });
  const fixed = twoOver(6);

  await test("two picks over the max: the retry names BOTH by index and price, says one may stay as the splurge, and lists what may replace the other", async () => {
    const { data, calls } = await callRoute(budgetPayload(), [modelReply(twoOver(3)), modelReply(fixed)]);
    assert(calls.length === 2, `expected a retry, got ${calls.length} calls`);
    const retry = calls[1].messages.at(-1).content;
    assert(retry.includes('i=0 ($68, your "splurge")') && retry.includes('i=3 ($88, your "wildcard")'), `both named: ${retry}`);
    assert(/at most ONE/i.test(retry) && /at or under \$60/.test(retry), `the rule as a price: ${retry}`);
    assert(retry.includes("i=6 ($54)") && retry.includes("i=7 ($40)"), `the in-budget wines not picked: ${retry}`);
    assert(!retry.includes("i=2 ($68)"), "an over-max wine is never offered as a replacement");
    assert(/Rules to satisfy/.test(retry) && /ONLY the corrected JSON/.test(retry), "the retry keeps its contract lines");
    assert(!data.fallback && data.meta.outcome === "retried" && data.picks.length === 5, JSON.stringify(data.meta));
  });

  await test("two wines at one price: the retry tells them apart by index (the reply that used to come back unchanged)", async () => {
    // The $68 Splurge and a second $68 as the wildcard. "non-splurge 68 > budget max" read as the Splurge itself.
    const { data, calls } = await callRoute(budgetPayload(), [modelReply(twoOver(2)), modelReply(fixed)]);
    const retry = calls[1].messages.at(-1).content;
    assert(retry.includes('i=0 ($68, your "splurge")') && retry.includes('i=2 ($68, your "wildcard")'), retry);
    assert(data.meta.reasons.length === 1 && data.meta.reasons[0].includes("i=0 $68, i=2 $68"), `the ledger's reason names them too: ${data.meta.reasons[0]}`);
    assert(data.meta.reasons[0].length <= 160, "inside the cap");
  });

  await test("still two over after the retry: a fallback whose reasons name the picks both times", async () => {
    const { data, calls } = await callRoute(budgetPayload(), [modelReply(twoOver(3)), modelReply(twoOver(2))]);
    assert(calls.length === 2 && data.fallback === true, `two calls, then the page keeps its picks: ${JSON.stringify(data)}`);
    assert(data.meta.reasons.length === 2 && data.meta.reasons[0].includes("i=3 $88") && data.meta.reasons[1].includes("i=2 $68"), JSON.stringify(data.meta.reasons));
  });

  await test("a rejection that is not about the budget says nothing about it", async () => {
    const { calls } = await callRoute(budgetPayload(), [modelReply({ picks: [noteFor(1, "top")], sommSummary: "One." }), modelReply(fixed)]);
    const retry = calls[1].messages.at(-1).content;
    assert(/pick count 1 < 5/.test(retry), retry);
    assert(!retry.includes("These picks are priced above") && !retry.includes("i=6 ($54)"), `no budget correction for a short answer: ${retry}`);
  });

  console.log("\n═══ /api/somm-picks — a wine over the max is marked ═══");

  await test("under a budget every candidate over the max reaches Claude marked \"overMax\" — and no other, whatever the caller sent", async () => {
    const payload = budgetPayload();
    payload.candidates[1].overMax = true; // a stale mark on a $44 wine
    const { sentPayload } = await callRoute(payload, [modelReply(fixed)]);
    const marked = sentPayload.candidates.filter((c) => c.overMax === true).map((c) => c.i);
    assert(JSON.stringify(marked) === JSON.stringify([0, 2, 3]), `the three over $60: ${JSON.stringify(marked)}`);
    assert(sentPayload.candidates.every((c) => c.price > 60 || !("overMax" in c)), "a wine inside the budget carries no mark at all");
  });

  await test("no maximum, no marks; and the lone Adventure's slate is never marked", async () => {
    const unlimited = budgetPayload({ budget: { min: null, max: null } });
    unlimited.candidates[0].overMax = true; // a stale mark from a caller
    const open = await callRoute(unlimited, [modelReply(fixed)]);
    assert(open.sentPayload.candidates.every((c) => !("overMax" in c)), "no max: nothing is over it");
    const adventure = await callRoute(routePayload({ mode: "adventure", pickCount: 1, budget: { min: null, max: 50 } }), [
      modelReply({ picks: [{ i: 0, role: "adventure", note: "Not your usual grape, but the nearest thing here to what you love. Worth a try." }], sommSummary: "" }),
    ]);
    assert(adventure.sentPayload.candidates.every((c) => !("overMax" in c)), "the Adventure has no splurge and no mark");
  });

  await test("the brief says what the mark means: at most one marked pick, and it is the splurge", async () => {
    const { sent } = await callRoute(budgetPayload(), [modelReply(fixed)]);
    assert(/"overMax": true/.test(sent.system.split("Your task:")[0]), "the payload description names the mark");
    assert(/at most ONE/i.test(sent.system) && /"overMax"/.test(sent.system.split("3. Budget")[1].split("4. ")[0]), "rule 3 reads the budget through the mark");
    assert(/never above 2x budget\.max/.test(sent.system), "twice the max is still the ceiling");
  });

  console.log("\n═══ /api/somm-picks — the reasons ride the meta ═══");

  await test("a first-attempt success carries no reasons, and says what was asked of which model", async () => {
    const { data } = await callRoute(routePayload());
    const m = data.meta;
    assert(Array.isArray(m.reasons) && m.reasons.length === 0, JSON.stringify(m.reasons));
    assert(m.candidates === 3 && m.pickCount === 2, `candidates ${m.candidates}, pickCount ${m.pickCount}`);
    assert(m.model === "claude-test", `the model the API reported, got ${m.model}`);
    assert(m.outcome === "first_attempt" && m.attempts === 1, JSON.stringify(m));
  });

  await test("a retried success keeps the reason its first attempt was rejected", async () => {
    const { data } = await callRoute(routePayload(), [
      modelReply({ picks: [noteFor(0, "top"), noteFor(0, "value")], sommSummary: "Twice the same." }),
    ]);
    assert(!data.fallback && data.meta.outcome === "retried" && data.meta.attempts === 2, JSON.stringify(data.meta));
    assert(JSON.stringify(data.meta.reasons) === JSON.stringify(["duplicate index 0"]), JSON.stringify(data.meta.reasons));
  });

  await test("a fallback carries one reason per rejected attempt, in order", async () => {
    const { data } = await callRoute(routePayload(), [
      modelReply({ picks: [noteFor(0, "top")], sommSummary: "" }),
      modelText("The constraint cannot be satisfied: I will not invent wines."),
    ]);
    assert(data.fallback === true && data.meta.outcome === "fallback", JSON.stringify(data));
    assert(JSON.stringify(data.meta.reasons) === JSON.stringify(["pick count 1 < 2", "output was not parseable JSON"]), JSON.stringify(data.meta.reasons));
    assert(data.meta.candidates === 3 && data.meta.pickCount === 2 && data.meta.model === "claude-test", JSON.stringify(data.meta));
  });

  await test("a reply that parses to nothing (JSON null) is rejected with a real reason", async () => {
    const { data } = await callRoute(routePayload(), [modelText("null")]);
    assert(!data.fallback && data.meta.outcome === "retried", JSON.stringify(data.meta));
    assert(JSON.stringify(data.meta.reasons) === JSON.stringify(["not an object"]), JSON.stringify(data.meta.reasons));
  });

  await test("an upstream error after a rejected attempt is recorded as its kind, never its message", async () => {
    const { data } = await callRoute(routePayload(), [
      modelReply({ picks: [], sommSummary: "" }),
      apiError(401, "authentication_error", "invalid x-api-key sk-ant-SECRET"),
    ]);
    assert(data.fallback === true && data.meta.attempts === 1, JSON.stringify(data.meta));
    assert(JSON.stringify(data.meta.reasons) === JSON.stringify(["pick count 0 < 2", "error: api 401"]), JSON.stringify(data.meta.reasons));
    assert(!JSON.stringify(data).includes("SECRET"), "an upstream message must never reach the client");
  });

  await test("an upstream error on the very first call still reaches the ledger (meta with zero attempts)", async () => {
    const { data, calls } = await callRoute(routePayload(), [apiError(401, "authentication_error", "invalid x-api-key")]);
    assert(calls.length === 1, `a 401 is not a format rejection — no second call (${calls.length})`);
    assert(data.fallback === true && data.meta && data.meta.attempts === 0, JSON.stringify(data));
    assert(JSON.stringify(data.meta.reasons) === JSON.stringify(["error: api 401"]), JSON.stringify(data.meta.reasons));
    assert(data.meta.usage.inputTokens === 0 && data.meta.usage.estCostUSD === 0, "nothing was spent");
  });

  await test("a reason is capped — model-written junk can't bloat the ledger", async () => {
    const { data } = await callRoute(routePayload(), [
      modelReply({ picks: [noteFor("x".repeat(5000), "top"), noteFor(1)], sommSummary: "" }),
      modelReply({ picks: [noteFor("y".repeat(5000), "top"), noteFor(1)], sommSummary: "" }),
    ]);
    assert(data.fallback === true, "fallback");
    assert(data.meta.reasons.every((r) => typeof r === "string" && r.length <= 160), `lengths ${data.meta.reasons.map((r) => r.length)}`);
  });

  console.log("\n═══ /api/somm-picks — the second line of defense ═══");

  await test("an answer after thinking out loud is read, not thrown away — and counted as a salvage", async () => {
    const prose = "I need to pick 2 wines from candidates 0–2. Let me analyze:\n\n**Roles**: top = 0, value = 2.\n\nWait, should I swap them? No.\n\n";
    const { data, calls } = await callRoute(routePayload(), [
      modelText(prose + "```json\n" + JSON.stringify(goodModelJson(), null, 2) + "\n```"),
    ]);
    assert(calls.length === 1, `one call, not a retry (${calls.length})`);
    assert(!data.fallback && data.picks.length === 2, JSON.stringify(data));
    assert(data.meta.outcome === "salvaged" && data.meta.salvagedCount === 1, JSON.stringify(data.meta));
    assert(data.meta.reasons.length === 0, "a salvage is not a rejection");
  });

  console.log("\n═══ /api/somm-picks — the lone Adventure (mode: \"adventure\") ═══");

  // A list that matched nothing: the priced wines that fit tonight's terms,
  // the engine's placeholder first (sommPicks' buildAdventurePayload)
  const adventurePayload = (extra = {}) => ({
    mode: "adventure",
    candidates: [
      { i: 0, name: "Tenuta Immaginaria Soave Classico", price: 38, country: "Italy", color: "white" },
      { i: 1, name: "Bodegas Inventadas Albariño", price: 46, country: "Spain", color: "white" },
      { i: 2, name: "Quinta Inventada Touriga Nacional", price: 88, country: "Portugal", color: "red" },
    ],
    algorithmicPicks: [0],
    pickCount: 1,
    dna: { archetype: "The South African Curator", varietals: ["Chenin Blanc"] },
    feedback: { loved: [], notForMe: [] },
    menu: { totalWines: 3 },
    budget: { min: null, max: 60 },
    color: null,
    lean: "white",
    steer: null,
    ...extra,
  });
  const NOTE = "Albariño isn’t one of your grapes, but it has the bright, salty snap of the Chenin you love — the nearest thing on this list.";
  const adventureJson = (i = 1, extra = {}) => ({ picks: [{ i, role: "adventure", note: NOTE, ...extra }], sommSummary: "" });

  let ordinaryPrompt = null;
  await test("the Adventure has its own brief: one wine, nearest in spirit, honest that it is a stretch", async () => {
    ordinaryPrompt = (await callRoute(routePayload())).sent.system;
    const { sent, sentPayload } = await callRoute(adventurePayload(), [modelReply(adventureJson())]);
    assert(sent.system !== ordinaryPrompt, "not the ordinary prompt");
    for (const phrase of ["exactly ONE", "nearest in spirit", "stretch", "candidates", "\"adventure\"", "notForMe"]) {
      assert(sent.system.includes(phrase), `the brief says "${phrase}"`);
    }
    assert(/never (say|claim)[^.]*match/i.test(sent.system), "it must not call the wine a match");
    assert(/under 450 characters/.test(sent.system), "the note's length");
    assert(!/Use each of top\/value\/adventure\/splurge/.test(sent.system), "no slate of roles to hand out");
    assert(sentPayload.mode === "adventure" && sentPayload.candidates.length === 3, "the payload reaches Claude as sent");
  });

  await test("the ordinary ask is untouched: its prompt is the same with or without a mode it doesn't know", async () => {
    const plain = (await callRoute(routePayload())).sent.system;
    const odd = (await callRoute(routePayload({ mode: "banana" }))).sent.system;
    assert(plain === ordinaryPrompt && odd === ordinaryPrompt, "one ordinary prompt");
    const { data } = await callRoute(routePayload({ mode: "banana" }));
    assert(!data.fallback && data.picks.length === 2 && data.meta.mode === "picks", JSON.stringify(data.meta));
  });

  await test("it asks for ONE pick whatever the caller sent, and still asks for JSON-schema output", async () => {
    const { sent, sentPayload, data } = await callRoute(adventurePayload({ pickCount: 5 }), [modelReply(adventureJson())]);
    assert(sentPayload.pickCount === 1, `asked for ${sentPayload.pickCount}`);
    assert(sent.output_config?.format?.type === "json_schema", "the output format");
    assert(data.meta.pickCount === 1 && data.meta.candidates === 3, JSON.stringify(data.meta));
  });

  await test("the answer is one Adventure with its note and no summary — whatever role and summary the model wrote", async () => {
    const { data, calls } = await callRoute(adventurePayload(), [
      modelReply({ picks: [{ i: 1, role: "top", note: NOTE }], sommSummary: "Nothing here is yours, but one comes close." }),
    ]);
    assert(calls.length === 1, "one call");
    assert(JSON.stringify(data.picks) === JSON.stringify([{ i: 1, role: "adventure", note: NOTE }]), JSON.stringify(data.picks));
    assert(data.sommSummary === "", `summary "${data.sommSummary}"`);
    assert(data.meta.outcome === "first_attempt" && data.meta.mode === "adventure", JSON.stringify(data.meta));
    assert(data.meta.reasons.length === 0, "no reasons on a clean answer");
  });

  await test("a wine over the max is rejected — an Adventure is never a stretch on price — and the retry is told so", async () => {
    const { data, calls } = await callRoute(adventurePayload(), [
      modelReply(adventureJson(2)),          // $88 against a $60 max
      modelReply(adventureJson(1)),
    ]);
    assert(calls.length === 2, `${calls.length} calls`);
    const correction = calls[1].messages[2].content;
    assert(correction.includes("adventure 88 > budget max"), correction);
    assert(/exactly one pick/i.test(correction) && /at or under budget\.max/.test(correction), correction);
    assert(!/splurge/i.test(correction), "the Adventure's correction never offers a splurge");
    assert(data.picks[0].i === 1 && data.meta.outcome === "retried", JSON.stringify(data.meta));
    assert(JSON.stringify(data.meta.reasons) === JSON.stringify(["adventure 88 > budget max"]), JSON.stringify(data.meta.reasons));
  });

  await test("two bad answers → the silent fallback, with a meta that says why (the page keeps the engine's pick)", async () => {
    const { data, calls } = await callRoute(adventurePayload(), [
      modelReply(adventureJson(9)),
      modelReply({ picks: [], sommSummary: "" }),
    ]);
    assert(calls.length === 2 && data.fallback === true && !data.picks, JSON.stringify(data));
    assert(data.meta.outcome === "fallback" && data.meta.mode === "adventure" && data.meta.attempts === 2, JSON.stringify(data.meta));
    assert(JSON.stringify(data.meta.reasons) === JSON.stringify(["index 9 not in candidates", "pick count 0 < 1"]), JSON.stringify(data.meta.reasons));
  });

  await test("a slate with nothing inside the max never reaches Claude", async () => {
    const { data, calls } = await callRoute(adventurePayload({ budget: { min: null, max: 30 } }));
    assert(calls.length === 0, "no call");
    assert(data.fallback === true && !data.meta, JSON.stringify(data));
  });

  await test("the steer is trimmed and capped for the Adventure too, and an upstream error still falls back quietly", async () => {
    const { sentPayload } = await callRoute(adventurePayload({ steer: `  ${"x".repeat(400)}  ` }), [modelReply(adventureJson())]);
    assert(sentPayload.steer.length === 200, `steer ${sentPayload.steer.length}`);
    const { data } = await callRoute(adventurePayload(), [apiError(401, "authentication_error", "invalid x-api-key")]);
    assert(data.fallback === true && data.meta.mode === "adventure", JSON.stringify(data));
    assert(data.meta.reasons.at(-1) === "error: api 401", JSON.stringify(data.meta.reasons));
  });

  console.log(`\nTotal: ${passed}/${passed + failed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => { console.error("Test runner crashed:", err); process.exit(1); });
