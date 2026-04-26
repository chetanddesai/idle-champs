/**
 * test/userBalances.test.js — covers `deriveUserBalances` in
 * `js/lib/userBalances.js`. The key regression guard is that the helper reads
 * `entry.currency_id` (not `entry.id`), matching the live play-server payload
 * as observed on 2026-04-25. Previously we read `entry.id`, which is
 * undefined on the wire, so every favor row rendered as Balance=0.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { deriveUserBalances } from '../js/lib/userBalances.js';

test('deriveUserBalances — null / undefined returns safe defaults', () => {
  const a = deriveUserBalances(null);
  assert.equal(a.scales, 0);
  assert.ok(a.favorById instanceof Map);
  assert.equal(a.favorById.size, 0);

  const b = deriveUserBalances(undefined);
  assert.equal(b.scales, 0);
  assert.equal(b.favorById.size, 0);
});

test('deriveUserBalances — reads scales from details.stats.multiplayer_points', () => {
  const { scales } = deriveUserBalances({
    stats: { multiplayer_points: 126995 },
    reset_currencies: [],
  });
  assert.equal(scales, 126995);
});

test('deriveUserBalances — coerces numeric scales strings (defensive)', () => {
  const { scales } = deriveUserBalances({
    stats: { multiplayer_points: '42' },
  });
  assert.equal(scales, 42);
});

test('deriveUserBalances — non-numeric scales falls back to 0', () => {
  const { scales } = deriveUserBalances({
    stats: { multiplayer_points: 'not-a-number' },
  });
  assert.equal(scales, 0);
});

test('deriveUserBalances — uses entry.currency_id (live API shape)', () => {
  // Regression: the live play server returns `currency_id`, not `id`.
  // Previously we read `entry.id` and silently dropped every row.
  const { favorById } = deriveUserBalances({
    reset_currencies: [
      { currency_id: 1, current_amount: '1.8413299067526E+53' },
      { currency_id: 15, current_amount: '4.2E+20' },
      { currency_id: 23, current_amount: 0 },
    ],
  });
  assert.equal(favorById.size, 3);
  assert.equal(favorById.get(1), 1.8413299067526e+53);
  assert.equal(favorById.get(15), 4.2e+20);
  assert.equal(favorById.get(23), 0);
});

test('deriveUserBalances — accepts legacy entry.id as fallback', () => {
  // Defensive: older snapshots / mocks may still use `id`. Keep working.
  const { favorById } = deriveUserBalances({
    reset_currencies: [{ id: 7, current_amount: 100 }],
  });
  assert.equal(favorById.get(7), 100);
});

test('deriveUserBalances — prefers currency_id when both are present', () => {
  const { favorById } = deriveUserBalances({
    reset_currencies: [{ currency_id: 9, id: 99, current_amount: 5 }],
  });
  assert.equal(favorById.get(9), 5);
  assert.equal(favorById.has(99), false);
});

test('deriveUserBalances — current_amount as scientific-notation string parses correctly', () => {
  // Guard against a future refactor that skips Number() coercion.
  const { favorById } = deriveUserBalances({
    reset_currencies: [
      { currency_id: 1, current_amount: '1e+3' },
      { currency_id: 2, current_amount: '2.5E+10' },
    ],
  });
  assert.equal(favorById.get(1), 1000);
  assert.equal(favorById.get(2), 2.5e+10);
});

test('deriveUserBalances — skips entries with missing or non-numeric currency id', () => {
  const { favorById } = deriveUserBalances({
    reset_currencies: [
      { current_amount: 100 },
      { currency_id: 'abc', current_amount: 100 },
      null,
      undefined,
      { currency_id: 5, current_amount: 50 },
    ],
  });
  assert.equal(favorById.size, 1);
  assert.equal(favorById.get(5), 50);
});

test('deriveUserBalances — missing current_amount defaults to 0', () => {
  const { favorById } = deriveUserBalances({
    reset_currencies: [{ currency_id: 1 }],
  });
  assert.equal(favorById.get(1), 0);
});

test('deriveUserBalances — non-array reset_currencies yields empty map', () => {
  const { favorById } = deriveUserBalances({
    reset_currencies: { 1: 100 },
  });
  assert.equal(favorById.size, 0);
});
