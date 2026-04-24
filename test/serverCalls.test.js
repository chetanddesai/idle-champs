/**
 * Unit tests for js/serverCalls.js.
 *
 * Covers the request() helper's retry + error semantics and the named
 * public functions' parameter shapes. `fetch` is never called for real —
 * every test injects a canned response sequence via `makeFetchStub`.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ApiError,
  MASTER_SERVER,
  request,
  getPlayServerForDefinitions,
  getUserDetails,
  upgradeLegendaryItem,
  craftLegendaryItem,
  changeLegendaryItem,
} from '../js/serverCalls.js';

import {
  makeFetchStub,
  CTX_BASE,
  CTX_MUT,
  DETAILS_FIXTURE,
  SWITCH_SERVER,
} from './fixtures/serverCalls.fixtures.js';

// ---------------------------------------------------------------------------
// request() — the core helper
// ---------------------------------------------------------------------------

test('request — happy path returns body + serverUrl', async () => {
  const { fetchFn, calls } = makeFetchStub([
    { body: { success: true, details: { instance_id: 42 } } },
  ]);
  const { body, serverUrl } = await request(
    'getuserdetails',
    CTX_BASE.playServer,
    { user_id: '1', hash: 'h' },
    { fetchFn }
  );
  assert.equal(body.success, true);
  assert.equal(serverUrl, CTX_BASE.playServer);
  assert.equal(calls.length, 1);
});

test('request — injects boilerplate query params', async () => {
  const { fetchFn, calls } = makeFetchStub([{ body: { success: true } }]);
  await request('getuserdetails', CTX_BASE.playServer, { user_id: '1', hash: 'h' }, { fetchFn });
  const url = new URL(calls[0]);
  // Endpoint path is always post.php on the play server
  assert.match(url.pathname, /post\.php$/);
  assert.equal(url.searchParams.get('call'), 'getuserdetails');
  assert.equal(url.searchParams.get('language_id'), '1');
  assert.equal(url.searchParams.get('mobile_client_version'), '99999');
  assert.equal(url.searchParams.get('user_id'), '1');
  assert.equal(url.searchParams.get('hash'), 'h');
});

test('request — switch_play_server retries once against the indicated shard', async () => {
  const { fetchFn, calls } = makeFetchStub([
    { body: { success: true, switch_play_server: SWITCH_SERVER } },
    { body: { success: true, details: DETAILS_FIXTURE } },
  ]);
  const { body, serverUrl } = await request(
    'getuserdetails',
    CTX_BASE.playServer,
    { user_id: '1', hash: 'h' },
    { fetchFn }
  );
  assert.equal(body.success, true);
  assert.ok(body.details);
  assert.equal(serverUrl, SWITCH_SERVER);
  assert.equal(calls.length, 2);
  assert.ok(calls[1].startsWith(SWITCH_SERVER));
});

test('request — switch_play_server retries EXACTLY once even if the retry also returns a switch', async () => {
  // After the first retry we're out of retries — a second switch arrives
  // and we return the body as-is rather than looping.
  const SECOND_SHARD = 'https://ps27.idlechampions.com/~idledragons/';
  const { fetchFn, calls } = makeFetchStub([
    { body: { success: true, switch_play_server: SWITCH_SERVER } },
    { body: { success: true, switch_play_server: SECOND_SHARD, details: DETAILS_FIXTURE } },
  ]);
  const { body, serverUrl } = await request(
    'getuserdetails',
    CTX_BASE.playServer,
    { user_id: '1', hash: 'h' },
    { fetchFn }
  );
  assert.equal(calls.length, 2);
  // serverUrl reflects the body's switch_play_server when present on the
  // final (non-retried) response.
  assert.equal(serverUrl, SECOND_SHARD);
  assert.ok(body.details);
});

test('request — fetch rejection surfaces as ApiError kind:network', async () => {
  const { fetchFn } = makeFetchStub([{ throws: new TypeError('NetworkError') }]);
  await assert.rejects(
    () => request('getuserdetails', CTX_BASE.playServer, {}, { fetchFn }),
    (err) => {
      assert.ok(err instanceof ApiError);
      assert.equal(err.kind, 'network');
      assert.match(err.message, /NetworkError/);
      return true;
    }
  );
});

test('request — non-2xx response surfaces as ApiError kind:http with status', async () => {
  const { fetchFn } = makeFetchStub([{ status: 502 }]);
  await assert.rejects(
    () => request('getuserdetails', CTX_BASE.playServer, {}, { fetchFn }),
    (err) => {
      assert.ok(err instanceof ApiError);
      assert.equal(err.kind, 'http');
      assert.equal(err.status, 502);
      return true;
    }
  );
});

test('request — malformed JSON surfaces as ApiError kind:api', async () => {
  const { fetchFn } = makeFetchStub([{ status: 200, badJson: true }]);
  await assert.rejects(
    () => request('getuserdetails', CTX_BASE.playServer, {}, { fetchFn }),
    (err) => {
      assert.ok(err instanceof ApiError);
      assert.equal(err.kind, 'api');
      assert.match(err.message, /not valid JSON/);
      return true;
    }
  );
});

test('request — failure_reason surfaces as ApiError kind:api with server message', async () => {
  const { fetchFn } = makeFetchStub([
    { body: { success: false, failure_reason: 'Security hash failure' } },
  ]);
  await assert.rejects(
    () => request('getuserdetails', CTX_BASE.playServer, {}, { fetchFn }),
    (err) => {
      assert.equal(err.kind, 'api');
      assert.equal(err.message, 'Security hash failure');
      assert.equal(err.raw.success, false);
      return true;
    }
  );
});

test('request — success=false without failure_reason still throws kind:api', async () => {
  const { fetchFn } = makeFetchStub([{ body: { success: false } }]);
  await assert.rejects(
    () => request('getuserdetails', CTX_BASE.playServer, {}, { fetchFn }),
    (err) => {
      assert.equal(err.kind, 'api');
      assert.match(err.message, /success=false/);
      return true;
    }
  );
});

test('request — non-function fetchFn throws kind:network', async () => {
  // Passing null lets the module fall back to globalThis.fetch (Node 18+);
  // passing a non-function-but-truthy value exercises the explicit guard.
  await assert.rejects(
    () => request('getuserdetails', CTX_BASE.playServer, {}, { fetchFn: 'nope' }),
    (err) => {
      assert.equal(err.kind, 'network');
      assert.match(err.message, /No fetch implementation/);
      return true;
    }
  );
});

// ---------------------------------------------------------------------------
// getPlayServerForDefinitions
// ---------------------------------------------------------------------------

test('getPlayServerForDefinitions — hits the master server and returns play_server', async () => {
  const { fetchFn, calls } = makeFetchStub([
    { body: { success: true, play_server: CTX_BASE.playServer } },
  ]);
  const { playServer } = await getPlayServerForDefinitions({ fetchFn });
  assert.equal(playServer, CTX_BASE.playServer);
  assert.ok(calls[0].startsWith(MASTER_SERVER));
});

test('getPlayServerForDefinitions — missing play_server field throws kind:api', async () => {
  const { fetchFn } = makeFetchStub([{ body: { success: true } }]);
  await assert.rejects(
    () => getPlayServerForDefinitions({ fetchFn }),
    (err) => {
      assert.equal(err.kind, 'api');
      assert.match(err.message, /no play_server URL/);
      return true;
    }
  );
});

// ---------------------------------------------------------------------------
// getUserDetails
// ---------------------------------------------------------------------------

test('getUserDetails — forwards credentials and returns details', async () => {
  const { fetchFn, calls } = makeFetchStub([
    { body: { success: true, details: DETAILS_FIXTURE } },
  ]);
  const { details, serverUrl } = await getUserDetails({ ...CTX_BASE, fetchFn });
  const url = new URL(calls[0]);
  assert.equal(url.searchParams.get('call'), 'getuserdetails');
  assert.equal(url.searchParams.get('user_id'), CTX_BASE.userId);
  assert.equal(url.searchParams.get('hash'), CTX_BASE.hash);
  assert.equal(url.searchParams.get('instance_id'), CTX_BASE.instanceId);
  assert.equal(details.instance_id, 1700000000);
  assert.equal(serverUrl, CTX_BASE.playServer);
});

test('getUserDetails — omits instance_id on the first call of a session', async () => {
  const { fetchFn, calls } = makeFetchStub([
    { body: { success: true, details: DETAILS_FIXTURE } },
  ]);
  await getUserDetails({ ...CTX_BASE, instanceId: null, fetchFn });
  const url = new URL(calls[0]);
  assert.equal(url.searchParams.has('instance_id'), false);
});

test('getUserDetails — missing playServer / creds throws kind:api synchronously', async () => {
  await assert.rejects(
    () => getUserDetails({ userId: '1', hash: 'h' }),
    (err) => {
      assert.equal(err.kind, 'api');
      assert.match(err.message, /playServer required/);
      return true;
    }
  );
  await assert.rejects(
    () => getUserDetails({ playServer: CTX_BASE.playServer }),
    (err) => {
      assert.match(err.message, /userId and hash required/);
      return true;
    }
  );
});

test('getUserDetails — missing details object throws kind:api', async () => {
  const { fetchFn } = makeFetchStub([{ body: { success: true } }]);
  await assert.rejects(
    () => getUserDetails({ ...CTX_BASE, fetchFn }),
    (err) => {
      assert.equal(err.kind, 'api');
      assert.match(err.message, /no details object/);
      return true;
    }
  );
});

test('getUserDetails — carries through switch_play_server retry', async () => {
  const { fetchFn, calls } = makeFetchStub([
    { body: { success: true, switch_play_server: SWITCH_SERVER } },
    { body: { success: true, details: DETAILS_FIXTURE } },
  ]);
  const { details, serverUrl } = await getUserDetails({ ...CTX_BASE, fetchFn });
  assert.equal(calls.length, 2);
  assert.equal(serverUrl, SWITCH_SERVER);
  assert.equal(details.instance_id, 1700000000);
});

// ---------------------------------------------------------------------------
// Mutations — upgrade / craft / change
//
// All three share the same parameter-validation path; test one happy path
// per fn and one validation failure per fn.
// ---------------------------------------------------------------------------

for (const [fnName, fn, expectedCall] of [
  ['upgradeLegendaryItem', upgradeLegendaryItem, 'upgradelegendaryitem'],
  ['craftLegendaryItem', craftLegendaryItem, 'craftlegendaryitem'],
  ['changeLegendaryItem', changeLegendaryItem, 'changelegendaryitem'],
]) {
  test(`${fnName} — forwards hero/slot + creds`, async () => {
    const { fetchFn, calls } = makeFetchStub([{ body: { success: true, actions: [] } }]);
    const { body } = await fn({ ...CTX_MUT, fetchFn });
    assert.equal(body.success, true);
    const url = new URL(calls[0]);
    assert.equal(url.searchParams.get('call'), expectedCall);
    assert.equal(url.searchParams.get('hero_id'), String(CTX_MUT.heroId));
    assert.equal(url.searchParams.get('slot_id'), String(CTX_MUT.slotId));
    assert.equal(url.searchParams.get('instance_id'), CTX_MUT.instanceId);
  });

  test(`${fnName} — missing heroId / slotId throws kind:api`, async () => {
    await assert.rejects(
      () => fn({ ...CTX_MUT, heroId: undefined }),
      (err) => {
        assert.equal(err.kind, 'api');
        assert.match(err.message, /heroId required/);
        return true;
      }
    );
    await assert.rejects(
      () => fn({ ...CTX_MUT, slotId: undefined }),
      (err) => {
        assert.match(err.message, /slotId required/);
        return true;
      }
    );
  });

  test(`${fnName} — server failure_reason surfaces through`, async () => {
    const { fetchFn } = makeFetchStub([
      { body: { success: false, failure_reason: 'Insufficient favor' } },
    ]);
    await assert.rejects(
      () => fn({ ...CTX_MUT, fetchFn }),
      (err) => {
        assert.equal(err.kind, 'api');
        assert.equal(err.message, 'Insufficient favor');
        return true;
      }
    );
  });
}
