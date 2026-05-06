/**
 * test/legendaryDefsParser.test.js — pinning tests for the shared parser
 * that both the runtime cache hydrator and the offline hero-images
 * refresh script depend on.
 *
 * Coverage targets:
 *   - trimHeroes: damage_types derivation across attack.tags and
 *     attack.damage_types unions, missing base_attack handling, tag
 *     lowercasing, sort order.
 *   - trimEffects: shape preservation, sort order, missing effects
 *     subarray.
 *   - deriveScope: every kind in the union shape, including the
 *     "Halfing" → "Halfling" alias, plus the unknown-kind fallthrough.
 *   - deriveScopes: bundled output is sorted + carries the kind/value.
 *   - deriveFavors: dedupe on reset_currency_id, skip rid=0 + nullish,
 *     sort order, audit list semantics.
 *   - parseDefinitions: aggregates the four arrays, surfaces the audit
 *     lists (`unknownScopeIds`, `favorsMissingShortName`).
 *   - Defensive inputs: arrays-or-non-arrays for every entry point.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  parseDefinitions,
  trimHeroes,
  trimEffects,
  deriveScope,
  deriveScopes,
  deriveFavors,
  deriveDamageTypes,
  DAMAGE_TYPE_TOKENS,
  GENDER_TOKENS,
  ALIGNMENT_TOKENS,
  SCOPE_VALUE_ALIASES,
} from '../js/lib/legendaryDefsParser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURE = JSON.parse(
  readFileSync(path.join(__dirname, 'fixtures/getdefinitions.fixture.json'), 'utf8')
);

// ---------------------------------------------------------------------------
// trimHeroes
// ---------------------------------------------------------------------------

test('trimHeroes — derives damage_types from attack.tags + attack.damage_types', () => {
  const heroes = trimHeroes(FIXTURE.hero_defines, FIXTURE.attack_defines);
  const bruenor = heroes.find((h) => h.id === 1);
  const cazrin = heroes.find((h) => h.id === 14);
  assert.deepEqual(bruenor.damage_types, ['melee']);
  // Cazrin is ranged via tags AND magic via damage_types — both buckets land.
  assert.deepEqual(cazrin.damage_types.sort(), ['magic', 'ranged'].sort());
});

test('trimHeroes — lowercases tags so runtime matching is trivial', () => {
  const heroes = trimHeroes(FIXTURE.hero_defines, FIXTURE.attack_defines);
  const bruenor = heroes.find((h) => h.id === 1);
  assert.deepEqual(bruenor.tags, ['male', 'dwarf', 'fighter', 'support', 'good']);
});

test('trimHeroes — sorts ascending by id', () => {
  const heroes = trimHeroes(FIXTURE.hero_defines, FIXTURE.attack_defines);
  const ids = heroes.map((h) => h.id);
  assert.deepEqual(ids, [...ids].sort((a, b) => a - b));
});

test('trimHeroes — preserves trimmed fields verbatim', () => {
  const heroes = trimHeroes(FIXTURE.hero_defines, FIXTURE.attack_defines);
  const cazrin = heroes.find((h) => h.id === 14);
  assert.equal(cazrin.name, 'Cazrin');
  assert.equal(cazrin.class, 'Wizard');
  assert.equal(cazrin.race, 'Human');
  assert.equal(cazrin.ability_scores.int, 17);
  assert.deepEqual(cazrin.legendary_effect_id, [1, 5, 17]);
});

test('trimHeroes — heroes with no base_attack get an empty damage_types array', () => {
  const heroes = trimHeroes(FIXTURE.hero_defines, FIXTURE.attack_defines);
  const placeholder = heroes.find((h) => h.id === 99);
  assert.deepEqual(placeholder.damage_types, []);
  assert.deepEqual(placeholder.tags, []);
  assert.equal(placeholder.legendary_effect_id, null);
});

test('trimHeroes — empty inputs return []', () => {
  assert.deepEqual(trimHeroes(null, null), []);
  assert.deepEqual(trimHeroes([], []), []);
  assert.deepEqual(trimHeroes('not-an-array', null), []);
});

test('trimHeroes — works with no attack_defines (missing damage_types collapse to [])', () => {
  const heroes = trimHeroes(FIXTURE.hero_defines, null);
  for (const h of heroes) {
    assert.deepEqual(h.damage_types, []);
  }
});

test('deriveDamageTypes — pure helper handles missing inputs', () => {
  assert.deepEqual(deriveDamageTypes(null, new Map()), []);
  assert.deepEqual(deriveDamageTypes({ base_attack_id: 1 }, null), []);
  assert.deepEqual(
    deriveDamageTypes({ base_attack_id: 999 }, new Map([[100, { tags: ['melee'] }]])),
    []
  );
});

// ---------------------------------------------------------------------------
// trimEffects
// ---------------------------------------------------------------------------

test('trimEffects — flattens the first effect into top-level fields', () => {
  const effects = trimEffects(FIXTURE.legendary_effect_defines);
  const first = effects.find((e) => e.id === 1);
  assert.equal(first.effect_string, 'global_dps_multiplier_mult,100');
  assert.deepEqual(first.targets, ['active_campaign']);
  assert.equal(first.description, 'Increases the damage of all Champions by $amount%');
});

test('trimEffects — sorts ascending by id', () => {
  const effects = trimEffects(FIXTURE.legendary_effect_defines);
  const ids = effects.map((e) => e.id);
  assert.deepEqual(ids, [...ids].sort((a, b) => a - b));
});

test('trimEffects — handles missing effects subarray gracefully', () => {
  const effects = trimEffects([{ id: 9001 }]);
  assert.deepEqual(effects, [
    { id: 9001, effect_string: null, targets: null, description: null },
  ]);
});

test('trimEffects — empty inputs return []', () => {
  assert.deepEqual(trimEffects(null), []);
  assert.deepEqual(trimEffects([]), []);
  assert.deepEqual(trimEffects('nope'), []);
});

// ---------------------------------------------------------------------------
// deriveScope — every kind in the discriminated union
// ---------------------------------------------------------------------------

test('deriveScope — global', () => {
  assert.deepEqual(deriveScope(FIXTURE.legendary_effect_defines[0]), { kind: 'global' });
});

test('deriveScope — gender (Male)', () => {
  const eff = FIXTURE.legendary_effect_defines.find((e) => e.id === 2);
  assert.deepEqual(deriveScope(eff), { kind: 'gender', value: 'Male' });
});

test('deriveScope — race (Human)', () => {
  const eff = FIXTURE.legendary_effect_defines.find((e) => e.id === 5);
  assert.deepEqual(deriveScope(eff), { kind: 'race', value: 'Human' });
});

test('deriveScope — race ("Halfing" alias normalises to Halfling)', () => {
  const eff = FIXTURE.legendary_effect_defines.find((e) => e.id === 17);
  assert.deepEqual(deriveScope(eff), { kind: 'race', value: 'Halfling' });
});

test('deriveScope — alignment (Good)', () => {
  const eff = FIXTURE.legendary_effect_defines.find((e) => e.id === 30);
  assert.deepEqual(deriveScope(eff), { kind: 'alignment', value: 'Good' });
});

test('deriveScope — damage_type (Magic)', () => {
  const eff = FIXTURE.legendary_effect_defines.find((e) => e.id === 40);
  assert.deepEqual(deriveScope(eff), { kind: 'damage_type', value: 'Magic' });
});

test('deriveScope — stat_threshold (STR ≥ 11)', () => {
  const eff = FIXTURE.legendary_effect_defines.find((e) => e.id === 50);
  assert.deepEqual(deriveScope(eff), { kind: 'stat_threshold', stat: 'str', min: 11 });
});

test('deriveScope — unknown', () => {
  const eff = FIXTURE.legendary_effect_defines.find((e) => e.id === 99);
  assert.deepEqual(deriveScope(eff), { kind: 'unknown' });
});

test('deriveScope — null effect → unknown', () => {
  assert.deepEqual(deriveScope(null), { kind: 'unknown' });
  assert.deepEqual(deriveScope({}), { kind: 'unknown' });
  assert.deepEqual(deriveScope({ effects: [] }), { kind: 'unknown' });
});

test('deriveScope — hyphenated race name preserved', () => {
  const eff = {
    effects: [
      {
        effect_string: 'hero_dps_multiplier_mult,150',
        description: 'Increases the damage of all Half-Elf Champions by $(amount)%',
      },
    ],
  };
  assert.deepEqual(deriveScope(eff), { kind: 'race', value: 'Half-Elf' });
});

// ---------------------------------------------------------------------------
// deriveScopes
// ---------------------------------------------------------------------------

test('deriveScopes — bundles per-effect scope records, sorted by id', () => {
  const scopes = deriveScopes(FIXTURE.legendary_effect_defines);
  const ids = scopes.map((s) => s.id);
  assert.deepEqual(ids, [...ids].sort((a, b) => a - b));
  const byId = new Map(scopes.map((s) => [s.id, s]));
  assert.equal(byId.get(1).kind, 'global');
  assert.equal(byId.get(50).kind, 'stat_threshold');
  assert.equal(byId.get(99).kind, 'unknown');
});

test('deriveScopes — empty inputs return []', () => {
  assert.deepEqual(deriveScopes(null), []);
  assert.deepEqual(deriveScopes([]), []);
});

// ---------------------------------------------------------------------------
// deriveFavors
// ---------------------------------------------------------------------------

test('deriveFavors — dedupes on reset_currency_id (first wins)', () => {
  const favors = deriveFavors(FIXTURE.campaign_defines);
  const dupes = favors.filter((f) => f.reset_currency_id === 1);
  assert.equal(dupes.length, 1);
  assert.equal(dupes[0].short_name, 'Grand Tour');
});

test('deriveFavors — skips campaigns with reset_currency_id === 0 or null', () => {
  const favors = deriveFavors(FIXTURE.campaign_defines);
  const ids = favors.map((f) => f.reset_currency_id);
  assert.equal(ids.includes(0), false);
  assert.ok(ids.includes(1));
  assert.ok(ids.includes(3));
});

test('deriveFavors — sorts ascending by reset_currency_id', () => {
  const favors = deriveFavors(FIXTURE.campaign_defines);
  const ids = favors.map((f) => f.reset_currency_id);
  assert.deepEqual(ids, [...ids].sort((a, b) => a - b));
});

test('deriveFavors — preserves short_name=null entries (audited downstream)', () => {
  const favors = deriveFavors(FIXTURE.campaign_defines);
  const orphan = favors.find((f) => f.reset_currency_id === 999);
  assert.ok(orphan);
  assert.equal(orphan.short_name, null);
});

test('deriveFavors — empty inputs return []', () => {
  assert.deepEqual(deriveFavors(null), []);
  assert.deepEqual(deriveFavors([]), []);
});

// ---------------------------------------------------------------------------
// parseDefinitions — bundle entrypoint
// ---------------------------------------------------------------------------

test('parseDefinitions — aggregates all four arrays', () => {
  const result = parseDefinitions(FIXTURE);
  assert.equal(result.heroes.length, 3);
  assert.equal(result.effects.length, 8);
  assert.equal(result.scopes.length, 8);
  assert.equal(result.favors.length, 3);
});

test('parseDefinitions — surfaces unknown_scope_ids audit list', () => {
  const result = parseDefinitions(FIXTURE);
  assert.deepEqual(result.unknownScopeIds, [99]);
});

test('parseDefinitions — surfaces favors_missing_short_name audit list', () => {
  const result = parseDefinitions(FIXTURE);
  assert.deepEqual(result.favorsMissingShortName, [999]);
});

test('parseDefinitions — graceful with missing fields', () => {
  const empty = parseDefinitions({});
  assert.deepEqual(empty.heroes, []);
  assert.deepEqual(empty.effects, []);
  assert.deepEqual(empty.scopes, []);
  assert.deepEqual(empty.favors, []);
  assert.deepEqual(empty.unknownScopeIds, []);
  assert.deepEqual(empty.favorsMissingShortName, []);

  const nully = parseDefinitions(null);
  assert.deepEqual(nully.heroes, []);
});

// ---------------------------------------------------------------------------
// Token table sanity (these guard against accidental mutation)
// ---------------------------------------------------------------------------

test('token tables — DAMAGE_TYPE_TOKENS / GENDER / ALIGNMENT pinned', () => {
  assert.deepEqual([...DAMAGE_TYPE_TOKENS].sort(), ['magic', 'melee', 'ranged']);
  assert.deepEqual([...GENDER_TOKENS].sort(), ['Female', 'Male', 'Nonbinary']);
  assert.deepEqual(
    [...ALIGNMENT_TOKENS].sort(),
    ['Chaotic', 'Evil', 'Good', 'Lawful', 'Neutral']
  );
  assert.equal(SCOPE_VALUE_ALIASES.Halfing, 'Halfling');
});
