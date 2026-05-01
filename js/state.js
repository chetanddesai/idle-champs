/**
 * state.js — the single source of truth for application state.
 *
 * Contract (FR-2, FR-4, tech-design Appendix B #2 and #8):
 *
 *   - `localStorage` is the persistence layer. Every `set` writes through
 *     immediately so a tab reload hydrates to the same state that was on
 *     screen before the reload.
 *   - Subscribers receive change notifications via a tiny pub/sub. No
 *     framework — views call `subscribe(key, cb)` and get `(newValue)`
 *     on every `set`.
 *   - Keys are namespaced with an `ic.` prefix so this module coexists
 *     cleanly with any other scripts running on the GitHub Pages origin.
 *   - No TTL, no auto-expiry, no background polling. Staleness is
 *     user-driven via `refreshAccount()`.
 *
 * Storage keys (all JSON-serialized):
 *
 *   ic.credentials      — { userId, hash }
 *   ic.play_server      — string (trailing slash)
 *   ic.instance_id      — number (from getuserdetails)
 *   ic.userdetails      — full `body.details` object
 *   ic.last_refresh_at  — epoch-ms number
 *   ic.selected_dps_id  — number (Legendary view last-picked DPS)
 *   ic.legendary.activeTab — 'forge-run' | 'reforge'
 *   ic.legendary.levelTarget — 5 | 10 | 20 (Forge Run milestone filter)
 *   ic.legendary.favorites — number[] (favorited hero IDs, global across DPS)
 *   ic.legendary.favoritesOnly — boolean (Forge Run "favorites only" toggle)
 *
 * Testability: the module reads `localStorage` lazily via the injected
 * `init(storage)` call, so Node tests pass an in-memory polyfill and the
 * browser uses the native `globalThis.localStorage`. `refreshAccount()`
 * similarly takes its serverCalls dependencies as arguments rather than
 * importing the `serverCalls` module directly, so it's testable without
 * network.
 */

const KEY_PREFIX = 'ic.';

// Known keys — exported so views and main.js don't typo them.
export const KEYS = Object.freeze({
  CREDENTIALS: 'credentials',
  PLAY_SERVER: 'play_server',
  INSTANCE_ID: 'instance_id',
  USER_DETAILS: 'userdetails',
  LAST_REFRESH_AT: 'last_refresh_at',
  SELECTED_DPS_ID: 'selected_dps_id',
  LEGENDARY_ACTIVE_TAB: 'legendary.activeTab',
  LEGENDARY_LEVEL_TARGET: 'legendary.levelTarget',
  LEGENDARY_FAVORITES: 'legendary.favorites',
  LEGENDARY_FAVORITES_ONLY: 'legendary.favoritesOnly',
});

let storage = null;
const subscribers = new Map(); // key → Set<callback>

/**
 * Bind this module to a Storage implementation. Call once at startup
 * (in `main.js` with `globalThis.localStorage`; in tests with an
 * in-memory shim).
 *
 * Calling init() a second time with a different storage instance is
 * allowed (useful in tests) and clears the subscriber table so stale
 * callbacks from a previous run don't fire on the new storage.
 *
 * @param {Storage} impl — must expose getItem / setItem / removeItem / key / length
 */
export function init(impl) {
  storage = impl;
  subscribers.clear();
}

function ensureInit() {
  if (!storage) {
    throw new Error('state.js used before init() — call init(localStorage) first');
  }
}

function storageKey(key) {
  return KEY_PREFIX + key;
}

/**
 * Read a JSON-deserialized value from storage, or `null` if the key is
 * missing or corrupted.
 *
 * @param {string} key  — one of KEYS.*, no prefix
 * @returns {unknown}
 */
export function get(key) {
  ensureInit();
  const raw = storage.getItem(storageKey(key));
  if (raw == null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    // Corrupted payload — treat as missing. Callers can set() a fresh
    // value to overwrite it; we don't remove here because the caller
    // may want to inspect the raw string via another channel.
    return null;
  }
}

/**
 * Write a JSON-serializable value to storage and fire the change event
 * for this key. Passing `null` or `undefined` removes the key.
 *
 * @param {string} key
 * @param {unknown} val
 */
export function set(key, val) {
  ensureInit();
  const sk = storageKey(key);
  if (val == null) {
    storage.removeItem(sk);
  } else {
    storage.setItem(sk, JSON.stringify(val));
  }
  notify(key, val ?? null);
}

/**
 * Subscribe to changes on `key`. Returns an unsubscribe function.
 *
 *   const off = subscribe('credentials', (c) => rerenderGate(c));
 *   // later: off();
 *
 * Callbacks receive the *new* value (after JSON roundtrip semantics:
 * i.e. the exact object that was passed to `set`, not a fresh `get`).
 *
 * @param {string} key
 * @param {(newValue: unknown) => void} cb
 * @returns {() => void}
 */
export function subscribe(key, cb) {
  if (typeof cb !== 'function') throw new TypeError('subscribe: cb must be a function');
  let subs = subscribers.get(key);
  if (!subs) {
    subs = new Set();
    subscribers.set(key, subs);
  }
  subs.add(cb);
  return () => {
    subs.delete(cb);
    if (subs.size === 0) subscribers.delete(key);
  };
}

function notify(key, val) {
  const subs = subscribers.get(key);
  if (!subs) return;
  for (const cb of subs) {
    try {
      cb(val);
    } catch (err) {
      // Swallow per-subscriber errors so one broken view doesn't block
      // other views from receiving the same change. Log to console so
      // the browser surfaces it during development.
      // eslint-disable-next-line no-console
      console.error(`state.js: subscriber for "${key}" threw`, err);
    }
  }
}

/**
 * Clear every `ic.*` key from storage and notify subscribers with `null`.
 * Used by the Settings "Clear credentials" action.
 */
export function clearAll() {
  ensureInit();
  const toRemove = [];
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (k && k.startsWith(KEY_PREFIX)) toRemove.push(k);
  }
  for (const k of toRemove) storage.removeItem(k);

  // Notify every live subscription with null so views can reset their
  // rendered state. Iterate on a snapshot because subscribers may
  // unsubscribe during their callback.
  const keys = [...subscribers.keys()];
  for (const key of keys) notify(key, null);
}

// ---------------------------------------------------------------------------
// Favorites — small helpers around the LEGENDARY_FAVORITES list.
// ---------------------------------------------------------------------------
//
// The favorites list is a plain Array<number> of hero IDs persisted under
// `ic.legendary.favorites`. We keep it as an array (not a Set) because Sets
// don't JSON-serialize cleanly; getFavoritesSet() materializes one when the
// caller needs O(1) membership checks.
//
// Hero IDs are global (an Idle Champions hero ID is the same regardless of
// which DPS the user has selected), so favorites are intentionally NOT
// scoped per-DPS — favoriting Donaar once means he's tagged across every
// DPS view.

/**
 * Read the favorites list as a Set of hero IDs (numbers). Always returns a
 * fresh Set; callers are free to mutate it without affecting persisted
 * state.
 *
 * @returns {Set<number>}
 */
export function getFavoritesSet() {
  const raw = get(KEYS.LEGENDARY_FAVORITES);
  if (!Array.isArray(raw)) return new Set();
  const out = new Set();
  for (const id of raw) {
    // Reject null/undefined explicitly — `Number(null)` is 0, which would
    // sneak a fake "hero zero" into the set if we coerced first.
    if (id == null) continue;
    const n = Number(id);
    if (Number.isFinite(n)) out.add(n);
  }
  return out;
}

/**
 * Toggle a hero's favorite status and persist the new list. Returns the
 * resulting boolean state ("is now a favorite") so callers can drive UI
 * without re-reading.
 *
 * Order of the persisted array is not meaningful — we sort numerically
 * just to keep the JSON in localStorage stable across toggles, which makes
 * debugging via DevTools easier.
 *
 * @param {number} heroId
 * @returns {boolean} whether the hero is a favorite AFTER the toggle
 */
export function toggleFavorite(heroId) {
  const id = Number(heroId);
  if (!Number.isFinite(id)) return false;
  const current = getFavoritesSet();
  let nowFavorite;
  if (current.has(id)) {
    current.delete(id);
    nowFavorite = false;
  } else {
    current.add(id);
    nowFavorite = true;
  }
  const sorted = [...current].sort((a, b) => a - b);
  set(KEYS.LEGENDARY_FAVORITES, sorted);
  return nowFavorite;
}

// ---------------------------------------------------------------------------
// refreshAccount — the single hydration entry point (FR-4, Appendix B #8).
// ---------------------------------------------------------------------------

/**
 * Refresh the cached account state. This is the ONLY function that
 * writes to `ic.userdetails`, `ic.instance_id`, `ic.play_server`, and
 * `ic.last_refresh_at`. Both the Refresh button and post-mutation
 * flows call this function.
 *
 * Dependency-injection contract: the caller passes the two `serverCalls`
 * functions explicitly so this module is testable without touching the
 * network. In production `main.js` wires these up once at startup:
 *
 *   import * as state from './state.js';
 *   import { getPlayServerForDefinitions, getUserDetails } from './serverCalls.js';
 *   await state.refreshAccount({ getPlayServerForDefinitions, getUserDetails });
 *
 * @param {object} deps
 * @param {Function} deps.getPlayServerForDefinitions
 * @param {Function} deps.getUserDetails
 * @param {() => number} [deps.now=Date.now]
 * @returns {Promise<object>} the refreshed `details` object
 */
export async function refreshAccount(deps) {
  ensureInit();
  const { getPlayServerForDefinitions, getUserDetails, now = () => Date.now() } = deps || {};
  if (typeof getPlayServerForDefinitions !== 'function') {
    throw new Error('refreshAccount: getPlayServerForDefinitions dep required');
  }
  if (typeof getUserDetails !== 'function') {
    throw new Error('refreshAccount: getUserDetails dep required');
  }

  const creds = get(KEYS.CREDENTIALS);
  if (!creds || typeof creds !== 'object' || !creds.userId || !creds.hash) {
    throw new Error('refreshAccount: no credentials in state — route to #/settings first');
  }

  // Discover (or reuse) the play server. We always call the master
  // discovery on first refresh of a session because the shard routing
  // can change day-to-day; subsequent refreshes reuse the cached URL
  // but still honor `switch_play_server` when the play server tells us
  // to move — that retry is handled inside `serverCalls.request()`.
  let playServer = get(KEYS.PLAY_SERVER);
  if (!playServer || typeof playServer !== 'string') {
    const disc = await getPlayServerForDefinitions({});
    playServer = disc.playServer;
    set(KEYS.PLAY_SERVER, playServer);
  }

  const cachedInstanceId = get(KEYS.INSTANCE_ID);
  const { details, serverUrl } = await getUserDetails({
    playServer,
    userId: creds.userId,
    hash: creds.hash,
    instanceId: cachedInstanceId ?? null,
  });

  // If the play server rewrote our URL via switch_play_server, persist
  // the new shard so subsequent calls land directly.
  if (serverUrl && serverUrl !== playServer) {
    set(KEYS.PLAY_SERVER, serverUrl);
  }

  set(KEYS.USER_DETAILS, details);
  if (details.instance_id != null) set(KEYS.INSTANCE_ID, details.instance_id);
  set(KEYS.LAST_REFRESH_AT, now());

  return details;
}
