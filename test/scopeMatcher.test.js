/**
 * Unit tests for js/lib/scopeMatcher.js.
 *
 * Runs via Node's built-in test runner: `npm test` (or `node --test test/`).
 * No external deps.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { effectAffectsHero, affectingEffectIds } from '../js/lib/scopeMatcher.js';
import {
  CAZRIN, BRUENOR, MINSC,
  S_GLOBAL,
  S_GENDER_MALE, S_GENDER_FEMALE, S_GENDER_NONBIN,
  S_RACE_HUMAN, S_RACE_DWARF, S_RACE_ELF, S_RACE_HALFLING,
  S_ALIGN_GOOD, S_ALIGN_EVIL, S_ALIGN_CHAOTIC, S_ALIGN_NEUTRAL,
  S_DMG_MELEE, S_DMG_RANGED, S_DMG_MAGIC,
  S_STAT_STR_11, S_STAT_STR_15, S_STAT_INT_11, S_STAT_INT_15,
  S_UNKNOWN,
  ALL_SCOPES,
} from './fixtures/scopeMatcher.fixtures.js';

// ---------------------------------------------------------------------------
// effectAffectsHero — global
// ---------------------------------------------------------------------------

describe('effectAffectsHero — global', () => {
  test('affects every hero regardless of identity', () => {
    for (const hero of [CAZRIN, BRUENOR, MINSC]) {
      assert.equal(effectAffectsHero(S_GLOBAL, hero), true, `global should affect ${hero.name}`);
    }
  });
});

// ---------------------------------------------------------------------------
// effectAffectsHero — race (matches against hero.tags)
// ---------------------------------------------------------------------------

describe('effectAffectsHero — race', () => {
  test('Human matches Cazrin and Minsc, misses Bruenor (Dwarf)', () => {
    assert.equal(effectAffectsHero(S_RACE_HUMAN, CAZRIN), true);
    assert.equal(effectAffectsHero(S_RACE_HUMAN, MINSC), true);
    assert.equal(effectAffectsHero(S_RACE_HUMAN, BRUENOR), false);
  });

  test('Dwarf matches only Bruenor', () => {
    assert.equal(effectAffectsHero(S_RACE_DWARF, CAZRIN), false);
    assert.equal(effectAffectsHero(S_RACE_DWARF, MINSC), false);
    assert.equal(effectAffectsHero(S_RACE_DWARF, BRUENOR), true);
  });

  test('Elf matches none of the fixture heroes', () => {
    for (const hero of [CAZRIN, BRUENOR, MINSC]) {
      assert.equal(effectAffectsHero(S_RACE_ELF, hero), false);
    }
  });

  test('Halfling (typo "Halfing" in effect desc, normalized) matches none of the fixture heroes but also does not throw', () => {
    for (const hero of [CAZRIN, BRUENOR, MINSC]) {
      assert.equal(effectAffectsHero(S_RACE_HALFLING, hero), false);
    }
  });
});

// ---------------------------------------------------------------------------
// effectAffectsHero — gender
// ---------------------------------------------------------------------------

describe('effectAffectsHero — gender', () => {
  test('Female matches only Cazrin', () => {
    assert.equal(effectAffectsHero(S_GENDER_FEMALE, CAZRIN), true);
    assert.equal(effectAffectsHero(S_GENDER_FEMALE, BRUENOR), false);
    assert.equal(effectAffectsHero(S_GENDER_FEMALE, MINSC), false);
  });

  test('Male matches Bruenor and Minsc, misses Cazrin', () => {
    assert.equal(effectAffectsHero(S_GENDER_MALE, CAZRIN), false);
    assert.equal(effectAffectsHero(S_GENDER_MALE, BRUENOR), true);
    assert.equal(effectAffectsHero(S_GENDER_MALE, MINSC), true);
  });

  test('Nonbinary matches nobody in the current roster but does not throw', () => {
    for (const hero of [CAZRIN, BRUENOR, MINSC]) {
      assert.equal(effectAffectsHero(S_GENDER_NONBIN, hero), false);
    }
  });
});

// ---------------------------------------------------------------------------
// effectAffectsHero — alignment
// Critical: API pre-splits two-word alignments (Chaotic Good, Neutral Good)
// into separate tokens in hero.tags. Matching is per-axis and each axis can
// hit independently.
// ---------------------------------------------------------------------------

describe('effectAffectsHero — alignment', () => {
  test('Good matches every fixture hero (all three are Good-aligned)', () => {
    for (const hero of [CAZRIN, BRUENOR, MINSC]) {
      assert.equal(effectAffectsHero(S_ALIGN_GOOD, hero), true);
    }
  });

  test('Evil matches none of the fixture heroes', () => {
    for (const hero of [CAZRIN, BRUENOR, MINSC]) {
      assert.equal(effectAffectsHero(S_ALIGN_EVIL, hero), false);
    }
  });

  test('Chaotic matches Cazrin and Minsc (Chaotic Good) but not Bruenor (Neutral Good)', () => {
    assert.equal(effectAffectsHero(S_ALIGN_CHAOTIC, CAZRIN), true);
    assert.equal(effectAffectsHero(S_ALIGN_CHAOTIC, MINSC), true);
    assert.equal(effectAffectsHero(S_ALIGN_CHAOTIC, BRUENOR), false);
  });

  test('Neutral matches only Bruenor (Neutral Good)', () => {
    assert.equal(effectAffectsHero(S_ALIGN_NEUTRAL, CAZRIN), false);
    assert.equal(effectAffectsHero(S_ALIGN_NEUTRAL, MINSC), false);
    assert.equal(effectAffectsHero(S_ALIGN_NEUTRAL, BRUENOR), true);
  });
});

// ---------------------------------------------------------------------------
// effectAffectsHero — damage_type
// Heroes can be in multiple buckets (Cazrin is both magic and ranged).
// Damage_type is derived from the base_attack_id, NOT from the hero's class.
// ---------------------------------------------------------------------------

describe('effectAffectsHero — damage_type', () => {
  test('Melee matches Bruenor and Minsc, misses Cazrin', () => {
    assert.equal(effectAffectsHero(S_DMG_MELEE, BRUENOR), true);
    assert.equal(effectAffectsHero(S_DMG_MELEE, MINSC), true);
    assert.equal(effectAffectsHero(S_DMG_MELEE, CAZRIN), false);
  });

  test('Ranged matches only Cazrin among the fixtures', () => {
    assert.equal(effectAffectsHero(S_DMG_RANGED, CAZRIN), true);
    assert.equal(effectAffectsHero(S_DMG_RANGED, BRUENOR), false);
    assert.equal(effectAffectsHero(S_DMG_RANGED, MINSC), false);
  });

  test('Magic matches only Cazrin; Cazrin hits both Ranged AND Magic (multi-bucket)', () => {
    assert.equal(effectAffectsHero(S_DMG_MAGIC, CAZRIN), true);
    assert.equal(effectAffectsHero(S_DMG_MAGIC, BRUENOR), false);
    assert.equal(effectAffectsHero(S_DMG_MAGIC, MINSC), false);
  });

  test('Minsc (Ranger class, Melee attack) proves damage_type is attack-based, not class-based', () => {
    assert.equal(effectAffectsHero(S_DMG_MELEE, MINSC), true);
    assert.equal(effectAffectsHero(S_DMG_RANGED, MINSC), false);
  });
});

// ---------------------------------------------------------------------------
// effectAffectsHero — stat_threshold
// ---------------------------------------------------------------------------

describe('effectAffectsHero — stat_threshold', () => {
  test('STR ≥ 11 misses Cazrin (STR 8), matches Bruenor (STR 17), matches Minsc (STR 18)', () => {
    assert.equal(effectAffectsHero(S_STAT_STR_11, CAZRIN), false);
    assert.equal(effectAffectsHero(S_STAT_STR_11, BRUENOR), true);
    assert.equal(effectAffectsHero(S_STAT_STR_11, MINSC), true);
  });

  test('STR ≥ 15 misses Cazrin, matches Bruenor (17 ≥ 15), matches Minsc (18 ≥ 15)', () => {
    assert.equal(effectAffectsHero(S_STAT_STR_15, CAZRIN), false);
    assert.equal(effectAffectsHero(S_STAT_STR_15, BRUENOR), true);
    assert.equal(effectAffectsHero(S_STAT_STR_15, MINSC), true);
  });

  test('INT ≥ 11 matches only Cazrin (INT 18) — Bruenor (8) and Minsc (10) fall short', () => {
    assert.equal(effectAffectsHero(S_STAT_INT_11, CAZRIN), true);
    assert.equal(effectAffectsHero(S_STAT_INT_11, BRUENOR), false);
    assert.equal(effectAffectsHero(S_STAT_INT_11, MINSC), false);
  });

  test('INT ≥ 15 matches only Cazrin (18 ≥ 15)', () => {
    assert.equal(effectAffectsHero(S_STAT_INT_15, CAZRIN), true);
    assert.equal(effectAffectsHero(S_STAT_INT_15, BRUENOR), false);
    assert.equal(effectAffectsHero(S_STAT_INT_15, MINSC), false);
  });

  test('boundary: threshold equal to stat value matches (≥, not >)', () => {
    const hero = { tags: [], damage_types: [], ability_scores: { str: 11, dex: 0, con: 0, int: 0, wis: 0, cha: 0 } };
    assert.equal(effectAffectsHero(S_STAT_STR_11, hero), true);
  });

  test('stat lookup is case-insensitive in scope.stat', () => {
    const upperScope = { id: 28, kind: 'stat_threshold', stat: 'STR', min: 11 };
    assert.equal(effectAffectsHero(upperScope, BRUENOR), true);
  });
});

// ---------------------------------------------------------------------------
// effectAffectsHero — unknown
// ---------------------------------------------------------------------------

describe('effectAffectsHero — unknown', () => {
  test('always returns false (conservative) for every hero', () => {
    for (const hero of [CAZRIN, BRUENOR, MINSC]) {
      assert.equal(effectAffectsHero(S_UNKNOWN, hero), false);
    }
  });

  test('unrecognized kinds behave like unknown (fall through to false)', () => {
    const weirdScope = { id: 1000, kind: 'future_thing' };
    for (const hero of [CAZRIN, BRUENOR, MINSC]) {
      assert.equal(effectAffectsHero(weirdScope, hero), false);
    }
  });
});

// ---------------------------------------------------------------------------
// effectAffectsHero — defensive input handling
// The matcher must never throw; partial/missing data returns false so the
// UI can continue to render the rest of the list.
// ---------------------------------------------------------------------------

describe('effectAffectsHero — defensive input handling', () => {
  test('null or undefined scope → false', () => {
    assert.equal(effectAffectsHero(null, CAZRIN), false);
    assert.equal(effectAffectsHero(undefined, CAZRIN), false);
  });

  test('null or undefined hero → false', () => {
    assert.equal(effectAffectsHero(S_GLOBAL, null), false);
    assert.equal(effectAffectsHero(S_GLOBAL, undefined), false);
  });

  test('hero missing tags → race/gender/alignment return false', () => {
    const barehero = { damage_types: ['melee'], ability_scores: { str: 10 } };
    assert.equal(effectAffectsHero(S_RACE_HUMAN, barehero), false);
    assert.equal(effectAffectsHero(S_GENDER_MALE, barehero), false);
    assert.equal(effectAffectsHero(S_ALIGN_GOOD, barehero), false);
  });

  test('hero missing damage_types → damage_type returns false', () => {
    const barehero = { tags: ['human'], ability_scores: { str: 10 } };
    assert.equal(effectAffectsHero(S_DMG_MELEE, barehero), false);
  });

  test('hero missing ability_scores → stat_threshold returns false', () => {
    const barehero = { tags: ['human'], damage_types: ['melee'] };
    assert.equal(effectAffectsHero(S_STAT_STR_11, barehero), false);
  });

  test('scope.value missing → race/gender/alignment/damage_type return false', () => {
    for (const kind of ['race', 'gender', 'alignment', 'damage_type']) {
      assert.equal(effectAffectsHero({ id: 0, kind }, CAZRIN), false);
    }
  });

  test('stat_threshold with missing stat or min → false', () => {
    assert.equal(effectAffectsHero({ id: 0, kind: 'stat_threshold', min: 11 }, BRUENOR), false);
    assert.equal(effectAffectsHero({ id: 0, kind: 'stat_threshold', stat: 'str' }, BRUENOR), false);
  });

  test('case insensitivity on scope.value for tag-based kinds', () => {
    const upperScope = { id: 5, kind: 'race', value: 'HUMAN' };
    assert.equal(effectAffectsHero(upperScope, CAZRIN), true);
  });
});

// ---------------------------------------------------------------------------
// affectingEffectIds
// ---------------------------------------------------------------------------

describe('affectingEffectIds', () => {
  test('Cazrin hits the expected set from the fixture scope list', () => {
    // Cazrin: Human / Female / Chaotic Good / Ranged+Magic / INT 18
    // Expected from ALL_SCOPES:
    //   1 (global), 3 (female), 5 (human), 39 (int>=15), 37 (int>=11),
    //   47 (ranged), 48 (magic), 49 (good), 52 (chaotic)
    // Note: STR thresholds miss (STR 8), Dwarf/Elf/Halfling miss, Melee misses.
    const ids = affectingEffectIds(ALL_SCOPES, CAZRIN);
    assert.deepEqual(ids, [1, 3, 5, 37, 39, 47, 48, 49, 52]);
  });

  test('Bruenor hits the expected set — completely different from Cazrin', () => {
    // Bruenor: Male / Dwarf / Neutral Good / Melee / STR 17, INT 8
    //   1 (global), 2 (male), 6 (dwarf), 28 (str>=11), 30 (str>=15),
    //   46 (melee), 49 (good), 53 (neutral)
    const ids = affectingEffectIds(ALL_SCOPES, BRUENOR);
    assert.deepEqual(ids, [1, 2, 6, 28, 30, 46, 49, 53]);
  });

  test('Minsc hits the expected set — shares Human/Male/Good/Chaotic with Cazrin and Melee/STR with Bruenor', () => {
    // Minsc: Male / Human / Chaotic Good / Melee / STR 18
    //   1 (global), 2 (male), 5 (human), 28 (str>=11), 30 (str>=15),
    //   46 (melee), 49 (good), 52 (chaotic)
    const ids = affectingEffectIds(ALL_SCOPES, MINSC);
    assert.deepEqual(ids, [1, 2, 5, 28, 30, 46, 49, 52]);
  });

  test('result is sorted ascending even when input scopes are unsorted', () => {
    // ALL_SCOPES is deliberately unsorted; verify the output is sorted.
    const ids = affectingEffectIds(ALL_SCOPES, BRUENOR);
    const sorted = [...ids].sort((a, b) => a - b);
    assert.deepEqual(ids, sorted);
  });

  test('unknown scopes are never included', () => {
    // S_UNKNOWN (id 999) is in ALL_SCOPES; must not appear in any result.
    for (const hero of [CAZRIN, BRUENOR, MINSC]) {
      const ids = affectingEffectIds(ALL_SCOPES, hero);
      assert.ok(!ids.includes(999), `${hero.name} should not include unknown scope id`);
    }
  });

  test('empty scopes → []', () => {
    assert.deepEqual(affectingEffectIds([], CAZRIN), []);
  });

  test('null / non-array scopes → []', () => {
    assert.deepEqual(affectingEffectIds(null, CAZRIN), []);
    assert.deepEqual(affectingEffectIds(undefined, CAZRIN), []);
    assert.deepEqual(affectingEffectIds('not-an-array', CAZRIN), []);
  });

  test('null hero → []', () => {
    assert.deepEqual(affectingEffectIds(ALL_SCOPES, null), []);
  });
});
