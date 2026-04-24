/**
 * Frozen test fixtures for js/lib/legendaryModel.js.
 *
 * Builds on top of scopeMatcher.fixtures.js — shares the same three canonical
 * heroes (CAZRIN, BRUENOR, MINSC) and the same scope taxonomy (ALL_SCOPES).
 * The only addition here is a per-test tailored hero pool (`legendary_effect_id`)
 * plus a range of `legendary_items` states that exercise classifySlots,
 * buildForgeRun eligibility, and buildReforge Phase 1 / Phase 2 behavior.
 *
 * DPS = Cazrin throughout (Human / Female / Chaotic Good / Ranged+Magic / INT 18).
 *
 * Scope-id cheat-sheet (from scopeMatcher.fixtures.js ALL_SCOPES):
 *   1 global, 2 male, 3 female, 5 human, 6 dwarf, 7 elf, 15 halfling,
 *   28 str≥11, 30 str≥15, 37 int≥11, 39 int≥15,
 *   46 melee, 47 ranged, 48 magic,
 *   49 good, 50 evil, 52 chaotic, 53 neutral,
 *   4 nonbinary, 999 unknown.
 *
 * Effects-affecting-Cazrin (DPS): [1, 3, 5, 37, 39, 47, 48, 49, 52]
 * Effects-affecting-Bruenor:      [1, 2, 6, 28, 30, 46, 49, 53]
 * Effects-affecting-Minsc:        [1, 2, 5, 28, 30, 46, 49, 52]
 *
 * Pool choices below are *test-tailored* (not the real game pools) so each
 * hero exercises specific forge-run and reforge branches.
 */

import {
  CAZRIN as BASE_CAZRIN,
  BRUENOR as BASE_BRUENOR,
  MINSC as BASE_MINSC,
  ALL_SCOPES,
} from './scopeMatcher.fixtures.js';

// ---------- Heroes with test-tailored legendary pools ----------
//
// Each hero's pool is hand-picked so their overlap with
// effects-affecting-Cazrin is deterministic and easy to reason about.

// Cazrin (DPS): pool is entirely made of effects that affect her. Each slot
// below is therefore always a level-up candidate under the game-design
// invariant (Appendix B #5a).
export const CAZRIN = Object.freeze({
  ...BASE_CAZRIN,
  legendary_effect_id: Object.freeze([1, 5, 49, 52, 47, 48]),
});

// Bruenor (supporting): pool has exactly 2 effects that affect Cazrin
// (1 global, 49 good) and 4 that do not. poolAffectingDps = [1, 49].
export const BRUENOR = Object.freeze({
  ...BASE_BRUENOR,
  legendary_effect_id: Object.freeze([1, 49, 46, 2, 6, 53]),
});

// Minsc (supporting): pool has exactly 4 effects that affect Cazrin
// (1, 5, 49, 52) and 2 that do not. poolAffectingDps = [1, 5, 49, 52].
export const MINSC = Object.freeze({
  ...BASE_MINSC,
  legendary_effect_id: Object.freeze([1, 5, 49, 52, 46, 2]),
});

// Fourth hero: "Obscura" — a supporting hero whose pool has zero overlap
// with effects-affecting-Cazrin. Should be filtered out of both Forge Run
// and Reforge views entirely.
export const OBSCURA = Object.freeze({
  id: 99,
  name: 'Obscura',
  seat_id: 12,
  class: 'Rogue',
  race: 'Elf',
  tags: Object.freeze(['female', 'elf', 'rogue', 'evil', 'lawful']),
  damage_types: Object.freeze(['melee']),
  ability_scores: Object.freeze({ str: 8, dex: 18, con: 10, int: 10, wis: 10, cha: 10 }),
  // Pool: all evil/elf/str≥11/str≥15/melee/neutral — none affect Cazrin.
  legendary_effect_id: Object.freeze([7, 46, 50, 28, 30, 53]),
});

// ---------- Heroes map helper ----------

/** The four-hero roster keyed by numeric id. */
export const HEROES = Object.freeze({
  [CAZRIN.id]: CAZRIN,
  [BRUENOR.id]: BRUENOR,
  [MINSC.id]: MINSC,
  [OBSCURA.id]: OBSCURA,
});

// Re-export so tests only have to import from one place.
export { ALL_SCOPES };

// ---------- Legendary items ----------
//
// Every test case uses numeric top-level keys (hero_id) and numeric-string
// slot keys ("1".."6") to match the shape of the live API response exactly
// (keys are JSON object keys → always strings when serialized; the classifier
// handles both number and string forms).
//
// Favor costs are kept small integers so the tests are human-readable; real
// favor costs can be 10^60 floats. The classifier treats them as plain
// numbers — no scale-specific quirks.

/**
 * LEGS_BASELINE — exercises forge-run eligibility across DPS and supporting
 * heroes. Cazrin has 5 slots + 1 empty; Bruenor has 3 crafted + 3 empty
 * (including 2 reforge candidates); Minsc has 6 crafted (mix of affecting
 * and reforge-candidate); Obscura has 0 crafted.
 *
 * Designed for Phase 1 behavior on Bruenor (|U| = 3) and Phase 2 behavior
 * on Minsc (|U| = 6).
 */
export const LEGS_BASELINE = Object.freeze({
  // ---- CAZRIN (DPS, id 166) ----
  166: Object.freeze({
    '1': Object.freeze({
      level: 5,
      effect_id: 5,             // human → affects Cazrin
      effects_unlocked: Object.freeze([5]),
      reset_currency_id: 10,    // e.g., Tiamat's Favor
      upgrade_cost: 500,
      upgrade_favor_cost: 100,
      upgrade_favor_required: 0,
    }),
    '2': Object.freeze({
      level: 19,
      effect_id: 49,            // good → affects Cazrin
      effects_unlocked: Object.freeze([49]),
      reset_currency_id: 10,
      upgrade_cost: 2000,
      upgrade_favor_cost: 200,
      upgrade_favor_required: 0,
    }),
    '3': Object.freeze({
      level: 20,                // already maxed — NOT upgradeable
      effect_id: 1,             // global
      effects_unlocked: Object.freeze([1]),
      reset_currency_id: 11,
      upgrade_cost: 0,
      upgrade_favor_cost: 0,
      upgrade_favor_required: 0,
    }),
    '4': Object.freeze({
      level: 3,
      effect_id: 47,            // ranged → affects Cazrin
      effects_unlocked: Object.freeze([47]),
      reset_currency_id: 12,
      upgrade_cost: 1_000_000,  // unaffordable Scales in test balances
      upgrade_favor_cost: 50,
      upgrade_favor_required: 0,
    }),
    '5': Object.freeze({
      level: 3,
      effect_id: 48,            // magic → affects Cazrin
      effects_unlocked: Object.freeze([48]),
      reset_currency_id: 13,
      upgrade_cost: 500,
      upgrade_favor_cost: 1_000_000,  // unaffordable favor
      upgrade_favor_required: 0,
    }),
    // slot 6 intentionally omitted → empty slot
  }),

  // ---- BRUENOR (supporting, id 1). Phase 1 reforge hero: |U| = 3. ----
  1: Object.freeze({
    '1': Object.freeze({
      level: 5,
      effect_id: 49,            // good → affects Cazrin (forge-run affecting slot)
      effects_unlocked: Object.freeze([49]),
      reset_currency_id: 10,
      upgrade_cost: 500,
      upgrade_favor_cost: 100,
      upgrade_favor_required: 0,
    }),
    '2': Object.freeze({
      level: 5,
      effect_id: 46,            // melee → does NOT affect Cazrin (reforge candidate)
      effects_unlocked: Object.freeze([46]),
      reset_currency_id: 11,
      upgrade_cost: 500,
      upgrade_favor_cost: 100,
      upgrade_favor_required: 0,
    }),
    '3': Object.freeze({
      level: 5,
      effect_id: 2,             // male → does NOT affect Cazrin (reforge candidate)
      effects_unlocked: Object.freeze([2]),
      reset_currency_id: 11,
      upgrade_cost: 500,
      upgrade_favor_cost: 100,
      upgrade_favor_required: 0,
    }),
    // slots 4,5,6 empty
  }),

  // ---- MINSC (supporting, id 7). Phase 2 reforge hero: |U| = 6. ----
  7: Object.freeze({
    '1': Object.freeze({
      level: 5,
      effect_id: 5,             // human → affects Cazrin (forge-run affecting)
      effects_unlocked: Object.freeze([5]),
      reset_currency_id: 10,
      upgrade_cost: 500,
      upgrade_favor_cost: 100,
      upgrade_favor_required: 0,
    }),
    '2': Object.freeze({
      level: 5,
      effect_id: 49,            // good → affects Cazrin (forge-run affecting)
      effects_unlocked: Object.freeze([49]),
      reset_currency_id: 10,
      upgrade_cost: 500,
      upgrade_favor_cost: 100,
      upgrade_favor_required: 0,
    }),
    '3': Object.freeze({
      level: 5,
      effect_id: 52,            // chaotic → affects Cazrin (forge-run affecting)
      effects_unlocked: Object.freeze([52]),
      reset_currency_id: 11,
      upgrade_cost: 500,
      upgrade_favor_cost: 100,
      upgrade_favor_required: 0,
    }),
    '4': Object.freeze({
      level: 5,
      effect_id: 46,            // melee → reforge candidate
      effects_unlocked: Object.freeze([46]),
      reset_currency_id: 11,
      upgrade_cost: 500,
      upgrade_favor_cost: 100,
      upgrade_favor_required: 0,
    }),
    '5': Object.freeze({
      level: 5,
      effect_id: 2,             // male → reforge candidate
      effects_unlocked: Object.freeze([2]),
      reset_currency_id: 11,
      upgrade_cost: 500,
      upgrade_favor_cost: 100,
      upgrade_favor_required: 0,
    }),
    '6': Object.freeze({
      level: 5,
      effect_id: 1,             // global → affects Cazrin
      effects_unlocked: Object.freeze([1]),
      reset_currency_id: 10,
      upgrade_cost: 500,
      upgrade_favor_cost: 100,
      upgrade_favor_required: 0,
    }),
  }),

  // Obscura has no crafted items.
});

/**
 * LEGS_WITH_UNKNOWN — same as BASELINE but Cazrin slot 1 carries an effect
 * id (9999) that's NOT in ALL_SCOPES. Drives the "unknown effect id" surface
 * for NFR-9 / FR-14 banner.
 */
export const LEGS_WITH_UNKNOWN = Object.freeze({
  166: Object.freeze({
    '1': Object.freeze({
      level: 3,
      effect_id: 9999,          // not in ALL_SCOPES → unknown
      effects_unlocked: Object.freeze([9999]),
      reset_currency_id: 10,
      upgrade_cost: 500,
      upgrade_favor_cost: 100,
      upgrade_favor_required: 0,
    }),
  }),
});

/**
 * LEGS_EMPTY — no crafted slots anywhere. Used to verify both builders
 * degrade to empty output without throwing.
 */
export const LEGS_EMPTY = Object.freeze({});

/**
 * LEGS_MULTI_UNLOCKED — Bruenor has been reforged: slot 1's effects_unlocked
 * is [49, 6, 53] (three effects historically rolled here), slot 2's is
 * [46, 1] (two), slot 3's is [2]. Union = {49, 6, 53, 46, 1, 2} — all 6
 * effects of the pool. This hero is in Phase 2.
 */
export const LEGS_BRUENOR_PHASE2 = Object.freeze({
  1: Object.freeze({
    '1': Object.freeze({
      level: 5,
      effect_id: 49,
      effects_unlocked: Object.freeze([49, 6, 53]),
      reset_currency_id: 10,
      upgrade_cost: 500,
      upgrade_favor_cost: 100,
      upgrade_favor_required: 0,
    }),
    '2': Object.freeze({
      level: 5,
      effect_id: 46,
      effects_unlocked: Object.freeze([46, 1]),
      reset_currency_id: 11,
      upgrade_cost: 500,
      upgrade_favor_cost: 100,
      upgrade_favor_required: 0,
    }),
    '3': Object.freeze({
      level: 5,
      effect_id: 2,
      effects_unlocked: Object.freeze([2]),
      reset_currency_id: 11,
      upgrade_cost: 500,
      upgrade_favor_cost: 100,
      upgrade_favor_required: 0,
    }),
  }),
});

// ---------- Balance fixtures ----------

/**
 * Balances tuned so that, against LEGS_BASELINE:
 *   - Cazrin slot 1 is upgradeable (scales 1000 ≥ 500 ✓, favor 500 ≥ 100 ✓)
 *   - Cazrin slot 2 is upgradeable (scales 1000 ≥ 2000? NO → blocked on scales)
 *     → Let's bump scales so slot 2 becomes upgradeable too.
 *   - Cazrin slot 3 is MAXED (level 20 — never upgradeable regardless)
 *   - Cazrin slot 4 is blocked on scales (1_000_000 > 5000)
 *   - Cazrin slot 5 is blocked on favor (favor 500 < 1_000_000)
 *   - Bruenor slot 1 is upgradeable
 *   - Bruenor slots 2,3 are reforge candidates (not upgradeable in forge-run)
 *   - Minsc slots 1,2,3,6 are upgradeable
 */
export const BAL_PLENTY = Object.freeze({
  scales: 5000,
  favorById: new Map([
    [10, 500],
    [11, 500],
    [12, 500],
    [13, 500],
  ]),
});

export const BAL_BROKE = Object.freeze({
  scales: 100,              // below every upgrade_cost
  favorById: new Map(),     // below every upgrade_favor_cost
});

// ---------- Reforge cost fixtures ----------

export const REFORGE_READY    = Object.freeze({ cost: 1000, nextCost: 1 });         // at floor
export const REFORGE_COOLING  = Object.freeze({ cost: 1500, nextCost: 1.5 });
export const REFORGE_BLOCKED  = Object.freeze({ cost: 9999, nextCost: 10 });        // cost > balance

// Re-export Scope ids that tests reference frequently, to make assertions
// read naturally without re-importing from the scope fixtures.
export const EFFECT_IDS_AFFECTING_CAZRIN = Object.freeze([1, 3, 5, 37, 39, 47, 48, 49, 52]);
