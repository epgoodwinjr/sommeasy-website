// Tests for the scan path's not-a-list gate (Path B of /api/parse-wine-list)
// Run with: node src/lib/__tests__/wineListText.test.js
//
// When Vision can't see a wine list it sometimes ignores the JSON
// instruction and answers in conversation ("I don't see any image attached
// to your message…"). The route used to hand ANY non-JSON reply of 20+
// chars to the client as Path B text, so that prose appeared in the paste
// box under "Extracted from your photo". looksLikeWineList decides whether
// a non-JSON reply really reads as a wine list; everything else must reach
// the user as the branded no_wines scan error.
//
// Part 1 runs the REAL module on a verdict table — the prose fixtures are
// Claude's actual replies to the 24×24 tiny-image e2e fixture, captured
// Oct 30, 2026. Part 2 runs the REAL route handler (the sommRoute pattern:
// alias-loader + globalThis.fetch scripted as Claude).

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

// ——— Claude's real non-list replies (tiny-image.jpg, Oct 30, 2026) ———
const PROSE_NO_IMAGE =
  "I don't see any image attached to analyze. The image appears to be a small gray square without any visible wine list content.\n\nCould you please share the wine list image you'd like me to analyze? Once you upload a clear image of the restaurant wine list, I'll extract all the wine entries into the structured JSON format you've specified.";
const PROSE_NUMBERED_ASK =
  "I notice you've shared what appears to be a very small or low-resolution gray image. I cannot make out any text or wine list content from this image.\n\nCould you please:\n1. **Share a higher resolution version** of the wine list image, or\n2. **Paste the wine list as text** if you have it in that format?\n\nOnce I can see the actual content, I'll extract all wines into the structured JSON format you've requested.";
// The reply quoted in the original bug report
const PROSE_REPORTED =
  "I don't see any image attached to your message. Could you please share the restaurant wine list image…";

// ——— genuine list text ———
const SAMPLE_LIST = `WHITES
Cloudy Bay Sauvignon Blanc, Marlborough 2022...$52
Trimbach Riesling, Alsace 2021...$44
Cakebread Chardonnay, Napa Valley 2021...$72

REDS
Kanonkop Pinotage, Stellenbosch 2019...$68
Catena Zapata Malbec, Mendoza 2020...$58
Ridge Monte Bello, Santa Cruz Mountains 2019...$250`;

async function main() {
  const { looksLikeWineList } = await import("../wineListText.js");

  console.log("\n═══ looksLikeWineList — prose and refusals are not lists ═══");

  await test("Claude's 'I don't see any image' reply is not a list", async () => {
    assert(looksLikeWineList(PROSE_NO_IMAGE) === false, "conversational refusal accepted as list text");
  });

  await test("a refusal that asks the user to paste (numbered steps) is not a list", async () => {
    assert(looksLikeWineList(PROSE_NUMBERED_ASK) === false, "numbered conversational ask accepted as list text");
  });

  await test("the reply quoted in the bug report is not a list", async () => {
    assert(looksLikeWineList(PROSE_REPORTED) === false, "reported refusal accepted as list text");
  });

  await test("a pronoun-free description of the image is not a list", async () => {
    const text = "The image appears to be a solid gray square. No wine list text is visible.";
    assert(looksLikeWineList(text) === false, "image description accepted as list text");
  });

  await test("prose that quotes a vintage and a price is still not a list", async () => {
    const text = "I can only make out a vintage — 2019 — and a price of $45.\nCould you upload a sharper photo so I can read the rest?";
    assert(looksLikeWineList(text) === false, "numbers inside conversation counted as list entries");
  });

  await test("first-person observations that quote a vintage and a price are not a list", async () => {
    const text = [
      "I can make out a vintage, 2019, near the top.",
      "I can also see a price of $45 at the bottom.",
      "The rest of the image is too blurry to read.",
    ].join("\n");
    assert(looksLikeWineList(text) === false, "the model describing what it sees was read as two entries");
  });

  await test("a second-person explanation of a non-wine photo is not a list", async () => {
    const text = [
      "Your photo looks like a receipt dated 2024, not a wine list.",
      "The total at the bottom reads $86.",
      "If you have the wine list itself, send a photo of that instead.",
    ].join("\n");
    assert(looksLikeWineList(text) === false, "a receipt explanation was read as list entries");
  });

  await test("number-bearing lines outweighed by conversation are not a list", async () => {
    const text = [
      "I'm sorry, but I can't read this image.",
      "Here's what I can tell you about it:",
      "- Dimensions: 24 x 24",
      "- File size: 642",
      "Please upload a clearer photo of the wine list.",
    ].join("\n");
    assert(looksLikeWineList(text) === false, "two stray numeric lines beat three lines of conversation");
  });

  console.log("\n═══ looksLikeWineList — too little list-like text ═══");

  await test("missing, empty, and whitespace-only text are not lists", async () => {
    for (const text of [null, undefined, "", "   \n\t  \n"]) {
      assert(looksLikeWineList(text) === false, `accepted ${JSON.stringify(text)}`);
    }
  });

  await test("a bare header is not a list", async () => {
    assert(looksLikeWineList("Wine List") === false, "header-only text accepted");
  });

  await test("a single wine line is too little to call a list", async () => {
    assert(looksLikeWineList("Kanonkop Pinotage, Stellenbosch 2019...$68") === false, "one entry accepted as a list");
  });

  console.log("\n═══ looksLikeWineList — genuine list text still flows ═══");

  await test("a priced list with section headers is a list", async () => {
    assert(looksLikeWineList(SAMPLE_LIST) === true, "the e2e sample list was rejected");
  });

  await test("two priced entries are enough", async () => {
    const text = "Kanonkop Pinotage, Stellenbosch 2019...$68\nCatena Zapata Malbec, Mendoza 2020...$58";
    assert(looksLikeWineList(text) === true, "a two-entry list was rejected");
  });

  await test("OCR-style lines with dot leaders, bare prices, and glass/bottle pairs are a list", async () => {
    const text = [
      "BY THE GLASS",
      "Prosecco, Bisol 14/56",
      "Cloudy Bay Sauvignon Blanc, Marlborough .......... 52",
      "Trimbach Riesling, Alsace .......... 44",
    ].join("\n");
    assert(looksLikeWineList(text) === true, "a list without currency marks or vintages was rejected");
  });

  await test("a column-split transcription (vintage and price on their own lines) is a list", async () => {
    const text = [
      "Cloudy Bay Sauvignon Blanc", "Marlborough, New Zealand", "2022", "52",
      "Kanonkop Pinotage", "Stellenbosch, South Africa", "2019", "68",
    ].join("\n");
    assert(looksLikeWineList(text) === true, "column-split list was rejected");
  });

  await test("a markdown table of wines is a list", async () => {
    const text = [
      "| Wine | Vintage | Price |",
      "|---|---|---|",
      "| Cloudy Bay Sauvignon Blanc | 2022 | $52 |",
      "| Kanonkop Pinotage | 2019 | $68 |",
    ].join("\n");
    assert(looksLikeWineList(text) === true, "markdown table was rejected");
  });

  await test("mid-line prices in dollars, euros, and pounds count", async () => {
    const text = [
      "House Sauvignon Blanc — $14 glass / $56 bottle",
      "Château Musar Rouge — 85 € the bottle",
      "Domaine Tempier Bandol Rosé — £64 the bottle",
    ].join("\n");
    assert(looksLikeWineList(text) === true, "currency-marked prices that don't end the line were not recognised");
  });

  await test("unpriced entries still read as entries by their vintage or NV", async () => {
    const text = "Château Margaux 2015, Margaux\nKrug Grande Cuvée NV";
    assert(looksLikeWineList(text) === true, "a mid-line vintage or an NV bottling was not recognised");
  });

  await test("a one-line conversational preface doesn't sink a real list", async () => {
    const text = [
      "Here are the wines I can read from the list:",
      "",
      "Cloudy Bay Sauvignon Blanc 2022 — $52",
      "Trimbach Riesling 2021 — $44",
      "Kanonkop Pinotage 2019 — $68",
    ].join("\n");
    assert(looksLikeWineList(text) === true, "a preface outweighed three real entries");
  });

  await test("a partial read — two real entries wrapped in two lines of chatter — still flows", async () => {
    const text = [
      "Here are the two wines I could read:",
      "Cloudy Bay Sauvignon Blanc 2022 — $52",
      "Kanonkop Pinotage 2019 — $68",
      "The rest of the list is too blurry; please send a sharper photo if you'd like more.",
    ].join("\n");
    assert(looksLikeWineList(text) === true, "real entries were discarded because chatter merely equalled them");
  });

  await test("third-person tasting notes between entries don't sink a real list", async () => {
    const text = [
      "Cloudy Bay Sauvignon Blanc, Marlborough 2022 — $52",
      "Bright and zesty, with notes of citrus, passionfruit and wet stone.",
      "Kanonkop Pinotage, Stellenbosch 2019 — $68",
      "Smoky dark fruit and a long, savoury finish. Pairs beautifully with lamb.",
    ].join("\n");
    assert(looksLikeWineList(text) === true, "tasting notes counted against the list");
  });

  await test("Italian producers named 'I …' are wine entries, not first-person talk", async () => {
    const text = "I Sodi di San Niccolò, Castellare 2018 ......... $120\nI Clivi Galea, Friuli 2020 ......... $64";
    assert(looksLikeWineList(text) === true, "'I Sodi' / 'I Clivi' read as the model talking");
  });

  await test("a JSON reply cut off at the token limit still flows (its entries are list content)", async () => {
    const text = [
      "{",
      '  "wines": [',
      "    {",
      '      "name": "Cloudy Bay Sauvignon Blanc 2022",',
      '      "vintage": "2022",',
      '      "price": 52,',
      '      "section": "White Wine",',
      "    },",
      "    {",
      '      "name": "Kanonkop Pinotage 2019",',
      '      "vintage": "201',
    ].join("\n");
    assert(looksLikeWineList(text) === true, "truncated JSON list content was rejected");
  });

  // ——— Part 2: the REAL route with a scripted Claude ———
  let anthropicCalls = 0;
  let scriptedReply = "";
  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === "string" ? input : input.url;
    if (!url.includes("api.anthropic.com")) throw new Error("unexpected fetch: " + url);
    anthropicCalls++;
    return new Response(
      JSON.stringify({
        id: "msg_test", type: "message", role: "assistant", model: "claude-test",
        content: [{ type: "text", text: scriptedReply }],
        stop_reason: "end_turn", stop_sequence: null,
        usage: { input_tokens: 1500, output_tokens: 80 },
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  };

  const { POST } = await import("../../app/api/parse-wine-list/route.js");

  const scan = async (reply) => {
    scriptedReply = reply;
    anthropicCalls = 0;
    const req = new Request("http://localhost:3000/api/parse-wine-list", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ imageBase64: "/9j/4AAQSkZJRgABAQ==", mimeType: "image/jpeg" }),
    });
    // The route's diagnostic + cost log lines are expected; keep test output readable
    const log = console.log;
    console.log = () => {};
    try {
      const res = await POST(req);
      return { res, data: await res.json() };
    } finally {
      console.log = log;
    }
  };

  console.log("\n═══ /api/parse-wine-list — Path B only carries list text ═══");

  await test("a conversational Vision reply becomes the branded no_wines scan error", async () => {
    const { res, data } = await scan(PROSE_NO_IMAGE);
    assert(anthropicCalls === 1, `Claude should be called exactly once, got ${anthropicCalls}`);
    assert(res.status === 200, `status ${res.status}`);
    assert(data.errorType === "no_wines", `errorType ${JSON.stringify(data.errorType)}`);
    assert(typeof data.error === "string" && data.error.length > 0, "missing error copy");
    assert(!data.error.includes("attached"), "error copy leaked the model's words");
    assert(/photo/i.test(data.error) && /paste/i.test(data.error), "error copy must tell the user what to do next (clearer photo or paste)");
    assert(data.rawText === undefined, "non-list prose must never travel to the client as text");
    assert(data.source === undefined, "an error must not carry a Path B source tag");
  });

  await test("a plain-text wine list still flows through Path B untouched", async () => {
    const { data } = await scan(SAMPLE_LIST);
    assert(anthropicCalls === 1, `Claude should be called exactly once, got ${anthropicCalls}`);
    assert(data.error === undefined, `unexpected error: ${data.error}`);
    assert(data.source === "vision_text", `source ${JSON.stringify(data.source)}`);
    assert(data.rawText === SAMPLE_LIST, "Path B text must reach the client exactly as Claude returned it");
  });

  console.log(`\nTotal: ${passed}/${passed + failed} passed, ${failed} failed\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => { console.error("Test runner crashed:", err); process.exit(1); });
