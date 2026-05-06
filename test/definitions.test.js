/**
 * test/definitions.test.js — unit tests for `js/lib/definitions.js`.
 * Covers:
 *   - Pure indexer + transform helpers (indexHeroesById, buildDpsOptions, …).
 *   - `loadCachedDefs` / `loadLegendaryDefs` cache reads against a stubbed
 *     state module (using the in-memory storage polyfill from
 *     `test/fixtures/state.fixtures.js`).
 *   - `applyDefinitionsResponse`: parser invocation + cache write +
 *     subscriber notification.
 *
 * The bundled hero-images fetch is exercised in-browser; we don't try to
 * mock global fetch here — `loadLegendaryDefs` tests stub `fetch` directly
 * for the hero-images path.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import * as state from '../js/state.js';
import { KEYS } from '../js/state.js';

import {
  indexHeroesById,
  indexEffectsById,
  indexFavorsByCurrencyId,
  buildDpsOptions,
  ownedHeroDefsMap,
  withBuildId,
  loadCachedDefs,
  loadLegendaryDefs,
  applyDefinitionsResponse,
} from '../js/lib/definitions.js';

import { makeMemoryStorage } from './fixtures/state.fixtures.js';

const VALID_CACHE = Object.freeze({
  fetched_at: 1717000000000,
  heroes: [{ id: 1, name: 'Bruenor', tags: ['dwarf', 'dps'] }],
  effects: [{ id: 1, effect_string: 'global_dps_multiplier_mult,100' }],
  scopes: [{ id: 1, kind: 'global' }],
  favors: [{ reset_currency_id: 1, short_name: 'Grand Tour' }],
});

// ---------------------------------------------------------------------------
// indexHeroesById
// ---------------------------------------------------------------------------

test('indexHeroesById — builds {id: record} map and keeps last-wins on dupe ids', () => {
  const heroes = [
    { id: 1, name: 'Bruenor' },
    { id: 55, name: 'Morgaen' },
    { id: 1, name: 'Bruenor-v2' },
  ];
  const idx = indexHeroesById(heroes);
  assert.equal(idx[1].name, 'Bruenor-v2');
  assert.equal(idx[55].name, 'Morgaen');
});

test('indexHeroesById — skips entries with missing or non-numeric id', () => {
  const idx = indexHeroesById([
    { id: 1, name: 'A' },
    { id: '2', name: 'B' },
    { name: 'C' },
    null,
    undefined,
    { id: 3, name: 'D' },
  ]);
  assert.deepEqual(Object.keys(idx).sort(), ['1', '3']);
});

test('indexHeroesById — returns empty map for non-arrays', () => {
  assert.equal(Object.keys(indexHeroesById(null)).length, 0);
  assert.equal(Object.keys(indexHeroesById(undefined)).length, 0);
  assert.equal(Object.keys(indexHeroesById('nope')).length, 0);
  assert.equal(Object.keys(indexHeroesById({ 1: {} })).length, 0);
});

// ---------------------------------------------------------------------------
// indexEffectsById + indexFavorsByCurrencyId — same contract, quick coverage
// ---------------------------------------------------------------------------

test('indexEffectsById — indexes on numeric id', () => {
  const idx = indexEffectsById([
    { id: 1, description: 'A' },
    { id: 2, description: 'B' },
  ]);
  assert.equal(idx[1].description, 'A');
  assert.equal(idx[2].description, 'B');
  assert.equal(idx[3], undefined);
});

test('indexFavorsByCurrencyId — indexes on reset_currency_id', () => {
  const idx = indexFavorsByCurrencyId([
    { reset_currency_id: 1, short_name: 'Grand Tour' },
    { reset_currency_id: 3, short_name: 'Tomb of Annihilation' },
    { short_name: 'missing-id' },
  ]);
  assert.equal(idx[1].short_name, 'Grand Tour');
  assert.equal(idx[3].short_name, 'Tomb of Annihilation');
  assert.equal(Object.keys(idx).length, 2);
});

// ---------------------------------------------------------------------------
// buildDpsOptions — alphabetical, owned, tag=dps
// ---------------------------------------------------------------------------

test('buildDpsOptions — includes only owned heroes with the "dps" tag, alphabetized', () => {
  const heroes = [
    { id: 1, name: 'Bruenor', tags: ['fighter', 'support'] },       // no dps tag → skip
    { id: 2, name: 'Celeste', tags: ['cleric', 'dps'] },            // owned + dps → include
    { id: 3, name: 'Nayeli', tags: ['paladin', 'dps'] },            // unowned → skip
    { id: 4, name: 'Jarlaxle', tags: ['drow', 'dps'] },             // owned + dps → include
    { id: 5, name: 'Aasterinian', tags: ['dragonborn', 'dps'] },    // owned + dps → include
  ];
  const userHeroes = [
    { hero_id: 1, owned: '1' },
    { hero_id: 2, owned: '1' },
    { hero_id: 3, owned: '0' }, // unowned
    { hero_id: 4, owned: 1 },
    { hero_id: 5, owned: '1' },
  ];
  const opts = buildDpsOptions(heroes, userHeroes);
  assert.deepEqual(
    opts.map((o) => o.name),
    ['Aasterinian', 'Celeste', 'Jarlaxle']
  );
  assert.equal(opts[0].id, 5);
  assert.equal(opts[0].hero.tags.includes('dps'), true);
});

test('buildDpsOptions — returns empty array when nobody is owned OR tagged', () => {
  const heroes = [
    { id: 1, name: 'A', tags: ['dps'] },
    { id: 2, name: 'B', tags: ['support'] },
  ];
  assert.deepEqual(buildDpsOptions(heroes, []), []);
  assert.deepEqual(buildDpsOptions(heroes, [{ hero_id: 2, owned: 1 }]), []);
});

test('buildDpsOptions — falls back to "Hero #id" when name is missing or blank', () => {
  const heroes = [
    { id: 99, name: '', tags: ['dps'] },
    { id: 100, tags: ['dps'] },
  ];
  const userHeroes = [
    { hero_id: 99, owned: '1' },
    { hero_id: 100, owned: '1' },
  ];
  const opts = buildDpsOptions(heroes, userHeroes);
  assert.equal(opts[0].name, 'Hero #100'); // "Hero #100" sorts before "Hero #99" lexically
  assert.equal(opts[1].name, 'Hero #99');
});

test('buildDpsOptions — defensive against garbage inputs', () => {
  assert.deepEqual(buildDpsOptions(null, null), []);
  assert.deepEqual(buildDpsOptions([], null), []);
  assert.deepEqual(buildDpsOptions([{}], [{}]), []);
});

// ---------------------------------------------------------------------------
// ownedHeroDefsMap — intersection of defs + owned roster
// ---------------------------------------------------------------------------

test('ownedHeroDefsMap — keeps only owned + defined heroes', () => {
  const heroesById = { 1: { id: 1, name: 'A' }, 2: { id: 2, name: 'B' }, 3: { id: 3, name: 'C' } };
  const userHeroes = [
    { hero_id: 1, owned: '1' },
    { hero_id: 2, owned: '0' },
    { hero_id: 3, owned: 1 },
    { hero_id: 4, owned: '1' }, // not in defs
  ];
  const map = ownedHeroDefsMap(heroesById, userHeroes);
  assert.deepEqual(Object.keys(map).sort(), ['1', '3']);
  assert.equal(map[1].name, 'A');
  assert.equal(map[3].name, 'C');
});

test('ownedHeroDefsMap — defensive against missing inputs', () => {
  assert.equal(Object.keys(ownedHeroDefsMap(null, null)).length, 0);
  assert.equal(Object.keys(ownedHeroDefsMap({ 1: {} }, null)).length, 0);
  assert.equal(Object.keys(ownedHeroDefsMap(null, [{ hero_id: 1, owned: 1 }])).length, 0);
});

// ---------------------------------------------------------------------------
// withBuildId — cache-busting helper (pinned so the contract doesn't drift
// from the comments in index.html)
// ---------------------------------------------------------------------------

test('withBuildId — appends ?v=<id> when buildId is set', () => {
  assert.equal(withBuildId('./data/heroes.json', 1), './data/heroes.json?v=1');
  assert.equal(withBuildId('./data/heroes.json', 42), './data/heroes.json?v=42');
  assert.equal(withBuildId('./data/heroes.json', '2026.04.25.1'), './data/heroes.json?v=2026.04.25.1');
});

test('withBuildId — uses & separator when the path already has a query string', () => {
  assert.equal(withBuildId('./data/heroes.json?fresh=1', 3), './data/heroes.json?fresh=1&v=3');
});

test('withBuildId — returns path unchanged for nullish / empty / "dev" buildIds', () => {
  assert.equal(withBuildId('./data/heroes.json', undefined), './data/heroes.json');
  assert.equal(withBuildId('./data/heroes.json', null), './data/heroes.json');
  assert.equal(withBuildId('./data/heroes.json', ''), './data/heroes.json');
  assert.equal(withBuildId('./data/heroes.json', 'dev'), './data/heroes.json');
});

test('withBuildId — returns path unchanged when path is empty or non-string', () => {
  assert.equal(withBuildId('', 1), '');
  assert.equal(withBuildId(null, 1), null);
  assert.equal(withBuildId(undefined, 1), undefined);
});

test('withBuildId — URL-encodes buildIds that contain reserved characters', () => {
  assert.equal(withBuildId('./data/heroes.json', '1 / 2'), './data/heroes.json?v=1%20%2F%202');
});

// ---------------------------------------------------------------------------
// loadCachedDefs — cache-only reader, validation
// ---------------------------------------------------------------------------

test('loadCachedDefs — returns the persisted cache verbatim', () => {
  const storage = makeMemoryStorage();
  state.init(storage);
  state.set(KEYS.DEFINITIONS_CACHE, VALID_CACHE);
  assert.deepEqual(loadCachedDefs(), VALID_CACHE);
});

test('loadCachedDefs — returns null when cache is missing', () => {
  const storage = makeMemoryStorage();
  state.init(storage);
  assert.equal(loadCachedDefs(), null);
});

test('loadCachedDefs — returns null on shape violations (treat malformed as no-cache)', () => {
  const storage = makeMemoryStorage();
  state.init(storage);
  // Missing one of the four required arrays — nothing's downstream-safe.
  state.set(KEYS.DEFINITIONS_CACHE, { heroes: [], effects: [], scopes: [] });
  assert.equal(loadCachedDefs(), null);

  // One of the fields is the wrong type.
  state.set(KEYS.DEFINITIONS_CACHE, { ...VALID_CACHE, scopes: 'not-an-array' });
  assert.equal(loadCachedDefs(), null);

  // Primitive (corruption from manual edits in DevTools).
  state.set(KEYS.DEFINITIONS_CACHE, 'just a string');
  assert.equal(loadCachedDefs(), null);
});

// ---------------------------------------------------------------------------
// loadLegendaryDefs — combines cache + bundled hero-images
// ---------------------------------------------------------------------------

test('loadLegendaryDefs — returns null when cache is empty (no fetch attempted)', async () => {
  const storage = makeMemoryStorage();
  state.init(storage);
  let fetchedUrl = null;
  globalThis.fetch = async (url) => {
    fetchedUrl = url;
    return { ok: true, json: async () => ({ heroes: {} }) };
  };
  try {
    const result = await loadLegendaryDefs();
    assert.equal(result, null);
    assert.equal(
      fetchedUrl,
      null,
      'should not fetch hero-images when cache is empty — view shows loading state instead'
    );
  } finally {
    delete globalThis.fetch;
  }
});

test('loadLegendaryDefs — combines cached defs with the bundled hero-images map', async () => {
  // Uses the global fetch cache inside definitions.js, which deduplicates
  // across tests in the same module — that's fine because every call
  // resolves to the same mocked map below.
  const storage = makeMemoryStorage();
  state.init(storage);
  state.set(KEYS.DEFINITIONS_CACHE, VALID_CACHE);
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ heroes: { 1: 'bruenor' } }),
  });
  try {
    const result = await loadLegendaryDefs();
    assert.ok(result, 'should hydrate when cache is present');
    assert.deepEqual(result.heroes, VALID_CACHE.heroes);
    assert.deepEqual(result.effects, VALID_CACHE.effects);
    assert.deepEqual(result.scopes, VALID_CACHE.scopes);
    assert.deepEqual(result.favors, VALID_CACHE.favors);
    assert.equal(result.fetched_at, VALID_CACHE.fetched_at);
    assert.ok(result.heroImages, 'heroImages bundle should be present');
  } finally {
    delete globalThis.fetch;
  }
});

// ---------------------------------------------------------------------------
// applyDefinitionsResponse — parser + persist + notify
// ---------------------------------------------------------------------------

test('applyDefinitionsResponse — parses the response body and persists to the cache key', () => {
  const storage = makeMemoryStorage();
  state.init(storage);
  const body = {
    hero_defines: [
      {
        id: 1,
        name: 'Bruenor',
        seat_id: 1,
        base_attack_id: 100,
        tags: ['dwarf', 'fighter'],
      },
    ],
    attack_defines: [{ id: 100, tags: ['melee'], damage_types: ['physical'] }],
    legendary_effect_defines: [
      {
        id: 1,
        effects: [
          {
            effect_string: 'global_dps_multiplier_mult,100',
            description: 'Increases the damage of all Champions by $amount%',
          },
        ],
      },
    ],
    campaign_defines: [
      { id: 1, reset_currency_id: 1, short_name: 'Grand Tour', name: 'A Grand Tour' },
    ],
  };
  applyDefinitionsResponse(body, { now: () => 1717000000000 });
  const stored = state.get(KEYS.DEFINITIONS_CACHE);
  assert.equal(stored.fetched_at, 1717000000000);
  assert.equal(stored.heroes.length, 1);
  assert.equal(stored.heroes[0].id, 1);
  assert.equal(stored.scopes[0].kind, 'global');
  assert.equal(stored.favors[0].short_name, 'Grand Tour');
});

test('applyDefinitionsResponse — returns audit lists for caller-side logging', () => {
  const storage = makeMemoryStorage();
  state.init(storage);
  const body = {
    hero_defines: [],
    attack_defines: [],
    legendary_effect_defines: [
      {
        id: 42,
        effects: [
          {
            effect_string: 'totally_new_kind,50',
            description: 'Imbues your DPS with arcane resonance.',
          },
        ],
      },
    ],
    campaign_defines: [{ id: 1, reset_currency_id: 7, short_name: null }],
  };
  const audit = applyDefinitionsResponse(body);
  assert.deepEqual(audit.unknownScopeIds, [42]);
  assert.deepEqual(audit.favorsMissingShortName, [7]);
});

test('applyDefinitionsResponse — fires KEYS.DEFINITIONS_CACHE subscribers', () => {
  const storage = makeMemoryStorage();
  state.init(storage);
  const calls = [];
  state.subscribe(KEYS.DEFINITIONS_CACHE, (v) => calls.push(v));
  applyDefinitionsResponse(
    {
      hero_defines: [],
      attack_defines: [],
      legendary_effect_defines: [],
      campaign_defines: [],
    },
    { now: () => 1 }
  );
  assert.equal(calls.length, 1);
  assert.equal(calls[0].fetched_at, 1);
  assert.deepEqual(calls[0].heroes, []);
});
