// The quiz save is a handful of requests, whatever the quiz size (launch prep
// Session 2b, Nov 2026). Run with: node src/lib/__tests__/quizSave.test.js
//
// The first signed-in load after signup took ~15 seconds on a phone: home's
// loading screen (and the signed-in reveal) waited on saveQuizProfile, whose
// syncQuizSelections made TWO SEQUENTIAL REQUESTS PER QUIZ ITEM (~88 round
// trips for a full quiz) and whose reconcileQuizPromotions made one per
// stale row. Both now batch: a read and at most two writes for the sync, a
// read and at most one write for the reconcile, the two side by side.
//
// THE ORACLE: the loop as it shipped at 7848671 (copied verbatim below). The
// real batched functions must leave dna_accumulation exactly as the loop
// did — row for row, column for column — over hundreds of seeded states,
// against a scripted Postgres that keeps the unique key, the column
// defaults, and ON CONFLICT's refusal to touch one row twice in a statement.

const { register } = require("node:module");
const { pathToFileURL } = require("node:url");
register("./helpers/alias-loader.mjs", pathToFileURL(__filename));

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (err) { failed++; console.log(`  ✗ ${name}\n    ${err.message}`); }
}
function assert(cond, msg) { if (!cond) throw new Error("ASSERT FAILED: " + msg); }
const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

const UID = "user-quiz-save";
const ACC_DEFAULTS = {
  points: 0, interaction_count: 0, promoted: false, promoted_at: null,
  demoted_at: null, source: "auto", mappable: true,
};
const ACC_KEY = ["user_id", "dimension", "dimension_value"];

// ─── A scripted Postgres behind a PostgREST-shaped client ───

function makeDb(seed = {}) {
  return { tables: { dna_accumulation: [], wine_profiles: [], wine_interactions: [], wine_events: [], ...clone(seed) }, seq: 0 };
}

// opts.latency: ms per request (real timers, so the critical path can be
// measured); opts.fail: { [label]: error } fails that request; opts.before:
// { [label]: fn } runs against the db just before that request executes
function makeClient(db, opts = {}) {
  const log = [];
  const { latency = 0, fail = {}, before = {} } = opts;
  const keyOf = (r) => ACC_KEY.map((k) => r[k]).join("\u0000");
  const matches = (row, filters) => filters.every(([kind, col, val]) => {
    if (kind === "eq") return row[col] === val;
    if (kind === "in") return val.includes(row[col]);
    if (kind === "not-is") return val === null ? row[col] != null : row[col] !== val;
    return true;
  });
  const fresh = (table, it) => ({
    id: `row-${++db.seq}`,
    ...(table === "dna_accumulation" ? ACC_DEFAULTS : {}),
    ...clone(it),
  });

  function from(table) {
    const q = { op: "select", filters: [], data: null, single: null, count: false, returning: false, onConflict: null, ignore: false };
    const rows = () => (db.tables[table] ||= []);
    function exec() {
      const label = `${q.op}:${table}`;
      before[label]?.(db);
      if (fail[label]) return { data: null, error: fail[label] };
      if (q.op === "insert") {
        const items = Array.isArray(q.data) ? q.data : [q.data];
        if (table === "dna_accumulation") {
          const seen = new Set(rows().map(keyOf));
          for (const it of items) {
            if (seen.has(keyOf(it))) return { data: null, error: { code: "23505", message: "duplicate key" } };
            seen.add(keyOf(it));
          }
        }
        for (const it of items) rows().push(fresh(table, it));
        return { data: null, error: null };
      }
      if (q.op === "update") {
        for (const r of rows().filter((r) => matches(r, q.filters))) Object.assign(r, clone(q.data));
        return { data: null, error: null };
      }
      if (q.op === "upsert") {
        const items = Array.isArray(q.data) ? q.data : [q.data];
        const keys = (q.onConflict || "user_id").split(",");
        const k = (r) => keys.map((c) => r[c]).join("\u0000");
        // Postgres: "ON CONFLICT DO UPDATE command cannot affect row a second
        // time" — one statement may not carry one key twice
        if (new Set(items.map(k)).size !== items.length) {
          return { data: null, error: { code: "21000", message: "cannot affect row a second time" } };
        }
        const written = [];
        for (const it of items) {
          const hit = rows().find((r) => k(r) === k(it));
          if (hit) { if (!q.ignore) { Object.assign(hit, clone(it)); written.push(hit); } }
          else { const row = fresh(table, it); rows().push(row); written.push(row); }
        }
        if (!q.returning) return { data: null, error: null };
        return { data: q.single ? clone(written[0] ?? null) : clone(written), error: null };
      }
      const found = rows().filter((r) => matches(r, q.filters)).map(clone);
      if (q.count) return { data: null, count: found.length, error: null };
      if (q.single === "single") {
        return found.length === 1 ? { data: found[0], error: null } : { data: null, error: { code: "PGRST116", message: "rows" } };
      }
      if (q.single === "maybe") return { data: found[0] || null, error: null };
      return { data: found, error: null };
    }
    const b = {
      select(_c, o) { if (q.op === "select") { if (o?.count) q.count = true; } else q.returning = true; return b; },
      eq(c, v) { q.filters.push(["eq", c, v]); return b; },
      in(c, v) { q.filters.push(["in", c, [...v]]); return b; },
      not(c, op, v) { if (op === "is") q.filters.push(["not-is", c, v]); return b; },
      order() { return b; },
      limit() { return b; },
      insert(d) { q.op = "insert"; q.data = d; return b; },
      update(d) { q.op = "update"; q.data = d; return b; },
      upsert(d, o) { q.op = "upsert"; q.data = d; q.onConflict = o?.onConflict || null; q.ignore = !!o?.ignoreDuplicates; return b; },
      single() { q.single = "single"; return b; },
      maybeSingle() { q.single = "maybe"; return b; },
      then(res, rej) {
        log.push(`${q.op}:${table}`);
        const run = () => exec();
        const p = latency
          ? new Promise((r) => setTimeout(() => r(run()), latency))
          : Promise.resolve().then(run);
        return p.then(res, rej);
      },
    };
    return b;
  }
  return { supabase: { from }, log };
}

// ─── The oracle: the loop at 7848671, verbatim but for its imports ───

let R, PRODUCERS; // wineResolver exports + wineUnified.producers, loaded below

async function loopSyncQuizSelections(supabase, userId, quizAnswers) {
  const { countries, regions, estates, varietals } = quizAnswers;
  const items = [];
  for (const countryId of (countries || [])) {
    if (R.isValidDnaCountry(countryId)) {
      items.push({ dimension: "country", dimensionValue: countryId, displayName: R.getCountryDisplayName(countryId) });
    }
  }
  for (const [countryId, regionIds] of Object.entries(regions || {})) {
    for (const regionId of regionIds) {
      if (R.isValidDnaRegion(regionId)) {
        items.push({ dimension: "region", dimensionValue: regionId, displayName: R.getRegionDisplayName(regionId) });
      }
    }
  }
  for (const [regionId, estateIds] of Object.entries(estates || {})) {
    for (const estateId of estateIds) {
      const estateList = PRODUCERS[regionId] || [];
      const estate = estateList.find(e => e.id === estateId);
      if (estate) items.push({ dimension: "estate", dimensionValue: estateId, displayName: estate.name });
    }
  }
  for (const varietalId of (varietals || [])) {
    if (R.isValidDnaVarietal(varietalId)) {
      items.push({ dimension: "varietal", dimensionValue: varietalId, displayName: R.DNA_TO_VARIETY_NAME[varietalId] || varietalId });
    }
  }
  for (const item of items) {
    const { data: existing } = await supabase
      .from("dna_accumulation")
      .select("id, source, promoted")
      .eq("user_id", userId)
      .eq("dimension", item.dimension)
      .eq("dimension_value", item.dimensionValue)
      .single();
    if (existing) {
      if (existing.promoted && existing.source === "auto") continue;
      await supabase.from("dna_accumulation").update({
        source: "quiz", promoted: true, promoted_at: new Date().toISOString(),
        display_name: item.displayName, mappable: true,
      }).eq("id", existing.id);
    } else {
      await supabase.from("dna_accumulation").insert({
        user_id: userId, dimension: item.dimension, dimension_value: item.dimensionValue,
        display_name: item.displayName, points: 0, interaction_count: 0, promoted: true,
        promoted_at: new Date().toISOString(), source: "quiz", mappable: true,
      });
    }
  }
}

async function loopReconcileQuizPromotions(supabase, userId, savedRaw) {
  const inDna = {
    country: new Set(savedRaw.countries || []),
    region: new Set(Object.values(savedRaw.regions || {}).flat()),
    estate: new Set(Object.values(savedRaw.estates || {}).flat()),
    varietal: new Set(savedRaw.varietals || []),
  };
  const { data: promoted } = await supabase
    .from("dna_accumulation").select("id, dimension, dimension_value")
    .eq("user_id", userId).eq("promoted", true);
  for (const row of promoted || []) {
    const set = inDna[row.dimension];
    if (set && !set.has(row.dimension_value)) {
      await supabase.from("dna_accumulation").update({
        promoted: false, demoted_at: new Date().toISOString(),
      }).eq("id", row.id);
    }
  }
}

// ─── Seeded states ───

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (rnd, arr) => arr[Math.floor(rnd() * arr.length)];

let POOLS;
function buildPools(W) {
  const countries = W.countries.map((c) => c.id);
  const regionsByCountry = Object.fromEntries(Object.entries(W.regions).map(([c, rs]) => [c, rs.map((r) => r.id)]));
  const regions = Object.values(regionsByCountry).flat();
  const estateRegions = Object.keys(W.producers).filter((r) => W.producers[r].length);
  const counts = new Map();
  for (const list of Object.values(W.producers)) for (const e of list) counts.set(e.id, (counts.get(e.id) || 0) + 1);
  const twins = [...counts].filter(([, n]) => n > 1).map(([id]) => id);
  const homes = new Map();
  for (const [r, list] of Object.entries(W.producers)) for (const e of list) {
    if (!homes.has(e.id)) homes.set(e.id, []);
    homes.get(e.id).push(r);
  }
  const varietals = Object.keys(R.DNA_TO_VARIETY_NAME);
  return { countries, regionsByCountry, regions, estateRegions, twins, homes, varietals };
}

// A quiz answer set: valid ids, a few invalid ones, estates listed under two
// regions, and (sometimes) one value repeated
function randomAnswers(rnd, size) {
  const a = { countries: [], regions: {}, estates: {}, varietals: [], specificWines: [] };
  for (let i = 0; i < size; i++) {
    const roll = rnd();
    if (roll < 0.2) a.countries.push(rnd() < 0.9 ? pick(rnd, POOLS.countries) : "atlantis");
    else if (roll < 0.45) {
      const c = pick(rnd, Object.keys(POOLS.regionsByCountry));
      (a.regions[c] ||= []).push(rnd() < 0.9 ? pick(rnd, POOLS.regionsByCountry[c] || ["nowhere"]) : "nowhere");
    } else if (roll < 0.75) {
      if (rnd() < 0.3) {
        // A twin estate: filed under every region the data files it under
        const id = pick(rnd, POOLS.twins);
        for (const r of POOLS.homes.get(id)) (a.estates[r] ||= []).push(id);
      } else {
        const r = pick(rnd, POOLS.estateRegions);
        const id = rnd() < 0.92 ? pick(rnd, PRODUCERS[r]).id : "ghost_estate";
        (a.estates[r] ||= []).push(id);
      }
    } else a.varietals.push(rnd() < 0.9 ? pick(rnd, POOLS.varietals) : "unobtainium");
  }
  if (rnd() < 0.2 && a.countries.length) a.countries.push(a.countries[0]);
  return a;
}

function flatValues(a) {
  return [
    ...a.countries.map((v) => ["country", v]),
    ...Object.values(a.regions).flat().map((v) => ["region", v]),
    ...Object.values(a.estates).flat().map((v) => ["estate", v]),
    ...a.varietals.map((v) => ["varietal", v]),
  ];
}

// Existing accumulation rows: some on the quiz's own values, some outside
// it, every combination of promoted / source / points
function randomRows(rnd, answers) {
  const rows = [];
  const seen = new Set();
  const addRow = (dimension, value) => {
    const k = `${dimension}\u0000${value}`;
    if (seen.has(k)) return;
    seen.add(k);
    const promoted = rnd() < 0.6;
    rows.push({
      id: `seed-${rows.length}`, user_id: UID, dimension, dimension_value: value,
      display_name: `Old ${value}`, points: Math.floor(rnd() * 9) - 2,
      interaction_count: Math.floor(rnd() * 4), promoted,
      promoted_at: promoted ? "2026-01-01T00:00:00.000Z" : null,
      demoted_at: rnd() < 0.2 ? "2026-02-01T00:00:00.000Z" : null,
      source: rnd() < 0.5 ? "auto" : "quiz", mappable: rnd() < 0.85,
    });
  };
  for (const [d, v] of flatValues(answers)) if (rnd() < 0.5) addRow(d, v);
  const outside = Math.floor(rnd() * 14);
  for (let i = 0; i < outside; i++) {
    const roll = rnd();
    if (roll < 0.25) addRow("country", pick(rnd, POOLS.countries));
    else if (roll < 0.5) addRow("region", pick(rnd, POOLS.regions));
    else if (roll < 0.75) addRow("estate", pick(rnd, PRODUCERS[pick(rnd, POOLS.estateRegions)]).id);
    else addRow("varietal", pick(rnd, POOLS.varietals));
  }
  // Another user's row on a quiz value: never read, never written
  const first = flatValues(answers)[0];
  if (first) rows.push({ id: "other-user", user_id: "someone-else", dimension: first[0], dimension_value: first[1], display_name: "Theirs", ...ACC_DEFAULTS, promoted: true, source: "auto" });
  return rows;
}

// merged ⊇ quiz: what mergeQuizWithEarnedDna hands the reconcile (the quiz
// plus some of the earned rows)
function mergedFrom(rnd, answers, rows) {
  const m = clone(answers);
  for (const r of rows) {
    if (r.user_id !== UID || !(r.promoted && r.source === "auto") || rnd() < 0.3) continue;
    if (r.dimension === "country") m.countries.push(r.dimension_value);
    else if (r.dimension === "varietal") m.varietals.push(r.dimension_value);
    else if (r.dimension === "region") (m.regions.any ||= []).push(r.dimension_value);
    else (m.estates.any ||= []).push(r.dimension_value);
  }
  return m;
}

// The table as a comparable value: ids dropped; a timestamp column reads as
// its seeded value, null, or "now" (the two runs write different clocks)
function snapshot(db, seedRows) {
  const seeded = new Map(seedRows.map((r) => [`${r.user_id}\u0000${r.dimension}\u0000${r.dimension_value}`, r]));
  return db.tables.dna_accumulation
    .map((r) => {
      const key = `${r.user_id}\u0000${r.dimension}\u0000${r.dimension_value}`;
      const was = seeded.get(key) || {};
      const out = { ...r };
      delete out.id;
      for (const col of ["promoted_at", "demoted_at"]) {
        out[col] = r[col] == null ? null : r[col] === was[col] ? r[col] : "now";
      }
      return [key, out];
    })
    .sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

function firstDifference(a, b) {
  if (a.length !== b.length) return `row count ${a.length} vs ${b.length}`;
  for (let i = 0; i < a.length; i++) {
    const [ka, ra] = a[i], [kb, rb] = b[i];
    if (ka !== kb) return `row ${i}: ${ka.replace(/\u0000/g, "/")} vs ${kb.replace(/\u0000/g, "/")}`;
    for (const col of new Set([...Object.keys(ra), ...Object.keys(rb)])) {
      if (JSON.stringify(ra[col]) !== JSON.stringify(rb[col])) {
        return `${ka.replace(/\u0000/g, "/")}.${col}: loop ${JSON.stringify(ra[col])} vs batched ${JSON.stringify(rb[col])}`;
      }
    }
  }
  return null;
}

async function main() {
  R = await import("../wineResolver.js");
  const W = (await import("../wineUnified.json", { with: { type: "json" } })).default;
  PRODUCERS = W.producers;
  POOLS = buildPools(W);
  const E = await import("../dnaEvolution.js");
  const { saveQuizProfile } = await import("../saveQuizProfile.js");
  const fs = require("node:fs");

  console.log("\nThe batched sync and reconcile leave the table as the loop did");

  await test("premise: the data files some estates under two regions, and some twice under one", () => {
    const cross = POOLS.twins.filter((t) => new Set(POOLS.homes.get(t)).size > 1);
    assert(cross.length >= 5 && cross.length < POOLS.twins.length, `cross-region ${cross.length} of ${POOLS.twins.length}`);
  });

  await test("400 seeded states: row for row, column for column, as the loop left them", async () => {
    let compared = 0, touched = 0;
    for (let seed = 1; seed <= 400; seed++) {
      const rnd = mulberry32(seed);
      const answers = randomAnswers(rnd, Math.floor(rnd() * 46));
      const seedRows = randomRows(rnd, answers);
      const merged = mergedFrom(rnd, answers, seedRows);

      const loopDb = makeDb({ dna_accumulation: seedRows });
      const { supabase: loopSb } = makeClient(loopDb);
      await loopReconcileQuizPromotions(loopSb, UID, merged);
      await loopSyncQuizSelections(loopSb, UID, answers);

      const batchDb = makeDb({ dna_accumulation: seedRows });
      const { supabase: batchSb, log } = makeClient(batchDb);
      // Side by side, as saveQuizProfile runs them — on odd seeds handed the
      // rows the save read up front (then the writes are the only requests)
      const pre = seed % 2
        ? (await batchSb.from("dna_accumulation").select("id, dimension, dimension_value, source, promoted, mappable").eq("user_id", UID)).data
        : null;
      const reads = log.length;
      await Promise.all([
        E.reconcileQuizPromotions(batchSb, UID, merged, pre),
        E.syncQuizSelections(batchSb, UID, answers, pre),
      ]);
      if (pre) assert(log.slice(reads).every((l) => !l.startsWith("select")), `seed ${seed}: read again: ${log.join(" ")}`);

      const diff = firstDifference(snapshot(loopDb, seedRows), snapshot(batchDb, seedRows));
      assert(!diff, `seed ${seed}: ${diff}`);
      compared++;
      if (JSON.stringify(snapshot(loopDb, seedRows)) !== JSON.stringify(snapshot(makeDb({ dna_accumulation: seedRows }), seedRows))) touched++;
    }
    assert(compared === 400 && touched > 300, `compared ${compared}, states the save changed ${touched}`);
  });

  await test("the merge reads the same earned rows from the save's own read as from its query (120 states)", async () => {
    for (let seed = 500; seed < 620; seed++) {
      const rnd = mulberry32(seed);
      const answers = randomAnswers(rnd, Math.floor(rnd() * 30));
      const seedRows = randomRows(rnd, answers);
      for (const r of seedRows) if (rnd() < 0.15) r.mappable = null;
      const initial = rnd() < 0.5 ? randomAnswers(rnd, 10) : null;
      const db = makeDb({ dna_accumulation: seedRows });
      const { supabase } = makeClient(db);
      const viaQuery = await E.mergeQuizWithEarnedDna(supabase, UID, answers, initial);
      const pre = db.tables.dna_accumulation.filter((r) => r.user_id === UID);
      const viaRows = await E.mergeQuizWithEarnedDna(supabase, UID, answers, initial, pre);
      assert(JSON.stringify(viaQuery) === JSON.stringify(viaRows), `seed ${seed}`);
    }
  });

  await test("an earned row keeps source 'auto', its points and its stamp (the ✦ survives a refine)", async () => {
    const seedRows = [{ id: "e", user_id: UID, dimension: "varietal", dimension_value: "malbec", display_name: "Malbec", points: 7, interaction_count: 3, promoted: true, promoted_at: "2026-03-01T00:00:00.000Z", demoted_at: null, source: "auto", mappable: true }];
    const db = makeDb({ dna_accumulation: seedRows });
    await E.syncQuizSelections(makeClient(db).supabase, UID, { varietals: ["malbec", "syrah"] });
    const malbec = db.tables.dna_accumulation.find((r) => r.dimension_value === "malbec");
    assert(JSON.stringify(malbec) === JSON.stringify(seedRows[0]), JSON.stringify(malbec));
    const syrah = db.tables.dna_accumulation.find((r) => r.dimension_value === "syrah");
    assert(syrah && syrah.source === "quiz" && syrah.promoted && syrah.points === 0 && syrah.interaction_count === 0, JSON.stringify(syrah));
  });

  await test("a quiz row that exists keeps its points and bottle count; only the quiz columns move", async () => {
    const seedRows = [{ id: "q", user_id: UID, dimension: "country", dimension_value: "france", display_name: "Old", points: 5, interaction_count: 2, promoted: false, promoted_at: null, demoted_at: "2026-02-01T00:00:00.000Z", source: "auto", mappable: false }];
    const db = makeDb({ dna_accumulation: seedRows });
    await E.syncQuizSelections(makeClient(db).supabase, UID, { countries: ["france"] });
    const r = db.tables.dna_accumulation[0];
    assert(r.points === 5 && r.interaction_count === 2 && r.demoted_at === "2026-02-01T00:00:00.000Z", JSON.stringify(r));
    assert(r.source === "quiz" && r.promoted && r.mappable && r.display_name === "France" && r.promoted_at, JSON.stringify(r));
  });

  // Which listing NAMES the row (the loop: the last, by insert-then-update)
  // can't be seen with today's data: every estate filed under two regions
  // carries one name in both, and an id repeated inside one region always
  // resolves to its first entry. The batch keeps the loop's rule anyway;
  // a first-listing-wins mutant is equivalent on this data.
  await test("an estate filed under two regions is ONE row, written in one statement", async () => {
    const id = POOLS.twins.find((t) => new Set(POOLS.homes.get(t)).size > 1);
    const homes = [...new Set(POOLS.homes.get(id))];
    const estates = Object.fromEntries(homes.map((r) => [r, [id, id]]));
    const db = makeDb();
    const { supabase, log } = makeClient(db);
    await E.syncQuizSelections(supabase, UID, { estates });
    const rows = db.tables.dna_accumulation.filter((r) => r.dimension_value === id);
    assert(rows.length === 1 && rows[0].display_name === PRODUCERS[homes[0]].find((e) => e.id === id).name, JSON.stringify(rows));
    assert(log.join(" ") === "select:dna_accumulation upsert:dna_accumulation", log.join(" "));
  });

  await test("a row that appears between the read and the write keeps what it holds (the loop's insert failed alone)", async () => {
    const db = makeDb();
    const { supabase } = makeClient(db, {
      before: {
        "upsert:dna_accumulation": (d) => {
          if (d.tables.dna_accumulation.length) return;
          d.tables.dna_accumulation.push({ id: "race", user_id: UID, dimension: "varietal", dimension_value: "syrah", display_name: "Syrah", ...ACC_DEFAULTS, points: 4, interaction_count: 2 });
        },
      },
    });
    await E.syncQuizSelections(supabase, UID, { varietals: ["syrah", "malbec"] });
    const syrah = db.tables.dna_accumulation.filter((r) => r.dimension_value === "syrah");
    assert(syrah.length === 1 && syrah[0].points === 4 && syrah[0].source === "auto", JSON.stringify(syrah));
    assert(db.tables.dna_accumulation.some((r) => r.dimension_value === "malbec" && r.source === "quiz"), "the rest still landed");
  });

  console.log("\nA handful of requests, whatever the quiz size");

  const big = { countries: [], regions: {}, estates: {}, varietals: [], specificWines: [] };
  {
    const rnd = mulberry32(99);
    while (flatValues(big).length < 44) {
      const more = randomAnswers(rnd, 1);
      big.countries.push(...more.countries.filter((v) => v !== "atlantis"));
      for (const [k, v] of Object.entries(more.regions)) (big.regions[k] ||= []).push(...v.filter((x) => x !== "nowhere"));
      for (const [k, v] of Object.entries(more.estates)) (big.estates[k] ||= []).push(...v.filter((x) => x !== "ghost_estate"));
      big.varietals.push(...more.varietals.filter((v) => v !== "unobtainium"));
    }
  }
  const small = { countries: ["france"], regions: { france: ["bordeaux"] }, estates: {}, varietals: ["merlot"], specificWines: [] };

  await test("the sync: one read and at most two writes, for one item or forty-four", async () => {
    for (const answers of [small, big]) {
      // Half the items already exist (an update batch AND an insert batch)
      const seedRows = flatValues(answers).filter((_, i) => i % 2).map(([d, v], i) => ({ id: `s${i}`, user_id: UID, dimension: d, dimension_value: v, display_name: v, ...ACC_DEFAULTS }));
      const db = makeDb({ dna_accumulation: seedRows });
      const { supabase, log } = makeClient(db);
      await E.syncQuizSelections(supabase, UID, answers);
      assert(log.length <= 3 && log[0] === "select:dna_accumulation", `${flatValues(answers).length} items: ${log.join(" ")}`);
    }
  });

  await test("the reconcile: one read and at most one write, for one stale row or thirty", async () => {
    for (const n of [1, 30]) {
      const seedRows = POOLS.varietals.slice(0, n).map((v, i) => ({ id: `r${i}`, user_id: UID, dimension: "varietal", dimension_value: v, display_name: v, ...ACC_DEFAULTS, promoted: true, source: "quiz" }));
      const db = makeDb({ dna_accumulation: seedRows });
      const { supabase, log } = makeClient(db);
      await E.reconcileQuizPromotions(supabase, UID, { countries: [], regions: {}, estates: {}, varietals: [] });
      assert(log.join(" ") === "select:dna_accumulation update:dna_accumulation", `${n}: ${log.join(" ")}`);
      assert(db.tables.dna_accumulation.every((r) => !r.promoted && r.demoted_at), "every row un-flagged");
    }
  });

  // The whole save, the way home's restore and the reveal call it: a refine
  // over an existing profile with earned rows (the slowest path)
  function profileSeed(answers) {
    return {
      wine_profiles: [{ id: "p", user_id: UID, archetype: "The Test Palate", identity: { milestones: { firsts: { firstLoved: true } } }, countries: [], regions: {}, estates: {}, varietals: [], specific_wines: [] }],
      dna_accumulation: [
        { id: "earned", user_id: UID, dimension: "varietal", dimension_value: "chenin_blanc", display_name: "Chenin Blanc", ...ACC_DEFAULTS, points: 6, interaction_count: 3, promoted: true, source: "auto" },
        ...flatValues(answers).slice(0, 10).map(([d, v], i) => ({ id: `x${i}`, user_id: UID, dimension: d, dimension_value: v, display_name: v, ...ACC_DEFAULTS })),
      ],
      wine_interactions: [{ id: "w", user_id: UID, wine_name: "A", rating: "loved" }],
    };
  }

  await test("the whole save: eight requests at most and one accumulation read, for four items or forty-four", async () => {
    const counts = [];
    for (const answers of [small, big]) {
      const db = makeDb(profileSeed(answers));
      const { supabase, log } = makeClient(db);
      const row = await saveQuizProfile(supabase, UID, answers, { mode: "refine" });
      await new Promise((r) => setTimeout(r, 5)); // let the un-awaited event land in the log
      assert(row && row.user_id === UID, "the save returns its row");
      counts.push(log.length);
      assert(log.length <= 8, `${flatValues(answers).length} items: ${log.length} requests: ${log.join(" ")}`);
      assert(log.filter((l) => l === "select:dna_accumulation").length === 1, log.join(" "));
    }
    assert(Math.abs(counts[0] - counts[1]) <= 1, `request counts ${counts.join(" vs ")} (only a write with nothing to send may drop)`);
  });

  await test("the whole save at 40ms a request: three round trips on its critical path, for forty-four items", async () => {
    const LAT = 40;
    const db = makeDb(profileSeed(big));
    const { supabase } = makeClient(db, { latency: LAT });
    const t0 = Date.now();
    // A gate that costs a round trip, as the restore's claim does: the
    // accumulation writes must already be on their way beside it
    const row = await saveQuizProfile(supabase, UID, big, {
      mode: "refine",
      beforeEvent: () => new Promise((r) => setTimeout(() => r(false), LAT)),
    });
    const rounds = (Date.now() - t0) / LAT;
    assert(row, "saved");
    // (accumulation read ∥ milestone reads) → upsert → (claim ∥ reconcile write ∥ sync writes)
    assert(rounds < 3.9, `${rounds.toFixed(2)} round trips (the loop took ~${3 + 2 * flatValues(big).length})`);
    // and it wrote what it should have
    assert(db.tables.dna_accumulation.find((r) => r.dimension_value === "chenin_blanc").source === "auto", "earned kept");
    assert(flatValues(big).every(([d, v]) => db.tables.dna_accumulation.some((r) => r.dimension === d && r.dimension_value === v && r.promoted)), "every quiz item promoted");
  });

  console.log("\nFailures are said, and never undo a landed save");

  await test("a failed sync read writes nothing and throws", async () => {
    const db = makeDb();
    const { supabase, log } = makeClient(db, { fail: { "select:dna_accumulation": { message: "offline" } } });
    let threw = null;
    try { await E.syncQuizSelections(supabase, UID, small); } catch (e) { threw = e; }
    assert(threw?.message === "offline" && log.length === 1 && db.tables.dna_accumulation.length === 0, log.join(" "));
  });

  await test("a failed write throws (it was silent)", async () => {
    for (const label of ["upsert:dna_accumulation", "update:dna_accumulation"]) {
      const db = makeDb({ dna_accumulation: [{ id: "a", user_id: UID, dimension: "varietal", dimension_value: "zinfandel", display_name: "Z", ...ACC_DEFAULTS, promoted: true, source: "quiz" }] });
      const { supabase } = makeClient(db, { fail: { [label]: { message: "denied" } } });
      let threw = null;
      try {
        if (label.startsWith("upsert")) await E.syncQuizSelections(supabase, UID, small);
        else await E.reconcileQuizPromotions(supabase, UID, small);
      } catch (e) { threw = e; }
      assert(threw?.message === "denied", label);
    }
  });

  await test("a failing sync still lets the reconcile run, and the save still returns its row", async () => {
    const errors = [];
    const orig = console.error;
    console.error = (...a) => errors.push(a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" "));
    try {
      const db = makeDb(profileSeed(small));
      db.tables.dna_accumulation.push({ id: "stale", user_id: UID, dimension: "country", dimension_value: "chile", display_name: "Chile", ...ACC_DEFAULTS, promoted: true, source: "quiz" });
      // The sync's write fails (the reconcile's is an update; the profile's
      // an upsert on another table)
      const { supabase } = makeClient(db, { fail: { "upsert:dna_accumulation": { message: "sync write failed" } } });
      const row = await saveQuizProfile(supabase, UID, small, { mode: "fresh" });
      assert(row, "the save landed");
      assert(!db.tables.dna_accumulation.find((r) => r.id === "stale").promoted, "the reconcile ran");
      assert(errors.some((e) => e.includes("Quiz sync error") && e.includes("sync write failed")), errors.join(" | "));
      assert(!errors.some((e) => e.includes("Quiz reconcile error")), errors.join(" | "));
    } finally { console.error = orig; }
  });

  console.log("\nThe shape stays");

  await test("SOURCE SCAN: neither function awaits inside a loop; the save runs them side by side", () => {
    const src = fs.readFileSync(require.resolve("../dnaEvolution.js"), "utf-8");
    for (const name of ["syncQuizSelections", "reconcileQuizPromotions"]) {
      const start = src.indexOf(`export async function ${name}`);
      const body = src.slice(start, src.indexOf("\n}\n", start));
      assert(!/for\s*\([^)]*\)\s*\{[^}]*\bawait\b/.test(body) && !/for\s*\([^)]*\)\s*await\b/.test(body), `${name} awaits in a loop`);
      assert((body.match(/\bawait\b/g) || []).length <= 2, `${name}: ${(body.match(/\bawait\b/g) || []).length} awaits`);
    }
    const save = fs.readFileSync(require.resolve("../saveQuizProfile.js"), "utf-8");
    assert(/Promise\.allSettled\(\[\s*reconcileQuizPromotions[^\]]*syncQuizSelections/s.test(save), "reconcile and sync side by side");
    assert(/Promise\.all\(\[readAccumulation\(\), readMilestones\(\)\]\)/.test(save), "one accumulation read beside the milestone reads");
    assert(/mergeQuizWithEarnedDna\([^)]*accRows\)/.test(save) && /reconcileQuizPromotions\([^)]*accRows\)/.test(save) && /syncQuizSelections\([^)]*accRows\)/.test(save), "the merge, reconcile and sync share it");
    assert(save.indexOf("const accumulation = Promise.allSettled") < save.indexOf("await beforeEvent"), "the writes go out beside the claim, not after it");
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed) process.exit(1);
}

main();
