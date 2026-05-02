/**
 * test/effectFormat.test.js — covers the pure presentation helpers in
 * `js/lib/effectFormat.js`. These back the tile tag chip and current-amount
 * display on the Forge Run view.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  scopeTagLabel,
  scopeTagKind,
  effectBaseAmount,
  effectCurrentAmount,
  effectQualifier,
  substituteAmount,
} from '../js/lib/effectFormat.js';

// ---------------------------------------------------------------------------
// scopeTagLabel
// ---------------------------------------------------------------------------

test('scopeTagLabel — global → "All"', () => {
  assert.equal(scopeTagLabel({ kind: 'global' }), 'All');
});

test('scopeTagLabel — race → value title-cased', () => {
  assert.equal(scopeTagLabel({ kind: 'race', value: 'Human' }), 'Human');
  assert.equal(scopeTagLabel({ kind: 'race', value: 'human' }), 'Human');
  assert.equal(scopeTagLabel({ kind: 'race', value: 'Half-Elf' }), 'Half-Elf');
  assert.equal(scopeTagLabel({ kind: 'race', value: 'half-elf' }), 'Half-Elf');
});

test('scopeTagLabel — gender preserves value case', () => {
  assert.equal(scopeTagLabel({ kind: 'gender', value: 'Male' }), 'Male');
  assert.equal(scopeTagLabel({ kind: 'gender', value: 'Nonbinary' }), 'Nonbinary');
});

test('scopeTagLabel — alignment with two words title-cased', () => {
  assert.equal(
    scopeTagLabel({ kind: 'alignment', value: 'Lawful Good' }),
    'Lawful Good'
  );
  assert.equal(
    scopeTagLabel({ kind: 'alignment', value: 'chaotic neutral' }),
    'Chaotic Neutral'
  );
});

test('scopeTagLabel — damage_type title-cased', () => {
  assert.equal(scopeTagLabel({ kind: 'damage_type', value: 'magic' }), 'Magic');
  assert.equal(scopeTagLabel({ kind: 'damage_type', value: 'Melee' }), 'Melee');
});

test('scopeTagLabel — stat_threshold formatted as "STAT ≥N"', () => {
  assert.equal(
    scopeTagLabel({ kind: 'stat_threshold', stat: 'int', min: 15 }),
    'INT ≥15'
  );
  assert.equal(
    scopeTagLabel({ kind: 'stat_threshold', stat: 'str', min: 20 }),
    'STR ≥20'
  );
});

test('scopeTagLabel — unknown kind returns "?"', () => {
  assert.equal(scopeTagLabel({ kind: 'unknown' }), '?');
  assert.equal(scopeTagLabel({ kind: 'not-a-real-kind' }), '?');
});

test('scopeTagLabel — null / undefined / malformed returns "?"', () => {
  assert.equal(scopeTagLabel(null), '?');
  assert.equal(scopeTagLabel(undefined), '?');
  assert.equal(scopeTagLabel('not-an-object'), '?');
  assert.equal(scopeTagLabel({}), '?');
  assert.equal(scopeTagLabel({ kind: 'race' }), '?');
  assert.equal(scopeTagLabel({ kind: 'race', value: '' }), '?');
  assert.equal(
    scopeTagLabel({ kind: 'stat_threshold', stat: 'int' }),
    '?'
  );
  assert.equal(
    scopeTagLabel({ kind: 'stat_threshold', min: 15 }),
    '?'
  );
});

// ---------------------------------------------------------------------------
// scopeTagKind
// ---------------------------------------------------------------------------

test('scopeTagKind — passes through simple kinds', () => {
  assert.equal(scopeTagKind({ kind: 'global' }), 'global');
  assert.equal(scopeTagKind({ kind: 'race' }), 'race');
  assert.equal(scopeTagKind({ kind: 'gender' }), 'gender');
  assert.equal(scopeTagKind({ kind: 'alignment' }), 'alignment');
});

test('scopeTagKind — underscores → dashes (CSS-safe)', () => {
  assert.equal(scopeTagKind({ kind: 'damage_type' }), 'damage-type');
  assert.equal(scopeTagKind({ kind: 'stat_threshold' }), 'stat-threshold');
});

test('scopeTagKind — null / undefined / malformed → "unknown"', () => {
  assert.equal(scopeTagKind(null), 'unknown');
  assert.equal(scopeTagKind(undefined), 'unknown');
  assert.equal(scopeTagKind({}), 'unknown');
  assert.equal(scopeTagKind({ kind: 42 }), 'unknown');
});

// ---------------------------------------------------------------------------
// effectBaseAmount
// ---------------------------------------------------------------------------

test('effectBaseAmount — parses trailing integer after comma', () => {
  assert.equal(effectBaseAmount('global_dps_multiplier_mult,100'), 100);
  assert.equal(effectBaseAmount('hero_dps_multiplier_mult,125'), 125);
  assert.equal(effectBaseAmount('foo,bar,42'), 42);
});

test('effectBaseAmount — handles floats', () => {
  assert.equal(effectBaseAmount('foo,0.5'), 0.5);
  assert.equal(effectBaseAmount('foo,2.5'), 2.5);
});

test('effectBaseAmount — malformed input returns null', () => {
  assert.equal(effectBaseAmount(null), null);
  assert.equal(effectBaseAmount(undefined), null);
  assert.equal(effectBaseAmount(''), null);
  assert.equal(effectBaseAmount('no-comma-here'), null);
  assert.equal(effectBaseAmount('foo,not-a-number'), null);
  assert.equal(effectBaseAmount(42), null);
});

// ---------------------------------------------------------------------------
// effectCurrentAmount
// ---------------------------------------------------------------------------

test('effectCurrentAmount — base × 2^(level-1) (geometric scaling)', () => {
  assert.equal(
    effectCurrentAmount({ effect_string: 'hero_dps_multiplier_mult,125' }, 5),
    2000
  );
  assert.equal(
    effectCurrentAmount({ effect_string: 'hero_dps_multiplier_mult,125' }, 20),
    65_536_000
  );
  assert.equal(
    effectCurrentAmount({ effect_string: 'global_dps_multiplier_mult,100' }, 1),
    100
  );
});

test('effectCurrentAmount — customer-reported examples', () => {
  // "increasing damage of all female champions by 125% at level 5 → 2000"
  assert.equal(
    effectCurrentAmount({ effect_string: 'hero_dps_multiplier_mult,125' }, 5),
    2000
  );
  // "increasing damage by 20% for each champion with CHA ≥ 11 at level 7 → 1280"
  assert.equal(
    effectCurrentAmount({ effect_string: 'global_dps_multiplier_mult,20' }, 7),
    1280
  );
});

test('effectCurrentAmount — every level doubles the previous level', () => {
  const effect = { effect_string: 'foo,100' };
  // Each step is exactly 2× the prior step, never additive.
  assert.equal(effectCurrentAmount(effect, 1), 100);
  assert.equal(effectCurrentAmount(effect, 2), 200);
  assert.equal(effectCurrentAmount(effect, 3), 400);
  assert.equal(effectCurrentAmount(effect, 4), 800);
  assert.equal(effectCurrentAmount(effect, 5), 1600);
  assert.equal(effectCurrentAmount(effect, 6), 3200);
  assert.equal(effectCurrentAmount(effect, 10), 51_200);
});

test('effectCurrentAmount — level 0 (uncrafted) returns 0', () => {
  // Domain of the doubling formula starts at L1; L0 is "no bonus".
  assert.equal(
    effectCurrentAmount({ effect_string: 'foo,100' }, 0),
    0
  );
});

test('effectCurrentAmount — negative level treated as uncrafted (returns 0)', () => {
  assert.equal(
    effectCurrentAmount({ effect_string: 'foo,100' }, -1),
    0
  );
});

test('effectCurrentAmount — null effect / bad string → null', () => {
  assert.equal(effectCurrentAmount(null, 5), null);
  assert.equal(effectCurrentAmount({}, 5), null);
  assert.equal(effectCurrentAmount({ effect_string: 'bad' }, 5), null);
});

test('effectCurrentAmount — non-numeric level → null', () => {
  assert.equal(effectCurrentAmount({ effect_string: 'foo,100' }, 'L5'), null);
  assert.equal(effectCurrentAmount({ effect_string: 'foo,100' }, undefined), null);
  assert.equal(effectCurrentAmount({ effect_string: 'foo,100' }, NaN), null);
});

// ---------------------------------------------------------------------------
// effectQualifier
// ---------------------------------------------------------------------------

test('effectQualifier — plain all-champions (no qualifier) returns null', () => {
  assert.equal(
    effectQualifier('Increases the damage of all Champions by $(amount)%'),
    null
  );
  assert.equal(
    effectQualifier('Increases the damage of all Male Champions by $(amount)%'),
    null
  );
});

test('effectQualifier — formation-size scaling', () => {
  assert.equal(
    effectQualifier(
      'Increases the damage of all Champions by $(amount)% for each Champion in the formation'
    ),
    'per champion'
  );
});

test('effectQualifier — stat threshold', () => {
  assert.equal(
    effectQualifier(
      'Increases the damage of all Champions by $(amount)% for each Champion with a CHA score of 15 or higher in the formation'
    ),
    'per CHA ≥15'
  );
  assert.equal(
    effectQualifier(
      'Increases the damage of all Champions by $(amount)% for each Champion with a INT score of 11 or higher in the formation'
    ),
    'per INT ≥11'
  );
  assert.equal(
    effectQualifier(
      'Increases the damage of all Champions by $(amount)% for each Champion with a STR score of 13 or higher in the formation'
    ),
    'per STR ≥13'
  );
});

test('effectQualifier — alignment', () => {
  assert.equal(
    effectQualifier(
      'Increases the damage of all Champions by $(amount)% for each Champion in the formation with a GOOD alignment'
    ),
    'per Good'
  );
  assert.equal(
    effectQualifier(
      'Increases the damage of all Champions by $(amount)% for each Champion in the formation with a CHAOTIC alignment'
    ),
    'per Chaotic'
  );
});

test('effectQualifier — gender', () => {
  assert.equal(
    effectQualifier(
      'Increases the damage of all Champions by $(amount)% for each Male Champion in the formation'
    ),
    'per Male'
  );
  assert.equal(
    effectQualifier(
      'Increases the damage of all Champions by $(amount)% for each Female Champion in the formation'
    ),
    'per Female'
  );
  assert.equal(
    effectQualifier(
      'Increases the damage of all Champions by $(amount)% for each Nonbinary Champion in the formation'
    ),
    'per Nonbinary'
  );
});

test('effectQualifier — damage type', () => {
  assert.equal(
    effectQualifier(
      'Increases the damage of all Champions by $(amount)% for each Melee Champion in the formation'
    ),
    'per Melee'
  );
  assert.equal(
    effectQualifier(
      'Increases the damage of all Champions by $(amount)% for each Magic Champion in the formation'
    ),
    'per Magic'
  );
});

test('effectQualifier — simple race', () => {
  assert.equal(
    effectQualifier(
      'Increases the damage of all Champions by $(amount)% for each Human Champion in the formation'
    ),
    'per Human'
  );
  assert.equal(
    effectQualifier(
      'Increases the damage of all Champions by $(amount)% for each Dragonborn Champion in the formation'
    ),
    'per Dragonborn'
  );
});

test('effectQualifier — hyphenated race', () => {
  assert.equal(
    effectQualifier(
      'Increases the damage of all Champions by $(amount)% for each Half-Elf Champion in the formation'
    ),
    'per Half-Elf'
  );
  assert.equal(
    effectQualifier(
      'Increases the damage of all Champions by $(amount)% for each Yuan-ti Champion in the formation'
    ),
    'per Yuan-Ti'
  );
});

test('effectQualifier — null / non-string returns null', () => {
  assert.equal(effectQualifier(null), null);
  assert.equal(effectQualifier(undefined), null);
  assert.equal(effectQualifier(42), null);
  assert.equal(effectQualifier(''), null);
});

// ---------------------------------------------------------------------------
// substituteAmount
// ---------------------------------------------------------------------------

test('substituteAmount — replaces $(amount) form', () => {
  assert.equal(
    substituteAmount('Increases damage by $(amount)%', '500'),
    'Increases damage by 500%'
  );
});

test('substituteAmount — replaces $amount form', () => {
  assert.equal(
    substituteAmount('Increases damage by $amount%', '500'),
    'Increases damage by 500%'
  );
});

test('substituteAmount — replaces every occurrence', () => {
  assert.equal(
    substituteAmount('A=$amount, B=$(amount)', '10'),
    'A=10, B=10'
  );
});

test('substituteAmount — returns empty string for non-string template', () => {
  assert.equal(substituteAmount(null, '500'), '');
  assert.equal(substituteAmount(undefined, '500'), '');
  assert.equal(substituteAmount(42, '500'), '');
});

test('substituteAmount — template without placeholder passes through', () => {
  assert.equal(substituteAmount('no placeholder here', '500'), 'no placeholder here');
});

test('substituteAmount — coerces non-string amountText', () => {
  assert.equal(
    substituteAmount('x=$amount', 500),
    'x=500'
  );
  assert.equal(
    substituteAmount('x=$amount', null),
    'x='
  );
});
