/**
 * effectFormat.js — pure presentation helpers for legendary-effect data
 * surfaced on the Forge Run / Reforge tiles.
 *
 * Two separate concerns live here because they both fall out of the same
 * `{scope, effect, level}` trio, but they're formatted on different surfaces:
 *
 *   1. Scope → tag label + tone kind   (which champions does this effect buff?)
 *   2. Effect + level → current amount (how much damage bonus is it applying
 *                                       right now, at the equipped level?)
 *
 * Both are total functions: invalid/missing input returns a safe placeholder
 * rather than throwing, so a single weird fixture never breaks the whole
 * card.
 *
 * Scope semantics come from `js/lib/scopeMatcher.js`; the `kind` values are:
 *   'global' | 'race' | 'gender' | 'alignment' | 'damage_type'
 *   | 'stat_threshold' | 'unknown'
 *
 * Effect record fields used:
 *   - effect_string: '<type>,<base>' e.g. "hero_dps_multiplier_mult,125"
 *   - description:   template with `$amount` or `$(amount)` placeholders
 *
 * Scaling rule (docs/server-calls.md §"Resolving legendary effect IDs"):
 *   amount_at_level_N  =  base × N
 *
 * There is no polynomial/diminishing-returns term in the live data — the
 * multiplier is strictly linear in level. We preserve that semantic here
 * rather than re-deriving it from the formula in the view.
 */

const PLACEHOLDER = '?';

/**
 * Short human-readable label describing the scope of a legendary effect.
 * Designed for a compact tile badge — keep output to ≤ ~10 characters
 * where possible so it fits in the corner badge without wrapping.
 *
 *   scopeTagLabel({kind:'global'})                         → 'All'
 *   scopeTagLabel({kind:'race', value:'Human'})            → 'Human'
 *   scopeTagLabel({kind:'gender', value:'Male'})           → 'Male'
 *   scopeTagLabel({kind:'alignment', value:'Lawful Good'}) → 'Lawful Good'
 *   scopeTagLabel({kind:'damage_type', value:'magic'})     → 'Magic'
 *   scopeTagLabel({kind:'stat_threshold', stat:'int', min:15}) → 'INT ≥15'
 *   scopeTagLabel({kind:'unknown'})                        → '?'
 *   scopeTagLabel(null)                                    → '?'
 *
 * @param {object|null|undefined} scope
 * @returns {string}
 */
export function scopeTagLabel(scope) {
  if (!scope || typeof scope !== 'object') return PLACEHOLDER;
  switch (scope.kind) {
    case 'global':
      return 'All';
    case 'race':
    case 'gender':
    case 'alignment':
      return titleCase(scope.value);
    case 'damage_type':
      return titleCase(scope.value);
    case 'stat_threshold': {
      const stat = typeof scope.stat === 'string' ? scope.stat.toUpperCase() : '';
      const min = Number.isFinite(Number(scope.min)) ? Number(scope.min) : null;
      if (!stat || min == null) return PLACEHOLDER;
      return `${stat} ≥${min}`;
    }
    case 'unknown':
    default:
      return PLACEHOLDER;
  }
}

/**
 * Return the scope's kind in a normalised form suitable for a CSS class
 * suffix (lowercased, dashes instead of underscores, safe fallback).
 *
 *   scopeTagKind({kind:'race'})           → 'race'
 *   scopeTagKind({kind:'damage_type'})    → 'damage-type'
 *   scopeTagKind({kind:'stat_threshold'}) → 'stat-threshold'
 *   scopeTagKind({kind:'global'})         → 'global'
 *   scopeTagKind(null)                    → 'unknown'
 *
 * Used by the tile to tone the badge colour (global vs. race vs. stat
 * threshold all read subtly differently).
 *
 * @param {object|null|undefined} scope
 * @returns {string}
 */
export function scopeTagKind(scope) {
  if (!scope || typeof scope !== 'object' || typeof scope.kind !== 'string') {
    return 'unknown';
  }
  return scope.kind.replace(/_/g, '-').toLowerCase();
}

/**
 * Parse the base multiplier out of a legendary-effect `effect_string`.
 *
 *   effectBaseAmount('global_dps_multiplier_mult,100') → 100
 *   effectBaseAmount('hero_dps_multiplier_mult,125')   → 125
 *   effectBaseAmount('foo,bar,42')                     → 42   (last token wins)
 *   effectBaseAmount('no-comma-here')                  → null
 *   effectBaseAmount(null)                             → null
 *
 * Returns `null` (not `0`) on malformed input so callers can distinguish
 * "couldn't parse" from "genuinely zero" — the current amount of an effect
 * with base 0 would legitimately read as 0, but we shouldn't display a bogus
 * "+0%" for an effect whose string is corrupted.
 *
 * @param {unknown} effectString
 * @returns {number|null}
 */
export function effectBaseAmount(effectString) {
  if (typeof effectString !== 'string') return null;
  const parts = effectString.split(',');
  if (parts.length < 2) return null;
  const tail = parts[parts.length - 1];
  const n = Number(tail);
  return Number.isFinite(n) ? n : null;
}

/**
 * Compute the current amount an effect is applying at the given equipped
 * level. Per the live-API scaling rule (docs/server-calls.md), the amount
 * is linear in level:
 *
 *   amount_at_level_N = base × N
 *
 * At level 0 (uncrafted) this returns 0, which is semantically correct (an
 * uncrafted slot applies no bonus) but callers should usually not render
 * this for empty tiles at all.
 *
 *   effectCurrentAmount({effect_string:'_,100'}, 5)  → 500
 *   effectCurrentAmount({effect_string:'_,125'}, 20) → 2500
 *   effectCurrentAmount({effect_string:'_,100'}, 0)  → 0
 *   effectCurrentAmount(null, 5)                     → null
 *   effectCurrentAmount({effect_string:'bad'}, 5)    → null
 *
 * @param {object|null|undefined} effect
 * @param {number} level
 * @returns {number|null}
 */
export function effectCurrentAmount(effect, level) {
  const base = effectBaseAmount(effect?.effect_string);
  if (base == null) return null;
  if (!Number.isFinite(Number(level))) return null;
  return base * Number(level);
}

/**
 * Extract the per-member scaling qualifier from an effect description, if any.
 *
 * In Idle Champions, a subset of legendary effects scale by formation
 * composition — "Increases the damage of all Champions by X% for each
 * <qualifier> Champion in the formation". Every such effect has
 * `scope.kind === 'global'` (the buff technically applies to all champions;
 * the per-member check is a multiplier, not a gate), so the scope tag alone
 * reads as just "ALL" and hides the most important planning info: what
 * formation detail drives the scaling.
 *
 * This helper parses the description template (pre-substitution — we don't
 * care about the amount here) and returns a compact label. Returns `null`
 * for any description that doesn't contain a `for each` clause we recognise,
 * so callers can omit the qualifier line rather than render a broken or
 * misleading label.
 *
 * Output style:
 *
 *   "Increases the damage of all Champions by $amount% for each Champion
 *    in the formation"                                       → "per champion"
 *   "...for each Male Champion in the formation"             → "per Male"
 *   "...for each Human Champion in the formation"            → "per Human"
 *   "...for each Half-Elf Champion in the formation"         → "per Half-Elf"
 *   "...for each Champion with a CHA score of 15 or higher…" → "per CHA ≥15"
 *   "...for each Melee Champion in the formation"            → "per Melee"
 *   "...for each Champion in the formation with a GOOD
 *    alignment"                                              → "per Good"
 *   "Increases the damage of all Champions by $amount%"      → null
 *   null / non-string                                        → null
 *
 * Pattern order matters: the stat-threshold and alignment variants insert
 * extra words into the sentence ("with a ... score", "with a ... alignment")
 * that we must recognise first, otherwise the generic race-catchall at the
 * bottom would try to match on "Champion" or the alignment word directly.
 *
 * @param {unknown} description
 * @returns {string|null}
 */
export function effectQualifier(description) {
  if (typeof description !== 'string') return null;

  // Stat threshold — "…for each Champion with a CHA score of 15 or higher in the formation".
  let m = description.match(
    /for each Champion with a (STR|DEX|CON|INT|WIS|CHA) score of (\d+) or higher/i
  );
  if (m) return `per ${m[1].toUpperCase()} ≥${m[2]}`;

  // Alignment — "…for each Champion in the formation with a GOOD alignment".
  m = description.match(
    /for each Champion in the formation with an? (GOOD|EVIL|LAWFUL|CHAOTIC|NEUTRAL) alignment/i
  );
  if (m) return `per ${titleCase(m[1])}`;

  // Gender — "…for each Male Champion in the formation".
  m = description.match(/for each (Male|Female|Nonbinary) Champion/i);
  if (m) return `per ${titleCase(m[1])}`;

  // Damage type — "…for each Melee Champion in the formation".
  m = description.match(/for each (Melee|Ranged|Magic) Champion/i);
  if (m) return `per ${titleCase(m[1])}`;

  // Pure formation size — no qualifier between "for each" and "Champion".
  // Matches "…for each Champion in the formation" exactly.
  if (/for each Champion in the formation$/i.test(description)) {
    return 'per champion';
  }

  // Race — catchall for "…for each <Race> Champion in the formation".
  // Races are an open-ended list (Human, Dwarf, Elf, Half-Elf, Yuan-ti,
  // Dragonborn, Firbolg, …), so we capture the word or hyphenated token
  // between "for each" and "Champion" rather than enumerating them. The
  // earlier patterns already rejected stat/alignment/gender/damage-type
  // phrasings, so this only fires for race-like words.
  m = description.match(/for each ([A-Za-z][A-Za-z-]*) Champion in the formation/i);
  if (m) return `per ${titleCase(m[1])}`;

  return null;
}

/**
 * Substitute the `$amount` / `$(amount)` placeholder in an effect description
 * template with a formatted amount. Both placeholder forms are handled (the
 * live data mixes them — see docs/server-calls.md §"Resolving legendary
 * effect IDs").
 *
 *   substituteAmount('by $(amount)%', '500')  → 'by 500%'
 *   substituteAmount('by $amount%', '500')    → 'by 500%'
 *   substituteAmount(null, '500')             → ''
 *   substituteAmount('no-placeholder', '500') → 'no-placeholder'
 *
 * `amount` is passed as a pre-formatted string (e.g. from `formatCompact`)
 * so the caller controls numeric presentation (compact vs. scientific vs.
 * raw). If the template is not a string, returns an empty string so render
 * code can `text: substituteAmount(...)` without null-checking.
 *
 * @param {unknown} template
 * @param {string}  amountText
 * @returns {string}
 */
export function substituteAmount(template, amountText) {
  if (typeof template !== 'string') return '';
  const replacement = typeof amountText === 'string' ? amountText : String(amountText ?? '');
  return template.replace(/\$\((?:amount)\)|\$amount/g, replacement);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function titleCase(value) {
  if (typeof value !== 'string' || value.length === 0) return PLACEHOLDER;
  // Title-case each whitespace-separated token while preserving hyphens
  // inside a token (e.g. "Half-Elf", "Chaotic Good").
  return value
    .toLowerCase()
    .split(/\s+/)
    .map((word) =>
      word
        .split('-')
        .map((seg) => (seg.length === 0 ? seg : seg[0].toUpperCase() + seg.slice(1)))
        .join('-')
    )
    .join(' ');
}
