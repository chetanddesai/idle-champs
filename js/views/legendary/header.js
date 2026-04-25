/**
 * legendary/header.js — shared chrome above the Forge Run / Reforge tabs.
 *
 * Three rows, always visible regardless of which tab is active:
 *
 *   Row 1 — DPS selector (PRD §3.2.3, FR-7, Appendix B #11):
 *     <select> populated from `buildDpsOptions(defs.heroes, userHeroes)`,
 *     alphabetized, filtered to owned heroes that carry the 'dps' tag.
 *     Right-aligned: a Scales of Tiamat balance badge.
 *
 *   Row 2 — Classification chip row:
 *     Renders the five axes the scope matcher reads — race, gender,
 *     alignment, damage_type(s), ability scores (STR/DEX/CON/INT/WIS/CHA).
 *     Wraps to two lines at 480px. The chips are intentionally
 *     non-interactive; they exist so the user understands *why* a given
 *     legendary does or doesn't affect their pick.
 *
 *   Row 3 — Tab switcher ("Forge Run" | "Reforge"):
 *     A segmented-control-style pair of buttons. ARIA role="tablist".
 *
 *   (Before row 1 when a DPS is selected) a large portrait tile showing
 *   the hero's image + name + class/race — so the card feels grounded in
 *   a specific champion rather than a bare dropdown.
 *
 * All DOM-level event handling dispatches up to the parent view via the
 * `onDpsChange` and `onTabChange` callbacks so `legendary/index.js`
 * remains the sole owner of routing + persistence decisions.
 */

import { el } from '../../lib/dom.js';
import { formatInteger } from '../../lib/format.js';
import { heroPortraitUrl, heroMonogram } from '../../lib/heroImage.js';

/**
 * Render the legendary-card header.
 *
 * @param {object} params
 * @param {object} params.defs               - bundled defs bag (heroes, effects, scopes, favors, heroImages)
 * @param {object} params.heroesById         - {[id]: heroDef}
 * @param {object} params.userDetails        - getuserdetails.details
 * @param {Array<{id:number,name:string,hero:object}>} params.dpsOptions
 * @param {number|null} params.selectedDpsId
 * @param {'forge-run'|'reforge'} params.activeTab
 * @param {(newDpsId:number) => void} params.onDpsChange
 * @param {(newTab:string) => void} params.onTabChange
 * @returns {HTMLElement}
 */
export function render({
  defs,
  heroesById,
  userDetails,
  dpsOptions,
  selectedDpsId,
  activeTab,
  onDpsChange,
  onTabChange,
}) {
  const selectedHero = selectedDpsId != null ? heroesById?.[selectedDpsId] : null;
  const scalesBalance = Number(userDetails?.stats?.multiplayer_points ?? 0);

  return el('header', { class: 'legendary-header' }, [
    renderPortraitRow({ selectedHero, heroImages: defs.heroImages }),
    renderSelectorRow({ dpsOptions, selectedDpsId, onDpsChange, scalesBalance }),
    selectedHero && renderChipRow(selectedHero),
    renderTabSwitcher({ activeTab, onTabChange, disabled: selectedDpsId == null }),
  ]);
}

// ---------------------------------------------------------------------------
// Row 0 — hero portrait block
// ---------------------------------------------------------------------------

function renderPortraitRow({ selectedHero, heroImages }) {
  if (!selectedHero) return null;
  const url = heroPortraitUrl(selectedHero.id, heroImages);
  const subtitle = [selectedHero.race, selectedHero.class].filter(Boolean).join(' · ');

  return el('div', { class: 'legendary-header__hero' }, [
    el('div', { class: 'legendary-header__portrait' }, [
      url
        ? el('img', {
            class: 'legendary-header__portrait-img',
            attrs: {
              src: url,
              alt: `${selectedHero.name} portrait`,
              loading: 'lazy',
              decoding: 'async',
            },
          })
        : el('span', {
            class: 'legendary-header__portrait-monogram',
            text: heroMonogram(selectedHero.name),
          }),
    ]),
    el('div', { class: 'legendary-header__hero-meta' }, [
      el('h2', { class: 'legendary-header__hero-name', text: selectedHero.name }),
      subtitle && el('p', { class: 'legendary-header__hero-sub', text: subtitle }),
    ]),
  ]);
}

// ---------------------------------------------------------------------------
// Row 1 — DPS dropdown + Scales badge
// ---------------------------------------------------------------------------

function renderSelectorRow({ dpsOptions, selectedDpsId, onDpsChange, scalesBalance }) {
  const selectId = 'legendary-dps-select';
  const isEmpty = dpsOptions.length === 0;

  const select = el('select', {
    class: 'legendary-header__select',
    attrs: {
      id: selectId,
      name: 'legendary-dps',
      disabled: isEmpty || null,
    },
    on: {
      change: (ev) => {
        const val = Number(ev.target.value);
        if (Number.isFinite(val)) onDpsChange(val);
      },
    },
  });

  const placeholder = el('option', {
    attrs: {
      value: '',
      disabled: true,
      selected: selectedDpsId == null ? true : null,
    },
    text: isEmpty ? 'No DPS-tagged heroes owned yet' : 'Pick your DPS champion…',
  });
  select.appendChild(placeholder);

  for (const opt of dpsOptions) {
    const race = opt.hero.race ? ` · ${opt.hero.race}` : '';
    const cls = opt.hero.class ? `${opt.hero.class}` : '';
    const suffix = [cls, opt.hero.race].filter(Boolean).join(' · ');
    const label = suffix ? `${opt.name} — ${suffix}` : opt.name;
    const option = el('option', {
      attrs: {
        value: String(opt.id),
        selected: opt.id === selectedDpsId ? true : null,
      },
      text: label,
    });
    select.appendChild(option);
  }

  return el('div', { class: 'legendary-header__selector-row' }, [
    el('label', {
      class: 'legendary-header__select-label',
      attrs: { for: selectId },
      text: 'DPS champion',
    }),
    select,
    el(
      'div',
      {
        class: 'legendary-header__scales',
        attrs: { role: 'status', 'aria-label': 'Scales of Tiamat balance' },
      },
      [
        el('span', { class: 'legendary-header__scales-label', text: 'Scales' }),
        el('span', {
          class: 'legendary-header__scales-value',
          text: formatInteger(scalesBalance),
        }),
      ]
    ),
  ]);
}

// ---------------------------------------------------------------------------
// Row 2 — classification chip row (the five axes the matcher reads)
// ---------------------------------------------------------------------------

const TAG_LABELS = {
  race: [
    'human', 'dwarf', 'elf', 'half-elf', 'halfling', 'dragonborn', 'tiefling', 'warforged',
    'gnome', 'kobold', 'aasimar', 'aarakocra', 'tabaxi', 'tortle', 'firbolg', 'gith',
    'githyanki', 'giff', 'plasmoid', 'goliath', 'genasi', 'goblin', 'minotaur',
    'lizardfolk', 'saurial', 'yuan-ti', 'half-orc', 'orc', 'half-elven',
  ],
  gender: ['male', 'female', 'nonbinary'],
  alignment: ['lawful', 'neutral', 'chaotic', 'good', 'evil', 'lcneutral'],
};

const STAT_ORDER = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
const STAT_LABELS = {
  str: 'STR', dex: 'DEX', con: 'CON', int: 'INT', wis: 'WIS', cha: 'CHA',
};

function renderChipRow(hero) {
  const tags = Array.isArray(hero.tags) ? hero.tags : [];
  const damageTypes = Array.isArray(hero.damage_types) ? hero.damage_types : [];
  const scores = hero.ability_scores || {};

  const race = tags.find((t) => TAG_LABELS.race.includes(t));
  const gender = tags.find((t) => TAG_LABELS.gender.includes(t));

  // Alignment is two-word — a hero tagged ["chaotic","good"] should render
  // "Chaotic Good", not just the first one found. Skip the merged
  // "lcneutral" metatag which the game uses for "any neutral".
  const alignmentTokens = tags.filter(
    (t) => TAG_LABELS.alignment.includes(t) && t !== 'lcneutral'
  );
  const alignment = alignmentTokens.map(toTitleCase).join(' ');

  const chips = [];
  if (race) chips.push({ kind: 'race', label: toTitleCase(race) });
  if (gender) chips.push({ kind: 'gender', label: toTitleCase(gender) });
  if (alignment) chips.push({ kind: 'alignment', label: alignment });
  for (const dt of damageTypes) chips.push({ kind: 'damage', label: toTitleCase(dt) });

  // Ability scores — render all six, dim if low. Readers learn which
  // stat-thresholds this hero clears just by scanning the values.
  for (const stat of STAT_ORDER) {
    const val = scores[stat];
    if (typeof val === 'number') {
      chips.push({ kind: 'stat', label: `${STAT_LABELS[stat]} ${val}`, stat, value: val });
    }
  }

  return el(
    'div',
    { class: 'legendary-header__chip-row', attrs: { role: 'list', 'aria-label': 'Classification' } },
    chips.map((c) =>
      el('span', {
        class: `chip chip--${c.kind}`,
        attrs: { role: 'listitem' },
        text: c.label,
      })
    )
  );
}

function toTitleCase(s) {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------------------------------------------------------------------------
// Row 3 — tab switcher
// ---------------------------------------------------------------------------

function renderTabSwitcher({ activeTab, onTabChange, disabled }) {
  const mkTab = (id, label) => {
    const isActive = activeTab === id;
    return el('button', {
      class: `legendary-tabs__tab${isActive ? ' legendary-tabs__tab--active' : ''}`,
      attrs: {
        type: 'button',
        role: 'tab',
        'aria-selected': isActive ? 'true' : 'false',
        'aria-controls': `legendary-tabpanel-${id}`,
        id: `legendary-tab-${id}`,
        disabled: disabled ? true : null,
      },
      on: { click: () => onTabChange(id) },
      text: label,
    });
  };

  return el(
    'div',
    { class: 'legendary-tabs', attrs: { role: 'tablist', 'aria-label': 'Legendary view tabs' } },
    [mkTab('forge-run', 'Forge Run'), mkTab('reforge', 'Reforge')]
  );
}
