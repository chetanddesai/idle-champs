/**
 * legendaryDefsParser.js — pure transforms over a raw `getdefinitions`
 * response body, producing the trimmed shapes the Legendary view consumes
 * at runtime (see js/lib/definitions.js, js/views/legendary/index.js).
 *
 * This module is the SINGLE source of truth for the parser logic. Both
 * runtime (cache hydrator in `js/lib/definitions.js`) and offline
 * (`scripts/refresh-hero-images.js`) callers import from here so a parser
 * fix is picked up by both surfaces in lockstep.
 *
 * Contract:
 *
 *   - No I/O. No `fetch`, no `fs`, no Node-specific globals. Inputs are
 *     plain JS values from a parsed JSON response; outputs are plain JS
 *     values that round-trip through `JSON.stringify` cleanly.
 *
 *   - No dependencies on any other repo module. Drop-in usable from
 *     Node 18+ (`scripts/`), browsers, or `node:test` without polyfills.
 *
 *   - Helpers are individually exported (in addition to the bundled
 *     `parseDefinitions(body)` wrapper) so tests can exercise edge
 *     cases on each transform without standing up a full fixture body.
 *
 * Parse contract per shape:
 *
 *   trimHeroes(hero_defines, attack_defines)
 *     → Array<{id, name, seat_id, class, race, tags, damage_types,
 *              ability_scores, legendary_effect_id}>, sorted by id.
 *
 *   trimEffects(legendary_effect_defines)
 *     → Array<{id, effect_string, targets, description}>, sorted by id.
 *
 *   deriveScopes(legendary_effect_defines)
 *     → Array<{id, ...scope}>, sorted by id, where scope is one of:
 *         {kind:'global'}
 *         {kind:'race',          value:string}
 *         {kind:'gender',        value:string}
 *         {kind:'alignment',     value:string}
 *         {kind:'damage_type',   value:string}
 *         {kind:'stat_threshold',stat:string, min:number}
 *         {kind:'unknown'}
 *
 *   deriveFavors(campaign_defines)
 *     → Array<{reset_currency_id, short_name, name, campaign_id}>,
 *       deduped by reset_currency_id (first campaign wins), sorted asc.
 *
 *   parseDefinitions(body) bundles all four for the cache hydrator.
 *
 * Scope-derivation notes (mirrors PRD §3.2.2 + scripts header):
 *
 *   - Effects with effect_string starting `global_` are tagged
 *     {kind:"global"} regardless of description text.
 *   - "Champions with a STR score of 11 or higher" → stat_threshold.
 *   - "all X Champions" → race / gender / alignment / damage_type /
 *     race-fallback. The "Halfing" typo in-game is normalized to
 *     "Halfling" via SCOPE_VALUE_ALIASES so runtime hero.tags matching
 *     stays trivial.
 *   - Anything unclassified is tagged {kind:"unknown"} so the next
 *     refresh surfaces a warning before customers hit a `?` badge.
 */

// ---------------------------------------------------------------------------
// Token lookups for scope derivation. Exported so tests can pin them.
// ---------------------------------------------------------------------------

/** Damage-type tokens recognised by `deriveScope` (lowercase). */
export const DAMAGE_TYPE_TOKENS = Object.freeze(
  new Set(['melee', 'ranged', 'magic'])
);

/** Gender tokens (case-sensitive — match the API's casing). */
export const GENDER_TOKENS = Object.freeze(
  new Set(['Male', 'Female', 'Nonbinary'])
);

/** Alignment tokens (case-sensitive). */
export const ALIGNMENT_TOKENS = Object.freeze(
  new Set(['Good', 'Evil', 'Lawful', 'Chaotic', 'Neutral'])
);

/**
 * Description-token aliases. The in-game effect description for halfling
 * effects misspells the race as "Halfing"; we normalize at derivation time
 * so the runtime matcher can do `hero.tags.includes(scope.value.toLowerCase())`
 * without a typo-special-case branch.
 */
export const SCOPE_VALUE_ALIASES = Object.freeze({
  Halfing: 'Halfling',
});

// ---------------------------------------------------------------------------
// Hero trim
// ---------------------------------------------------------------------------

/**
 * Derive the per-hero damage_types array (subset of {melee, ranged, magic})
 * from the hero's base_attack_id resolved against attack_defines.
 *
 * Ranged vs. melee is encoded in `attack.tags` (attack style / distance);
 * magic is encoded in `attack.damage_types` (damage type). We union both
 * and intersect with {melee, ranged, magic} so a hero can land in multiple
 * buckets (e.g., Cazrin is both `magic` and `ranged`).
 *
 * @param {object} hero
 * @param {Map<number, object>} attackById
 * @returns {string[]}
 */
export function deriveDamageTypes(hero, attackById) {
  if (!hero || !attackById) return [];
  const attack = attackById.get(hero.base_attack_id);
  if (!attack) return [];
  const merged = new Set([
    ...(attack.tags || []).map((t) => String(t).toLowerCase()),
    ...(attack.damage_types || []).map((t) => String(t).toLowerCase()),
  ]);
  return ['melee', 'ranged', 'magic'].filter((t) => merged.has(t));
}

/**
 * Trim raw `hero_defines` into the runtime-friendly shape consumed by
 * the Legendary view. Sorted ascending by `id` so cache + bundled-output
 * comparisons are stable.
 *
 * @param {Array<object>} heroDefines
 * @param {Array<object>} attackDefines
 * @returns {Array<object>}
 */
export function trimHeroes(heroDefines, attackDefines) {
  if (!Array.isArray(heroDefines)) return [];
  // Index attacks for O(1) lookup during enrichment; we never persist the
  // attack table itself — the derived damage_types array is enough.
  const attackById = new Map(
    Array.isArray(attackDefines) ? attackDefines.map((a) => [a.id, a]) : []
  );
  return heroDefines
    .map((h) => {
      const csd = h.character_sheet_details || {};
      return {
        id: h.id,
        name: h.name,
        seat_id: h.seat_id,
        class: csd.class ?? null,
        race: csd.race ?? null,
        tags: Array.isArray(h.tags) ? h.tags.map((t) => String(t).toLowerCase()) : [],
        damage_types: deriveDamageTypes(h, attackById),
        ability_scores: csd.ability_scores ?? null,
        legendary_effect_id: h.properties?.legendary_effect_id ?? null,
      };
    })
    .sort((a, b) => a.id - b.id);
}

// ---------------------------------------------------------------------------
// Effect trim
// ---------------------------------------------------------------------------

/**
 * Trim raw `legendary_effect_defines` into the runtime-friendly shape.
 * Sorted ascending by `id`.
 *
 * @param {Array<object>} legendaryEffectDefines
 * @returns {Array<object>}
 */
export function trimEffects(legendaryEffectDefines) {
  if (!Array.isArray(legendaryEffectDefines)) return [];
  return legendaryEffectDefines
    .map((e) => {
      const eff = (e.effects && e.effects[0]) || {};
      return {
        id: e.id,
        effect_string: eff.effect_string ?? null,
        targets: eff.targets ?? null,
        description: eff.description ?? null,
      };
    })
    .sort((a, b) => a.id - b.id);
}

// ---------------------------------------------------------------------------
// Scope derivation
// ---------------------------------------------------------------------------

/**
 * Parse a single `legendary_effect_define` into its scope tag.
 * Returns one of the union shapes documented at the top of the file.
 *
 * Scope `value` is stored in the canonical cased form from the description
 * (e.g. "Half-Elf"); runtime matching lowercases on compare via
 * `js/lib/scopeMatcher.js`.
 *
 * @param {object} effect
 * @returns {{kind: string, [k: string]: unknown}}
 */
export function deriveScope(effect) {
  const eff = (effect?.effects && effect.effects[0]) || {};
  const effectString = eff.effect_string || '';
  const description = eff.description || '';

  if (effectString.startsWith('global_')) {
    return { kind: 'global' };
  }

  // Stat threshold: "Champions with a STR score of 11 or higher"
  const statMatch = description.match(
    /Champions with a (STR|DEX|CON|INT|WIS|CHA) score of (\d+) or higher/i
  );
  if (statMatch) {
    return {
      kind: 'stat_threshold',
      stat: statMatch[1].toLowerCase(),
      min: Number(statMatch[2]),
    };
  }

  // General scoped pattern: "all X Champions" (allowing letters, spaces, hyphens)
  const tokenMatch = description.match(/damage of all ([\w\- ]+?) Champions/);
  if (tokenMatch) {
    const raw = tokenMatch[1].trim();
    const normalized = SCOPE_VALUE_ALIASES[raw] || raw;
    if (DAMAGE_TYPE_TOKENS.has(normalized.toLowerCase())) {
      return { kind: 'damage_type', value: normalized };
    }
    if (GENDER_TOKENS.has(normalized)) {
      return { kind: 'gender', value: normalized };
    }
    if (ALIGNMENT_TOKENS.has(normalized)) {
      return { kind: 'alignment', value: normalized };
    }
    // Assume race for everything else; the unknown_scope_ids audit list
    // catches truly novel category shapes that shouldn't land in race.
    return { kind: 'race', value: normalized };
  }

  return { kind: 'unknown' };
}

/**
 * Derive the per-effect scope array. Sorted ascending by `id`.
 *
 * @param {Array<object>} legendaryEffectDefines
 * @returns {Array<{id: number, kind: string, [k: string]: unknown}>}
 */
export function deriveScopes(legendaryEffectDefines) {
  if (!Array.isArray(legendaryEffectDefines)) return [];
  return legendaryEffectDefines
    .map((e) => ({ id: e.id, ...deriveScope(e) }))
    .sort((a, b) => a.id - b.id);
}

// ---------------------------------------------------------------------------
// Favor derivation
// ---------------------------------------------------------------------------

/**
 * Derive the favor bundle from `campaign_defines` — one record per campaign
 * that has an associated `reset_currency_id`. Dedupes on
 * `reset_currency_id` (first campaign wins) so the output is deterministic
 * even if two campaigns somehow share a currency.
 *
 * @param {Array<object>} campaignDefines
 * @returns {Array<{reset_currency_id: number, short_name: string|null, name: string|null, campaign_id: number|null}>}
 */
export function deriveFavors(campaignDefines) {
  if (!Array.isArray(campaignDefines)) return [];
  const favorsById = new Map();
  for (const c of campaignDefines) {
    const rid = c?.reset_currency_id;
    if (rid == null || rid === 0) continue;
    if (favorsById.has(rid)) continue;
    favorsById.set(rid, {
      reset_currency_id: rid,
      short_name: c.short_name ?? null,
      name: c.name ?? null,
      campaign_id: c.id ?? null,
    });
  }
  return [...favorsById.values()].sort(
    (a, b) => a.reset_currency_id - b.reset_currency_id
  );
}

// ---------------------------------------------------------------------------
// Bundle entrypoint
// ---------------------------------------------------------------------------

/**
 * Parse a raw `getdefinitions` response body into the bundle the Legendary
 * cache stores. Missing arrays degrade gracefully to empty results so a
 * partial / malformed response doesn't crash the parser.
 *
 * @param {object} body — typically `(await getDefinitions(ctx)).body`
 * @returns {{
 *   heroes: Array<object>,
 *   effects: Array<object>,
 *   scopes:  Array<object>,
 *   favors:  Array<object>,
 *   unknownScopeIds: number[],
 *   favorsMissingShortName: number[],
 * }}
 */
export function parseDefinitions(body) {
  const heroDefines = body?.hero_defines;
  const attackDefines = body?.attack_defines;
  const effectDefines = body?.legendary_effect_defines;
  const campaignDefines = body?.campaign_defines;

  const heroes = trimHeroes(heroDefines, attackDefines);
  const effects = trimEffects(effectDefines);
  const scopes = deriveScopes(effectDefines);
  const favors = deriveFavors(campaignDefines);

  // Audit lists — surfaced by the offline refresh script as warnings, and
  // available to runtime callers that want to log a GA event when a new
  // game release introduces a parser gap.
  const unknownScopeIds = scopes
    .filter((s) => s.kind === 'unknown')
    .map((s) => s.id);
  const favorsMissingShortName = favors
    .filter((f) => !f.short_name)
    .map((f) => f.reset_currency_id);

  return {
    heroes,
    effects,
    scopes,
    favors,
    unknownScopeIds,
    favorsMissingShortName,
  };
}
