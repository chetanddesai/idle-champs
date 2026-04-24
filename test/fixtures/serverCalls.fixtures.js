/**
 * Frozen fixtures + a tiny `makeFetchStub` helper for js/serverCalls.js tests.
 *
 * The stub lets each test describe a canned response sequence; the returned
 * fn is drop-in compatible with `fetch(url)` and records every call URL so
 * tests can assert on query-string shape without parsing URLs in the suite.
 */

/**
 * @typedef {object} StubResponseSpec
 * @property {number}  [status]   — HTTP status (default 200)
 * @property {boolean} [ok]       — defaults to status in [200, 300)
 * @property {object}  [body]     — JSON body to return from .json()
 * @property {Error}   [throws]   — if set, fetchFn rejects with this error
 * @property {boolean} [badJson]  — if true, .json() rejects
 */

/**
 * @param {StubResponseSpec[]} specs  — one per expected call, in order
 * @returns {{ fetchFn: Function, calls: string[] }}
 */
export function makeFetchStub(specs) {
  const queue = [...specs];
  const calls = [];

  const fetchFn = async (url) => {
    calls.push(url);
    const spec = queue.shift();
    if (!spec) {
      throw new Error(
        `fetchFn called ${calls.length} time(s) but only ${specs.length} response(s) were queued`
      );
    }
    if (spec.throws) throw spec.throws;

    const status = spec.status ?? 200;
    return {
      ok: spec.ok ?? (status >= 200 && status < 300),
      status,
      async json() {
        if (spec.badJson) throw new Error('not valid JSON');
        return spec.body ?? {};
      },
    };
  };

  return { fetchFn, calls };
}

// Shape-valid placeholder credentials. NOT real — never replace with real values.
export const CTX_BASE = Object.freeze({
  playServer: 'https://ps29.idlechampions.com/~idledragons/',
  userId: '1234567',
  hash: 'DEADBEEFDEADBEEFDEADBEEF12345678',
  instanceId: '1700000000',
});

export const CTX_MUT = Object.freeze({
  ...CTX_BASE,
  heroId: 11,
  slotId: 3,
});

export const DETAILS_FIXTURE = Object.freeze({
  instance_id: 1700000000,
  heroes: [],
  loot: {},
  legendary_details: { legendary_items: {}, cost: 1000, next_cost: 0 },
  stats: { multiplayer_points: 126995 },
  reset_currencies: [],
});

export const SWITCH_SERVER = 'https://ps28.idlechampions.com/~idledragons/';
