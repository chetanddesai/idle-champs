/**
 * Tiny in-memory Storage polyfill + shared fixtures for state.js tests.
 *
 * Matches the web Storage API well enough that state.js can't tell the
 * difference: supports getItem, setItem, removeItem, key(index), length.
 */

export function makeMemoryStorage(seed = {}) {
  const data = new Map(Object.entries(seed));
  return {
    get length() {
      return data.size;
    },
    key(index) {
      return [...data.keys()][index] ?? null;
    },
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(key, String(value));
    },
    removeItem(key) {
      data.delete(key);
    },
    clear() {
      data.clear();
    },
    // Test-only peek for assertions
    _dump() {
      return Object.fromEntries(data);
    },
  };
}

// Shape-valid placeholder credentials. NOT real — never replace with real values.
export const CREDS_FIXTURE = Object.freeze({
  userId: '1234567',
  hash: '0123456789abcdef0123456789abcdef',
});

export const DETAILS_FIXTURE = Object.freeze({
  instance_id: 1700000000,
  heroes: [{ id: 1, name: 'Bruenor', owned: true }],
  loot: {},
  legendary_details: {
    legendary_items: {},
    cost: 1000,
    next_cost: 0,
  },
  stats: { multiplayer_points: 126995 },
  reset_currencies: [{ id: 3, current_amount: 1e30, total_earned: 1e30 }],
});

export const PLAY_SERVER = 'https://ps29.idlechampions.com/~idledragons/';
export const SWITCH_SERVER = 'https://ps28.idlechampions.com/~idledragons/';
