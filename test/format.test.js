/**
 * Unit tests for js/lib/format.js.
 *
 * Run with: `npm test` (auto-discovers test/*.test.js via node:test).
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  formatInteger,
  formatCompact,
  formatFavor,
  formatTimeAgo,
  formatDuration,
  formatPhase,
} from '../js/lib/format.js';

import {
  INTEGER_CASES,
  COMPACT_CASES,
  FAVOR_CASES,
  TIMEAGO_CASES,
  DURATION_CASES,
  PHASE_CASES,
  NOW,
} from './fixtures/format.fixtures.js';

test('formatInteger', async (t) => {
  for (const c of INTEGER_CASES) {
    await t.test(c.name, () => {
      assert.equal(formatInteger(c.input), c.expected);
    });
  }
});

test('formatCompact', async (t) => {
  for (const c of COMPACT_CASES) {
    await t.test(c.name, () => {
      assert.equal(formatCompact(c.input), c.expected);
    });
  }
});

test('formatFavor', async (t) => {
  for (const c of FAVOR_CASES) {
    await t.test(c.name, () => {
      assert.equal(formatFavor(c.input), c.expected);
    });
  }
});

test('formatTimeAgo', async (t) => {
  for (const c of TIMEAGO_CASES) {
    await t.test(c.name, () => {
      assert.equal(formatTimeAgo(c.input, NOW), c.expected);
    });
  }

  await t.test('defaults to Date.now() when called without a reference', () => {
    // Sanity check: with no `now` arg, any timestamp within the last minute
    // returns "just now". We can't hard-code the output without mocking the
    // clock, so we verify the bucket instead.
    const recent = Date.now() - 10_000;
    assert.equal(formatTimeAgo(recent), 'just now');
  });

  await t.test('invalid now argument falls back to placeholder', () => {
    assert.equal(formatTimeAgo(NOW, Number.NaN), '—');
  });
});

test('formatDuration', async (t) => {
  for (const c of DURATION_CASES) {
    await t.test(c.name, () => {
      assert.equal(formatDuration(c.input), c.expected);
    });
  }
});

test('formatPhase', async (t) => {
  for (const c of PHASE_CASES) {
    await t.test(c.name, () => {
      assert.equal(formatPhase(c.x, c.y), c.expected);
    });
  }
});
