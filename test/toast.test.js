/**
 * test/toast.test.js — unit tests for the pure part of `js/lib/toast.js`.
 *
 * `showToast` and `showError` touch the DOM and are exercised in-browser;
 * they're not covered here. `describeError` is pure and gets full coverage.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { describeError } from '../js/lib/toast.js';
import { ApiError } from '../js/serverCalls.js';

test('describeError — ApiError network kind includes the underlying message', () => {
  const err = new ApiError({ kind: 'network', message: 'offline', raw: null });
  assert.equal(describeError(err), 'Network error: offline');
});

test('describeError — ApiError network kind falls back when message is empty', () => {
  const err = new ApiError({ kind: 'network', message: '', raw: null });
  assert.equal(describeError(err), 'Network error: request failed');
});

test('describeError — ApiError http kind reports status, not raw message', () => {
  const err = new ApiError({
    kind: 'http',
    status: 500,
    message: 'getuserdetails → HTTP 500',
    raw: null,
  });
  assert.equal(describeError(err), 'Server error (HTTP 500)');
});

test('describeError — ApiError http with no status labels it "unknown"', () => {
  const err = new ApiError({ kind: 'http', message: 'x', raw: null });
  assert.equal(describeError(err), 'Server error (HTTP unknown)');
});

test('describeError — ApiError api kind surfaces the server\'s failure_reason', () => {
  const err = new ApiError({
    kind: 'api',
    message: 'Security hash failure',
    raw: null,
  });
  assert.equal(describeError(err), 'Security hash failure');
});

test('describeError — ApiError api with empty message falls back to generic', () => {
  const err = new ApiError({ kind: 'api', message: '', raw: null });
  assert.equal(describeError(err), 'API error');
});

test('describeError — unknown ApiError kind falls through to api default', () => {
  const err = new ApiError({ kind: 'weird', message: 'hmm', raw: null });
  assert.equal(describeError(err), 'hmm');
});

test('describeError — plain Error returns its message', () => {
  assert.equal(describeError(new Error('boom')), 'boom');
});

test('describeError — plain object with a .message string uses the message', () => {
  assert.equal(describeError({ message: 'shape-like' }), 'shape-like');
});

test('describeError — null / undefined / non-object return a generic string', () => {
  assert.equal(describeError(null), 'Unexpected error');
  assert.equal(describeError(undefined), 'Unexpected error');
  assert.equal(describeError('just a string'), 'Unexpected error');
  assert.equal(describeError(42), 'Unexpected error');
});

test('describeError — object with non-string message falls through to generic', () => {
  assert.equal(describeError({ message: 42 }), 'Unexpected error');
  assert.equal(describeError({ message: '' }), 'Unexpected error');
});
