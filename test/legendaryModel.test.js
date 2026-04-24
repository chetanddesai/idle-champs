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
