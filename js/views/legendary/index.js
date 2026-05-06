/**
 * legendary/index.js — route shell for the Legendary category (PRD §3.2, FR-7/8).
 *
 * Responsibilities:
 *
 *   1. Read the runtime definitions bundle from the localStorage cache
 *      (heroes, legendary-effects, effect scopes, favors), augmented with
 *      the bundled hero-portrait map. The cache is populated by
 *      `state.refreshAccount()` on every Refresh; if it's empty (very
 *      first session, before the first Refresh resolves), we render a
 *      loading state and rely on a `KEYS.DEFINITIONS_CACHE` subscription
 *      to re-render once the data lands.
 *   2. Own the two persistent UI-state values this view exposes:
 *        - ic.selected_dps_id       (which DPS the player is planning for)
 *        - ic.legendary.activeTab   ('forge-run' | 'reforge')
 *      Transient session state (current favor filter) lives in a
 *      module-level variable that resets on DPS change.
 *   3. Own the classifySlots memoization per tech-design Appendix B #10:
 *      `Map<dpsHeroId, ClassificationOutput>` lives here; subscriptions
 *      to ic.userdetails AND ic.definitions.cache clear the whole map
 *      whenever account state OR defs refresh. This keeps
 *      legendaryModel.classifySlots pure.
 *   4. Compose the shared header (DPS dropdown + chip row + Scales badge +
 *      tab switcher) with the active tab's body.
 *
 * The Reforge tab is scaffolded here as a "coming next" placeholder; the
 * V1 priority (per PRD §3.2) is Forge Run. When reforge.js lands we swap
 * the placeholder for `reforgeView.render(...)`.
 */

import * as state from '../../state.js';
import { KEYS } from '../../state.js';
import { el, mount } from '../../lib/dom.js';
import {
  loadCachedDefs,
  loadHeroImages,
  indexHeroesById,
  indexEffectsById,
  indexFavorsByCurrencyId,
  buildDpsOptions,
  ownedHeroDefsMap,
} from '../../lib/definitions.js';
import { classifySlots, buildForgeRun } from '../../lib/legendaryModel.js';
import { deriveUserBalances } from '../../lib/userBalances.js';
import * as header from './header.js';
import * as forgeRun from './forgeRun.js';

// ---------------------------------------------------------------------------
// Module-level singletons — shared across every render of this view.
// ---------------------------------------------------------------------------

/**
 * The current definitions bundle: parsed cache plus the bundled hero-image
 * map. Null until either the cache or the hero-images fetch resolves.
 *
 *   - heroes/effects/scopes/favors come from `KEYS.DEFINITIONS_CACHE`.
 *   - heroImages is the only piece that still requires a fetch
 *     (`data/definitions.hero-images.json`).
 */
let defs = null;

/** Pre-indexed lookups derived from `defs` (built whenever defs reloads). */
let heroesById = null;
let effectsById = null;
let favorsByCurrencyId = null;

/** Bundled hero portraits cache (resolves once per session). */
let heroImagesCache = null;
/** In-flight hero-images fetch; null when not loading. */
let heroImagesLoad = null;

/**
 * classifySlots memo keyed by dps hero id.
 * @type {Map<number, import('../../lib/legendaryModel.js').ClassificationOutput>}
 */
const classificationMemo = new Map();

/**
 * Session-only favor filter on the Forge Run tab. Null = "show all".
 * Resets to null on DPS change.
 * @type {number | null}
 */
let forgeFavorFilter = null;

/** True once subscriptions (ic.userdetails + ic.definitions.cache) are wired. */
let subscriptionsWired = false;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Render the Legendary view into `host`. Idempotent — safe to call on any
 * hash-change, state-change, or user interaction.
 *
 * @param {HTMLElement} host
 */
export function render(host) {
  if (!host) return;

  wireSubscriptionsOnce();

  // Ensure `defs` reflects the latest cache contents. Cheap on every
  // call (sync read + indexer rebuild over ~150 records).
  refreshDefsFromCache();

  if (!defs) {
    // No cache yet — first session before the user has clicked Refresh.
    // The credential gate already routes unauthenticated users to
    // settings, so reaching here means we're authenticated and waiting
    // for the in-flight first-Refresh to populate the cache. The
    // ic.definitions.cache subscription will re-render us when it does.
    renderLoading(host);
    return;
  }

  if (!heroImagesCache) {
    // Cache landed but the bundled hero-images fetch hasn't resolved yet.
    // Kick it off (idempotent) and re-render when it lands.
    renderLoading(host);
    ensureHeroImagesLoaded().then(() => {
      if (currentHostIsLegendary(host)) render(host);
    });
    return;
  }

  const userDetails = state.get(KEYS.USER_DETAILS);
  if (!userDetails) {
    renderNoAccount(host);
    return;
  }

  const dpsOptions = buildDpsOptions(defs.heroes, userDetails.heroes || []);
  const selectedDpsId = coerceSelectedDpsId(dpsOptions);
  const activeTab = coerceActiveTab();
  const levelTarget = coerceLevelTarget();
  const favoritesOnly = coerceFavoritesOnly();
  const favorites = state.getFavoritesSet();

  // Header is rendered regardless of whether a DPS is picked — the
  // dropdown is how the user picks one.
  const headerNode = header.render({
    defs,
    heroesById,
    userDetails,
    dpsOptions,
    selectedDpsId,
    activeTab,
    onDpsChange: handleDpsChange,
    onTabChange: handleTabChange,
  });

  let bodyNode;
  if (selectedDpsId == null) {
    bodyNode = renderEmptyDpsState();
  } else {
    const classification = getOrComputeClassification(selectedDpsId, userDetails);
    bodyNode = renderActiveTab({
      activeTab,
      classification,
      userDetails,
      selectedDpsId,
      levelTarget,
      favoritesOnly,
      favorites,
    });
  }

  mount(host, [
    renderUnknownEffectsBannerMaybe(),
    el('section', { class: 'card legendary-card' }, [headerNode, bodyNode]),
  ]);
}

// ---------------------------------------------------------------------------
// Internal — state handlers
// ---------------------------------------------------------------------------

function handleDpsChange(newDpsId) {
  const current = state.get(KEYS.SELECTED_DPS_ID);
  if (newDpsId === current) return;
  forgeFavorFilter = null;
  state.set(KEYS.SELECTED_DPS_ID, newDpsId);
  rerender();
}

function handleTabChange(newTab) {
  const current = coerceActiveTab();
  if (newTab === current) return;
  state.set(KEYS.LEGENDARY_ACTIVE_TAB, newTab);
  rerender();
}

function handleFavorFilterChange(currencyId) {
  // null / same-as-current toggles off.
  forgeFavorFilter =
    currencyId == null || currencyId === forgeFavorFilter ? null : currencyId;
  rerender();
}

function handleLevelTargetChange(newTarget) {
  const current = coerceLevelTarget();
  if (newTarget === current) return;
  // Switching the milestone re-segments the favor priority list, so any
  // active per-favor filter is no longer guaranteed to point at a row
  // that still exists. Clear it for clarity.
  forgeFavorFilter = null;
  state.set(KEYS.LEGENDARY_LEVEL_TARGET, newTarget);
  rerender();
}

function handleFavoritesOnlyChange(next) {
  const current = coerceFavoritesOnly();
  const value = !!next;
  if (value === current) return;
  // Same rationale as handleLevelTargetChange: toggling re-segments the
  // favor priority breakdown, so any active per-favor filter may now
  // point at a row that no longer exists. Clear it for clarity.
  forgeFavorFilter = null;
  state.set(KEYS.LEGENDARY_FAVORITES_ONLY, value);
  rerender();
}

function handleFavoriteToggle(heroId) {
  // Toggle persists immediately. We re-render so the heart re-paints AND
  // — when "favorites only" is on — the row removes itself if the user
  // un-favorited their last visible hero.
  //
  // Note: we deliberately DO NOT clear the favor filter here. A heart
  // toggle is a small, incremental change; clearing the filter on every
  // click would be jarring. If the toggle happens to drop the only hero
  // backing the active favor row, the empty-state copy explains why.
  state.toggleFavorite(heroId);
  rerender();
}

function rerender() {
  // Only re-render when the user is actually on the Legendary route.
  // Otherwise our subscriptions (ic.userdetails, ic.definitions.cache)
  // would stomp on whatever view is currently mounted in #app-main.
  if (globalThis.location.hash !== '#/legendary') return;
  const host = document.getElementById('app-main');
  if (host) render(host);
}

// ---------------------------------------------------------------------------
// Internal — defs + memo management
// ---------------------------------------------------------------------------

/**
 * Re-read the parsed-defs cache from state and rebuild the indexer maps.
 * Called from `render()` (so the view always sees fresh cache contents)
 * and from the `KEYS.DEFINITIONS_CACHE` subscription (so the memo is
 * cleared the moment a new cache lands).
 *
 * Idempotent and cheap — a sync state read plus three small loops over
 * ~150 records each. We deliberately don't memoise on the cache identity
 * because the savings are negligible and the explicit semantics ("every
 * render reflects the current cache") is easier to reason about than
 * "stale unless the cache changed since last we checked".
 */
function refreshDefsFromCache() {
  const cached = loadCachedDefs();
  if (!cached) {
    defs = null;
    heroesById = null;
    effectsById = null;
    favorsByCurrencyId = null;
    return;
  }
  // Combine cached parsed-defs with the bundled hero-images map. The
  // hero-images fetch is async; if it hasn't resolved yet we still set
  // `defs` so the cache-present-but-images-pending branch in `render()`
  // can run, but the `heroImages` field will be `null` until the fetch
  // lands.
  defs = {
    heroes: cached.heroes,
    effects: cached.effects,
    scopes: cached.scopes,
    favors: cached.favors,
    heroImages: heroImagesCache,
    fetched_at: cached.fetched_at,
  };
  heroesById = indexHeroesById(cached.heroes);
  effectsById = indexEffectsById(cached.effects);
  favorsByCurrencyId = indexFavorsByCurrencyId(cached.favors);
}

/**
 * Kick off the bundled hero-images fetch the first time it's needed.
 * Idempotent: subsequent calls return the same promise (or a resolved
 * one) so concurrent renders share a single fetch.
 */
function ensureHeroImagesLoaded() {
  if (heroImagesCache) return Promise.resolve(heroImagesCache);
  if (heroImagesLoad) return heroImagesLoad;
  heroImagesLoad = loadHeroImages()
    .then((img) => {
      heroImagesCache = img || {};
      // Patch the existing defs bundle so the next render sees portraits
      // without having to re-run `refreshDefsFromCache()` first.
      if (defs) defs.heroImages = heroImagesCache;
      return heroImagesCache;
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error('Failed to load hero-images bundle:', err);
      heroImagesLoad = null; // allow retry on next render
      throw err;
    });
  return heroImagesLoad;
}

function wireSubscriptionsOnce() {
  if (subscriptionsWired) return;
  subscriptionsWired = true;

  // Per Appendix B #10: clear the memo whenever account state refreshes.
  // This is *separate* from the main.js subscription that re-renders
  // the current route — both fire on userdetails change; our handler
  // runs first because it's synchronous and registers during this view's
  // first render.
  state.subscribe(KEYS.USER_DETAILS, () => {
    classificationMemo.clear();
  });

  // Definitions cache landed (first refresh) or refreshed (subsequent
  // refreshes). Clear the memo — any classification computed against the
  // old defs may now be stale — and re-render so a brand-new champion
  // shows up in the DPS dropdown without requiring a hash change.
  state.subscribe(KEYS.DEFINITIONS_CACHE, () => {
    classificationMemo.clear();
    rerender();
  });
}

function getOrComputeClassification(dpsHeroId, userDetails) {
  const cached = classificationMemo.get(dpsHeroId);
  if (cached) return cached;

  const ownedHeroes = ownedHeroDefsMap(heroesById, userDetails.heroes || []);
  const legendaryItems = userDetails.legendary_details?.legendary_items || {};

  const output = classifySlots({
    dpsHeroId,
    heroes: ownedHeroes,
    scopes: defs.scopes,
    legendaryItems,
  });

  classificationMemo.set(dpsHeroId, output);
  return output;
}

// ---------------------------------------------------------------------------
// Internal — persisted state coercion
// ---------------------------------------------------------------------------

/**
 * Resolve the selected DPS id against the current dropdown options.
 * Clears the persisted id if it no longer maps to an owned+dps hero
 * (e.g. the player sold a hero between sessions).
 */
function coerceSelectedDpsId(dpsOptions) {
  const stored = state.get(KEYS.SELECTED_DPS_ID);
  if (stored == null) return null;
  const id = Number(stored);
  if (!Number.isFinite(id)) return null;
  const match = dpsOptions.find((o) => o.id === id);
  if (!match) {
    // Lazy-clean: the stored value is stale. Leave it in localStorage for
    // now (no set()) so we don't thrash subscriptions; the selected id
    // simply doesn't render.
    return null;
  }
  return id;
}

function coerceActiveTab() {
  const stored = state.get(KEYS.LEGENDARY_ACTIVE_TAB);
  if (stored === 'reforge') return 'reforge';
  return 'forge-run';
}

/**
 * Resolve the persisted level target into one of the supported milestone
 * values. Anything unrecognised collapses to the default (20 = "max"),
 * which is also the legacy "no filter" behaviour from before this knob
 * existed — so users on first load don't see a narrowed list.
 *
 * Kept in sync with `LEVEL_TARGET_OPTIONS` in `forgeRun.js`; the view
 * renders pills for each option.
 */
function coerceLevelTarget() {
  const stored = Number(state.get(KEYS.LEGENDARY_LEVEL_TARGET));
  if (stored === 5 || stored === 10 || stored === 20) return stored;
  return 20;
}

/**
 * Resolve the persisted "favorites only" toggle. Defaults to false (off)
 * for first-time users so the unfiltered list is what they see by default.
 */
function coerceFavoritesOnly() {
  return state.get(KEYS.LEGENDARY_FAVORITES_ONLY) === true;
}

// ---------------------------------------------------------------------------
// Internal — rendering
// ---------------------------------------------------------------------------

function currentHostIsLegendary(host) {
  // Defensive: if the user has navigated away while defs were loading,
  // don't stomp on the new view.
  return host && host.isConnected && globalThis.location.hash === '#/legendary';
}

function renderLoading(host) {
  mount(host, [
    el('section', { class: 'card legendary-card legendary-card--loading' }, [
      el('p', { class: 'card__meta', text: 'Loading legendary data…' }),
      el('p', {
        class: 'card__meta card__meta--hint',
        text: 'If nothing appears in a few seconds, tap Refresh above.',
      }),
    ]),
  ]);
}

function renderNoAccount(host) {
  mount(host, [
    el('section', { class: 'card legendary-card' }, [
      el('h2', { class: 'card__title', text: 'Legendary Items' }),
      el('p', {
        class: 'card__meta',
        text: 'No account data loaded yet. Tap Refresh at the top to fetch your roster and legendaries.',
      }),
    ]),
  ]);
}

function renderEmptyDpsState() {
  return el('div', { class: 'legendary-empty' }, [
    el('p', {
      class: 'legendary-empty__title',
      text: 'Pick your DPS champion to start.',
    }),
    el('p', {
      class: 'legendary-empty__body',
      text:
        'Choose the hero you want to optimize and both tabs will fill in with slots and upgrades relevant to them.',
    }),
  ]);
}

function renderActiveTab({
  activeTab,
  classification,
  userDetails,
  selectedDpsId,
  levelTarget,
  favoritesOnly,
  favorites,
}) {
  if (activeTab === 'reforge') {
    return renderReforgePlaceholder();
  }

  const userBalances = deriveUserBalances(userDetails);
  const forgeState = buildForgeRun(classification, userBalances, {
    levelTarget,
    favoritesOnly,
    favoriteHeroIds: favorites,
  });

  return forgeRun.render({
    forgeState,
    userBalances,
    classification,
    defs,
    heroesById,
    effectsById,
    favorsByCurrencyId,
    favorFilter: forgeFavorFilter,
    onFavorFilterChange: handleFavorFilterChange,
    levelTarget,
    onLevelTargetChange: handleLevelTargetChange,
    favoritesOnly,
    onFavoritesOnlyChange: handleFavoritesOnlyChange,
    favorites,
    onFavoriteToggle: handleFavoriteToggle,
    selectedDpsId,
  });
}

function renderReforgePlaceholder() {
  return el('div', { class: 'legendary-empty legendary-empty--reforge' }, [
    el('p', {
      class: 'legendary-empty__title',
      text: 'Reforge view — coming next',
    }),
    el('p', {
      class: 'legendary-empty__body',
      text:
        'The probabilistic-reroll planner ships right after Forge Run. Switch back to the Forge Run tab to plan Scales-of-Tiamat + favor upgrades in the meantime.',
    }),
  ]);
}

function renderUnknownEffectsBannerMaybe() {
  // The classification memo already has the current DPS's unknown-effect
  // ids; pick them up if we have a current entry so we can surface a
  // banner above the card (per FR-14).
  const dpsId = state.get(KEYS.SELECTED_DPS_ID);
  if (dpsId == null) return null;
  const classification = classificationMemo.get(Number(dpsId));
  if (!classification || classification.unknownEffectIds.length === 0) return null;

  const ids = classification.unknownEffectIds.join(', ');
  return el('div', { class: 'banner banner--unknown-effects', attrs: { role: 'status' } }, [
    el('strong', { text: `${classification.unknownEffectIds.length} effects couldn't be classified.` }),
    ` Please file an issue citing effect ID${
      classification.unknownEffectIds.length === 1 ? '' : 's'
    } ${ids}; the Forge Run view is still usable in the meantime.`,
  ]);
}
