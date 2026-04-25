/**
 * test/definitions.test.js — unit tests for the pure indexer + transform
 * helpers exported from `js/lib/definitions.js`. The `load*` functions
 * touch `fetch` and are exercised in-browser; only the pure bits are
 * covered here.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  indexHeroesById,
  indexEffectsById,
  indexFavorsByCurrencyId,
  buildDpsOptions,
  ownedHeroDefsMap,
} from '../js/lib/definitions.js';

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
