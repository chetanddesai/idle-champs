/**
 * Unit tests for js/lib/legendaryModel.js.
 *
 * Runs via `npm test` (Node's built-in test runner; no external deps).
 * Covers the pure-functional kernel that drives both the Forge Run and
 * Reforge tabs of the Legendary view (PRD §3.2).
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  classifySlots,
  buildForgeRun,
  buildReforge,
} from '../js/lib/legendaryModel.js';

import {
  CAZRIN, BRUENOR, MINSC, OBSCURA,
  HEROES,
  ALL_SCOPES,
  LEGS_BASELINE, LEGS_WITH_UNKNOWN, LEGS_EMPTY, LEGS_BRUENOR_PHASE2,
  BAL_PLENTY, BAL_BROKE,
  REFORGE_READY, REFORGE_COOLING, REFORGE_BLOCKED,
} from './fixtures/legendaryModel.fixtures.js';

// ---------------------------------------------------------------------------
// classifySlots
// ---------------------------------------------------------------------------

describe('classifySlots — shape + basic invariants', () => {
  const result = classifySlots({
    dpsHeroId: CAZRIN.id,
    heroes: HEROES,
    scopes: ALL_SCOPES,
    legendaryItems: LEGS_BASELINE,
  });

  test('selectedDpsId echoes back the input DPS id', () => {
    assert.equal(result.selectedDpsId, CAZRIN.id);
  });

  test('dpsHero is Cazrin; heroRole is "dps"', () => {
    assert.equal(result.dpsHero.heroId, CAZRIN.id);
    assert.equal(result.dpsHero.heroRole, 'dps');
  });

  test('supportingHeroes contains the three non-DPS heroes, sorted by id', () => {
    const ids = result.supportingHeroes.map((h) => h.heroId);
    // Bruenor=1, Minsc=7, Obscura=99
    assert.deepEqual(ids, [1, 7, 99]);
  });

  test('every hero row has exactly 6 slots, slotIndex 1..6 in order', () => {
    for (const h of [result.dpsHero, ...result.supportingHeroes]) {
      assert.equal(h.slots.length, 6);
      assert.deepEqual(h.slots.map((s) => s.slotIndex), [1, 2, 3, 4, 5, 6]);
    }
  });

  test('effectsAffectingDps matches the scopeMatcher ground truth for Cazrin', () => {
    assert.deepEqual(result.effectsAffectingDps, [1, 3, 5, 37, 39, 47, 48, 49, 52]);
  });
});

describe('classifySlots — per-hero poolAffectingDps', () => {
  const result = classifySlots({
    dpsHeroId: CAZRIN.id,
    heroes: HEROES,
    scopes: ALL_SCOPES,
    legendaryItems: LEGS_BASELINE,
  });

  test('Cazrin pool is entirely DPS-affecting (invariant)', () => {
    assert.deepEqual(result.dpsHero.poolAffectingDps.sort((a, b) => a - b), [1, 5, 47, 48, 49, 52]);
  });

  test('Bruenor pool has 2 DPS-affecting effects: [1, 49]', () => {
    const bruenor = result.supportingHeroes.find((h) => h.heroId === BRUENOR.id);
    assert.deepEqual(bruenor.poolAffectingDps, [1, 49]);
  });

  test('Minsc pool has 4 DPS-affecting effects: [1, 5, 49, 52]', () => {
    const minsc = result.supportingHeroes.find((h) => h.heroId === MINSC.id);
    assert.deepEqual(minsc.poolAffectingDps, [1, 5, 49, 52]);
  });

  test('Obscura pool has 0 DPS-affecting effects (but still appears in supportingHeroes)', () => {
    const obscura = result.supportingHeroes.find((h) => h.heroId === OBSCURA.id);
    assert.deepEqual(obscura.poolAffectingDps, []);
  });
});

describe('classifySlots — per-slot state', () => {
  const result = classifySlots({
    dpsHeroId: CAZRIN.id,
    heroes: HEROES,
    scopes: ALL_SCOPES,
    legendaryItems: LEGS_BASELINE,
  });

  test('Cazrin slot 3 reports level 20 and affectsDps=true (global effect)', () => {
    const slot = result.dpsHero.slots[2]; // slotIndex 3
    assert.equal(slot.slotIndex, 3);
    assert.equal(slot.equippedLevel, 20);
    assert.equal(slot.currentEffectId, 1);
    assert.equal(slot.affectsDps, true);
  });

  test('Cazrin slot 6 is empty: currentEffectId=null, level=0, affectsDps=false', () => {
    const slot = result.dpsHero.slots[5];
    assert.equal(slot.slotIndex, 6);
    assert.equal(slot.currentEffectId, null);
    assert.equal(slot.equippedLevel, 0);
    assert.equal(slot.affectsDps, false);
    assert.deepEqual(slot.effectsUnlocked, []);
  });

  test('Bruenor slot 1 (effect 49 "good") affects Cazrin', () => {
    const bruenor = result.supportingHeroes.find((h) => h.heroId === BRUENOR.id);
    const slot = bruenor.slots[0];
    assert.equal(slot.currentEffectId, 49);
    assert.equal(slot.affectsDps, true);
  });

  test('Bruenor slot 2 (effect 46 "melee") does NOT affect Cazrin', () => {
    const bruenor = result.supportingHeroes.find((h) => h.heroId === BRUENOR.id);
    const slot = bruenor.slots[1];
    assert.equal(slot.currentEffectId, 46);
    assert.equal(slot.affectsDps, false);
  });

  test('per-slot cost and currency fields propagate through classification', () => {
    const slot = result.dpsHero.slots[0]; // Cazrin slot 1
    assert.equal(slot.upgradeCost, 500);
    assert.equal(slot.upgradeFavorCost, 100);
    assert.equal(slot.resetCurrencyId, 10);
    assert.deepEqual(slot.effectsUnlocked, [5]);
  });
});

describe('classifySlots — unknown effect ids', () => {
  test('effect id not in scopes is surfaced in unknownEffectIds and affectsDps=false', () => {
    const result = classifySlots({
      dpsHeroId: CAZRIN.id,
      heroes: HEROES,
      scopes: ALL_SCOPES,
      legendaryItems: LEGS_WITH_UNKNOWN,
    });
    assert.deepEqual(result.unknownEffectIds, [9999]);
    const slot = result.dpsHero.slots[0];
    assert.equal(slot.currentEffectId, 9999);
    assert.equal(slot.affectsDps, false);
  });
});

describe('classifySlots — empty inputs + defensive', () => {
  test('empty legendaryItems → every slot is empty, no unknowns', () => {
    const result = classifySlots({
      dpsHeroId: CAZRIN.id,
      heroes: HEROES,
      scopes: ALL_SCOPES,
      legendaryItems: LEGS_EMPTY,
    });
    for (const h of [result.dpsHero, ...result.supportingHeroes]) {
      for (const slot of h.slots) {
        assert.equal(slot.currentEffectId, null);
        assert.equal(slot.equippedLevel, 0);
      }
    }
    assert.deepEqual(result.unknownEffectIds, []);
  });

  test('dpsHeroId not found in heroes → empty output (not throw)', () => {
    const result = classifySlots({
      dpsHeroId: 404, // nonexistent
      heroes: HEROES,
      scopes: ALL_SCOPES,
      legendaryItems: LEGS_BASELINE,
    });
    assert.equal(result.dpsHero, null);
    assert.deepEqual(result.supportingHeroes, []);
    assert.deepEqual(result.effectsAffectingDps, []);
  });

  test('null inputs do not throw', () => {
    assert.doesNotThrow(() => classifySlots(null));
    assert.doesNotThrow(() => classifySlots(undefined));
    assert.doesNotThrow(() => classifySlots({}));
  });

  test('missing scopes → empty classification', () => {
    const result = classifySlots({
      dpsHeroId: CAZRIN.id,
      heroes: HEROES,
      scopes: null,
      legendaryItems: LEGS_BASELINE,
    });
    assert.equal(result.dpsHero, null);
  });
});

// ---------------------------------------------------------------------------
// buildForgeRun
// ---------------------------------------------------------------------------

describe('buildForgeRun — upgrade eligibility on DPS hero', () => {
  const classification = classifySlots({
    dpsHeroId: CAZRIN.id,
    heroes: HEROES,
    scopes: ALL_SCOPES,
    legendaryItems: LEGS_BASELINE,
  });
  const forgeRun = buildForgeRun(classification, BAL_PLENTY);

  test('dpsHeroRow contains Cazrin with all 6 slots', () => {
    assert.equal(forgeRun.dpsHeroRow.heroId, CAZRIN.id);
    assert.equal(forgeRun.dpsHeroRow.slots.length, 6);
  });

  test('Cazrin slot 1 (affordable) is upgradeable', () => {
    assert.equal(forgeRun.dpsHeroRow.slots[0].upgradeable, true);
  });

  test('Cazrin slot 2 (upgrade_cost 2000, scales 5000) is upgradeable', () => {
    assert.equal(forgeRun.dpsHeroRow.slots[1].upgradeable, true);
  });

  test('Cazrin slot 3 (level 20 = MAX) is NOT upgradeable', () => {
    assert.equal(forgeRun.dpsHeroRow.slots[2].upgradeable, false);
  });

  test('Cazrin slot 4 (upgrade_cost 1M > scales 5000) is NOT upgradeable — scales blocked', () => {
    assert.equal(forgeRun.dpsHeroRow.slots[3].upgradeable, false);
  });

  test('Cazrin slot 5 (upgrade_favor_cost 1M > favor 500) is NOT upgradeable — favor blocked', () => {
    assert.equal(forgeRun.dpsHeroRow.slots[4].upgradeable, false);
  });

  test('Cazrin slot 6 (empty) is NOT upgradeable', () => {
    assert.equal(forgeRun.dpsHeroRow.slots[5].upgradeable, false);
  });

  test('upgradeableSlotKeys contains exactly the upgradeable slots (sorted)', () => {
    assert.ok(forgeRun.upgradeableSlotKeys.includes('166.1'));
    assert.ok(forgeRun.upgradeableSlotKeys.includes('166.2'));
    assert.ok(!forgeRun.upgradeableSlotKeys.includes('166.3'));
    assert.ok(!forgeRun.upgradeableSlotKeys.includes('166.4'));
    // sorted
    const sorted = [...forgeRun.upgradeableSlotKeys].sort();
    assert.deepEqual(forgeRun.upgradeableSlotKeys, sorted);
  });
});

describe('buildForgeRun — supporting hero filter', () => {
  const classification = classifySlots({
    dpsHeroId: CAZRIN.id,
    heroes: HEROES,
    scopes: ALL_SCOPES,
    legendaryItems: LEGS_BASELINE,
  });
  const forgeRun = buildForgeRun(classification, BAL_PLENTY);

  test('Bruenor is included (1 affecting slot)', () => {
    const bruenor = forgeRun.supportingHeroes.find((h) => h.heroId === BRUENOR.id);
    assert.ok(bruenor, 'Bruenor should appear in supportingHeroes');
    assert.equal(bruenor.affectingSlotCount, 1);
  });

  test('Minsc is included (4 affecting slots: 1, 2, 3, 6)', () => {
    const minsc = forgeRun.supportingHeroes.find((h) => h.heroId === MINSC.id);
    assert.ok(minsc, 'Minsc should appear in supportingHeroes');
    assert.equal(minsc.affectingSlotCount, 4);
  });

  test('Obscura is EXCLUDED (0 affecting slots; pool does not intersect DPS-affecting)', () => {
    const obscura = forgeRun.supportingHeroes.find((h) => h.heroId === OBSCURA.id);
    assert.equal(obscura, undefined);
  });
});

describe('buildForgeRun — favor priority panel', () => {
  const classification = classifySlots({
    dpsHeroId: CAZRIN.id,
    heroes: HEROES,
    scopes: ALL_SCOPES,
    legendaryItems: LEGS_BASELINE,
  });
  const forgeRun = buildForgeRun(classification, BAL_PLENTY);

  test('favorBreakdown is sorted desc by upgradeableCount (PRD §9 #15)', () => {
    const counts = forgeRun.favorBreakdown.map((f) => f.upgradeableCount);
    const sorted = [...counts].sort((a, b) => b - a);
    assert.deepEqual(counts, sorted);
  });

  test('every favorBreakdown row has a currentBalance sourced from userBalances', () => {
    for (const row of forgeRun.favorBreakdown) {
      assert.equal(row.currentBalance, BAL_PLENTY.favorById.get(row.resetCurrencyId));
    }
  });

  test('favor currency 10 is present and reflects multiple affecting slots', () => {
    const cur10 = forgeRun.favorBreakdown.find((f) => f.resetCurrencyId === 10);
    assert.ok(cur10);
    // DPS-affecting slots using currency 10:
    // Cazrin slot 1 (5/human), slot 2 (49/good), Bruenor slot 1 (49/good),
    // Minsc slot 1 (5/human), slot 2 (49/good), slot 6 (1/global).
    assert.equal(cur10.affectingCount, 6);
  });
});

describe('buildForgeRun — broke balance', () => {
  const classification = classifySlots({
    dpsHeroId: CAZRIN.id,
    heroes: HEROES,
    scopes: ALL_SCOPES,
    legendaryItems: LEGS_BASELINE,
  });
  const forgeRun = buildForgeRun(classification, BAL_BROKE);

  test('no slots are upgradeable when balances are insufficient', () => {
    assert.deepEqual(forgeRun.upgradeableSlotKeys, []);
  });

  test('affecting counts are unchanged (eligibility is separate from affecting)', () => {
    const cur10 = forgeRun.favorBreakdown.find((f) => f.resetCurrencyId === 10);
    assert.equal(cur10.affectingCount, 6);
    assert.equal(cur10.upgradeableCount, 0);
  });

  test('favorBreakdown ranks by (upgradeableCount desc, affectingCount desc)', () => {
    // With every upgradeableCount=0, the secondary key must sort the list.
    const affecting = forgeRun.favorBreakdown.map((f) => f.affectingCount);
    const sorted = [...affecting].sort((a, b) => b - a);
    assert.deepEqual(affecting, sorted);
  });
});

describe('buildForgeRun — defensive', () => {
  test('null classification → empty shape, no throw', () => {
    const forgeRun = buildForgeRun(null, BAL_PLENTY);
    assert.equal(forgeRun.dpsHeroRow, null);
    assert.deepEqual(forgeRun.supportingHeroes, []);
  });

  test('missing userBalances → everything blocked, no throw', () => {
    const classification = classifySlots({
      dpsHeroId: CAZRIN.id,
      heroes: HEROES,
      scopes: ALL_SCOPES,
      legendaryItems: LEGS_BASELINE,
    });
    const forgeRun = buildForgeRun(classification, null);
    assert.deepEqual(forgeRun.upgradeableSlotKeys, []);
  });
});

// ---------------------------------------------------------------------------
// buildForgeRun — level-target milestone filter
// ---------------------------------------------------------------------------

describe('buildForgeRun — levelTarget=5 narrows the favor breakdown', () => {
  const classification = classifySlots({
    dpsHeroId: CAZRIN.id,
    heroes: HEROES,
    scopes: ALL_SCOPES,
    legendaryItems: LEGS_BASELINE,
  });
  const forgeRun = buildForgeRun(classification, BAL_PLENTY, { levelTarget: 5 });

  // Affecting slots BELOW L5 in LEGS_BASELINE: Cazrin slot 4 (L3, cur 12,
  // scales-blocked) and Cazrin slot 5 (L3, cur 13, favor-blocked). Every
  // other affecting slot (Cazrin1=L5, Cazrin2=L19, Bruenor1=L5, Minsc1/2/3/6=L5)
  // sits at or above the L5 milestone and so drops out of the breakdown.

  test('levelTarget echoed back on the state', () => {
    assert.equal(forgeRun.levelTarget, 5);
  });

  test('Cazrin slot 1 (L5) is NOT upgradeable when target is L5', () => {
    // Was true with the legacy default (L5 < 20 = MAX) but is false at target=5
    // because L5 is no longer "below the milestone".
    assert.equal(forgeRun.dpsHeroRow.slots[0].upgradeable, false);
  });

  test('Cazrin slot 4 (L3, scales-blocked) still tracked as affecting/below-target', () => {
    const cur12 = forgeRun.favorBreakdown.find((f) => f.resetCurrencyId === 12);
    assert.ok(cur12, 'currency 12 should appear (Cazrin slot 4 is below L5)');
    assert.equal(cur12.affectingCount, 1);
    assert.equal(cur12.upgradeableCount, 0); // scales-blocked
  });

  test('Cazrin slot 5 (L3, favor-blocked) still tracked as affecting/below-target', () => {
    const cur13 = forgeRun.favorBreakdown.find((f) => f.resetCurrencyId === 13);
    assert.ok(cur13);
    assert.equal(cur13.affectingCount, 1);
    assert.equal(cur13.upgradeableCount, 0); // favor-blocked
  });

  test('currencies whose only DPS-affecting slots are at/above L5 drop out', () => {
    // currency 10 has 5 affecting slots (Cazrin1, Bruenor1, Minsc1/2/6) — all at L5.
    // currency 11 has 1 affecting slot (Minsc3) — at L5.
    assert.equal(
      forgeRun.favorBreakdown.find((f) => f.resetCurrencyId === 10),
      undefined
    );
    assert.equal(
      forgeRun.favorBreakdown.find((f) => f.resetCurrencyId === 11),
      undefined
    );
  });

  test('upgradeableSlotKeys is empty (every below-L5 slot is budget-blocked)', () => {
    assert.deepEqual(forgeRun.upgradeableSlotKeys, []);
  });
});

describe('buildForgeRun — levelTarget=10 widens the breakdown', () => {
  const classification = classifySlots({
    dpsHeroId: CAZRIN.id,
    heroes: HEROES,
    scopes: ALL_SCOPES,
    legendaryItems: LEGS_BASELINE,
  });
  const forgeRun = buildForgeRun(classification, BAL_PLENTY, { levelTarget: 10 });

  // Below-L10 affecting slots: Cazrin1 (L5, cur 10), Cazrin4 (L3, cur 12),
  // Cazrin5 (L3, cur 13), Bruenor1 (L5, cur 10), Minsc1/2/6 (L5, cur 10),
  // Minsc3 (L5, cur 11). Cazrin2 (L19) is above target → out.

  test('currency 10 reflects 5 below-L10 affecting slots, all upgradeable', () => {
    const cur10 = forgeRun.favorBreakdown.find((f) => f.resetCurrencyId === 10);
    assert.ok(cur10);
    assert.equal(cur10.affectingCount, 5);
    assert.equal(cur10.upgradeableCount, 5); // upgrade_cost 500 ≤ scales 5000
  });

  test('currency 11 reflects 1 below-L10 affecting slot (Minsc3)', () => {
    const cur11 = forgeRun.favorBreakdown.find((f) => f.resetCurrencyId === 11);
    assert.ok(cur11);
    assert.equal(cur11.affectingCount, 1);
    assert.equal(cur11.upgradeableCount, 1);
  });

  test('Cazrin slot 2 (L19) drops out of the breakdown at target=10', () => {
    // Currency 10 still appears (other slots are below 10) but slot 2 itself
    // shouldn't have contributed to its counts.
    const cur10 = forgeRun.favorBreakdown.find((f) => f.resetCurrencyId === 10);
    // 5, not 6 — would be 6 if slot 2 were still counted.
    assert.equal(cur10.affectingCount, 5);
  });
});

describe('buildForgeRun — levelTarget defaults to MAX_LEVEL when omitted/invalid', () => {
  const classification = classifySlots({
    dpsHeroId: CAZRIN.id,
    heroes: HEROES,
    scopes: ALL_SCOPES,
    legendaryItems: LEGS_BASELINE,
  });

  test('omitted options → levelTarget = 20', () => {
    const forgeRun = buildForgeRun(classification, BAL_PLENTY);
    assert.equal(forgeRun.levelTarget, 20);
  });

  test('out-of-range target collapses to 20', () => {
    assert.equal(buildForgeRun(classification, BAL_PLENTY, { levelTarget: 0 }).levelTarget, 20);
    assert.equal(buildForgeRun(classification, BAL_PLENTY, { levelTarget: 21 }).levelTarget, 20);
    assert.equal(buildForgeRun(classification, BAL_PLENTY, { levelTarget: -5 }).levelTarget, 20);
  });

  test('non-numeric target collapses to 20', () => {
    assert.equal(buildForgeRun(classification, BAL_PLENTY, { levelTarget: 'L5' }).levelTarget, 20);
    assert.equal(buildForgeRun(classification, BAL_PLENTY, { levelTarget: null }).levelTarget, 20);
    assert.equal(buildForgeRun(classification, BAL_PLENTY, { levelTarget: NaN }).levelTarget, 20);
  });

  test('default behaviour matches legacy single-arg call', () => {
    const legacy = buildForgeRun(classification, BAL_PLENTY);
    const explicit = buildForgeRun(classification, BAL_PLENTY, { levelTarget: 20 });
    // Same favor breakdown ranking and same upgradeable-key set.
    assert.deepEqual(
      legacy.favorBreakdown.map((f) => f.resetCurrencyId),
      explicit.favorBreakdown.map((f) => f.resetCurrencyId)
    );
    assert.deepEqual(legacy.upgradeableSlotKeys, explicit.upgradeableSlotKeys);
  });
});

describe('buildForgeRun — favoritesOnly narrows the favor breakdown', () => {
  // Baseline classification (Cazrin DPS, Bruenor + Minsc + Obscura supporting).
  const classification = classifySlots({
    dpsHeroId: CAZRIN.id,
    heroes: HEROES,
    scopes: ALL_SCOPES,
    legendaryItems: LEGS_BASELINE,
  });

  test('favoritesOnly=false matches the unfiltered breakdown', () => {
    const open = buildForgeRun(classification, BAL_PLENTY, { levelTarget: 20 });
    const explicit = buildForgeRun(classification, BAL_PLENTY, {
      levelTarget: 20,
      favoritesOnly: false,
      favoriteHeroIds: new Set([BRUENOR.id]),
    });
    assert.deepEqual(
      explicit.favorBreakdown.map((f) => ({
        id: f.resetCurrencyId,
        a: f.affectingCount,
        u: f.upgradeableCount,
      })),
      open.favorBreakdown.map((f) => ({
        id: f.resetCurrencyId,
        a: f.affectingCount,
        u: f.upgradeableCount,
      }))
    );
  });

  test('favoritesOnly=true with no favorites collapses to DPS-only counts', () => {
    const dpsOnly = buildForgeRun(classification, BAL_PLENTY, {
      levelTarget: 20,
      favoritesOnly: true,
      favoriteHeroIds: new Set(),
    });
    // Cazrin (DPS) DPS-affecting slots in LEGS_BASELINE:
    //   slot 1 (L5, cur 10), slot 2 (L19, cur 10), slot 4 (L3, cur 12),
    //   slot 5 (L3, cur 13).
    // Currency 10: affecting=2 (slot 1 + slot 2). Slot 2 is L19 (still <20),
    //   so it stays in the breakdown.
    // Currency 12: affecting=1 (slot 4 only — Cazrin).
    // Currency 13: affecting=1 (slot 5 only — Cazrin).
    const cur10 = dpsOnly.favorBreakdown.find((f) => f.resetCurrencyId === 10);
    const cur12 = dpsOnly.favorBreakdown.find((f) => f.resetCurrencyId === 12);
    const cur13 = dpsOnly.favorBreakdown.find((f) => f.resetCurrencyId === 13);
    assert.ok(cur10);
    assert.equal(cur10.affectingCount, 2);
    assert.ok(cur12);
    assert.equal(cur12.affectingCount, 1);
    assert.ok(cur13);
    assert.equal(cur13.affectingCount, 1);
    // Currency 11 — Minsc-only — should drop out entirely.
    assert.equal(
      dpsOnly.favorBreakdown.find((f) => f.resetCurrencyId === 11),
      undefined
    );
  });

  test('favoritesOnly=true with Bruenor favorited adds his affecting slots back', () => {
    const withBruenor = buildForgeRun(classification, BAL_PLENTY, {
      levelTarget: 20,
      favoritesOnly: true,
      favoriteHeroIds: new Set([BRUENOR.id]),
    });
    // Bruenor adds 1 DPS-affecting slot tied to currency 10 (slot 1, L5).
    // Currency 10 affecting goes from 2 (DPS-only) → 3.
    const cur10 = withBruenor.favorBreakdown.find((f) => f.resetCurrencyId === 10);
    assert.ok(cur10);
    assert.equal(cur10.affectingCount, 3);
    // Currency 11 (Minsc-only) is still out — Minsc isn't favorited.
    assert.equal(
      withBruenor.favorBreakdown.find((f) => f.resetCurrencyId === 11),
      undefined
    );
  });

  test('DPS hero is exempt from favoritesOnly even when not in the favorites set', () => {
    // Favorites set explicitly excludes the DPS — DPS slots must still
    // contribute. Use a non-existent hero id to make the intent clear.
    const result = buildForgeRun(classification, BAL_PLENTY, {
      levelTarget: 20,
      favoritesOnly: true,
      favoriteHeroIds: new Set([999999]),
    });
    // Should match the "no favorites" DPS-only breakdown.
    const dpsOnly = buildForgeRun(classification, BAL_PLENTY, {
      levelTarget: 20,
      favoritesOnly: true,
      favoriteHeroIds: new Set(),
    });
    assert.deepEqual(
      result.favorBreakdown.map((f) => f.resetCurrencyId).sort(),
      dpsOnly.favorBreakdown.map((f) => f.resetCurrencyId).sort()
    );
  });

  test('favoritesOnly + levelTarget compose: target=10 + Bruenor favorited', () => {
    const result = buildForgeRun(classification, BAL_PLENTY, {
      levelTarget: 10,
      favoritesOnly: true,
      favoriteHeroIds: new Set([BRUENOR.id]),
    });
    // Below-L10 + (DPS or Bruenor):
    //   Cazrin1 (L5, cur 10), Cazrin4 (L3, cur 12), Cazrin5 (L3, cur 13),
    //   Bruenor1 (L5, cur 10).
    // Currency 10 affecting: 2 (Cazrin1 + Bruenor1). Cazrin2 (L19) is
    //   above target so it drops out.
    const cur10 = result.favorBreakdown.find((f) => f.resetCurrencyId === 10);
    assert.ok(cur10);
    assert.equal(cur10.affectingCount, 2);
    // Currency 11 (Minsc-only) still gone — not favorited.
    assert.equal(
      result.favorBreakdown.find((f) => f.resetCurrencyId === 11),
      undefined
    );
  });

  test('favoriteHeroIds accepts an array (not just a Set)', () => {
    const arr = buildForgeRun(classification, BAL_PLENTY, {
      levelTarget: 20,
      favoritesOnly: true,
      favoriteHeroIds: [BRUENOR.id],
    });
    const set = buildForgeRun(classification, BAL_PLENTY, {
      levelTarget: 20,
      favoritesOnly: true,
      favoriteHeroIds: new Set([BRUENOR.id]),
    });
    assert.deepEqual(
      arr.favorBreakdown.map((f) => [f.resetCurrencyId, f.affectingCount]),
      set.favorBreakdown.map((f) => [f.resetCurrencyId, f.affectingCount])
    );
  });

  test('favoriteHeroIds nullish + favoritesOnly=true collapses to DPS-only', () => {
    const result = buildForgeRun(classification, BAL_PLENTY, {
      levelTarget: 20,
      favoritesOnly: true,
      // favoriteHeroIds intentionally omitted
    });
    // Same DPS-only breakdown as the empty-Set case.
    const dpsOnly = buildForgeRun(classification, BAL_PLENTY, {
      levelTarget: 20,
      favoritesOnly: true,
      favoriteHeroIds: new Set(),
    });
    assert.deepEqual(
      result.favorBreakdown.map((f) => f.resetCurrencyId),
      dpsOnly.favorBreakdown.map((f) => f.resetCurrencyId)
    );
  });
});

// ---------------------------------------------------------------------------
// buildReforge
// ---------------------------------------------------------------------------

describe('buildReforge — readyState account-wide', () => {
  const classification = classifySlots({
    dpsHeroId: CAZRIN.id,
    heroes: HEROES,
    scopes: ALL_SCOPES,
    legendaryItems: LEGS_BASELINE,
  });

  test('ready: cost at floor (1000) AND scales ≥ cost', () => {
    const r = buildReforge(classification, REFORGE_READY, BAL_PLENTY);
    assert.equal(r.readyState, 'ready');
    assert.equal(r.cost, 1000);
  });

  test('cooling: cost > floor AND scales ≥ cost', () => {
    const r = buildReforge(classification, REFORGE_COOLING, BAL_PLENTY);
    assert.equal(r.readyState, 'cooling');
    assert.equal(r.cost, 1500);
  });

  test('blocked: scales < cost regardless of floor state', () => {
    const r = buildReforge(classification, REFORGE_BLOCKED, BAL_PLENTY);
    assert.equal(r.readyState, 'blocked');
    assert.equal(r.cost, 9999);
  });

  test('broke balance + cost-at-floor → blocked (scales 100 < 1000)', () => {
    const r = buildReforge(classification, REFORGE_READY, BAL_BROKE);
    assert.equal(r.readyState, 'blocked');
  });
});

describe('buildReforge — supporting hero filter', () => {
  const classification = classifySlots({
    dpsHeroId: CAZRIN.id,
    heroes: HEROES,
    scopes: ALL_SCOPES,
    legendaryItems: LEGS_BASELINE,
  });
  const r = buildReforge(classification, REFORGE_READY, BAL_PLENTY);

  test('DPS hero (Cazrin) never appears in reforge supportingHeroes', () => {
    assert.ok(r.supportingHeroes.every((h) => h.heroId !== CAZRIN.id));
  });

  test('Obscura excluded (poolAffectingDps.length === 0)', () => {
    assert.ok(r.supportingHeroes.every((h) => h.heroId !== OBSCURA.id));
  });

  test('Bruenor included (slots 2 and 3 are reforge candidates)', () => {
    const b = r.supportingHeroes.find((h) => h.heroId === BRUENOR.id);
    assert.ok(b);
    const candidates = b.slots.filter((s) => s.isReforgeCandidate);
    assert.equal(candidates.length, 2);
  });

  test('Minsc included (slots 4 and 5 are reforge candidates)', () => {
    const m = r.supportingHeroes.find((h) => h.heroId === MINSC.id);
    assert.ok(m);
    const candidates = m.slots.filter((s) => s.isReforgeCandidate);
    assert.equal(candidates.length, 2);
  });
});

describe('buildReforge — Phase 1 / Phase 2 X/Y formulas', () => {
  const classification = classifySlots({
    dpsHeroId: CAZRIN.id,
    heroes: HEROES,
    scopes: ALL_SCOPES,
    legendaryItems: LEGS_BASELINE,
  });
  const r = buildReforge(classification, REFORGE_READY, BAL_PLENTY);

  test('Bruenor is Phase 1: |U| = 3 (slots 1,2,3 unlocked distinct effects)', () => {
    const b = r.supportingHeroes.find((h) => h.heroId === BRUENOR.id);
    assert.equal(b.reforgePhase, 1);
    assert.equal(b.unlockedUnion.length, 3);
    assert.deepEqual(b.unlockedUnion, [2, 46, 49]);
  });

  test('Bruenor Phase 1 X/Y: Y = 6 - 3 = 3; X = |(P\\U) ∩ A| = |{1,6,53} ∩ {1,49}| = 1', () => {
    const b = r.supportingHeroes.find((h) => h.heroId === BRUENOR.id);
    assert.equal(b.xHits, 1);
    assert.equal(b.yHits, 3);
  });

  test('Minsc is Phase 2: |U| = 6 (all effects unlocked)', () => {
    const m = r.supportingHeroes.find((h) => h.heroId === MINSC.id);
    assert.equal(m.reforgePhase, 2);
    assert.equal(m.unlockedUnion.length, 6);
  });

  test('Minsc Phase 2 X/Y: X = |A| = 4, Y = 6', () => {
    const m = r.supportingHeroes.find((h) => h.heroId === MINSC.id);
    assert.equal(m.xHits, 4);
    assert.equal(m.yHits, 6);
  });
});

describe('buildReforge — Bruenor forced into Phase 2 via multi-unlocked slots', () => {
  // LEGS_BRUENOR_PHASE2 gives Bruenor effects_unlocked arrays [49,6,53] + [46,1] + [2],
  // union = {49, 6, 53, 46, 1, 2} = all 6 pool entries → Phase 2.
  // Only Bruenor has legendary_items in this fixture; other heroes are empty.
  const classification = classifySlots({
    dpsHeroId: CAZRIN.id,
    heroes: HEROES,
    scopes: ALL_SCOPES,
    legendaryItems: LEGS_BRUENOR_PHASE2,
  });
  const r = buildReforge(classification, REFORGE_READY, BAL_PLENTY);

  test('Bruenor is now Phase 2 with |U| = 6', () => {
    const b = r.supportingHeroes.find((h) => h.heroId === BRUENOR.id);
    assert.ok(b);
    assert.equal(b.reforgePhase, 2);
    assert.equal(b.unlockedUnion.length, 6);
  });

  test('Bruenor Phase 2 X/Y: X = |{1, 49}| = 2, Y = 6', () => {
    const b = r.supportingHeroes.find((h) => h.heroId === BRUENOR.id);
    assert.equal(b.xHits, 2);
    assert.equal(b.yHits, 6);
  });
});

describe('buildReforge — defensive', () => {
  test('null classification returns a valid empty shape with a sensible readyState', () => {
    const r = buildReforge(null, REFORGE_READY, BAL_PLENTY);
    assert.equal(r.readyState, 'ready'); // cost 1000, balance 5000
    assert.deepEqual(r.supportingHeroes, []);
  });

  test('missing reforgeCost defaults to floor', () => {
    const classification = classifySlots({
      dpsHeroId: CAZRIN.id,
      heroes: HEROES,
      scopes: ALL_SCOPES,
      legendaryItems: LEGS_BASELINE,
    });
    const r = buildReforge(classification, null, BAL_PLENTY);
    assert.equal(r.cost, 1000);
  });

  test('missing userBalances → blocked (scales 0 < cost 1000)', () => {
    const classification = classifySlots({
      dpsHeroId: CAZRIN.id,
      heroes: HEROES,
      scopes: ALL_SCOPES,
      legendaryItems: LEGS_BASELINE,
    });
    const r = buildReforge(classification, REFORGE_READY, null);
    assert.equal(r.readyState, 'blocked');
  });
});

describe('buildReforge — surfaces unknownEffectIds from classification', () => {
  const classification = classifySlots({
    dpsHeroId: CAZRIN.id,
    heroes: HEROES,
    scopes: ALL_SCOPES,
    legendaryItems: LEGS_WITH_UNKNOWN,
  });
  const r = buildReforge(classification, REFORGE_READY, BAL_PLENTY);

  test('reforge state carries unknownEffectIds through unchanged', () => {
    assert.deepEqual(r.unknownEffectIds, [9999]);
  });
});
