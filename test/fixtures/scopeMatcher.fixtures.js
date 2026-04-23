/**
 * Frozen test fixtures for js/lib/scopeMatcher.js.
 *
 * These records are snapshots of the real bundled data (data/*.json) at the
 * time the test suite was written. They are hardcoded here on purpose — the
 * tests must NOT depend on the live data pipeline, or future refresh-defs
 * runs could silently change test results.
 *
 * When a game update breaks a fixture (a hero's stats get rebalanced, a
 * scope definition changes, etc.), treat it as a signal: verify the
 * refreshed bundle looks right, then update this file and the affected
 * assertions explicitly.
 */

// ---------- Heroes ----------
// Three heroes chosen to exercise every scope kind and every permutation:
// - Cazrin:  Human / Female / Chaotic Good / Ranged+Magic damage / INT 18, STR 8
// - Bruenor: Male  / Dwarf   / Neutral Good / Melee-only / STR 17, INT 8
// - Minsc:   Male  / Human   / Chaotic Good / Melee-only / STR 18
//            (Minsc's class is Ranger, but his base attack is melee — the
//             pair guards against anyone naively tying damage_type to class.)

export const CAZRIN = Object.freeze({
  id: 166,
  name: 'Cazrin',
  seat_id: 10,
  class: 'Wizard',
  race: 'Human',
  tags: Object.freeze([
    'female', 'human', 'wizard', 'chaotic', 'good',
    'dps', 'support', 'fallbacks', 'event', 'y9',
  ]),
  damage_types: Object.freeze(['ranged', 'magic']),
  ability_scores: Object.freeze({ str: 8, dex: 13, con: 14, int: 18, wis: 13, cha: 13 }),
  legendary_effect_id: Object.freeze([1, 3, 5, 35, 94, 52]),
});

export const BRUENOR = Object.freeze({
  id: 1,
  name: 'Bruenor',
  seat_id: 1,
  class: 'Fighter',
  race: 'Dwarf (Shield)',
  tags: Object.freeze([
    'male', 'dwarf', 'fighter', 'support', 'neutral', 'good',
    'companion', 'evergreen', 'core', 'positional', 'lcneutral',
  ]),
  damage_types: Object.freeze(['melee']),
  ability_scores: Object.freeze({ str: 17, dex: 10, con: 16, int: 8, wis: 13, cha: 12 }),
  legendary_effect_id: Object.freeze([1, 56, 6, 83, 43, 53]),
});

export const MINSC = Object.freeze({
  id: 7,
  name: 'Minsc',
  seat_id: 7,
  class: 'Ranger',
  race: 'Human',
  tags: Object.freeze([
    'male', 'human', 'space-hamster', 'ranger', 'dps', 'support',
    'chaotic', 'good', 'baldursgate', 'speed', 'evergreen', 'core', 'hunter',
    'spec_hunter_humanoid', 'spec_hunter_beast', 'spec_hunter_undead',
    'spec_hunter_fey', 'spec_hunter_monstrosity',
  ]),
  damage_types: Object.freeze(['melee']),
  ability_scores: Object.freeze({ str: 18, dex: 12, con: 17, int: 10, wis: 10, cha: 10 }),
  legendary_effect_id: Object.freeze([54, 2, 58, 29, 89, 46]),
});

// ---------- Scopes ----------
// At least one scope per kind, and enough overlap to exercise every branch
// in effectAffectsHero. IDs mirror the actual effect ids from the bundle so
// cross-referencing against data/definitions.legendary-effects.json is
// straightforward when debugging a failing test.

export const S_GLOBAL         = Object.freeze({ id: 1,  kind: 'global' });

export const S_GENDER_MALE    = Object.freeze({ id: 2,  kind: 'gender',      value: 'Male' });
export const S_GENDER_FEMALE  = Object.freeze({ id: 3,  kind: 'gender',      value: 'Female' });
// Nonbinary exists in the effect pool but matches zero heroes today —
// the matcher must correctly return false for everyone, not throw.
export const S_GENDER_NONBIN  = Object.freeze({ id: 4,  kind: 'gender',      value: 'Nonbinary' });

export const S_RACE_HUMAN     = Object.freeze({ id: 5,  kind: 'race',        value: 'Human' });
export const S_RACE_DWARF     = Object.freeze({ id: 6,  kind: 'race',        value: 'Dwarf' });
export const S_RACE_ELF       = Object.freeze({ id: 7,  kind: 'race',        value: 'Elf' });
// "Halfing" (misspelled in the effect description) normalized at refresh
// time to "Halfling"; the matcher must succeed against the correctly-spelled
// hero tag, not the typo.
export const S_RACE_HALFLING  = Object.freeze({ id: 15, kind: 'race',        value: 'Halfling' });

export const S_ALIGN_GOOD     = Object.freeze({ id: 49, kind: 'alignment',   value: 'Good' });
export const S_ALIGN_EVIL     = Object.freeze({ id: 50, kind: 'alignment',   value: 'Evil' });
export const S_ALIGN_CHAOTIC  = Object.freeze({ id: 52, kind: 'alignment',   value: 'Chaotic' });
export const S_ALIGN_NEUTRAL  = Object.freeze({ id: 53, kind: 'alignment',   value: 'Neutral' });

export const S_DMG_MELEE      = Object.freeze({ id: 46, kind: 'damage_type', value: 'Melee' });
export const S_DMG_RANGED     = Object.freeze({ id: 47, kind: 'damage_type', value: 'Ranged' });
export const S_DMG_MAGIC      = Object.freeze({ id: 48, kind: 'damage_type', value: 'Magic' });

export const S_STAT_STR_11    = Object.freeze({ id: 28, kind: 'stat_threshold', stat: 'str', min: 11 });
export const S_STAT_STR_15    = Object.freeze({ id: 30, kind: 'stat_threshold', stat: 'str', min: 15 });
export const S_STAT_INT_11    = Object.freeze({ id: 37, kind: 'stat_threshold', stat: 'int', min: 11 });
export const S_STAT_INT_15    = Object.freeze({ id: 39, kind: 'stat_threshold', stat: 'int', min: 15 });

// Represents a future effect the parser couldn't classify — must always
// return false.
export const S_UNKNOWN        = Object.freeze({ id: 999, kind: 'unknown' });

/**
 * Reference list used to test affectingEffectIds(). Purposefully out of
 * id order so we verify the function sorts its output.
 */
export const ALL_SCOPES = Object.freeze([
  S_GLOBAL,
  S_UNKNOWN,
  S_STAT_INT_15,
  S_STAT_INT_11,
  S_STAT_STR_15,
  S_STAT_STR_11,
  S_DMG_MAGIC,
  S_DMG_RANGED,
  S_DMG_MELEE,
  S_ALIGN_NEUTRAL,
  S_ALIGN_CHAOTIC,
  S_ALIGN_EVIL,
  S_ALIGN_GOOD,
  S_RACE_HALFLING,
  S_RACE_ELF,
  S_RACE_DWARF,
  S_RACE_HUMAN,
  S_GENDER_NONBIN,
  S_GENDER_FEMALE,
  S_GENDER_MALE,
]);
