/**
 * legendary/index.js — route shell for the Legendary category (PRD §3.2, FR-7/8).
 *
 * Responsibilities:
 *
 *   1. Bootstrap the bundled definition files on first mount (heroes,
 *      legendary-effects, effect scopes, favors, hero portraits). Caching is
 *      handled by `js/lib/definitions.js`; we Promise.all them on mount so
 *      the five files stream in parallel.
 *   2. Own the two persistent UI-state values this view exposes:
 *        - ic.selected_dps_id       (which DPS the player is planning for)
 *        - ic.legendary.activeTab   ('forge-run' | 'reforge')
 *      Transient session state (current favor filter) lives in a
 *      module-level variable that resets on DPS change.
 *   3. Own the classifySlots memoization per tech-design Appendix B #10:
 *      `Map<dpsHeroId, ClassificationOutput>` lives here; a subscription
 *      to ic.userdetails clears the whole map whenever account state
 *      refreshes. This keeps legendaryModel.classifySlots pure.
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
  loadLegendaryDefs,
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

/** Parsed bundled definitions; null until `loadLegendaryDefs()` resolves. */
let defs = null;

/** Pre-indexed lookups derived from `defs` (built once after defs load). */
let heroesById = null;
let effectsById = null;
let favorsByCurrencyId = null;

/** Promise guard so concurrent renders share the same in-flight load. */
let defsLoad = null;

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

/** True once the ic.userdetails subscription has been wired. */
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

  if (!defs) {
    renderLoading(host);
    ensureDefsLoaded().then(() => {
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

function rerender() {
  const host = document.getElementById('app-main');
  if (host) render(host);
}

// ---------------------------------------------------------------------------
// Internal — defs + memo management
// ---------------------------------------------------------------------------

function ensureDefsLoaded() {
  if (defs) return Promise.resolve(defs);
  if (defsLoad) return defsLoad;
  defsLoad = loadLegendaryDefs()
    .then((result) => {
      defs = result;
      heroesById = indexHeroesById(result.heroes);
      effectsById = indexEffectsById(result.effects);
      favorsByCurrencyId = indexFavorsByCurrencyId(result.favors);
      return result;
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.error('Failed to load legendary definitions:', err);
      defsLoad = null; // allow retry on next render
      throw err;
    });
  return defsLoad;
}

function wireSubscriptionsOnce() {
  if (subscriptionsWired) return;
  subscriptionsWired = true;
  // Per Appendix B #10: clear the memo whenever account state refreshes.
  // This is *separate* from the main.js subscription that re-renders
  // the current route — both fire on userdetails change; our handler
  // just needs to run first, which it does because it's synchronous and
  // registers during this view's first render.
  state.subscribe(KEYS.USER_DETAILS, () => {
    classificationMemo.clear();
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
      el('p', {
        class: 'card__meta',
        text: 'Loading legendary data…',
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

function renderActiveTab({ activeTab, classification, userDetails, selectedDpsId, levelTarget }) {
  if (activeTab === 'reforge') {
    return renderReforgePlaceholder();
  }

  const userBalances = deriveUserBalances(userDetails);
  const forgeState = buildForgeRun(classification, userBalances, { levelTarget });

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
