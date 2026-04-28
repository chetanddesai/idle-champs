/**
 * legendaryModel.js
 *
 * Pure, deterministic runtime data model for the Legendary view (PRD §3.2).
 * Builds the shared slot classification (consumed by both Forge Run and
 * Reforge tabs) and the per-view state each tab renders.
 *
 * This module has no I/O, no DOM, and no network dependencies — it's
 * importable from the browser (native ES module) and from Node (`node --test`).
 *
 * Contracts are settled in tech-design-legendary.md Appendix B, items
 * #4 (shape), #5a (reforge candidate definition), #5b (X/Y formulas),
 * #5c (account-wide reforge cost), and #6 (upgrade eligibility).
 *
 * Shapes:
 *
 *   Hero (subset; see js/lib/scopeMatcher.js docstring + data/definitions.heroes.json):
 *     { id, tags, damage_types, ability_scores, legendary_effect_id: number[6] }
 *
 *   Scope: see js/lib/scopeMatcher.js docstring.
 *
 *   LegendaryItem (from getuserdetails.details.legendary_details.legendary_items[heroId][slotId]):
 *     { level, effect_id, effects_unlocked: number[],
 *       reset_currency_id, upgrade_cost, upgrade_favor_cost, upgrade_favor_required }
 *
 *   UserBalances:
 *     { scales: number, favorById: Map<number, number> }
 *
 *   SlotClassification:
 *     { heroId, slotIndex (1..6),
 *       currentEffectId: number | null,   // null ⇒ slot is empty / not crafted
 *       scope: Scope | null,              // scope record for currentEffectId,
 *                                         // or null on empty / unknown-scope slots.
 *                                         // The view reads `scope.kind`/`scope.value`
 *                                         // for the tile tag badge; keeping it on the
 *                                         // slot means the view never re-indexes the
 *                                         // scopes array.
 *       affectsDps: boolean,              // false for empty slots
 *       equippedLevel: number,            // 0 for empty slots
 *       upgradeCost, upgradeFavorCost, resetCurrencyId,
 *       effectsUnlocked: number[] }       // per-slot roll history
 *
 *   HeroClassification:
 *     { heroId, heroRole: 'dps' | 'supporting',
 *       heroPool: number[],               // the hero's 6 possible effect ids
 *       poolAffectingDps: number[],       // heroPool ∩ effectsAffectingDps (sorted asc)
 *       slots: SlotClassification[] }     // length 6, slotIndex 1..6 at indices 0..5
 *
 *   ClassificationOutput:
 *     { selectedDpsId,
 *       dpsHero: HeroClassification | null,
 *       supportingHeroes: HeroClassification[],
 *       effectsAffectingDps: number[],    // ids; sorted asc (from scopeMatcher.affectingEffectIds)
 *       unknownEffectIds: number[] }      // currently-equipped effects whose scope is kind:'unknown'
 */

import { effectAffectsHero, affectingEffectIds } from './scopeMatcher.js';

const SLOT_COUNT = 6;
const MAX_LEVEL = 20;
const REFORGE_FLOOR = 1000;

// ---------------------------------------------------------------------------
// classifySlots — shared stage consumed by both view builders
// ---------------------------------------------------------------------------

/**
 * Classify every hero's six legendary slots against the selected DPS hero.
 *
 * The DPS hero is always emitted as `dpsHero`; every other owned hero goes
 * into `supportingHeroes`. Empty/uncrafted slots are emitted with
 * `currentEffectId: null` rather than being omitted, because the view
 * renders a 6-cell grid per hero regardless of craft state.
 *
 * "Owned" is determined by the caller — `inputs.heroes` should contain
 * only heroes the player owns (filtered upstream in state.js when we wire
 * the refresh path).
 *
 * @param {object}   inputs
 * @param {number}   inputs.dpsHeroId
 * @param {object}   inputs.heroes           — { [heroId]: Hero }
 * @param {object[]} inputs.scopes           — scope records (bundled)
 * @param {object}   inputs.legendaryItems   — { [heroId]: { [slotId]: LegendaryItem } }
 * @returns {ClassificationOutput}
 */
export function classifySlots(inputs) {
  const empty = Object.freeze({
    selectedDpsId: inputs?.dpsHeroId ?? null,
    dpsHero: null,
    supportingHeroes: [],
    effectsAffectingDps: [],
    unknownEffectIds: [],
  });

  if (!inputs || typeof inputs !== 'object') return empty;

  const { dpsHeroId, heroes, scopes, legendaryItems } = inputs;
  if (
    dpsHeroId == null ||
    !heroes ||
    typeof heroes !== 'object' ||
    !Array.isArray(scopes)
  ) {
    return empty;
  }

  const dpsHero = heroes[dpsHeroId];
  if (!dpsHero) return empty;

  // Index scopes by effect id for O(1) per-slot lookup.
  const scopeById = new Map();
  for (const scope of scopes) {
    if (scope && typeof scope.id === 'number') scopeById.set(scope.id, scope);
  }

  const effectsAffectingDps = affectingEffectIds(scopes, dpsHero);
  const effectsAffectingDpsSet = new Set(effectsAffectingDps);

  // Stable iteration order: sort hero ids ascending so outputs are deterministic
  // across runtimes. Object.keys iteration order is insertion-order for string
  // keys but we want this explicit for test stability.
  const heroIds = Object.keys(heroes)
    .map((k) => Number(k))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);

  const unknownEffectIds = new Set();

  let dpsHeroClassification = null;
  const supportingHeroes = [];

  for (const heroId of heroIds) {
    const hero = heroes[heroId];
    if (!hero) continue;

    const heroRole = heroId === dpsHeroId ? 'dps' : 'supporting';
    const heroPool = Array.isArray(hero.legendary_effect_id)
      ? hero.legendary_effect_id.slice()
      : [];
    const poolAffectingDps = heroPool
      .filter((id) => effectsAffectingDpsSet.has(id))
      .slice()
      .sort((a, b) => a - b);

    const heroItems = legendaryItems?.[heroId] ?? legendaryItems?.[String(heroId)] ?? {};

    const slots = [];
    for (let slotIndex = 1; slotIndex <= SLOT_COUNT; slotIndex++) {
      const item = heroItems[slotIndex] ?? heroItems[String(slotIndex)];

      if (!item || typeof item.effect_id !== 'number') {
        // Empty / uncrafted slot.
        slots.push({
          heroId,
          slotIndex,
          currentEffectId: null,
          scope: null,
          affectsDps: false,
          equippedLevel: 0,
          upgradeCost: 0,
          upgradeFavorCost: 0,
          resetCurrencyId: 0,
          effectsUnlocked: [],
        });
        continue;
      }

      const currentEffectId = item.effect_id;
      const scope = scopeById.get(currentEffectId) ?? null;

      // affectsDps is determined purely by the scope match. The game-design
      // invariant (Appendix B #5a) ensures this is true for every DPS-hero
      // slot, but we derive rather than assume, so a future data bug surfaces
      // honestly instead of silently reporting the wrong answer.
      const affectsDps = scope ? effectAffectsHero(scope, dpsHero) : false;

      if (scope && scope.kind === 'unknown') unknownEffectIds.add(currentEffectId);
      if (!scope) unknownEffectIds.add(currentEffectId); // treat missing scope record as unknown

      slots.push({
        heroId,
        slotIndex,
        currentEffectId,
        scope: scope && scope.kind !== 'unknown' ? scope : null,
        affectsDps,
        equippedLevel: typeof item.level === 'number' ? item.level : 0,
        upgradeCost: typeof item.upgrade_cost === 'number' ? item.upgrade_cost : 0,
        upgradeFavorCost:
          typeof item.upgrade_favor_cost === 'number' ? item.upgrade_favor_cost : 0,
        resetCurrencyId:
          typeof item.reset_currency_id === 'number' ? item.reset_currency_id : 0,
        effectsUnlocked: Array.isArray(item.effects_unlocked)
          ? item.effects_unlocked.slice()
          : [],
      });
    }

    const heroClassification = {
      heroId,
      heroRole,
      heroPool,
      poolAffectingDps,
      slots,
    };

    if (heroRole === 'dps') {
      dpsHeroClassification = heroClassification;
    } else {
      supportingHeroes.push(heroClassification);
    }
  }

  return {
    selectedDpsId: dpsHeroId,
    dpsHero: dpsHeroClassification,
    supportingHeroes,
    effectsAffectingDps,
    unknownEffectIds: [...unknownEffectIds].sort((a, b) => a - b),
  };
}

// ---------------------------------------------------------------------------
// buildForgeRun — Forge Run tab state (PRD §3.2.4, FR-9)
// ---------------------------------------------------------------------------

/**
 * Build the Forge Run view state from a classification and the player's
 * balances.
 *
 * Eligibility per slot (all three must hold — Appendix B #6):
 *   - equippedLevel < levelTarget   (default 20 = MAX_LEVEL = "level all the way")
 *   - userBalances.scales >= slot.upgradeCost
 *   - userBalances.favorById.get(slot.resetCurrencyId) >= slot.upgradeFavorCost
 *
 * `upgrade_favor_required` is NEVER consulted. It's telemetry of cumulative
 * favor already spent to reach the current level; it is not a balance check.
 *
 * The optional `levelTarget` (an integer in [1, 20]) lets the view narrow
 * planning to a milestone — e.g. "all DPS-affecting slots to L5" or "to
 * L10". A favor row only appears in `favorBreakdown` if at least one of
 * its DPS-affecting slots is still BELOW the target; rows whose slots
 * have all met the target drop out (the panel's "narrow the list"
 * behaviour). Both `affectingCount` and `upgradeableCount` count below-
 * target slots only — so when target is L5, "Affecting 3 / Upgradeable 3"
 * means "you have 3 below-L5 slots tied to this favor and all 3 are
 * fundable now". With the default target (MAX_LEVEL) the behaviour is
 * unchanged: every DPS-affecting slot that isn't yet maxed is in scope.
 *
 * Favor priority panel is ranked by `upgradeableCount` desc, tiebroken by
 * `affectingCount` desc (PRD §9 decision 15).
 *
 * @param {ClassificationOutput} classification
 * @param {UserBalances}         userBalances
 * @param {{levelTarget?: number}} [options]
 * @returns {ForgeRunState}
 */
export function buildForgeRun(classification, userBalances, options) {
  // Coerce target into [1, MAX_LEVEL]. Anything malformed → MAX_LEVEL so the
  // view degrades to the original "level all the way" behaviour.
  const rawTarget = Number(options?.levelTarget);
  const levelTarget =
    Number.isFinite(rawTarget) && rawTarget >= 1 && rawTarget <= MAX_LEVEL
      ? Math.floor(rawTarget)
      : MAX_LEVEL;

  const empty = Object.freeze({
    selectedDpsId: classification?.selectedDpsId ?? null,
    levelTarget,
    dpsHeroRow: null,
    supportingHeroes: [],
    favorBreakdown: [],
    upgradeableSlotKeys: [],
    unknownEffectIds: classification?.unknownEffectIds ?? [],
  });

  if (!classification || classification.dpsHero == null) return empty;

  const favorById = userBalances?.favorById instanceof Map
    ? userBalances.favorById
    : new Map();
  const scales = typeof userBalances?.scales === 'number' ? userBalances.scales : 0;

  const isUpgradeable = (slot) =>
    slot.currentEffectId != null &&
    slot.equippedLevel < levelTarget &&
    scales >= slot.upgradeCost &&
    (favorById.get(slot.resetCurrencyId) ?? 0) >= slot.upgradeFavorCost;

  // Favor aggregation — { [resetCurrencyId]: { affectingCount, upgradeableCount } }
  // accumulated across every DPS-affecting slot that's below the target on
  // DPS-hero and supporting-hero rows alike. Slots already at/above target
  // don't contribute — they're "done" relative to the current milestone.
  const favorAgg = new Map();
  const addToFavor = (slot, { upgradeable }) => {
    if (!slot.affectsDps || slot.resetCurrencyId === 0) return;
    if (slot.equippedLevel >= levelTarget) return;
    let entry = favorAgg.get(slot.resetCurrencyId);
    if (!entry) {
      entry = { resetCurrencyId: slot.resetCurrencyId, affectingCount: 0, upgradeableCount: 0 };
      favorAgg.set(slot.resetCurrencyId, entry);
    }
    entry.affectingCount += 1;
    if (upgradeable) entry.upgradeableCount += 1;
  };

  const upgradeableSlotKeys = [];
  const annotateSlot = (slot) => {
    const upgradeable = isUpgradeable(slot);
    if (upgradeable) upgradeableSlotKeys.push(`${slot.heroId}.${slot.slotIndex}`);
    addToFavor(slot, { upgradeable });
    return { ...slot, upgradeable };
  };

  // DPS hero row: render every slot regardless of affectsDps (but the game
  // invariant guarantees every equipped slot affects DPS anyway).
  const dpsHeroRow = {
    ...classification.dpsHero,
    slots: classification.dpsHero.slots.map(annotateSlot),
  };

  // Supporting heroes: keep only those with at least one DPS-affecting slot.
  // Every supporting-hero slot carries an `upgradeable` flag regardless of
  // affectsDps (view may want to show "not your DPS" vs. "yes upgrade") but
  // the favor panel only counts DPS-affecting slots.
  const supportingHeroes = [];
  for (const hero of classification.supportingHeroes) {
    const slots = hero.slots.map(annotateSlot);
    const affectingSlotCount = slots.filter((s) => s.affectsDps).length;
    if (affectingSlotCount === 0) continue;
    supportingHeroes.push({ ...hero, slots, affectingSlotCount });
  }

  // Favor breakdown: sorted desc by upgradeableCount, then by affectingCount,
  // then by resetCurrencyId (deterministic tiebreaker).
  const favorBreakdown = [...favorAgg.values()]
    .map((entry) => ({
      ...entry,
      currentBalance: favorById.get(entry.resetCurrencyId) ?? 0,
    }))
    .sort((a, b) => {
      if (b.upgradeableCount !== a.upgradeableCount) {
        return b.upgradeableCount - a.upgradeableCount;
      }
      if (b.affectingCount !== a.affectingCount) return b.affectingCount - a.affectingCount;
      return a.resetCurrencyId - b.resetCurrencyId;
    });

  return {
    selectedDpsId: classification.selectedDpsId,
    levelTarget,
    dpsHeroRow,
    supportingHeroes,
    favorBreakdown,
    upgradeableSlotKeys: upgradeableSlotKeys.sort(),
    unknownEffectIds: classification.unknownEffectIds,
  };
}

// ---------------------------------------------------------------------------
// buildReforge — Reforge tab state (PRD §3.2.5, FR-10)
// ---------------------------------------------------------------------------

/**
 * Build the Reforge view state from a classification, the account-wide
 * reforge cost scalars, and the player's scales balance.
 *
 * A slot is a reforge candidate iff (Appendix B #5a):
 *   - slot.currentEffectId != null (already crafted)
 *   - slot.affectsDps === false    (current roll doesn't help DPS)
 *   - hero.poolAffectingDps.length >= 1 (pool has ≥ 1 DPS-affecting effect)
 *
 * The DPS hero itself is never a reforge candidate source — by game-design
 * invariant (Appendix B #5a) every equipped slot on the DPS hero already
 * affects them.
 *
 * X/Y hit-count formulas (Appendix B #5b):
 *   Let U = ⋃ᵢ effects_unlockedᵢ across the hero's crafted slots (not just
 *   candidate slots; reroll is hero-wide).
 *   Let P = hero.legendary_effect_id (pool of 6).
 *   Let A = P ∩ effectsAffectingDps (= hero.poolAffectingDps).
 *   Phase 1 (|U| < 6): X = |(P \ U) ∩ A|,  Y = 6 − |U|.
 *   Phase 2 (|U| = 6): X = |A|,             Y = 6.
 *
 * readyState (account-wide — Appendix B #5c):
 *   'ready'   — cost at 1000-Tiamat floor AND scales >= cost
 *   'cooling' — cost > floor AND scales >= cost (can reforge but it's expensive)
 *   'blocked' — scales < cost
 *
 * @param {ClassificationOutput} classification
 * @param {{cost:number, nextCost?:number}} reforgeCost
 * @param {UserBalances}         userBalances
 * @returns {ReforgeState}
 */
export function buildReforge(classification, reforgeCost, userBalances) {
  const cost = typeof reforgeCost?.cost === 'number' ? reforgeCost.cost : REFORGE_FLOOR;
  const nextCost = typeof reforgeCost?.nextCost === 'number' ? reforgeCost.nextCost : 0;
  const scales = typeof userBalances?.scales === 'number' ? userBalances.scales : 0;

  let readyState;
  if (scales < cost) readyState = 'blocked';
  else if (cost <= REFORGE_FLOOR) readyState = 'ready';
  else readyState = 'cooling';

  const empty = Object.freeze({
    selectedDpsId: classification?.selectedDpsId ?? null,
    cost,
    nextCost,
    readyState,
    supportingHeroes: [],
    unknownEffectIds: classification?.unknownEffectIds ?? [],
  });

  if (!classification || classification.dpsHero == null) return empty;

  const effectsAffectingDpsSet = new Set(classification.effectsAffectingDps);

  const supportingHeroes = [];
  for (const hero of classification.supportingHeroes) {
    // Only heroes whose pool has at least one DPS-affecting effect can ever
    // yield a beneficial reforge.
    if (hero.poolAffectingDps.length === 0) continue;

    // Union of effects_unlocked across every crafted slot on this hero —
    // this is the hero-wide "historical roll record" that drives Phase 1
    // vs. Phase 2 (Appendix B #5b).
    const unlockedUnion = new Set();
    for (const slot of hero.slots) {
      for (const id of slot.effectsUnlocked) unlockedUnion.add(id);
    }
    const unlockedSize = unlockedUnion.size;
    const heroPoolSet = new Set(hero.heroPool);
    const poolAffectingDpsSet = new Set(hero.poolAffectingDps);

    let xHits;
    let yHits;
    let reforgePhase;
    if (unlockedSize < SLOT_COUNT) {
      // Phase 1 — rerolls draw only from effects not yet unlocked.
      reforgePhase = 1;
      // P \ U — effects in pool but not yet unlocked.
      const remainingPool = [...heroPoolSet].filter((id) => !unlockedUnion.has(id));
      // (P \ U) ∩ A — of those remaining, which affect DPS.
      xHits = remainingPool.filter((id) => poolAffectingDpsSet.has(id)).length;
      yHits = SLOT_COUNT - unlockedSize;
    } else {
      // Phase 2 — rerolls draw uniformly from the full pool of 6.
      reforgePhase = 2;
      xHits = hero.poolAffectingDps.length;
      yHits = SLOT_COUNT;
    }

    // Annotate every slot with candidate flag; per FR-10 the view filters to
    // candidates but we preserve the full 6-slot grid so the view can render
    // the hero's full row and grey out non-candidate slots if desired.
    const slots = hero.slots.map((slot) => ({
      ...slot,
      isReforgeCandidate:
        slot.currentEffectId != null && !slot.affectsDps,
    }));

    const hasAnyCandidate = slots.some((s) => s.isReforgeCandidate);
    if (!hasAnyCandidate) continue;

    supportingHeroes.push({
      heroId: hero.heroId,
      heroRole: hero.heroRole,
      heroPool: hero.heroPool,
      poolAffectingDps: hero.poolAffectingDps,
      reforgePhase,
      unlockedUnion: [...unlockedUnion].sort((a, b) => a - b),
      xHits,
      yHits,
      slots,
    });
  }

  return {
    selectedDpsId: classification.selectedDpsId,
    cost,
    nextCost,
    readyState,
    supportingHeroes,
    unknownEffectIds: classification.unknownEffectIds,
  };
}
