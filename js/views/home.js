/**
 * home.js — Dashboard / Home route (PRD §3.0, §3.4).
 *
 * Responsibilities:
 *
 *   - Summarize the loaded account at a glance: Scales of Tiamat balance,
 *     roster size, equipped legendary count, last refresh timestamp.
 *   - Deep-link into each category (Legendary Items, Specializations)
 *     with a one-line "what's here" summary so the landing surface feels
 *     useful even before the V1 preview data lands.
 *   - When no userdetails have been loaded yet, render a helpful
 *     "Tap Refresh" placeholder instead of a sea of em-dashes.
 *
 * This view is purely read-only. It never triggers a refresh itself —
 * the global Refresh button in the header is the only hydration path
 * (FR-4, FR-5). `main.js` subscribes to `ic.userdetails` and re-renders
 * this view when a refresh lands.
 *
 * DPS name resolution: if a DPS has been selected in the Legendary view,
 * this module lazy-loads `data/definitions.heroes.json` to display its
 * name on the Legendary card. A fetch failure or race just renders
 * "Forge Run ready" instead — the Home view never blocks on defs.
 */

import * as state from '../state.js';
import { KEYS } from '../state.js';
import { el, mount } from '../lib/dom.js';
import { formatInteger, formatTimeAgo } from '../lib/format.js';
import { loadHeroes } from '../lib/definitions.js';

/**
 * Compute quick account-summary numbers from `details`. Missing fields
 * collapse to `null` so the caller can pick a display placeholder.
 *
 * Exported for visibility / potential future reuse by tests — this
 * function is pure and side-effect free.
 *
 * @param {object | null} details  getuserdetails body.details
 * @returns {{
 *   scales: number | null,
 *   ownedHeroes: number | null,
 *   equippedLegendaries: number | null,
 *   legendaryHeroes: number | null,
 * }}
 */
export function summarizeAccount(details) {
  if (!details || typeof details !== 'object') {
    return {
      scales: null,
      ownedHeroes: null,
      equippedLegendaries: null,
      legendaryHeroes: null,
    };
  }

  const scalesRaw = details.stats?.multiplayer_points;
  const scales = Number.isFinite(Number(scalesRaw)) ? Number(scalesRaw) : null;

  // details.heroes is an array; each entry has an `owned` flag that can
  // arrive as the string "1" / "0" or as a number. Treat anything truthy
  // that parses to non-zero as owned.
  let ownedHeroes = null;
  if (Array.isArray(details.heroes)) {
    ownedHeroes = details.heroes.reduce((count, h) => {
      const owned = Number(h?.owned ?? 0);
      return owned > 0 ? count + 1 : count;
    }, 0);
  }

  // legendary_items is keyed by hero_id → { slot_id → item }. Count the
  // total equipped slots, and the distinct hero count.
  let equippedLegendaries = null;
  let legendaryHeroes = null;
  const itemsMap = details.legendary_details?.legendary_items;
  if (itemsMap && typeof itemsMap === 'object') {
    const heroKeys = Object.keys(itemsMap);
    legendaryHeroes = heroKeys.length;
    equippedLegendaries = heroKeys.reduce((n, hid) => {
      const slots = itemsMap[hid];
      return slots && typeof slots === 'object' ? n + Object.keys(slots).length : n;
    }, 0);
  }

  return { scales, ownedHeroes, equippedLegendaries, legendaryHeroes };
}

/**
 * Render the Home view into `host`. Idempotent — call again on any
 * relevant state change (`ic.userdetails`, `ic.selected_dps_id`,
 * `ic.last_refresh_at`).
 *
 * @param {HTMLElement} host
 */
export function render(host) {
  if (!host) return;

  const details = state.get(KEYS.USER_DETAILS);
  const lastRefresh = state.get(KEYS.LAST_REFRESH_AT);
  const selectedDpsId = state.get(KEYS.SELECTED_DPS_ID);
  const stats = summarizeAccount(details);

  mount(host, [
    renderAccountCard(stats, lastRefresh, !!details),
    renderLegendaryCard(selectedDpsId, stats),
    renderSpecializationsCard(),
  ]);

  // Lazy DPS-name resolution. If a DPS is remembered, try to upgrade the
  // Legendary card's subtitle from "Forge Run ready" to "DPS: Cazrin".
  if (selectedDpsId != null) {
    resolveDpsName(selectedDpsId).then((name) => {
      if (!name) return;
      const subtitle = host.querySelector('[data-role="legendary-subtitle"]');
      if (subtitle && subtitle.dataset.dpsId === String(selectedDpsId)) {
        subtitle.textContent = `DPS: ${name}. Forge Run ranks upgrades by favor priority; Reforge flags reroll candidates.`;
      }
    });
  }
}

/**
 * Resolve a DPS hero id to its display name. Returns `null` if defs
 * aren't loadable or the id isn't found.
 *
 * @param {number | string} dpsId
 * @returns {Promise<string | null>}
 */
async function resolveDpsName(dpsId) {
  const heroes = await loadHeroes();
  if (!Array.isArray(heroes)) return null;
  const id = Number(dpsId);
  const match = heroes.find((h) => Number(h?.id) === id);
  return match?.name || null;
}

// ---------------------------------------------------------------------------
// Card builders
// ---------------------------------------------------------------------------

function renderAccountCard(stats, lastRefresh, hasDetails) {
  const statItems = [
    {
      label: 'Scales of Tiamat',
      value: stats.scales != null ? formatInteger(stats.scales) : '—',
      hint: 'Currency for crafting, upgrading, reforging.',
    },
    {
      label: 'Owned heroes',
      value: stats.ownedHeroes != null ? formatInteger(stats.ownedHeroes) : '—',
      hint: 'From your current roster.',
    },
    {
      label: 'Legendary items',
      value:
        stats.equippedLegendaries != null
          ? formatInteger(stats.equippedLegendaries)
          : '—',
      hint:
        stats.legendaryHeroes != null
          ? `Across ${formatInteger(stats.legendaryHeroes)} heroes.`
          : 'Equipped across your roster.',
    },
    {
      label: 'Last refreshed',
      value: lastRefresh ? formatTimeAgo(lastRefresh) : 'never',
      hint: 'Tap Refresh after an in-game change.',
    },
  ];

  return el('section', { class: 'card home-card' }, [
    el('h2', { class: 'card__title', text: 'Your account' }),
    el(
      'div',
      { class: 'stat-grid' },
      statItems.map((stat) =>
        el('div', { class: 'stat' }, [
          el('div', { class: 'stat__value', text: stat.value }),
          el('div', { class: 'stat__label', text: stat.label }),
          el('div', { class: 'stat__hint', text: stat.hint }),
        ])
      )
    ),
    !hasDetails &&
      el('div', { class: 'banner banner--refresh' }, [
        el('strong', { text: 'No account data yet.' }),
        ' Tap Refresh above to load your roster and legendaries.',
      ]),
  ]);
}

function renderLegendaryCard(selectedDpsId, stats) {
  const hasDps = selectedDpsId != null;
  const hasLegendaries =
    stats.equippedLegendaries != null && stats.equippedLegendaries > 0;

  // Initial subtitle — upgraded to include the DPS name by the lazy
  // resolver above if defs load in time.
  let subtitle;
  if (hasDps) {
    subtitle =
      'DPS remembered from last visit. Forge Run ranks upgrades by favor priority; Reforge flags reroll candidates.';
  } else if (hasLegendaries) {
    subtitle =
      'Pick your DPS inside to see which crafted slots affect it and which upgrades are worth spending Scales on.';
  } else {
    subtitle =
      "You don't have any legendaries crafted yet. Craft a few in-game, refresh, then come back for upgrade guidance.";
  }

  const ctaLabel = hasDps ? 'Open Forge Run →' : 'Pick your DPS →';

  return el('section', { class: 'card home-card home-card--action' }, [
    el('div', { class: 'home-card__header' }, [
      el('h3', { class: 'card__title', text: 'Legendary Items' }),
      el('span', { class: 'home-card__tag', text: 'V1' }),
    ]),
    el('p', {
      class: 'card__meta',
      text: subtitle,
      data: { role: 'legendary-subtitle', dpsId: String(selectedDpsId ?? '') },
    }),
    el('div', { class: 'btn-row' }, [
      el('a', {
        class: 'btn btn--primary',
        attrs: { href: '#/legendary', role: 'button' },
        text: ctaLabel,
      }),
    ]),
  ]);
}

function renderSpecializationsCard() {
  return el('section', { class: 'card home-card home-card--muted' }, [
    el('div', { class: 'home-card__header' }, [
      el('h3', { class: 'card__title', text: 'Specialization Choices' }),
      el('span', { class: 'home-card__tag home-card__tag--muted', text: 'Later' }),
    ]),
    el('p', {
      class: 'card__meta',
      text:
        'Specialization and feat recommendations for each champion will ship after the Legendary view is complete — see docs/PRD.md §3.3.',
    }),
  ]);
}
