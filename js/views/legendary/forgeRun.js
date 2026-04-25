/**
 * legendary/forgeRun.js — the Forge Run tab body (PRD §3.2.4, FR-9).
 *
 * V1 is a **read-only planner** (PRD §9 decision 18): every slot that's a
 * recommended in-game upgrade is highlighted with its Tiamat + favor cost;
 * the user performs the upgrade in-game and taps Refresh.
 *
 * Layout:
 *
 *   1. Favor priority panel — a ranked list of favor currencies (the
 *      per-campaign gating resource). Each row surfaces the affecting
 *      count, the upgradeable-now subset, and the current balance. Rows
 *      are clickable and filter the upgrade-candidate list below.
 *
 *   2. Upgrade candidate list — one card per champion that has at least
 *      one DPS-affecting equipped slot, DPS hero rendered first. Each
 *      card shows a 6-tile slot grid where tile visuals encode the slot's
 *      state (affecting+upgradeable / affecting+blocked / affecting+maxed
 *      / empty). Non-affecting slots on supporting heroes are rendered
 *      muted so the grid still reads as "six slots" at a glance.
 *
 *   3. Bottom disclosure — a muted "N champions contribute nothing to
 *      this DPS" line is informational only.
 *
 * All state ownership stays in `legendary/index.js`; this module is a pure
 * render function driven by the `ForgeRunState` already computed by
 * `legendaryModel.buildForgeRun`.
 */

import { el } from '../../lib/dom.js';
import {
  formatInteger,
  formatCompact,
  formatFavor,
} from '../../lib/format.js';
import { heroPortraitUrl, heroMonogram } from '../../lib/heroImage.js';

const MAX_LEVEL = 20;

/**
 * Render the Forge Run tab body.
 *
 * @param {object} params
 * @param {import('../../lib/legendaryModel.js').ForgeRunState} params.forgeState
 * @param {{scales:number, favorById:Map<number,number>}} params.userBalances
 * @param {import('../../lib/legendaryModel.js').ClassificationOutput} params.classification
 * @param {object} params.defs
 * @param {object} params.heroesById
 * @param {object} params.effectsById
 * @param {object} params.favorsByCurrencyId
 * @param {number|null} params.favorFilter     active favor filter
 * @param {(id:number|null) => void} params.onFavorFilterChange
 * @param {number} params.selectedDpsId
 * @returns {HTMLElement}
 */
export function render({
  forgeState,
  userBalances,
  classification,
  defs,
  heroesById,
  effectsById,
  favorsByCurrencyId,
  favorFilter,
  onFavorFilterChange,
  selectedDpsId,
}) {
  const container = el('div', {
    class: 'forge-run',
    attrs: {
      role: 'tabpanel',
      id: 'legendary-tabpanel-forge-run',
      'aria-labelledby': 'legendary-tab-forge-run',
    },
  });

  container.appendChild(
    renderFavorPanel({
      breakdown: forgeState.favorBreakdown,
      favorsByCurrencyId,
      favorFilter,
      onFavorFilterChange,
    })
  );

  container.appendChild(
    renderHeroList({
      forgeState,
      favorFilter,
      heroesById,
      effectsById,
      favorsByCurrencyId,
      heroImages: defs.heroImages,
    })
  );

  container.appendChild(
    renderNonContributorDisclosure({
      classification,
      forgeState,
      selectedDpsId,
    })
  );

  return container;
}

// ---------------------------------------------------------------------------
// Favor priority panel
// ---------------------------------------------------------------------------

function renderFavorPanel({ breakdown, favorsByCurrencyId, favorFilter, onFavorFilterChange }) {
  if (!Array.isArray(breakdown) || breakdown.length === 0) {
    return el('div', { class: 'favor-panel favor-panel--empty' }, [
      el('p', {
        class: 'favor-panel__empty',
        text:
          'No favor-gated upgrades available. Either every DPS-affecting legendary is already maxed, or none use a campaign favor currency.',
      }),
    ]);
  }

  const hasActiveFilter = favorFilter != null;

  const header = el('div', { class: 'favor-panel__header' }, [
    el('h3', { class: 'favor-panel__title', text: 'Favor priority' }),
    el('p', {
      class: 'favor-panel__hint',
      text:
        'Ranked by upgrades you can perform now. Tap a row to filter the hero cards below.',
    }),
  ]);

  const list = el(
    'ol',
    { class: 'favor-panel__list', attrs: { role: 'list' } },
    breakdown.map((entry, idx) => {
      const favor = favorsByCurrencyId?.[entry.resetCurrencyId];
      const displayName = favor?.short_name || `Favor #${entry.resetCurrencyId}`;
      const isActive = favorFilter === entry.resetCurrencyId;
      return el(
        'li',
        {
          class: `favor-row${isActive ? ' favor-row--active' : ''}`,
          attrs: { role: 'listitem' },
        },
        [
          el('button', {
            class: 'favor-row__button',
            attrs: {
              type: 'button',
              'aria-pressed': isActive ? 'true' : 'false',
              title: isActive ? 'Clear filter' : `Filter to ${displayName}`,
            },
            on: {
              click: () => onFavorFilterChange(entry.resetCurrencyId),
            },
          }, [
            el('span', { class: 'favor-row__rank', text: `#${idx + 1}` }),
            el('span', { class: 'favor-row__name', text: displayName }),
            el('div', { class: 'favor-row__stats' }, [
              renderFavorStat({
                label: 'Upgradeable',
                value: formatInteger(entry.upgradeableCount),
                tone: entry.upgradeableCount > 0 ? 'pos' : 'muted',
              }),
              renderFavorStat({
                label: 'Affecting',
                value: formatInteger(entry.affectingCount),
              }),
              renderFavorStat({
                label: 'Balance',
                value: formatFavor(entry.currentBalance),
              }),
            ]),
          ]),
        ]
      );
    })
  );

  const clearNode = hasActiveFilter
    ? el('button', {
        class: 'favor-panel__clear',
        attrs: { type: 'button' },
        text: 'Clear filter',
        on: { click: () => onFavorFilterChange(null) },
      })
    : null;

  return el('section', { class: 'favor-panel' }, [header, list, clearNode]);
}

function renderFavorStat({ label, value, tone }) {
  const className = `favor-row__stat${tone ? ` favor-row__stat--${tone}` : ''}`;
  return el('span', { class: className }, [
    el('span', { class: 'favor-row__stat-label', text: label }),
    el('span', { class: 'favor-row__stat-value', text: value }),
  ]);
}

// ---------------------------------------------------------------------------
// Hero list — DPS row first, then supporting heroes
// ---------------------------------------------------------------------------

function renderHeroList({
  forgeState,
  favorFilter,
  heroesById,
  effectsById,
  favorsByCurrencyId,
  heroImages,
}) {
  const heroRows = [];
  if (forgeState.dpsHeroRow) {
    heroRows.push({ ...forgeState.dpsHeroRow, isDps: true });
  }
  for (const h of forgeState.supportingHeroes) {
    heroRows.push({ ...h, isDps: false });
  }

  if (heroRows.length === 0) {
    return el('div', { class: 'hero-list hero-list--empty' }, [
      el('p', {
        class: 'hero-list__empty',
        text:
          "You don't have any legendaries crafted yet for this DPS. Craft a few slots in-game, refresh here, and the planner will fill in.",
      }),
    ]);
  }

  // If a favor filter is active, only keep heroes that have at least one
  // affecting slot tied to that favor. Non-matching heroes drop out of
  // the view entirely; their card wouldn't have any highlightable tiles.
  const filteredRows = heroRows.filter((row) => {
    if (favorFilter == null) return true;
    return row.slots.some(
      (s) => s.affectsDps && s.resetCurrencyId === favorFilter
    );
  });

  if (filteredRows.length === 0) {
    const favorName =
      favorsByCurrencyId?.[favorFilter]?.short_name ?? `Favor #${favorFilter}`;
    return el('div', { class: 'hero-list hero-list--empty' }, [
      el('p', {
        class: 'hero-list__empty',
        text: `No heroes have DPS-affecting slots tied to ${favorName} right now. Clear the filter to see every hero's upgradeable slots.`,
      }),
    ]);
  }

  return el(
    'div',
    { class: 'hero-list' },
    filteredRows.map((row) =>
      renderHeroCard({
        row,
        favorFilter,
        hero: heroesById?.[row.heroId],
        heroImages,
        effectsById,
        favorsByCurrencyId,
      })
    )
  );
}

function renderHeroCard({ row, favorFilter, hero, heroImages, effectsById, favorsByCurrencyId }) {
  const affectingCount = row.slots.filter((s) => s.affectsDps).length;
  const upgradeableCount = row.slots.filter((s) => s.affectsDps && s.upgradeable).length;

  const roleBadge = row.isDps
    ? el('span', { class: 'hero-card__badge hero-card__badge--dps', text: 'DPS' })
    : el('span', { class: 'hero-card__badge', text: 'Supporting' });

  return el(
    'article',
    {
      class: `hero-card${row.isDps ? ' hero-card--dps' : ''}`,
      attrs: { 'data-hero-id': String(row.heroId) },
    },
    [
      el('header', { class: 'hero-card__head' }, [
        renderHeroAvatar(hero, heroImages),
        el('div', { class: 'hero-card__titles' }, [
          el('h4', { class: 'hero-card__name', text: hero?.name ?? `Hero #${row.heroId}` }),
          el('p', {
            class: 'hero-card__sub',
            text: [hero?.race, hero?.class].filter(Boolean).join(' · ') || '—',
          }),
        ]),
        roleBadge,
      ]),
      el(
        'div',
        { class: 'slot-grid', attrs: { role: 'list' } },
        row.slots.map((slot) =>
          renderSlotTile({ slot, favorFilter, effectsById, favorsByCurrencyId })
        )
      ),
      el('footer', { class: 'hero-card__foot' }, [
        el('p', { class: 'hero-card__summary' }, [
          el('strong', { text: formatInteger(affectingCount) }),
          ` affecting · `,
          el('strong', {
            text: formatInteger(upgradeableCount),
            attrs: { 'data-upgradeable': 'true' },
          }),
          ` upgradeable now`,
        ]),
        el('p', {
          class: 'hero-card__hint',
          text: 'Upgrade in-game, then tap Refresh above to sync.',
        }),
      ]),
    ]
  );
}

function renderHeroAvatar(hero, heroImages) {
  if (!hero) {
    return el('div', { class: 'hero-card__avatar hero-card__avatar--empty' });
  }
  const url = heroPortraitUrl(hero.id, heroImages);
  if (url) {
    return el('div', { class: 'hero-card__avatar' }, [
      el('img', {
        class: 'hero-card__avatar-img',
        attrs: {
          src: url,
          alt: '',
          loading: 'lazy',
          decoding: 'async',
        },
      }),
    ]);
  }
  return el('div', { class: 'hero-card__avatar hero-card__avatar--mono' }, [
    el('span', { text: heroMonogram(hero.name) }),
  ]);
}

// ---------------------------------------------------------------------------
// Slot tile — the most information-dense element on this view
// ---------------------------------------------------------------------------

function renderSlotTile({ slot, favorFilter, effectsById, favorsByCurrencyId }) {
  const tileState = classifyTile(slot);
  const tileClasses = ['slot-tile', `slot-tile--${tileState}`];
  if (favorFilter != null && slot.resetCurrencyId === favorFilter && slot.affectsDps) {
    tileClasses.push('slot-tile--filtered');
  }

  const tooltip = buildTileTooltip({ slot, tileState, effectsById, favorsByCurrencyId });

  return el(
    'div',
    {
      class: tileClasses.join(' '),
      attrs: {
        role: 'listitem',
        'data-slot': String(slot.slotIndex),
        'data-state': tileState,
        title: tooltip,
      },
    },
    [
      el('span', { class: 'slot-tile__index', text: String(slot.slotIndex) }),
      renderTileBody({ slot, tileState, favorsByCurrencyId }),
    ]
  );
}

/**
 * Map a slot's shape to a visual state keyword consumed by CSS:
 *
 *   'empty'        — no crafted effect yet
 *   'upgradeable'  — affecting + can upgrade now (gold + cost chip)
 *   'blocked'      — affecting + upgrade blocked (gold muted + need-X chip)
 *   'maxed'        — affecting + level 20 (gold + "MAX")
 *   'not-affecting-supporting' — crafted slot on supporting hero that doesn't
 *                                affect DPS (muted; a reforge candidate, not
 *                                a forge-run action)
 */
function classifyTile(slot) {
  if (slot.currentEffectId == null) return 'empty';
  if (!slot.affectsDps) return 'not-affecting';
  if (slot.equippedLevel >= MAX_LEVEL) return 'maxed';
  if (slot.upgradeable) return 'upgradeable';
  return 'blocked';
}

function renderTileBody({ slot, tileState, favorsByCurrencyId }) {
  switch (tileState) {
    case 'empty':
      return el('div', { class: 'slot-tile__body' }, [
        el('span', { class: 'slot-tile__label', text: 'Craft' }),
      ]);
    case 'maxed':
      return el('div', { class: 'slot-tile__body' }, [
        el('span', { class: 'slot-tile__level', text: 'MAX' }),
      ]);
    case 'not-affecting':
      return el('div', { class: 'slot-tile__body' }, [
        el('span', { class: 'slot-tile__level', text: `L${slot.equippedLevel}` }),
      ]);
    case 'upgradeable':
    case 'blocked':
    default:
      return el('div', { class: 'slot-tile__body' }, [
        el('span', { class: 'slot-tile__level', text: `L${slot.equippedLevel}` }),
        renderCostRow(slot, favorsByCurrencyId),
      ]);
  }
}

function renderCostRow(slot, favorsByCurrencyId) {
  const favorName =
    favorsByCurrencyId?.[slot.resetCurrencyId]?.short_name ??
    (slot.resetCurrencyId ? `#${slot.resetCurrencyId}` : '');

  return el('div', { class: 'slot-tile__cost' }, [
    el('span', {
      class: 'slot-tile__cost-scales',
      text: formatCompact(slot.upgradeCost),
      attrs: { title: `${formatInteger(slot.upgradeCost)} Scales of Tiamat` },
    }),
    slot.upgradeFavorCost > 0 &&
      el('span', {
        class: 'slot-tile__cost-favor',
        text: favorName ? `${formatCompact(slot.upgradeFavorCost)} ${favorName}` : formatCompact(slot.upgradeFavorCost),
        attrs: {
          title: `${formatFavor(slot.upgradeFavorCost)} favor${favorName ? ` (${favorName})` : ''}`,
        },
      }),
  ]);
}

function buildTileTooltip({ slot, tileState, effectsById, favorsByCurrencyId }) {
  if (tileState === 'empty') {
    return 'Empty slot — craft this in-game to unlock upgrades.';
  }

  const effect = effectsById?.[slot.currentEffectId];
  const effectDescription = effect
    ? resolveDescription(effect.description)
    : `Effect #${slot.currentEffectId}`;
  const favorName = favorsByCurrencyId?.[slot.resetCurrencyId]?.short_name;

  const lines = [];
  lines.push(`${effectDescription} · Level ${slot.equippedLevel}`);

  if (tileState === 'maxed') {
    lines.push('Maxed (L20) — no further upgrades available.');
  } else if (!slot.affectsDps) {
    lines.push("Does not affect the selected DPS (see Reforge tab for reroll options).");
  } else if (tileState === 'upgradeable') {
    const parts = [`Upgrade cost: ${formatInteger(slot.upgradeCost)} Scales`];
    if (slot.upgradeFavorCost > 0) {
      parts.push(
        `${formatFavor(slot.upgradeFavorCost)} ${favorName || 'favor'}`
      );
    }
    lines.push(parts.join(' + '));
    lines.push('Upgrade in-game, then tap Refresh above to sync.');
  } else if (tileState === 'blocked') {
    const parts = [`Next upgrade: ${formatInteger(slot.upgradeCost)} Scales`];
    if (slot.upgradeFavorCost > 0) {
      parts.push(
        `${formatFavor(slot.upgradeFavorCost)} ${favorName || 'favor'}`
      );
    }
    lines.push(parts.join(' + '));
    lines.push('Blocked — insufficient Scales or favor balance right now.');
  }

  return lines.join('\n');
}

/**
 * Substitute the `$amount` / `$(amount)` placeholder with the word "X%" so
 * the tooltip reads sensibly without us needing to resolve the actual
 * per-level percentage (that lives on the in-game effect data, not on our
 * bundled `description` template).
 */
function resolveDescription(template) {
  if (typeof template !== 'string') return '';
  return template.replace(/\$\(?amount\)?%?/g, 'X%');
}

// ---------------------------------------------------------------------------
// Bottom disclosure — "N champions contribute nothing"
// ---------------------------------------------------------------------------

function renderNonContributorDisclosure({ classification, forgeState, selectedDpsId }) {
  // Count supporting heroes that have no DPS-affecting slots at all —
  // they never appear in the card list above. Reforge-candidate heroes
  // surface in the Reforge tab instead, so this count deliberately
  // includes them too (they're still "not contributing to Forge Run").
  const supportingAll = classification.supportingHeroes.length;
  const supportingShown = forgeState.supportingHeroes.length;
  const notContributing = Math.max(0, supportingAll - supportingShown);

  if (notContributing === 0) return null;

  return el(
    'details',
    { class: 'non-contributors', attrs: { 'aria-label': 'Hidden heroes' } },
    [
      el('summary', {
        class: 'non-contributors__summary',
        text: `${formatInteger(notContributing)} champion${notContributing === 1 ? '' : 's'} contribute nothing to this DPS`,
      }),
      el('p', {
        class: 'non-contributors__body',
        text:
          'These heroes have no equipped slot that affects the selected DPS. Candidates with rerollable slots appear in the Reforge tab.',
      }),
    ]
  );
}
