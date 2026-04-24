/**
 * Unit tests for js/state.js.
 *
 * Uses an in-memory Storage polyfill (test/fixtures/state.fixtures.js) so
 * we can assert on exact key names and values without touching the real
 * browser localStorage. refreshAccount is tested with stubbed serverCalls
 * deps — no network.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import * as state from '../js/state.js';
import { KEYS } from '../js/state.js';

import {
  makeMemoryStorage,
  CREDS_FIXTURE,
  DETAILS_FIXTURE,
  PLAY_SERVER,
  SWITCH_SERVER,
} from './fixtures/state.fixtures.js';

// ---------------------------------------------------------------------------
// init + ensureInit
// ---------------------------------------------------------------------------

test('get() before init throws a clear error', () => {
  state.init(null); // clears subs; reset storage to null via the null-check
  // init(null) leaves `storage = null`, so the next get should throw.
  assert.throws(() => state.get('anything'), /used before init/);
});

// ---------------------------------------------------------------------------
// get / set round-trip
// ---------------------------------------------------------------------------

test('set + get round-trip preserves plain objects', () => {
  const storage = makeMemoryStorage();
  state.init(storage);
  state.set(KEYS.CREDENTIALS, CREDS_FIXTURE);
  assert.deepEqual(state.get(KEYS.CREDENTIALS), CREDS_FIXTURE);
});

test('set() uses the ic. prefix in the underlying storage', () => {
  const storage = makeMemoryStorage();
  state.init(storage);
  state.set(KEYS.PLAY_SERVER, PLAY_SERVER);
  // Raw key should be "ic.play_server", raw value JSON-encoded
  assert.equal(storage.getItem('ic.play_server'), JSON.stringify(PLAY_SERVER));
  assert.equal(storage.getItem('play_server'), null);
});

test('set(null) or set(undefined) removes the key', () => {
  const storage = makeMemoryStorage();
  state.init(storage);
  state.set(KEYS.INSTANCE_ID, 123);
  assert.equal(state.get(KEYS.INSTANCE_ID), 123);
  state.set(KEYS.INSTANCE_ID, null);
  assert.equal(state.get(KEYS.INSTANCE_ID), null);
  assert.equal(storage.getItem('ic.instance_id'), null);

  state.set(KEYS.INSTANCE_ID, 456);
  state.set(KEYS.INSTANCE_ID, undefined);
  assert.equal(storage.getItem('ic.instance_id'), null);
});

test('get() returns null for missing keys', () => {
  const storage = makeMemoryStorage();
  state.init(storage);
  assert.equal(state.get(KEYS.CREDENTIALS), null);
});

test('get() returns null (not throws) for corrupted JSON', () => {
  const storage = makeMemoryStorage({ 'ic.credentials': 'not-valid-json{{{' });
  state.init(storage);
  assert.equal(state.get(KEYS.CREDENTIALS), null);
});

// ---------------------------------------------------------------------------
// subscribe / notify
// ---------------------------------------------------------------------------

test('subscribe fires on set with the new value', () => {
  const storage = makeMemoryStorage();
  state.init(storage);
  const calls = [];
  state.subscribe(KEYS.CREDENTIALS, (v) => calls.push(v));
  state.set(KEYS.CREDENTIALS, CREDS_FIXTURE);
  state.set(KEYS.CREDENTIALS, null);
  assert.deepEqual(calls, [CREDS_FIXTURE, null]);
});

test('subscribe is key-scoped — other keys do not fire this subscriber', () => {
  const storage = makeMemoryStorage();
  state.init(storage);
  const calls = [];
  state.subscribe(KEYS.CREDENTIALS, (v) => calls.push(v));
  state.set(KEYS.INSTANCE_ID, 123);
  state.set(KEYS.PLAY_SERVER, PLAY_SERVER);
  assert.deepEqual(calls, []);
});

test('returned unsubscribe function removes the callback', () => {
  const storage = makeMemoryStorage();
  state.init(storage);
  const calls = [];
  const off = state.subscribe(KEYS.CREDENTIALS, (v) => calls.push(v));
  state.set(KEYS.CREDENTIALS, CREDS_FIXTURE);
  off();
  state.set(KEYS.CREDENTIALS, null);
  assert.deepEqual(calls, [CREDS_FIXTURE]);
});

test('multiple subscribers on the same key all fire in insertion order', () => {
  const storage = makeMemoryStorage();
  state.init(storage);
  const calls = [];
  state.subscribe(KEYS.CREDENTIALS, (v) => calls.push(['a', v]));
  state.subscribe(KEYS.CREDENTIALS, (v) => calls.push(['b', v]));
  state.set(KEYS.CREDENTIALS, CREDS_FIXTURE);
  assert.deepEqual(calls, [
    ['a', CREDS_FIXTURE],
    ['b', CREDS_FIXTURE],
  ]);
});

test('a throwing subscriber does not block the other subscribers', (t) => {
  const storage = makeMemoryStorage();
  state.init(storage);
  const originalError = console.error;
  t.after(() => {
    console.error = originalError;
  });
  console.error = () => {}; // silence the expected per-subscriber log

  const calls = [];
  state.subscribe(KEYS.CREDENTIALS, () => {
    throw new Error('boom');
  });
  state.subscribe(KEYS.CREDENTIALS, (v) => calls.push(v));
  state.set(KEYS.CREDENTIALS, CREDS_FIXTURE);
  assert.deepEqual(calls, [CREDS_FIXTURE]);
});

test('subscribe requires a function callback', () => {
  const storage = makeMemoryStorage();
  state.init(storage);
  assert.throws(() => state.subscribe(KEYS.CREDENTIALS, null), TypeError);
});

// ---------------------------------------------------------------------------
// clearAll
// ---------------------------------------------------------------------------

test('clearAll removes every ic.* key and leaves other keys alone', () => {
  const storage = makeMemoryStorage({
    'ic.credentials': JSON.stringify(CREDS_FIXTURE),
    'ic.play_server': JSON.stringify(PLAY_SERVER),
    'unrelated.key': 'keep-me',
  });
  state.init(storage);
  state.clearAll();
  assert.equal(state.get(KEYS.CREDENTIALS), null);
  assert.equal(state.get(KEYS.PLAY_SERVER), null);
  assert.equal(storage.getItem('unrelated.key'), 'keep-me');
});

test('clearAll fires every subscribed key with null', () => {
  const storage = makeMemoryStorage({
    'ic.credentials': JSON.stringify(CREDS_FIXTURE),
  });
  state.init(storage);
  const calls = [];
  state.subscribe(KEYS.CREDENTIALS, (v) => calls.push(['c', v]));
  state.subscribe(KEYS.PLAY_SERVER, (v) => calls.push(['p', v]));
  state.clearAll();
  // Both subscribers fire with null; order is insertion order of the
  // subscribers Map, which we don't hard-pin beyond "both fired".
  assert.equal(calls.length, 2);
  assert.ok(calls.every(([, v]) => v === null));
  assert.ok(calls.some(([k]) => k === 'c'));
  assert.ok(calls.some(([k]) => k === 'p'));
});

// ---------------------------------------------------------------------------
// refreshAccount
// ---------------------------------------------------------------------------

test('refreshAccount — happy path writes userdetails, instance_id, last_refresh_at', async () => {
  const storage = makeMemoryStorage();
  state.init(storage);
  state.set(KEYS.CREDENTIALS, CREDS_FIXTURE);

  const calls = [];
  const deps = {
    getPlayServerForDefinitions: async () => {
      calls.push(['disc']);
      return { playServer: PLAY_SERVER };
    },
    getUserDetails: async (ctx) => {
      calls.push(['ud', ctx]);
      return { details: DETAILS_FIXTURE, serverUrl: PLAY_SERVER };
    },
    now: () => 1717000000000,
  };

  const result = await state.refreshAccount(deps);

  assert.deepEqual(result, DETAILS_FIXTURE);
  assert.equal(state.get(KEYS.PLAY_SERVER), PLAY_SERVER);
  assert.deepEqual(state.get(KEYS.USER_DETAILS), DETAILS_FIXTURE);
  assert.equal(state.get(KEYS.INSTANCE_ID), 1700000000);
  assert.equal(state.get(KEYS.LAST_REFRESH_AT), 1717000000000);
  // Discovery runs on first refresh; subsequent refreshes skip it (next test).
  assert.equal(calls.length, 2);
});

test('refreshAccount — reuses cached play_server on subsequent refreshes', async () => {
  const storage = makeMemoryStorage();
  state.init(storage);
  state.set(KEYS.CREDENTIALS, CREDS_FIXTURE);
  state.set(KEYS.PLAY_SERVER, PLAY_SERVER);

  let discovered = false;
  const deps = {
    getPlayServerForDefinitions: async () => {
      discovered = true;
      return { playServer: 'https://unexpected.example.com/' };
    },
    getUserDetails: async (ctx) => {
      assert.equal(ctx.playServer, PLAY_SERVER);
      return { details: DETAILS_FIXTURE, serverUrl: PLAY_SERVER };
    },
    now: () => 1,
  };

  await state.refreshAccount(deps);
  assert.equal(discovered, false);
  assert.equal(state.get(KEYS.PLAY_SERVER), PLAY_SERVER);
});

test('refreshAccount — switch_play_server-rewritten serverUrl is persisted', async () => {
  const storage = makeMemoryStorage();
  state.init(storage);
  state.set(KEYS.CREDENTIALS, CREDS_FIXTURE);
  state.set(KEYS.PLAY_SERVER, PLAY_SERVER);

  const deps = {
    getPlayServerForDefinitions: async () => ({ playServer: PLAY_SERVER }),
    getUserDetails: async () => ({ details: DETAILS_FIXTURE, serverUrl: SWITCH_SERVER }),
    now: () => 1,
  };

  await state.refreshAccount(deps);
  assert.equal(state.get(KEYS.PLAY_SERVER), SWITCH_SERVER);
});

test('refreshAccount — forwards cached instance_id on subsequent calls', async () => {
  const storage = makeMemoryStorage();
  state.init(storage);
  state.set(KEYS.CREDENTIALS, CREDS_FIXTURE);
  state.set(KEYS.PLAY_SERVER, PLAY_SERVER);
  state.set(KEYS.INSTANCE_ID, 999);

  const deps = {
    getPlayServerForDefinitions: async () => ({ playServer: PLAY_SERVER }),
    getUserDetails: async (ctx) => {
      assert.equal(ctx.instanceId, 999);
      return { details: DETAILS_FIXTURE, serverUrl: PLAY_SERVER };
    },
    now: () => 1,
  };

  await state.refreshAccount(deps);
});

test('refreshAccount — throws when credentials are missing', async () => {
  const storage = makeMemoryStorage();
  state.init(storage);
  await assert.rejects(
    () =>
      state.refreshAccount({
        getPlayServerForDefinitions: async () => ({ playServer: PLAY_SERVER }),
        getUserDetails: async () => ({ details: DETAILS_FIXTURE, serverUrl: PLAY_SERVER }),
      }),
    /no credentials/
  );
});

test('refreshAccount — throws when deps are missing', async () => {
  const storage = makeMemoryStorage();
  state.init(storage);
  state.set(KEYS.CREDENTIALS, CREDS_FIXTURE);
  await assert.rejects(() => state.refreshAccount({}), /getPlayServerForDefinitions dep required/);
  await assert.rejects(
    () =>
      state.refreshAccount({
        getPlayServerForDefinitions: async () => ({ playServer: PLAY_SERVER }),
      }),
    /getUserDetails dep required/
  );
});

test('refreshAccount — surface underlying errors from getUserDetails', async () => {
  const storage = makeMemoryStorage();
  state.init(storage);
  state.set(KEYS.CREDENTIALS, CREDS_FIXTURE);
  state.set(KEYS.PLAY_SERVER, PLAY_SERVER);

  const deps = {
    getPlayServerForDefinitions: async () => ({ playServer: PLAY_SERVER }),
    getUserDetails: async () => {
      throw new Error('Security hash failure');
    },
  };

  await assert.rejects(() => state.refreshAccount(deps), /Security hash failure/);
  // Error path must NOT write last_refresh_at — a failed refresh is not a
  // successful refresh.
  assert.equal(state.get(KEYS.LAST_REFRESH_AT), null);
});

test('refreshAccount — subscribers fire for each key written', async () => {
  const storage = makeMemoryStorage();
  state.init(storage);
  state.set(KEYS.CREDENTIALS, CREDS_FIXTURE);

  const fires = [];
  state.subscribe(KEYS.USER_DETAILS, (v) => fires.push(['ud', v]));
  state.subscribe(KEYS.LAST_REFRESH_AT, (v) => fires.push(['ts', v]));

  const deps = {
    getPlayServerForDefinitions: async () => ({ playServer: PLAY_SERVER }),
    getUserDetails: async () => ({ details: DETAILS_FIXTURE, serverUrl: PLAY_SERVER }),
    now: () => 42,
  };

  await state.refreshAccount(deps);

  assert.deepEqual(
    fires.filter(([k]) => k === 'ud'),
    [['ud', DETAILS_FIXTURE]]
  );
  assert.deepEqual(
    fires.filter(([k]) => k === 'ts'),
    [['ts', 42]]
  );
});
