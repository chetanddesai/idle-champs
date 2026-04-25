/**
 * definitions.js — runtime loader for the bundled `data/*.json` definition files.
 *
 * PRD §4.2 ships a trimmed, curated subset of `getdefinitions` output as
 * committed static JSON. This module is the shared entry point for reading
 * those files at runtime. It:
 *
 *   - Fetches each file at most once per session. The `Map<path, Promise>`
 *     cache means repeat calls dedupe even when multiple views race to
 *     trigger the first fetch during bootstrap.
 *   - Falls back to an empty shape (`[]` for arrays, `{}` for objects) on
 *     any fetch / parse failure so the UI degrades gracefully instead of
 *     crashing. The caller still sees the failure in the browser console.
 *   - Offers pure indexer helpers (`indexHeroesById`, `indexEffectsById`,
 *     `indexFavorsByCurrencyId`) for views that need `{[id]: record}` lookup
 *     without re-implementing the loop each time. These are covered by
 *     `node:test` since they touch no I/O.
 *
 * Every path is module-relative via `./data/...` because `index.html` lives
 * at the repo root — `fetch(relativeUrl)` resolves against the page URL.
 *
 * This module deliberately does NOT handle the "opportunistic background
 * refresh" flow from PRD §4.2 — that's a V2 concern. V1 reads the bundled
 * baseline and trusts it until the developer runs `scripts/refresh-defs.js`.
 */

const HEROES_PATH = './data/definitions.heroes.json';
const LEGENDARY_EFFECTS_PATH = './data/definitions.legendary-effects.json';
const LEGENDARY_EFFECT_SCOPES_PATH = './data/definitions.legendary-effect-scopes.json';
const FAVORS_PATH = './data/definitions.favors.json';
const HERO_IMAGES_PATH = './data/definitions.hero-images.json';

const cache = new Map();

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
 * @param {string} path     — e.g. `./data/definitions.heroes.json`
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
 * Fetch + cache a single JSON file. Returns `fallback` on failure so the
 * caller can always proceed with *something*.
 *
 * The cache is keyed by the *unversioned* path so bumping `__BUILD_ID__`
 * between loads doesn't matter mid-session — the first fetch within a
 * session wins. The version is appended only to the URL we actually
 * hand to `fetch`, which is what the browser / HTTP cache sees.
 *
 * @param {string} path
 * @param {unknown} fallback
 * @returns {Promise<unknown>}
 */
function loadOnce(path, fallback) {
  if (cache.has(path)) return cache.get(path);
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
  cache.set(path, p);
  return p;
}

/** @returns {Promise<Array<object>>} trimmed hero definitions (see data/definitions.heroes.json) */
export const loadHeroes = () => loadOnce(HEROES_PATH, []);

/** @returns {Promise<Array<object>>} trimmed legendary-effect definitions */
export const loadLegendaryEffects = () => loadOnce(LEGENDARY_EFFECTS_PATH, []);

/** @returns {Promise<Array<object>>} derived scope records for every effect */
export const loadLegendaryEffectScopes = () => loadOnce(LEGENDARY_EFFECT_SCOPES_PATH, []);

/** @returns {Promise<Array<object>>} favor/campaign definitions */
export const loadFavors = () => loadOnce(FAVORS_PATH, []);

/** @returns {Promise<object>} hero portrait URL map (see data/definitions.hero-images.json) */
export const loadHeroImages = () => loadOnce(HERO_IMAGES_PATH, {});

/**
 * Load every definition file the Legendary view needs, in parallel.
 * Convenience for `views/legendary/index.js` which needs all five on mount.
 *
 * @returns {Promise<{heroes, effects, scopes, favors, heroImages}>}
 */
export async function loadLegendaryDefs() {
  const [heroes, effects, scopes, favors, heroImages] = await Promise.all([
    loadHeroes(),
    loadLegendaryEffects(),
    loadLegendaryEffectScopes(),
    loadFavors(),
    loadHeroImages(),
  ]);
  return { heroes, effects, scopes, favors, heroImages };
}

// ---------------------------------------------------------------------------
// Pure indexer helpers — exported separately so views can share them and
// tests can exercise them without DOM / fetch.
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
 * the `"dps"` tag in `definitions.heroes.json`, alphabetized by name.
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
