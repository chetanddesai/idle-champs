/**
 * test/home.test.js — unit tests for the pure summary helper exported
 * from `js/views/home.js`. The DOM-touching render path is exercised
 * in-browser; only `summarizeAccount` is covered here.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { summarizeAccount } from '../js/views/home.js';

test('summarizeAccount — null / undefined returns all-null shape', () => {
  assert.deepEqual(summarizeAccount(null), {
    scales: null,
    ownedHeroes: null,
    equippedLegendaries: null,
    legendaryHeroes: null,
  });
  assert.deepEqual(summarizeAccount(undefined), {
    scales: null,
    ownedHeroes: null,
    equippedLegendaries: null,
    legendaryHeroes: null,
  });
});

test('summarizeAccount — non-object details returns all-null shape', () => {
  assert.deepEqual(summarizeAccount('whoops'), {
    scales: null,
    ownedHeroes: null,
    equippedLegendaries: null,
    legendaryHeroes: null,
  });
});

test('summarizeAccount — reads multiplayer_points as Scales balance', () => {
  const details = { stats: { multiplayer_points: 126995 } };
  const s = summarizeAccount(details);
  assert.equal(s.scales, 126995);
});

test('summarizeAccount — string multiplayer_points parses to number', () => {
  const details = { stats: { multiplayer_points: '4200' } };
  assert.equal(summarizeAccount(details).scales, 4200);
});

test('summarizeAccount — non-numeric multiplayer_points falls back to null', () => {
  assert.equal(summarizeAccount({ stats: { multiplayer_points: 'n/a' } }).scales, null);
  assert.equal(summarizeAccount({ stats: {} }).scales, null);
  assert.equal(summarizeAccount({}).scales, null);
});

test('summarizeAccount — ownedHeroes counts owned=1 entries, string or number', () => {
  const details = {
    heroes: [
      { hero_id: 1, owned: 1 },
      { hero_id: 2, owned: '1' },
      { hero_id: 3, owned: 0 },
      { hero_id: 4, owned: '0' },
      { hero_id: 5, owned: 1 },
    ],
  };
  assert.equal(summarizeAccount(details).ownedHeroes, 3);
});

test('summarizeAccount — ownedHeroes handles missing owned flag as unowned', () => {
  const details = { heroes: [{ hero_id: 1 }, { hero_id: 2, owned: 1 }] };
  assert.equal(summarizeAccount(details).ownedHeroes, 1);
});

test('summarizeAccount — ownedHeroes is null when heroes is not an array', () => {
  assert.equal(summarizeAccount({ heroes: {} }).ownedHeroes, null);
  assert.equal(summarizeAccount({ heroes: null }).ownedHeroes, null);
});

test('summarizeAccount — counts legendary_items slots and heroes', () => {
  const details = {
    legendary_details: {
      legendary_items: {
        '34': { '1': {}, '2': {}, '3': {} },
        '55': { '1': {} },
      },
    },
  };
  const s = summarizeAccount(details);
  assert.equal(s.equippedLegendaries, 4);
  assert.equal(s.legendaryHeroes, 2);
});

test('summarizeAccount — zero legendaries when map exists but is empty', () => {
  const s = summarizeAccount({ legendary_details: { legendary_items: {} } });
  assert.equal(s.equippedLegendaries, 0);
  assert.equal(s.legendaryHeroes, 0);
});

test('summarizeAccount — missing legendary_details leaves legendary counts null', () => {
  const s = summarizeAccount({});
  assert.equal(s.equippedLegendaries, null);
  assert.equal(s.legendaryHeroes, null);
});

test('summarizeAccount — full-shape example returns the expected digest', () => {
  const details = {
    stats: { multiplayer_points: 50_000 },
    heroes: [
      { hero_id: 1, owned: '1' },
      { hero_id: 2, owned: '1' },
      { hero_id: 3, owned: '0' },
    ],
    legendary_details: {
      legendary_items: {
        '1': { '1': {}, '2': {} },
        '2': { '3': {} },
      },
    },
  };
  assert.deepEqual(summarizeAccount(details), {
    scales: 50_000,
    ownedHeroes: 2,
    equippedLegendaries: 3,
    legendaryHeroes: 2,
  });
});
