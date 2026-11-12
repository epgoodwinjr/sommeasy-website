import { test, expect, type Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { RecommendPage } from "./fixtures/sommeasy-page";
import { testDb, ensureEarnedFixture, countEvents } from "./fixtures/test-db";
// The identity engine is pure and client-runnable — the spec uses the REAL
// engine to verify the hook wrote exactly what the evidence composes.
import { composeIdentity } from "../src/lib/identityEngine.js";
// …and the real mark, to hold the growth moment to the genomes it shows
import { renderPalateMark } from "../src/lib/palateMark.js";

/**
 * Hard-fail guard for the Living Strand (Act III, Session 3):
 *
 * A milestone earned through the REAL UI must shift the identity. The
 * seeded account holds Domaine Dujac at 2 accumulation points (one loved
 * bottle shy of the estate threshold). Rating "Domaine Dujac Clos de la
 * Roche" loved through the /recommend paste UI promotes the estate —
 * a milestone — so maybeRecomposeIdentity must recompose the strand:
 * a second estate makes the persona a Loyalist, so the title AND epithet
 * change, a dna_timeline 'shifted' row must land (dimension 'identity',
 * before→after in dimension_value), and the shift toast must show.
 *
 * Do NOT make this outcome-tolerant. If the shifted row or the celebrated
 * surface goes missing, identity milestones are dead again.
 *
 * Data discipline (the pinotage guard's rules): the guard wine touches ONLY
 * dujac/burgundy/france — zero overlap with evidence-ledger's dims, so the
 * two guards can never corrupt each other's baselines. Guard interactions
 * are identified by source_url='text_paste' (the seeded Dujac rating has no
 * source_url). Stale state from crashed runs is healed at start, and the
 * exact baseline — identity jsonb and timeline included — is restored in
 * afterEach (it survives a timeout; a finally doesn't), after about:blank
 * kills any in-flight page JS.
 *
 * The second guard (Motion, Session 4 — docs/motion/README.md §8.4) earns
 * the SAME promotion through Log a bottle, with motion on: the saved step
 * must be the big moment — the bloom arriving in the shape the account had,
 * growing (celebrated) into the one the recompose wrote. Its bottle is
 * logged as written, so it is identified by its exact name (a Log save
 * carries no source_url), and a loved Log save also names the wine in
 * specific_wines — healed and restored with the rest.
 */

const GUARD_LINE = "Domaine Dujac Clos de la Roche 2019...$95";
// What the Log guard types, and so the exact name its row is saved under
const LOG_WINE = "Domaine Dujac Clos de la Roche 2019";

// Dimensions the guard wine feeds (verified against the resolver: 90).
const DIMS: Array<[string, string]> = [
  ["estate", "domaine_dujac"],
  ["region", "burgundy"],
  ["country", "france"],
];

// The spec's own fixture: Dujac exactly one loved bottle from the estate
// threshold (dnaThresholds.js: estate 4). Healed to this state at start.
const SHIFT_FIXTURE = {
  dimension: "estate",
  value: "domaine_dujac",
  displayName: "Domaine Dujac",
  points: 2,
  interactionCount: 1,
};

type AccRow = {
  points: number; interaction_count: number; promoted: boolean;
  promoted_at: string | null; demoted_at: string | null;
  source: string; mappable: boolean; display_name: string;
} | null;

async function readDims(supabase: SupabaseClient, userId: string) {
  const out: Record<string, AccRow> = {};
  for (const [dimension, value] of DIMS) {
    const { data } = await supabase
      .from("dna_accumulation")
      .select("points, interaction_count, promoted, promoted_at, demoted_at, source, mappable, display_name")
      .eq("user_id", userId)
      .eq("dimension", dimension)
      .eq("dimension_value", value)
      .maybeSingle();
    out[`${dimension}:${value}`] = (data as AccRow) ?? null;
  }
  return out;
}

async function findGuardRows(supabase: SupabaseClient, userId: string) {
  const { data: pasted } = await supabase
    .from("wine_interactions")
    .select("wine_name, rating")
    .eq("user_id", userId)
    .eq("source_url", "text_paste")
    .ilike("wine_name", "%dujac%");
  // The Log guard's bottle: saved as written, with no provenance
  const { data: logged } = await supabase
    .from("wine_interactions")
    .select("wine_name, rating")
    .eq("user_id", userId)
    .eq("wine_name", LOG_WINE);
  const rows = [...(pasted ?? [])];
  for (const row of logged ?? []) {
    if (!rows.some((r) => r.wine_name === row.wine_name)) rows.push(row);
  }
  return rows;
}

const RATING_POINTS: Record<string, number> = { loved: 2, liked: 1, fine: 0, not_for_me: -1 };

async function readProfile(supabase: SupabaseClient, userId: string) {
  const { data } = await supabase
    .from("wine_profiles")
    .select("archetype, identity, countries, regions, estates, varietals, specific_wines, red_count, white_count")
    .eq("user_id", userId)
    .single();
  return data!;
}

/**
 * Heal anything a crashed earlier run left behind, then normalize the
 * Dujac fixture to its canonical one-bottle-away state.
 */
async function healStaleState(supabase: SupabaseClient, userId: string) {
  // 1. Stale guard interactions: reverse their points, then delete
  for (const row of await findGuardRows(supabase, userId)) {
    const pts = RATING_POINTS[row.rating ?? ""] ?? 0;
    if (pts !== 0) {
      for (const [dimension, value] of DIMS) {
        const { data: acc } = await supabase
          .from("dna_accumulation")
          .select("id, points")
          .eq("user_id", userId)
          .eq("dimension", dimension)
          .eq("dimension_value", value)
          .maybeSingle();
        if (acc) {
          await supabase.from("dna_accumulation")
            .update({ points: acc.points - pts })
            .eq("id", acc.id);
        }
      }
    }
    await supabase.from("wine_interactions")
      .delete().eq("user_id", userId).eq("wine_name", row.wine_name);
  }

  // 2. The account's baseline holds no shifted events and no promoted-Dujac
  // event — remove any a crashed run left
  await supabase.from("dna_timeline").delete()
    .eq("user_id", userId).eq("event_type", "shifted");
  await supabase.from("dna_timeline").delete()
    .eq("user_id", userId).eq("event_type", "promoted")
    .eq("dimension", "estate").eq("dimension_value", SHIFT_FIXTURE.value);

  // 3. Normalize the Dujac accumulation fixture (self-healing, like chenin)
  const { data: dujac } = await supabase
    .from("dna_accumulation").select("id")
    .eq("user_id", userId)
    .eq("dimension", SHIFT_FIXTURE.dimension)
    .eq("dimension_value", SHIFT_FIXTURE.value)
    .maybeSingle();
  const fixtureRow = {
    display_name: SHIFT_FIXTURE.displayName,
    points: SHIFT_FIXTURE.points,
    interaction_count: SHIFT_FIXTURE.interactionCount,
    promoted: false,
    promoted_at: null,
    demoted_at: null,
    source: "auto",
    mappable: true,
  };
  if (dujac) {
    await supabase.from("dna_accumulation").update(fixtureRow).eq("id", dujac.id);
  } else {
    await supabase.from("dna_accumulation").insert({
      user_id: userId,
      dimension: SHIFT_FIXTURE.dimension,
      dimension_value: SHIFT_FIXTURE.value,
      ...fixtureRow,
    });
  }

  // 4. A crashed run may have left the post-shift profile: Dujac in the
  // estates map and the Loyalist strand — and, from the Log guard, its
  // bottle among the named wines. Remove them and recompose the canonical
  // quiz-shape strand (no accumulation — the S2 baseline).
  const profile = await readProfile(supabase, userId);
  const burgundyEstates: string[] = profile.estates?.burgundy ?? [];
  const named: string[] = profile.specific_wines ?? [];
  const specificWines = named.filter((w) => w.toLowerCase() !== LOG_WINE.toLowerCase());
  const shifted = burgundyEstates.includes(SHIFT_FIXTURE.value) ||
    /Loyalist/.test(profile.archetype ?? "") || specificWines.length !== named.length;
  if (shifted) {
    const estates = { ...profile.estates };
    if (estates.burgundy) {
      estates.burgundy = estates.burgundy.filter((e: string) => e !== SHIFT_FIXTURE.value);
      if (estates.burgundy.length === 0) delete estates.burgundy;
    }
    const strand = composeIdentity({
      countries: profile.countries || [],
      regions: profile.regions || {},
      estates,
      varietals: profile.varietals || [],
      specificWines,
    });
    await supabase.from("wine_profiles").update({
      estates,
      specific_wines: specificWines,
      archetype: strand.title,
      identity: { epithet: strand.epithet, traits: strand.traits, genome: strand.genome },
    }).eq("user_id", userId);
  }
}

// The exact baseline, captured post-heal. The restore runs in afterEach,
// which Playwright runs after a failed OR timed-out test — a finally in
// the test body doesn't survive a timeout (House List Phase 3).
type Baseline = {
  profile: Awaited<ReturnType<typeof readProfile>>;
  dims: Record<string, AccRow>;
  eventIds: Set<string>;
};
let baseline: Baseline | null = null;

async function captureBaseline(supabase: SupabaseClient, userId: string) {
  const profile = await readProfile(supabase, userId);
  const dims = await readDims(supabase, userId);
  const { data: events } = await supabase.from("dna_timeline").select("id").eq("user_id", userId);
  baseline = { profile, dims, eventIds: new Set((events ?? []).map((e) => e.id)) };
  return baseline;
}

async function restoreBaseline(page: Page) {
  if (!baseline) return;
  const { profile, dims, eventIds } = baseline;
  baseline = null;
  const { supabase, userId } = await testDb();
  // Kill in-flight page JS BEFORE touching the DB (the teardown-race
  // rule: a live resolveAndAccumulate/hook can re-insert rows under us)
  await page.goto("about:blank").catch(() => {});

  // Exact restore: guard interactions gone, accumulation rows back to
  // baseline, new timeline events removed, profile row (identity jsonb
  // included) restored verbatim
  for (const row of await findGuardRows(supabase, userId)) {
    await supabase.from("wine_interactions")
      .delete().eq("user_id", userId).eq("wine_name", row.wine_name);
  }
  for (const [dimension, value] of DIMS) {
    const base = dims[`${dimension}:${value}`];
    if (base) {
      await supabase.from("dna_accumulation").update(base)
        .eq("user_id", userId).eq("dimension", dimension).eq("dimension_value", value);
    } else {
      await supabase.from("dna_accumulation").delete()
        .eq("user_id", userId).eq("dimension", dimension).eq("dimension_value", value);
    }
  }
  const { data: eventsNow } = await supabase
    .from("dna_timeline").select("id").eq("user_id", userId);
  for (const e of eventsNow ?? []) {
    if (!eventIds.has(e.id)) {
      await supabase.from("dna_timeline").delete().eq("id", e.id);
    }
  }
  await supabase.from("wine_profiles").update({
    archetype: profile.archetype,
    identity: profile.identity,
    estates: profile.estates,
    varietals: profile.varietals,
    // A loved Log save names its bottle among the quiz's wines
    specific_wines: profile.specific_wines,
    red_count: profile.red_count,
    white_count: profile.white_count,
  }).eq("user_id", userId);
}

test.describe("Identity shift — a milestone earned in the real UI moves the strand (hard-fail)", () => {
  test.afterEach(async ({ page }) => { await restoreBaseline(page); });

  test("estate promotion shifts the title, writes the shifted event, and celebrates", async ({ page }) => {
    test.setTimeout(150_000);
    const { supabase, userId } = await testDb();

    await ensureEarnedFixture(supabase, userId);
    await healStaleState(supabase, userId);

    // ── Exact baseline capture (post-heal) ──
    const {
      profile: baselineProfile, dims: baselineDims, eventIds: baselineEventIds,
    } = await captureBaseline(supabase, userId);
    const { count: baselineRated } = await supabase
      .from("wine_interactions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .not("rating", "is", null);

    // Fixture premises — fail loudly if the account drifts
    expect(baselineDims["estate:domaine_dujac"]?.points).toBe(SHIFT_FIXTURE.points);
    expect(baselineDims["estate:domaine_dujac"]?.promoted).toBe(false);
    expect(baselineProfile.archetype).not.toMatch(/Loyalist/);

    // ── Drive the milestone through the real UI ──
    const recPage = new RecommendPage(page);
    await recPage.goto();
    await recPage.pasteAndAnalyze(GUARD_LINE);
    await expect(recPage.resultsHeading).toBeVisible({ timeout: 10_000 });
    const card = recPage.pickCards.first();
    await expect(card).toBeVisible();
    await expect(card).toContainText(/Dujac/);

    // House List picks rate in place: Had it? → a tile → the done line
    // (which retired the "Rating saved!" toast)
    await card.getByRole("button", { name: "Had it? Rate it" }).click();
    await card.getByTestId("rating-tile-loved").click();
    await expect(card).toContainText("❤️ Loved it — noted in your journal.");

    // ── The celebrated surface: promotion toast, then the shift toast ──
    await expect(page.getByText(/Domaine Dujac added to your estates/))
      .toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/Your DNA has shifted: you're now The .+/))
      .toBeVisible({ timeout: 20_000 });

    // ── The shifted record ──
    await expect
      .poll(async () => {
        const { data } = await supabase
          .from("dna_timeline").select("id")
          .eq("user_id", userId).eq("event_type", "shifted");
        return (data ?? []).length;
      }, { timeout: 15_000 })
      .toBe(1);

    const { data: shiftedEvent } = await supabase
      .from("dna_timeline")
      .select("dimension, dimension_value, display_name, wine_name")
      .eq("user_id", userId).eq("event_type", "shifted")
      .single();
    const after = await readProfile(supabase, userId);

    // The title/epithet change: a second estate makes a Loyalist
    expect(after.archetype).not.toBe(baselineProfile.archetype);
    expect(after.archetype).toMatch(/Loyalist$/);
    expect(after.identity.epithet).toContain("estate-loyal");
    expect(after.identity.epithet).not.toBe(baselineProfile.identity.epithet);

    // The event row: identity dimension, new title as display name,
    // before→after carried in dimension_value
    expect(shiftedEvent!.dimension).toBe("identity");
    expect(shiftedEvent!.display_name).toBe(after.archetype);
    const change = JSON.parse(shiftedEvent!.dimension_value);
    expect(change.from.title).toBe(baselineProfile.archetype);
    expect(change.from.epithet).toBe(baselineProfile.identity.epithet);
    expect(change.to.title).toBe(after.archetype);
    expect(change.to.epithet).toBe(after.identity.epithet);

    // House List Phase 4: the shift AND the promotion name the bottle whose
    // rating earned them (dna_timeline.wine_name) — what links them to its
    // wine page's "What it did to your palate"
    const guardRows = await findGuardRows(supabase, userId);
    expect(guardRows.length).toBe(1);
    expect(shiftedEvent!.wine_name).toBe(guardRows[0].wine_name);
    const { data: promotedEvent } = await supabase
      .from("dna_timeline")
      .select("wine_name")
      .eq("user_id", userId).eq("event_type", "promoted")
      .eq("dimension", "estate").eq("dimension_value", SHIFT_FIXTURE.value)
      .single();
    expect(promotedEvent!.wine_name).toBe(guardRows[0].wine_name);

    // Engine consistency: the stored strand is EXACTLY what the pure
    // engine composes from the live evidence — the hook invented nothing
    const { data: accRows } = await supabase
      .from("dna_accumulation")
      .select("dimension, dimension_value, points")
      .eq("user_id", userId);
    const expected = composeIdentity({
      countries: after.countries || [],
      regions: after.regions || {},
      estates: after.estates || {},
      varietals: after.varietals || [],
      specificWines: after.specific_wines || [],
      accumulation: accRows || [],
    });
    expect(after.archetype).toBe(expected.title);
    expect(after.identity.epithet).toBe(expected.epithet);

    // Milestone bookkeeping: baseline reset, first-promotion armed
    expect(after.identity.milestones.ratedCountAtLastRecompose).toBe((baselineRated ?? 0) + 1);
    expect(after.identity.milestones.firsts.earnedPromotion).toBe(true);

    // Exactly the promotion + the shift — no stray events
    const { data: allEvents } = await supabase
      .from("dna_timeline").select("id").eq("user_id", userId);
    expect((allEvents ?? []).length).toBe(baselineEventIds.size + 2);
  });
});

/** What an entrance could have left on the page's own elements (not the
 *  insides of a palate mark) — motion.spec.ts's restOf. */
const restOf = (page: Page, root: string) =>
  page.evaluate((selector) => {
    const host = document.querySelector(selector)!;
    const all = Array.from(host.querySelectorAll("*")).filter((el): el is HTMLElement => el instanceof HTMLElement);
    return {
      running: host.getAnimations({ subtree: true }).filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).length,
      invisible: all.filter((el) => getComputedStyle(el).opacity === "0").map((el) => el.tagName + (el.dataset.testid ? `[${el.dataset.testid}]` : "")),
      clipped: all.filter((el) => getComputedStyle(el).clipPath !== "none").length,
      inline: all.filter((el) => el.style.clipPath || el.style.opacity === "0").length,
      wordSpans: host.querySelectorAll("[data-word]").length,
    };
  }, root);

/** A mark's wrapper attributes (its style as the browser reads it). */
const wrapperAttrs = (mark: ReturnType<Page["locator"]>) =>
  mark.evaluate((el) => Array.from(el.attributes)
    .map((a) => `${a.name}=${a.name === "style" ? (el as HTMLElement).style.cssText : a.value}`)
    .sort());

test.describe("The growth moment — a promotion earned in the real UI grows the bloom (hard-fail)", () => {
  // The ONE real-flow guard for docs/motion §8.4: motion on, the test
  // account's own genomes, a promotion earned through the real /log UI.
  test.use({ contextOptions: { reducedMotion: "no-preference" } });

  // Set when a test put a chosen pick on the ledger (home's From last
  // night): wine_events is append-forever, so a test that dies before rating
  // it is answered with a bypass — the ask must never outlive the run
  let askOpen = false;

  test.afterEach(async ({ page }) => {
    await restoreBaseline(page);
    if (!askOpen) return;
    askOpen = false;
    const { supabase, userId } = await testDb();
    await supabase.from("wine_events").insert({
      user_id: userId, event_type: "somm_bypassed",
      payload: { session: "e2e-growth-cleanup", steer: null, picks_shown: null, had_chosen: LOG_WINE },
    });
  });

  /** As the browser serializes a mark (self-closing tags and all). */
  const asBrowser = (page: Page, html: string) => page.evaluate((markup) => {
    const holder = document.createElement("div");
    holder.innerHTML = markup;
    return holder.innerHTML;
  }, html);

  /** Record every frame a bloom paints, from now on. */
  const watchBloom = (page: Page, selector: string) => page.evaluate((target) => {
    const frames: string[] = [];
    (window as any).__bloomFrames = frames;
    const read = () => {
      const mark = document.querySelector(target);
      if (mark && frames[frames.length - 1] !== mark.innerHTML) frames.push(mark.innerHTML);
    };
    read();
    new MutationObserver(read).observe(document.body, { childList: true, subtree: true, attributes: true });
  }, selector);
  const bloomFrames = (page: Page): Promise<string[]> => page.evaluate(() => (window as any).__bloomFrames);

  /** Record every toast the page shows, from now on. A toast is on screen
   *  for four or five seconds and a celebrated growth outlasts the first of
   *  them, so "is it visible" asked AFTER the growth is a race the toast
   *  loses (it failed the full run on Nov 12, 2026). "Was it shown" is the
   *  outcome — and it can only be watched from before the tap. */
  const watchToasts = (page: Page) => page.evaluate(() => {
    const seen: string[] = [];
    (window as any).__toastsSeen = seen;
    const read = () => document.querySelectorAll('[role="status"][aria-live="polite"] > div').forEach((pill) => {
      const text = pill.textContent || "";
      if (text && !seen.includes(text)) seen.push(text);
    });
    read();
    new MutationObserver(read).observe(document.body, { childList: true, subtree: true, characterData: true });
  });
  const toastsSeen = (page: Page): Promise<string> =>
    page.evaluate(() => ((window as any).__toastsSeen as string[]).join(" | "));
  const berryRipple = /<circle[^>]*fill="none"[^>]*stroke="#F5F0E8"[^>]*stroke-width="0\.9"[^>]*opacity=/i;

  /** Heal, capture the baseline, and hand back the profile as it stands. */
  async function ready() {
    const { supabase, userId } = await testDb();
    await ensureEarnedFixture(supabase, userId);
    await healStaleState(supabase, userId);
    const { profile } = await captureBaseline(supabase, userId);
    expect(profile.archetype).not.toMatch(/Loyalist/);
    expect(profile.identity?.genome).toBeTruthy();
    return { supabase, userId, before: profile };
  }

  /** The promotion landed: the strand shifted, under a new seed. */
  async function shifted(supabase: SupabaseClient, userId: string, before: Awaited<ReturnType<typeof readProfile>>) {
    await expect
      .poll(async () => (await readProfile(supabase, userId)).archetype, { timeout: 20_000 })
      .toMatch(/Loyalist$/);
    const after = await readProfile(supabase, userId);
    expect(after.identity.genome.seed).not.toBe(before.identity.genome.seed);
    return after;
  }

  test("the wine page: a verdict that promotes an estate brings the bloom up under it, grown and celebrated — toasts kept", async ({ page }) => {
    test.setTimeout(150_000);
    const { supabase, userId, before } = await ready();
    // The bottle is on the want list (no provenance: the guard knows it by name)
    await supabase.from("wine_interactions").insert({ user_id: userId, wine_name: LOG_WINE, interaction_type: "want" });

    await page.goto(`/wine?name=${encodeURIComponent(LOG_WINE)}`);
    const wine = page.getByTestId("wine-page");
    await expect(wine).toContainText("On your want list", { timeout: 20_000 });
    // No bloom on a wine's page until a verdict earns one
    await expect(page.getByTestId("wine-growth")).toHaveCount(0);
    await watchBloom(page, '[data-testid="wine-growth"] [data-testid="palate-mark"]');
    await watchToasts(page);
    await wine.getByRole("button", { name: "🍷 Had it" }).click();
    await wine.getByTestId("rating-tile-loved").click();
    // The tiles hold, pressed, then the verdict takes their place
    await expect(page.getByTestId("wine-verdict")).toContainText("Loved it", { timeout: 10_000 });

    const after = await shifted(supabase, userId, before);
    const was = await asBrowser(page, renderPalateMark(before.identity.genome, { size: 96 }));
    const is = await asBrowser(page, renderPalateMark(after.identity.genome, { size: 96 }));
    const mark = page.getByTestId("wine-growth").getByTestId("palate-mark");
    await expect.poll(() => mark.innerHTML(), { timeout: 30_000 }).toBe(is);
    const frames = await bloomFrames(page);
    expect(frames[0]).toBe(was);
    expect(frames[frames.length - 1]).toBe(is);
    expect(new Set(frames).size).toBeGreaterThan(20);
    expect(frames.some((f) => f.includes("scale("))).toBe(true);
    expect(frames.some((f) => berryRipple.test(f))).toBe(true);

    // The existing toasts are kept — both were shown (watched from the tap)
    await expect.poll(() => toastsSeen(page), { timeout: 20_000 }).toMatch(/Domaine Dujac added to your estates/);
    await expect.poll(() => toastsSeen(page), { timeout: 20_000 }).toMatch(/Your DNA has shifted: you're now The .+/);
    // …and the page says what the bottle did, as it always has
    await expect(wine).toContainText("What it did to your palate", { timeout: 15_000 });
  });

  test("home: rating From last night into a promotion grows the crest in place and retitles it — toasts kept", async ({ page }) => {
    test.setTimeout(150_000);
    const { supabase, userId, before } = await ready();
    // A pick chosen at the table and never rated: the ledger's own shape
    await supabase.from("wine_interactions").insert({ user_id: userId, wine_name: LOG_WINE, interaction_type: "want" });
    const { error } = await supabase.from("wine_events").insert({
      user_id: userId, event_type: "pick_chosen",
      payload: { wine: LOG_WINE, role: "Top Pick", price: 95, steer: null, session: "e2e-growth", replaced: null },
    });
    expect(error).toBeNull();
    askOpen = true;

    await page.goto("/");
    const crest = page.getByTestId("palate-strip");
    await expect(crest).toContainText(before.archetype, { timeout: 20_000 });
    const ask = page.getByTestId("verdict-ask");
    await expect(ask).toContainText("Domaine Dujac Clos de la Roche", { timeout: 20_000 });
    const was = await asBrowser(page, renderPalateMark(before.identity.genome, { size: 76 }));
    await expect.poll(() => crest.getByTestId("palate-mark").innerHTML()).toBe(was);

    await watchBloom(page, '[data-testid="palate-strip"] [data-testid="palate-mark"]');
    await watchToasts(page);
    await ask.getByTestId("rating-tile-loved").click();
    // The reply names what the rating did
    await expect(ask).toContainText("❤️ Loved it — noted. Domaine Dujac just joined your DNA.", { timeout: 30_000 });
    askOpen = false; // rated: the ledger resolves the ask

    const after = await shifted(supabase, userId, before);
    const is = await asBrowser(page, renderPalateMark(after.identity.genome, { size: 76 }));
    await expect.poll(() => crest.getByTestId("palate-mark").innerHTML(), { timeout: 30_000 }).toBe(is);
    const frames = await bloomFrames(page);
    expect(frames[0]).toBe(was);
    expect(frames[frames.length - 1]).toBe(is);
    expect(new Set(frames).size).toBeGreaterThan(20);
    expect(frames.some((f) => f.includes("scale("))).toBe(true);
    expect(frames.some((f) => berryRipple.test(f))).toBe(true);
    // The strand's words changed with the bloom, in place
    await expect(crest).toContainText(after.archetype, { timeout: 10_000 });
    await expect(crest).toContainText(after.identity.epithet);
    await expect(crest).not.toContainText(before.archetype);

    // Both toasts were shown (watched from the tap — see watchToasts)
    await expect.poll(() => toastsSeen(page), { timeout: 20_000 }).toMatch(/Domaine Dujac added to your estates/);
    await expect.poll(() => toastsSeen(page), { timeout: 20_000 }).toMatch(/Your DNA has shifted: you're now The .+/);
  });

  test("logging the bottle that promotes an estate: the saved step shows the bloom as it was, then grown and celebrated", async ({ page }) => {
    test.setTimeout(150_000);
    const { supabase, userId } = await testDb();
    await ensureEarnedFixture(supabase, userId);
    await healStaleState(supabase, userId);
    const { profile: before } = await captureBaseline(supabase, userId);
    const loggedBefore = await countEvents(supabase, userId, "bottle_logged");

    // Fixture premises — fail loudly if the account drifts
    expect(before.archetype).not.toMatch(/Loyalist/);
    expect(before.identity?.genome).toBeTruthy();
    expect((before.specific_wines ?? []).map((w: string) => w.toLowerCase())).not.toContain(LOG_WINE.toLowerCase());

    // ── Log the bottle as written, loved ──
    await page.goto(`/log?q=${encodeURIComponent(LOG_WINE)}`);
    await expect(page.getByTestId("log-search-input")).toHaveValue(LOG_WINE, { timeout: 15_000 });
    await page.getByRole("button", { name: /as written/ }).click();
    const rate = page.getByTestId("bottle-confirm");
    await expect(rate).toBeVisible();
    await rate.getByRole("radio", { name: "Loved it" }).click();

    // Every frame the saved step's bloom paints, from before the save — and,
    // frame by frame, whether the headline was legible before the bloom
    // began to grow (it must not be: the page says why once it is growing)
    await page.evaluate(() => {
      const frames: string[] = [];
      const words = { spans: 0, early: false, stop: false };
      (window as any).__savedFrames = frames;
      (window as any).__savedWords = words;
      const read = () => {
        const mark = document.querySelector('[data-testid="log-saved"] [data-testid="palate-mark"]');
        if (mark && frames[frames.length - 1] !== mark.innerHTML) frames.push(mark.innerHTML);
      };
      new MutationObserver(read).observe(document.body, { childList: true, subtree: true, attributes: true });
      const loop = () => {
        read();
        const spans = document.querySelectorAll('[data-testid="log-saved"] h1 [data-word]');
        words.spans = Math.max(words.spans, spans.length);
        if (frames.length <= 1 && Array.from(spans).some((el) => Number(getComputedStyle(el).opacity) > 0.5)) words.early = true;
        if (!words.stop) requestAnimationFrame(loop);
      };
      loop();
    });
    await page.getByTestId("log-save").click();

    // ── The saved step is the big moment ──
    const saved = page.getByTestId("log-saved");
    await expect(saved).toBeVisible({ timeout: 30_000 });
    await expect(saved).toHaveAttribute("data-moment", "grown");

    // What the recompose wrote: the strand shifted, and the genome with it
    await expect
      .poll(async () => (await readProfile(supabase, userId)).archetype, { timeout: 20_000 })
      .toMatch(/Loyalist$/);
    const after = await readProfile(supabase, userId);
    expect(after.identity.genome.seed).not.toBe(before.identity.genome.seed); // a new seed, as every promotion brings

    const asBrowser = (html: string) => page.evaluate((markup) => {
      const holder = document.createElement("div");
      holder.innerHTML = markup;
      return holder.innerHTML;
    }, html);
    const was = await asBrowser(renderPalateMark(before.identity.genome, { size: 164 }));
    const is = await asBrowser(renderPalateMark(after.identity.genome, { size: 164 }));
    expect(is).not.toBe(was);

    // The bloom arrived in the shape the account HAD, and ends on the one it has
    const mark = saved.getByTestId("palate-mark");
    await expect.poll(() => mark.innerHTML(), { timeout: 20_000 }).toBe(is);
    const frames: string[] = await page.evaluate(() => (window as any).__savedFrames);
    expect(frames[0]).toBe(was);
    expect(frames[frames.length - 1]).toBe(is);
    expect(new Set(frames).size).toBeGreaterThan(20);
    // Celebrated — a promotion: the swell, and a berry landing with its
    // ripples, the LAST thing to play
    expect(frames.some((f) => f.includes("scale("))).toBe(true);
    const berryRipple = /<circle[^>]*fill="none"[^>]*stroke="#F5F0E8"[^>]*stroke-width="0\.9"[^>]*opacity=/i;
    expect(frames.some((f) => berryRipple.test(f))).toBe(true);
    const anyOverlay = /<circle[^>]*fill="none"[^>]*stroke="#F5F0E8"[^>]*opacity=/i;
    const overlays = frames.filter((f) => anyOverlay.test(f));
    expect(berryRipple.test(overlays[overlays.length - 1] ?? "")).toBe(true);
    // A new seed re-deals the bloom (README §14): the ring rests somewhere
    // else, and the fruit lifts away to none, then lands again — one more
    const ringOf = (html: string) => html.match(/<path d="([^"]+)" fill="none" stroke="#8B2332"/i)?.[1];
    expect(ringOf(was)).toBeTruthy();
    expect(ringOf(is)).not.toBe(ringOf(was));
    // Fruit: the burgundy circles other than the heart (r 6.5, at rest in a growth)
    const berries = (frame: string) => (frame.match(/<circle cx="[^"]*" cy="[^"]*" r="(?!6\.5")[^"]*" fill="#8B2332"/gi) || []).length;
    expect(berries(is)).toBe(berries(was) + 1);
    expect(Math.min(...frames.map(berries))).toBe(0);
    expect(berries(frames[frames.length - 1])).toBe(berries(is));
    // The headline was written, and never legible before the bloom grew
    const words = await page.evaluate(() => {
      const w = (window as any).__savedWords;
      w.stop = true;
      return { spans: w.spans, early: w.early };
    });
    expect(words.early).toBe(false);
    expect(words.spans).toBeGreaterThan(0);

    // The words are houseCopy's: the shift takes the headline, the promotion its line
    await expect(saved).toContainText("✨ Your palate shifted");
    await expect(saved.locator("h1")).toHaveText(`You became ${after.archetype}`);
    await expect(saved).toContainText(after.identity.epithet);
    await expect(saved).toContainText("🧬 Domaine Dujac joined your DNA");
    await expect(saved).toContainText("Domaine Dujac Clos de la Roche");
    await expect(saved.getByRole("link", { name: "See it in your palate" })).toBeVisible();
    for (const way of ["Log another bottle", "Back to your list"]) await expect(saved.getByText(way)).toBeVisible();
    // …written in, and settled to plain text
    await expect
      .poll(() => saved.locator("h1").evaluate((el) => el.childNodes.length === 1 && el.firstChild?.nodeType === Node.TEXT_NODE), { timeout: 15_000 })
      .toBe(true);
    // Everything settles into the plain page: nothing an entrance used is
    // left on any element, and the bloom is exactly the new static mark
    await expect.poll(async () => (await restOf(page, '[data-testid="log-saved"]')).running, { timeout: 20_000 }).toBe(0);
    expect(await restOf(page, '[data-testid="log-saved"]')).toEqual({ running: 0, invisible: [], clipped: 0, inline: 0, wordSpans: 0 });
    expect(await mark.innerHTML()).toBe(is);
    const grownWrapper = await wrapperAttrs(mark);

    // The save itself is the one path: one row, one ledger event, the shift recorded
    const rows = await findGuardRows(supabase, userId);
    expect(rows).toEqual([{ wine_name: LOG_WINE, rating: "loved" }]);
    await expect
      .poll(async () => countEvents(supabase, userId, "bottle_logged"), { timeout: 15_000 })
      .toBe(loggedBefore + 1);
    const { data: shiftedRows } = await supabase
      .from("dna_timeline").select("wine_name")
      .eq("user_id", userId).eq("event_type", "shifted");
    expect(shiftedRows).toEqual([{ wine_name: LOG_WINE }]);

    // A way on is live: Log another bottle closes the step
    await saved.getByRole("button", { name: "Log another bottle" }).click();
    await expect(page.getByTestId("log-saved")).toHaveCount(0);
    // At rest the grown bloom's wrapper IS PalateMark's (/palate's static mark)
    await page.goto("/palate");
    const palateMark = page.locator("main header").getByTestId("palate-mark");
    await expect(palateMark).toBeVisible({ timeout: 20_000 });
    expect(await wrapperAttrs(palateMark)).toEqual(grownWrapper);
  });
});

test.describe("The growth moment — reduced motion (hard-fail)", () => {
  // The suite's default: under reduced motion a moment is still known, and
  // nothing of it plays — the saved step shows the new shape at once
  test.afterEach(async ({ page }) => { await restoreBaseline(page); });

  test("logging the bottle that promotes an estate: the saved step's bloom is already the new shape — one frame, no word split", async ({ page }) => {
    test.setTimeout(150_000);
    const { supabase, userId } = await testDb();
    await ensureEarnedFixture(supabase, userId);
    await healStaleState(supabase, userId);
    const { profile: before } = await captureBaseline(supabase, userId);
    expect(before.archetype).not.toMatch(/Loyalist/);
    expect(before.identity?.genome).toBeTruthy();
    await page.addInitScript(() => {
      const seen = { wordSpans: 0 };
      (window as any).__words = seen;
      new MutationObserver((records) => {
        for (const record of records) record.addedNodes.forEach((node) => {
          if (node instanceof Element) seen.wordSpans += (node.matches("[data-word]") ? 1 : 0) + node.querySelectorAll("[data-word]").length;
        });
      }).observe(document, { childList: true, subtree: true });
    });

    await page.goto(`/log?q=${encodeURIComponent(LOG_WINE)}`);
    await expect(page.getByTestId("log-search-input")).toHaveValue(LOG_WINE, { timeout: 15_000 });
    await page.getByRole("button", { name: /as written/ }).click();
    const rate = page.getByTestId("bottle-confirm");
    await expect(rate).toBeVisible();
    await rate.getByRole("radio", { name: "Loved it" }).click();
    await page.evaluate(() => {
      const frames: string[] = [];
      (window as any).__savedFrames = frames;
      const read = () => {
        const mark = document.querySelector('[data-testid="log-saved"] [data-testid="palate-mark"]');
        if (mark && !frames.includes(mark.innerHTML)) frames.push(mark.innerHTML);
      };
      new MutationObserver(read).observe(document.body, { childList: true, subtree: true, attributes: true });
      const loop = () => { read(); if (frames.length < 50) requestAnimationFrame(loop); };
      loop();
    });
    await page.getByTestId("log-save").click();

    const saved = page.getByTestId("log-saved");
    await expect(saved).toBeVisible({ timeout: 30_000 });
    await expect(saved).toHaveAttribute("data-moment", "grown");
    await expect
      .poll(async () => (await readProfile(supabase, userId)).archetype, { timeout: 20_000 })
      .toMatch(/Loyalist$/);
    const after = await readProfile(supabase, userId);
    const is = await page.evaluate((markup) => {
      const holder = document.createElement("div");
      holder.innerHTML = markup;
      return holder.innerHTML;
    }, renderPalateMark(after.identity.genome, { size: 164 }));
    await expect.poll(() => saved.getByTestId("palate-mark").innerHTML(), { timeout: 20_000 }).toBe(is);
    // One frame, ever: the new shape, at the big size, from the first paint
    await page.evaluate(async () => { for (let i = 0; i < 30; i++) await new Promise((r) => requestAnimationFrame(r)); });
    expect(await page.evaluate(() => (window as any).__savedFrames)).toEqual([is]);
    await expect(saved.locator("h1")).toHaveText(`You became ${after.archetype}`);
    await expect.poll(() => page.evaluate(() => document.getAnimations().length), { timeout: 10_000 }).toBe(0);
    expect(await page.evaluate(() => (window as any).__words.wordSpans)).toBe(0);
  });
});
