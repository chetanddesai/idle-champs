/**
 * Unit tests for js/credentials.js — pure parsing + validation helpers.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseSupportUrl,
  isValidCredentials,
  normalizeCredentials,
} from '../js/credentials.js';

// Shape-valid placeholder credentials. These are NOT real — `user_id` is
// 7 fake digits, `hash` is a 32-char hex placeholder. Never replace these
// with real values: the file is committed.
const VALID_HASH = '0123456789abcdef0123456789abcdef';
const VALID_USER = '1234567';
const VALID_URL = `https://support.idlechampions.com/hc/en-us/requests/new?user_id=${VALID_USER}&device_hash=${VALID_HASH}`;

// ---------------------------------------------------------------------------
// parseSupportUrl
// ---------------------------------------------------------------------------

test('parseSupportUrl — extracts userId + hash from a real support URL', () => {
  assert.deepEqual(parseSupportUrl(VALID_URL), {
    userId: VALID_USER,
    hash: VALID_HASH,
  });
});

test('parseSupportUrl — accepts ?hash= in addition to ?device_hash=', () => {
  const url = `https://support.idlechampions.com/?user_id=${VALID_USER}&hash=${VALID_HASH}`;
  assert.deepEqual(parseSupportUrl(url), {
    userId: VALID_USER,
    hash: VALID_HASH,
  });
});

test('parseSupportUrl — device_hash wins over hash when both present', () => {
  const url = `https://support.idlechampions.com/?user_id=${VALID_USER}&hash=WRONG&device_hash=${VALID_HASH}`;
  assert.deepEqual(parseSupportUrl(url), {
    userId: VALID_USER,
    hash: VALID_HASH,
  });
});

test('parseSupportUrl — trims surrounding whitespace from the paste', () => {
  assert.deepEqual(parseSupportUrl(`   ${VALID_URL}   \n`), {
    userId: VALID_USER,
    hash: VALID_HASH,
  });
});

test('parseSupportUrl — missing user_id → null', () => {
  const url = `https://support.idlechampions.com/?device_hash=${VALID_HASH}`;
  assert.equal(parseSupportUrl(url), null);
});

test('parseSupportUrl — missing hash params → null', () => {
  const url = `https://support.idlechampions.com/?user_id=${VALID_USER}`;
  assert.equal(parseSupportUrl(url), null);
});

test('parseSupportUrl — malformed URL → null (does not throw)', () => {
  assert.equal(parseSupportUrl('not a url'), null);
  assert.equal(parseSupportUrl('http://'), null);
  assert.equal(parseSupportUrl(''), null);
  assert.equal(parseSupportUrl('   '), null);
});

test('parseSupportUrl — non-string inputs → null', () => {
  assert.equal(parseSupportUrl(null), null);
  assert.equal(parseSupportUrl(undefined), null);
  assert.equal(parseSupportUrl(123), null);
  assert.equal(parseSupportUrl({}), null);
});

// ---------------------------------------------------------------------------
// isValidCredentials
// ---------------------------------------------------------------------------

test('isValidCredentials — accepts real account credentials', () => {
  assert.equal(isValidCredentials({ userId: VALID_USER, hash: VALID_HASH }), true);
});

test('isValidCredentials — rejects non-numeric userId', () => {
  assert.equal(isValidCredentials({ userId: 'abc', hash: VALID_HASH }), false);
  assert.equal(isValidCredentials({ userId: '12a34', hash: VALID_HASH }), false);
});

test('isValidCredentials — rejects short hash', () => {
  assert.equal(isValidCredentials({ userId: VALID_USER, hash: 'tooshort' }), false);
  // 15 chars — still below the 16-char minimum.
  assert.equal(
    isValidCredentials({ userId: VALID_USER, hash: '1234567890abcde' }),
    false
  );
});

test('isValidCredentials — rejects empty strings / whitespace', () => {
  assert.equal(isValidCredentials({ userId: '', hash: VALID_HASH }), false);
  assert.equal(isValidCredentials({ userId: VALID_USER, hash: '   ' }), false);
});

test('isValidCredentials — rejects non-string types', () => {
  assert.equal(isValidCredentials({ userId: 1234567, hash: VALID_HASH }), false);
  assert.equal(isValidCredentials({ userId: VALID_USER, hash: null }), false);
});

test('isValidCredentials — rejects non-object inputs', () => {
  assert.equal(isValidCredentials(null), false);
  assert.equal(isValidCredentials(undefined), false);
  assert.equal(isValidCredentials('string'), false);
});

test('isValidCredentials — rejects hash with special characters', () => {
  assert.equal(
    isValidCredentials({ userId: VALID_USER, hash: 'abcd-efgh-ijkl-mnop-qrst' }),
    false
  );
});

// ---------------------------------------------------------------------------
// normalizeCredentials
// ---------------------------------------------------------------------------

test('normalizeCredentials — canonical shape passes through, trimmed', () => {
  assert.deepEqual(
    normalizeCredentials({ userId: `  ${VALID_USER}  `, hash: `  ${VALID_HASH}  ` }),
    { userId: VALID_USER, hash: VALID_HASH }
  );
});

test('normalizeCredentials — support-URL form rekeyed to canonical', () => {
  assert.deepEqual(
    normalizeCredentials({ user_id: VALID_USER, device_hash: VALID_HASH }),
    { userId: VALID_USER, hash: VALID_HASH }
  );
});

test('normalizeCredentials — legacy manual form rekeyed', () => {
  assert.deepEqual(
    normalizeCredentials({ user_id: VALID_USER, hash: VALID_HASH }),
    { userId: VALID_USER, hash: VALID_HASH }
  );
});

test('normalizeCredentials — numeric userId coerced to string', () => {
  assert.deepEqual(
    normalizeCredentials({ userId: 1234567, hash: VALID_HASH }),
    { userId: '1234567', hash: VALID_HASH }
  );
});

test('normalizeCredentials — missing fields → null', () => {
  assert.equal(normalizeCredentials({ userId: VALID_USER }), null);
  assert.equal(normalizeCredentials({ hash: VALID_HASH }), null);
  assert.equal(normalizeCredentials({}), null);
});

test('normalizeCredentials — non-object inputs → null', () => {
  assert.equal(normalizeCredentials(null), null);
  assert.equal(normalizeCredentials(undefined), null);
  assert.equal(normalizeCredentials('nope'), null);
});
