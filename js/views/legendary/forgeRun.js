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
  formatScientific,
  formatFavor,
} from '../../lib/format.js';
import { heroPortraitUrl, heroMonogram } from '../../lib/heroImage.js';
import {
  scopeTagLabel,
  scopeTagKind,
  effectCurrentAmount,
  effectQualifier,
  substituteAmount,
} from '../../lib/effectFormat.js';
import { idealAdventureForFavor } from '../../lib/idealAdventures.js';

const MAX_LEVEL = 20;

/**
 * Level-target milestones the player can pick from. Kept here (not in the
 * model) because they're a UI choice — the model just consumes whichever
 * integer we pass as `levelTarget`. `coerceLevelTarget()` in
 * legendary/index.js validates against this set, so any change here must
 * be mirrored there.
 *
 * Players typically grind milestones in this order: L5 → L10 → L20. The
 * default is 20 ("level all the way") so first-time users see the same
 * panel they did before this knob landed.
 */
const LEVEL_TARGET_OPTIONS = [5, 10, 20];

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
 * @param {number} params.levelTarget          milestone the player is planning toward (5/10/20)
 * @param {(target:number) => void} params.onLevelTargetChange
 * @param {boolean} params.favoritesOnly        if true, hide non-favorited heroes
 * @param {(next:boolean) => void} params.onFavoritesOnlyChange
 * @param {Set<number>} params.favorites        set of favorited hero IDs
 * @param {(heroId:number) => void} params.onFavoriteToggle
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
  levelTarget,
  onLevelTargetChange,
  favoritesOnly,
  onFavoritesOnlyChange,
  favorites,
  onFavoriteToggle,
  selectedDpsId,
}) {
  // Build the container via el() with a children array so null returns
  // from any child renderer (e.g. renderNonContributorDisclosure when
  // every hero contributes — small rosters, well-supported DPS) are
  // silently filtered by appendChildren() instead of throwing
  // "appendChild: parameter 1 is not of type 'Node'".
  return el(
    'div',
    {
      class: 'forge-run',
      attrs: {
        role: 'tabpanel',
        id: 'legendary-tabpanel-forge-run',
        'aria-labelledby': 'legendary-tab-forge-run',
      },
    },
    [
      renderFavorPanel({
        breakdown: forgeState.favorBreakdown,
        favorsByCurrencyId,
        favorFilter,
        onFavorFilterChange,
        levelTarget,
        onLevelTargetChange,
        favoritesOnly,
        onFavoritesOnlyChange,
      }),
      renderHeroList({
        forgeState,
        favorFilter,
        heroesById,
        effectsById,
        favorsByCurrencyId,
        heroImages: defs.heroImages,
        levelTarget,
        favoritesOnly,
        favorites,
        onFavoriteToggle,
      }),
      renderNonContributorDisclosure({
        classification,
        forgeState,
        selectedDpsId,
      }),
    ]
  );
}

// ---------------------------------------------------------------------------
// Favor priority panel
// ---------------------------------------------------------------------------

function renderFavorPanel({
  breakdown,
  favorsByCurrencyId,
  favorFilter,
  onFavorFilterChange,
  levelTarget,
  onLevelTargetChange,
  favoritesOnly,
  onFavoritesOnlyChange,
}) {
  // Header (incl. target switcher) renders even on empty breakdowns so the
  // user can re-pick the target without losing the panel chrome.
  const header = renderFavorPanelHeader({
    levelTarget,
    onLevelTargetChange,
    favoritesOnly,
    onFavoritesOnlyChange,
  });

  if (!Array.isArray(breakdown) || breakdown.length === 0) {
    return el('section', { class: 'favor-panel favor-panel--empty' }, [
      header,
      el('p', {
        class: 'favor-panel__empty',
        text:
          levelTarget < MAX_LEVEL
            ? `Every DPS-affecting legendary is already at L${levelTarget}+ — bump the target to keep planning.`
            : 'No favor-gated upgrades available. Either every DPS-affecting legendary is already maxed, or none use a campaign favor currency.',
      }),
    ]);
  }

  const hasActiveFilter = favorFilter != null;

  const list = el(
    'ol',
    { class: 'favor-panel__list', attrs: { role: 'list' } },
    breakdown.map((entry, idx) => {
      const favor = favorsByCurrencyId?.[entry.resetCurrencyId];
      const displayName = favor?.short_name || `Favor #${entry.resetCurrencyId}`;
      const isActive = favorFilter === entry.resetCurrencyId;
      const idealAdventure = idealAdventureForFavor(entry.resetCurrencyId);
      const titleChildren = [
        el('span', { class: 'favor-row__name', text: displayName }),
      ];
      if (idealAdventure) {
        titleChildren.push(
          el('span', {
            class: 'favor-row__sub',
            text: `Ideal adventure: ${idealAdventure}`,
          })
        );
      }
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
            el('div', { class: 'favor-row__title' }, titleChildren),
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

/**
 * Header chrome for the favor priority panel: title, hint copy, the
 * level-target pill row, and the "favorites only" toggle. Pulled out of
 * `renderFavorPanel` so the empty state can re-use the same chrome (the
 * user can still switch milestones even when no favors are eligible at
 * the current target).
 */
function renderFavorPanelHeader({
  levelTarget,
  onLevelTargetChange,
  favoritesOnly,
  onFavoritesOnlyChange,
}) {
  const target = LEVEL_TARGET_OPTIONS.includes(levelTarget) ? levelTarget : MAX_LEVEL;

  const hint =
    target < MAX_LEVEL
      ? `Ranked by below-L${target} upgrades you can perform now. Tap a row to filter the hero cards below.`
      : 'Ranked by upgrades you can perform now. Tap a row to filter the hero cards below.';

  const pills = LEVEL_TARGET_OPTIONS.map((option) => {
    const isActive = option === target;
    const label = option === MAX_LEVEL ? 'L20 (max)' : `L${option}`;
    return el('button', {
      class: `level-target__pill${isActive ? ' level-target__pill--active' : ''}`,
      attrs: {
        type: 'button',
        'aria-pressed': isActive ? 'true' : 'false',
        title: option === MAX_LEVEL
          ? 'Plan upgrades all the way to MAX (L20)'
          : `Plan upgrades up to L${option}`,
      },
      text: label,
      on: { click: () => onLevelTargetChange(option) },
    });
  });

  // "Favorites only" toggle. Lives in the same control row as the L5/10/20
  // pills because it's the same kind of "narrow the hero list" knob from
  // the user's perspective. The heart icon mirrors the per-card heart so
  // the visual association is obvious.
  const favoritesToggle = el(
    'button',
    {
      class: `favorites-toggle${favoritesOnly ? ' favorites-toggle--active' : ''}`,
      attrs: {
        type: 'button',
        'aria-pressed': favoritesOnly ? 'true' : 'false',
        title: favoritesOnly
          ? 'Showing favorites only — click to show every hero'
          : 'Show favorites only',
      },
      on: { click: () => onFavoritesOnlyChange(!favoritesOnly) },
    },
    [
      renderHeartIcon({ filled: favoritesOnly }),
      el('span', { text: 'Favorites only' }),
    ]
  );

  return el('div', { class: 'favor-panel__header' }, [
    el('div', { class: 'favor-panel__header-row' }, [
      el('h3', { class: 'favor-panel__title', text: 'Favor priority' }),
      el('div', { class: 'favor-panel__controls' }, [
        favoritesToggle,
        el('div', { class: 'level-target', attrs: { role: 'group', 'aria-label': 'Level target' } }, [
          el('span', { class: 'level-target__label', text: 'Target:' }),
          ...pills,
        ]),
      ]),
    ]),
    el('p', { class: 'favor-panel__hint', text: hint }),
  ]);
}

/**
 * Heart SVG used by the per-card favorite button and the "favorites only"
 * toggle. `filled` swaps between an outline (not favorite) and a solid
 * (favorite). Inline so we don't add another asset to the cache-busting
 * checklist.
 */
function renderHeartIcon({ filled }) {
  // 16x16 to match the existing inline SVGs in index.html.
  // Outline path: a stroked heart silhouette.
  // Filled path: same silhouette filled solid.
  const svg = el('span', {
    class: `favorite-heart${filled ? ' favorite-heart--filled' : ''}`,
    attrs: { 'aria-hidden': 'true' },
  });
  // Build the SVG via innerHTML — `el()` doesn't have a clean way to set
  // attributes on nested SVG primitives, and these are static strings.
  svg.innerHTML = filled
    ? '<svg viewBox="0 0 16 16" width="14" height="14"><path fill="currentColor" d="M8 14.5s-5.5-3.4-5.5-7.5C2.5 5 4 3.5 6 3.5c1 0 1.7.4 2 1 .3-.6 1-1 2-1 2 0 3.5 1.5 3.5 3.5 0 4.1-5.5 7.5-5.5 7.5z"/></svg>'
    : '<svg viewBox="0 0 16 16" width="14" height="14"><path fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" d="M8 13.5s-5-3-5-6.7C3 5 4.3 3.8 6 3.8c1 0 1.7.5 2 1.2.3-.7 1-1.2 2-1.2 1.7 0 3 1.2 3 3 0 3.7-5 6.7-5 6.7z"/></svg>';
  return svg;
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
  levelTarget,
  favoritesOnly,
  favorites,
  onFavoriteToggle,
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

  // Filter heroes based on favor + level-target + favorites constraints.
  //
  // Favor + level-target combine when both are active: a hero must have at
  // least one DPS-affecting slot that is (a) tied to the selected favor AND
  // (b) below the target level. This prevents heroes from showing up for a
  // favor when their slot for THAT favor is already past the milestone, even
  // if they have other below-target slots for different favors.
  //
  // Favorites-only is an independent layer applied after the slot-based
  // filters: keep only heroes whose ID is in the favorites set.
  //
  // The DPS hero is exempt from the favorites-only filter — they're the
  // anchor of the whole view, hiding them would be confusing.

  let filteredRows = heroRows;

  if (favorFilter != null && levelTarget < MAX_LEVEL) {
    filteredRows = filteredRows.filter((row) =>
      row.slots.some(
        (s) =>
          s.affectsDps &&
          s.resetCurrencyId === favorFilter &&
          s.equippedLevel < levelTarget
      )
    );
  } else if (favorFilter != null) {
    filteredRows = filteredRows.filter((row) =>
      row.slots.some((s) => s.affectsDps && s.resetCurrencyId === favorFilter)
    );
  } else if (levelTarget < MAX_LEVEL) {
    filteredRows = filteredRows.filter((row) =>
      row.slots.some((s) => s.affectsDps && s.equippedLevel < levelTarget)
    );
  }

  if (favoritesOnly && favorites instanceof Set) {
    filteredRows = filteredRows.filter(
      (row) => row.isDps || favorites.has(row.heroId)
    );
  }

  if (filteredRows.length === 0) {
    // Tailor the empty-state message to whichever filter triggered it.
    let emptyText;
    if (favoritesOnly) {
      emptyText =
        "No favorited heroes match the current filters. Tap a heart on a hero card to add favorites, or turn off 'Favorites only' to see every hero.";
    } else if (favorFilter != null && levelTarget < MAX_LEVEL) {
      const favorName =
        favorsByCurrencyId?.[favorFilter]?.short_name ?? `Favor #${favorFilter}`;
      emptyText = `No heroes have below-L${levelTarget} DPS-affecting slots tied to ${favorName}. Clear the favor filter or bump the target to see more.`;
    } else if (favorFilter != null) {
      const favorName =
        favorsByCurrencyId?.[favorFilter]?.short_name ?? `Favor #${favorFilter}`;
      emptyText = `No heroes have DPS-affecting slots tied to ${favorName} right now. Clear the filter to see every hero's upgradeable slots.`;
    } else {
      emptyText = `Every hero's DPS-affecting slots are already at L${levelTarget}+. Bump the target to keep planning.`;
    }
    return el('div', { class: 'hero-list hero-list--empty' }, [
      el('p', { class: 'hero-list__empty', text: emptyText }),
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
        levelTarget,
        isFavorite: favorites instanceof Set && favorites.has(row.heroId),
        onFavoriteToggle,
      })
    )
  );
}

function renderHeroCard({
  row,
  favorFilter,
  hero,
  heroImages,
  effectsById,
  favorsByCurrencyId,
  levelTarget,
  isFavorite,
  onFavoriteToggle,
}) {
  const affectingCount = row.slots.filter((s) => s.affectsDps).length;
  const upgradeableCount = row.slots.filter((s) => s.affectsDps && s.upgradeable).length;

  const roleBadge = row.isDps
    ? el('span', { class: 'hero-card__badge hero-card__badge--dps', text: 'DPS' })
    : el('span', { class: 'hero-card__badge', text: 'Supporting' });

  const heroName = hero?.name ?? `Hero #${row.heroId}`;
  const favoriteBtn = el(
    'button',
    {
      class: `hero-card__favorite${isFavorite ? ' hero-card__favorite--active' : ''}`,
      attrs: {
        type: 'button',
        'aria-pressed': isFavorite ? 'true' : 'false',
        'aria-label': isFavorite
          ? `Remove ${heroName} from favorites`
          : `Mark ${heroName} as a favorite`,
        title: isFavorite ? 'Remove from favorites' : 'Mark as favorite',
      },
      on: {
        click: (e) => {
          // Stop bubbling — the card itself isn't clickable today, but
          // future ambient handlers shouldn't pick this up.
          e.stopPropagation();
          if (typeof onFavoriteToggle === 'function') {
            onFavoriteToggle(row.heroId);
          }
        },
      },
    },
    [renderHeartIcon({ filled: !!isFavorite })]
  );

  return el(
    'article',
    {
      class: `hero-card${row.isDps ? ' hero-card--dps' : ''}${
        isFavorite ? ' hero-card--favorite' : ''
      }`,
      attrs: { 'data-hero-id': String(row.heroId) },
    },
    [
      el('header', { class: 'hero-card__head' }, [
        renderHeroAvatar(hero, heroImages),
        el('div', { class: 'hero-card__titles' }, [
          el('h4', { class: 'hero-card__name', text: heroName }),
          el('p', {
            class: 'hero-card__sub',
            text: [hero?.race, hero?.class].filter(Boolean).join(' · ') || '—',
          }),
        ]),
        favoriteBtn,
        roleBadge,
      ]),
      el(
        'div',
        { class: 'slot-grid', attrs: { role: 'list' } },
        row.slots.map((slot) =>
          renderSlotTile({ slot, favorFilter, effectsById, favorsByCurrencyId, levelTarget })
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

function renderSlotTile({ slot, favorFilter, effectsById, favorsByCurrencyId, levelTarget }) {
  const tileState = classifyTile(slot, levelTarget);
  const tileClasses = ['slot-tile', `slot-tile--${tileState}`];
  if (favorFilter != null && slot.resetCurrencyId === favorFilter && slot.affectsDps) {
    tileClasses.push('slot-tile--filtered');
  }

  const effect = slot.currentEffectId != null ? effectsById?.[slot.currentEffectId] : null;
  const currentAmount = effect ? effectCurrentAmount(effect, slot.equippedLevel) : null;
  const qualifier = effect ? effectQualifier(effect.description) : null;

  const tooltip = buildTileTooltip({
    slot,
    tileState,
    effect,
    currentAmount,
    favorsByCurrencyId,
    levelTarget,
  });

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
      renderTileBody({ slot, tileState, currentAmount, qualifier, favorsByCurrencyId }),
    ]
  );
}

/**
 * Map a slot's shape to a visual state keyword consumed by CSS:
 *
 *   'empty'         — no crafted effect yet
 *   'maxed'         — affecting + level 20 (gold + "MAX")
 *   'beyond-target' — affecting + level >= target but < 20 (only fires when
 *                     a milestone target is active; tile reads as "done for
 *                     this milestone, no action required")
 *   'upgradeable'   — affecting + below target + can upgrade now (gold + cost chip)
 *   'blocked'       — affecting + below target + upgrade blocked (gold muted + need-X chip)
 *   'not-affecting' — crafted slot that doesn't affect DPS (muted; a reforge
 *                     candidate, not a forge-run action)
 *
 * `levelTarget` defaults to MAX_LEVEL — the legacy "level all the way"
 * behaviour, which means `'beyond-target'` is never emitted.
 */
function classifyTile(slot, levelTarget = MAX_LEVEL) {
  if (slot.currentEffectId == null) return 'empty';
  if (!slot.affectsDps) return 'not-affecting';
  if (slot.equippedLevel >= MAX_LEVEL) return 'maxed';
  if (levelTarget < MAX_LEVEL && slot.equippedLevel >= levelTarget) return 'beyond-target';
  if (slot.upgradeable) return 'upgradeable';
  return 'blocked';
}

function renderTileBody({ slot, tileState, currentAmount, qualifier, favorsByCurrencyId }) {
  if (tileState === 'empty') {
    return el('div', { class: 'slot-tile__body' }, [
      el('span', { class: 'slot-tile__label', text: 'Craft' }),
    ]);
  }

  // Every crafted tile shares the same top section: level + current-amount
  // chip on one line, scope tag on the next. A qualifier line ("per CHA ≥15",
  // "per Human", …) only renders for effects whose description has a
  // `for each` clause — otherwise it's omitted to keep the tile compact.
  // The cost row is only appended for upgradeable/blocked states (maxed,
  // beyond-target, and not-affecting have nothing to upgrade).
  const levelText =
    tileState === 'maxed'
      ? 'MAX'
      : tileState === 'beyond-target'
        ? `L${slot.equippedLevel} ✓`
        : `L${slot.equippedLevel}`;

  const levelRow = el('div', { class: 'slot-tile__level-row' }, [
    el('span', { class: 'slot-tile__level', text: levelText }),
    renderAmountChip(currentAmount),
  ]);

  const tagChip = renderScopeTag(slot.scope, qualifier);

  const children = [levelRow, tagChip];
  if (tileState === 'upgradeable' || tileState === 'blocked') {
    children.push(renderCostRow(slot, favorsByCurrencyId));
  }

  return el('div', { class: 'slot-tile__body' }, children);
}

function renderAmountChip(currentAmount) {
  if (currentAmount == null) return null;
  // Scientific notation rather than K/M/B compact: legendary scaling is
  // geometric, so adjacent levels look identical under compact ("65M" vs.
  // "131M" both round to the same eyeball read) but read clearly apart in
  // exponential form. The tile-level tooltip carries the exact number.
  return el('span', {
    class: 'slot-tile__amount',
    text: `+${formatScientific(currentAmount)}%`,
  });
}

function renderScopeTag(scope, qualifier) {
  const kind = scopeTagKind(scope);
  const label = scopeTagLabel(scope);
  // Qualifier (e.g. "per CHA ≥15") folds into the same pill so the player
  // reads "ALL per CHA ≥15" as a single unit rather than a tag plus a
  // floating caption. The qualifier text already includes the "per " prefix
  // — we just join with a space.
  const text = qualifier ? `${label} ${qualifier}` : label;
  return el('span', {
    class: `slot-tile__tag slot-tile__tag--${kind}`,
    text,
  });
}

function renderCostRow(slot, favorsByCurrencyId) {
  const favorName =
    favorsByCurrencyId?.[slot.resetCurrencyId]?.short_name ??
    (slot.resetCurrencyId ? `#${slot.resetCurrencyId}` : '');

  // Per-element titles intentionally omitted — the tile container carries
  // a single tooltip (`buildTileTooltip`) that already lists the exact
  // Scales + favor breakdown alongside the effect description, so nesting
  // sub-tooltips would show a redundant bubble whenever a player's pointer
  // happened to land on a chip rather than the tile background.
  return el('div', { class: 'slot-tile__cost' }, [
    el('span', {
      class: 'slot-tile__cost-scales',
      text: formatCompact(slot.upgradeCost),
    }),
    slot.upgradeFavorCost > 0 &&
      el('span', {
        class: 'slot-tile__cost-favor',
        text: favorName ? `${formatCompact(slot.upgradeFavorCost)} ${favorName}` : formatCompact(slot.upgradeFavorCost),
      }),
  ]);
}

function buildTileTooltip({ slot, tileState, effect, currentAmount, favorsByCurrencyId, levelTarget }) {
  if (tileState === 'empty') {
    return 'Empty slot — craft this in-game to unlock upgrades.';
  }

  // Substitute the real, level-scaled amount into the description rather
  // than a placeholder ("X"). The live description templates already include
  // a literal "%" after the placeholder (e.g. "by $amount%"), so we pass
  // the bare number and let the template's own "%" supply the symbol —
  // otherwise we'd render "by 625%%". When we can't compute the amount
  // (unknown effect, malformed effect_string), substitute "N/A" so the
  // placeholder never leaks to the UI.
  const amountText =
    currentAmount != null ? formatInteger(currentAmount) : 'N/A';
  const effectDescription = effect?.description
    ? substituteAmount(effect.description, amountText)
    : `Effect #${slot.currentEffectId}`;
  const favorName = favorsByCurrencyId?.[slot.resetCurrencyId]?.short_name;

  const lines = [];
  lines.push(`${effectDescription} · Level ${slot.equippedLevel}`);

  if (tileState === 'maxed') {
    lines.push('Maxed (L20) — no further upgrades available.');
  } else if (tileState === 'beyond-target') {
    lines.push(
      `Already past target (L${slot.equippedLevel} ≥ L${levelTarget ?? MAX_LEVEL}) — bump the target to plan further upgrades.`
    );
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
