/**
 * definitions.js — the cache layer for the Legendary view's definitions
 * bundle, plus pure indexer helpers.
 *
 * Definitions split:
 *
 *   - `heroes` / `effects` / `scopes` / `favors` come from a runtime
 *     `getdefinitions` call (see js/serverCalls.js + state.refreshAccount)
 *     and live in localStorage under `ic.definitions.cache`. Empty until
 *     the user clicks Refresh once after saving credentials. The runtime
 *     parser (`js/lib/legendaryDefsParser.js`) turns the raw response
 *     into the trimmed shapes we persist.
 *
 *   - `heroImages` is the *only* bundled JSON file. It maps hero IDs to
 *     Emmote's wiki slugs and ships at `data/definitions.hero-images.json`.
 *     Browsers can't regenerate it (CORS-blocked + no public listing API),
 *     so it's refreshed by the maintainer-only `npm run refresh-hero-images`
 *     script. New champions render as a monogram fallback (per
 *     `js/lib/heroImage.js`) until the next maintainer push.
 *
 * Public API:
 *
 *   - `loadCachedDefs()`            — sync read of the parsed cache; null
 *                                     when missing / malformed.
 *   - `loadLegendaryDefs()`         — async; returns the cache + heroImages
 *                                     bundle, or null when there's no
 *                                     cache (callers render a loading
 *                                     state and rely on the
 *                                     `KEYS.DEFINITIONS_CACHE` subscription
 *                                     to re-render when the first refresh
 *                                     lands).
 *   - `applyDefinitionsResponse()`  — runs the parser over a raw
 *                                     `getdefinitions` body and persists
 *                                     the result to localStorage.
 *   - `index*ById` / `buildDpsOptions` / `ownedHeroDefsMap` — pure
 *                                     helpers used by the view layer;
 *                                     unchanged by the cache split.
 *   - `withBuildId`                 — pure cache-bust helper (still used
 *                                     by the bundled hero-images fetch).
 *
 * `loadHeroImages()` is a `loadOnce`-cached fetch against the bundled file.
 * Cache busting via `__BUILD_ID__` matches the import-map and CSS strategy
 * (see HTML comment in index.html and PRD §4.4).
 */

import * as state from '../state.js';
import { KEYS } from '../state.js';
import { parseDefinitions } from './legendaryDefsParser.js';

const HERO_IMAGES_PATH = './data/definitions.hero-images.json';

const fetchCache = new Map();

/**
 * Append the global `__BUILD_ID__` as a `?v=` / `&v=` query param so that
 * `data/*.json` fetches invalidate cleanly whenever index.html's BUILD_ID
 * bumps — matches the import-map and CSS cache-busting strategy (see the
 * HTML comment at the top of index.html and PRD §4.4).
 *
 * Pure & exported for tests. When `buildId` is nullish, unsafe, or the
 * default `'dev'`, the path is returned unchanged so local `node:test`
 * runs and first-time dev loads don't pollute the filename space.
 *
 * @param {string} path     — e.g. `./data/definitions.hero-images.json`
 * @param {unknown} buildId — value of `globalThis.__BUILD_ID__`
 * @returns {string}
 */
export function withBuildId(path, buildId) {
  if (typeof path !== 'string' || path.length === 0) return path;
  if (buildId == null || buildId === '' || buildId === 'dev') return path;
  const v = encodeURIComponent(String(buildId));
  const sep = path.includes('?') ? '&' : '?';
  return `${path}${sep}v=${v}`;
}

/**
 * Fetch + cache a single bundled JSON file. Returns `fallback` on failure
 * so the caller can always proceed with *something*. The cache is keyed
 * by the unversioned path so a mid-session `__BUILD_ID__` change doesn't
 * matter; the version is appended only to the URL we hand to `fetch`.
 *
 * @param {string} path
 * @param {unknown} fallback
 * @returns {Promise<unknown>}
 */
function loadOnce(path, fallback) {
  if (fetchCache.has(path)) return fetchCache.get(path);
  const url = withBuildId(path, globalThis.__BUILD_ID__);
  const p = fetch(url)
    .then((r) => {
      if (!r.ok) throw new Error(`definitions: ${path} → HTTP ${r.status}`);
      return r.json();
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error(err);
      return fallback;
    });
  fetchCache.set(path, p);
  return p;
}

/** @returns {Promise<object>} hero portrait URL map (see data/definitions.hero-images.json) */
export const loadHeroImages = () => loadOnce(HERO_IMAGES_PATH, {});

// ---------------------------------------------------------------------------
// Cached definitions (heroes / effects / scopes / favors)
// ---------------------------------------------------------------------------

/**
 * Read the parsed-defs cache from state. Returns the persisted bundle
 * `{ fetched_at, heroes, effects, scopes, favors }` or `null` when the
 * cache is missing or doesn't validate. Validation is intentionally
 * shallow — we trust the parser to produce well-shaped output and treat
 * a corrupt cache as no-cache so the next Refresh re-populates from
 * scratch instead of crashing the view.
 *
 * @returns {{ fetched_at:number, heroes:Array, effects:Array, scopes:Array, favors:Array } | null}
 */
export function loadCachedDefs() {
  const raw = state.get(KEYS.DEFINITIONS_CACHE);
  if (!raw || typeof raw !== 'object') return null;
  if (
    !Array.isArray(raw.heroes) ||
    !Array.isArray(raw.effects) ||
    !Array.isArray(raw.scopes) ||
    !Array.isArray(raw.favors)
  ) {
    return null;
  }
  return raw;
}

/**
 * Load the full definitions bundle the Legendary view consumes:
 *
 *   - heroes / effects / scopes / favors — from the localStorage cache
 *     (populated by the most recent runtime Refresh).
 *   - heroImages — from the bundled `data/definitions.hero-images.json`
 *     file (cached after first fetch).
 *
 * Returns `null` when the parsed-defs cache is missing — the legendary
 * view shows a loading state in that case and relies on a subscription
 * to `KEYS.DEFINITIONS_CACHE` to re-render once the first Refresh lands.
 *
 * @returns {Promise<{
 *   heroes: Array<object>,
 *   effects: Array<object>,
 *   scopes: Array<object>,
 *   favors: Array<object>,
 *   heroImages: object,
 *   fetched_at: number,
 * } | null>}
 */
export async function loadLegendaryDefs() {
  const cached = loadCachedDefs();
  if (!cached) return null;
  const heroImages = await loadHeroImages();
  return {
    heroes: cached.heroes,
    effects: cached.effects,
    scopes: cached.scopes,
    favors: cached.favors,
    heroImages,
    fetched_at: cached.fetched_at,
  };
}

/**
 * Run the parser over a raw `getdefinitions` response body and persist
 * the trimmed shapes to localStorage under `KEYS.DEFINITIONS_CACHE`.
 * Subscribers (the legendary view) fire on the next event-loop tick.
 *
 * Returns the parser's audit lists (`unknownScopeIds`,
 * `favorsMissingShortName`) so callers can log GA events / surface
 * warnings; the persisted cache itself only holds the four data arrays.
 *
 * @param {object} body — `getdefinitions` response body
 * @param {object} [opts]
 * @param {() => number} [opts.now]
 * @returns {{ unknownScopeIds: number[], favorsMissingShortName: number[] }}
 */
export function applyDefinitionsResponse(body, opts = {}) {
  const now = opts.now || (() => Date.now());
  const parsed = parseDefinitions(body);
  state.set(KEYS.DEFINITIONS_CACHE, {
    fetched_at: now(),
    heroes: parsed.heroes,
    effects: parsed.effects,
    scopes: parsed.scopes,
    favors: parsed.favors,
  });
  return {
    unknownScopeIds: parsed.unknownScopeIds,
    favorsMissingShortName: parsed.favorsMissingShortName,
  };
}

// ---------------------------------------------------------------------------
// Pure indexer helpers — exported separately so views can share them and
// tests can exercise them without DOM / fetch / state.
// ---------------------------------------------------------------------------

/**
 * Build an `{[heroId]: heroRecord}` lookup from the heroes array.
 * Invalid entries (missing numeric `id`) are skipped silently.
 *
 * @param {Array<object>} heroes
 * @returns {Record<number, object>}
 */
export function indexHeroesById(heroes) {
  const map = Object.create(null);
  if (!Array.isArray(heroes)) return map;
  for (const h of heroes) {
    if (h && typeof h.id === 'number') map[h.id] = h;
  }
  return map;
}

/**
 * Build an `{[effectId]: effectRecord}` lookup from the effects array.
 *
 * @param {Array<object>} effects
 * @returns {Record<number, object>}
 */
export function indexEffectsById(effects) {
  const map = Object.create(null);
  if (!Array.isArray(effects)) return map;
  for (const e of effects) {
    if (e && typeof e.id === 'number') map[e.id] = e;
  }
  return map;
}

/**
 * Build a `{[resetCurrencyId]: favorRecord}` lookup from the favors array.
 *
 * @param {Array<object>} favors
 * @returns {Record<number, object>}
 */
export function indexFavorsByCurrencyId(favors) {
  const map = Object.create(null);
  if (!Array.isArray(favors)) return map;
  for (const f of favors) {
    if (f && typeof f.reset_currency_id === 'number') {
      map[f.reset_currency_id] = f;
    }
  }
  return map;
}

/**
 * Filter + sort the heroes definitions into the DPS-dropdown options per
 * tech-design FR-7 / Appendix B #11: heroes the player owns AND that carry
 * the `"dps"` tag in the cached defs, alphabetized by name.
 *
 * Ownership is sourced from `getuserdetails.details.heroes` — each entry
 * has `hero_id` plus an `owned` flag that arrives as the string `"1"` or
 * `"0"` (or occasionally as a number). Anything that parses to a non-zero
 * number counts as owned; missing flags count as unowned.
 *
 * Hero names use `String.localeCompare` so diacritics sort sensibly
 * (Cæsar before Dwarf, etc.) and the order matches what users read.
 *
 * @param {Array<object>} heroes       — bundled hero definitions
 * @param {Array<{hero_id, owned}>} userHeroes — from details.heroes
 * @returns {Array<{id:number, name:string, hero:object}>}
 */
export function buildDpsOptions(heroes, userHeroes) {
  const owned = new Set();
  if (Array.isArray(userHeroes)) {
    for (const h of userHeroes) {
      if (!h) continue;
      const ownedFlag = Number(h.owned ?? 0);
      const hid = Number(h.hero_id);
      if (ownedFlag > 0 && Number.isFinite(hid)) owned.add(hid);
    }
  }

  const options = [];
  if (!Array.isArray(heroes)) return options;

  for (const hero of heroes) {
    if (!hero || typeof hero.id !== 'number') continue;
    if (!Array.isArray(hero.tags) || !hero.tags.includes('dps')) continue;
    if (!owned.has(hero.id)) continue;
    options.push({
      id: hero.id,
      name: typeof hero.name === 'string' && hero.name ? hero.name : `Hero #${hero.id}`,
      hero,
    });
  }

  options.sort((a, b) => a.name.localeCompare(b.name, 'en'));
  return options;
}

/**
 * Intersect the bundled hero definitions with the player's owned heroes to
 * produce the `{[heroId]: heroDef}` map that `legendaryModel.classifySlots`
 * consumes. Only hero IDs that are both defined *and* owned appear.
 *
 * @param {Record<number, object>} heroesById — from `indexHeroesById`
 * @param {Array<{hero_id, owned}>} userHeroes — from details.heroes
 * @returns {Record<number, object>}
 */
export function ownedHeroDefsMap(heroesById, userHeroes) {
  const out = Object.create(null);
  if (!heroesById || !Array.isArray(userHeroes)) return out;
  for (const h of userHeroes) {
    if (!h) continue;
    const ownedFlag = Number(h.owned ?? 0);
    const hid = Number(h.hero_id);
    if (ownedFlag <= 0 || !Number.isFinite(hid)) continue;
    const def = heroesById[hid];
    if (def) out[hid] = def;
  }
  return out;
}
