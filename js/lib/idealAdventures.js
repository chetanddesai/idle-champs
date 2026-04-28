/**
 * idealAdventures.js — pure lookup of the recommended adventure to farm for
 * each campaign favor when planning a forge run.
 *
 * This data is **community wisdom**, not API output. The Idle Champions
 * server doesn't expose any "best adventure for forge runs" hint, but
 * every campaign has one or two adventures that the player base agrees
 * are the highest-throughput target for the campaign's reset currency.
 * Surfacing this on the favor priority panel saves the player a context
 * switch to a wiki to remember which adventure to launch in-game.
 *
 * Keyed by `reset_currency_id` (matches `getuserdetails.details
 * .reset_currencies[].currency_id` and the `reset_currency_id` field on
 * the bundled favor records — see `data/definitions.favors.json`). The
 * stored string is a free-form display label; for campaigns with multiple
 * equally-good options we encode the alternation inline (e.g.
 * "Lost Modron or Fast Food") rather than splitting into an array, since
 * the consumer only renders the result as one line of muted subtitle text.
 *
 * Adding a new campaign:
 *
 *   1. Look up the favor's `reset_currency_id` in
 *      `data/definitions.favors.json` (e.g. Grand Tour = 1).
 *   2. Append a `[id, 'Adventure Name']` pair below.
 *   3. Add a unit test in `test/idealAdventures.test.js`.
 *
 * Casing follows standard English title case (small words like "of"/"the"
 * stay lower-case unless they start the title). Update with care — the
 * label is rendered verbatim under the favor name.
 */

const IDEAL_BY_FAVOR_ID = new Map([
  [1, 'Beast Intentions'], // Grand Tour
  [3, 'The Ring of Regeneration'], // Tomb of Annihilation
  [15, 'A Mysterious Summons'], // Waterdeep: Dragon Heist
  [22, 'The Dead Three'], // Baldur's Gate: Descent into Avernus
  [23, 'The Everlasting Rime'], // Icewind Dale: Rime of the Frostmaiden
  [25, 'The Witchlight Carnival'], // The Wild Beyond the Witchlight
  [30, 'The Evacuation of Waterdeep'], // Light of Xaryxis
  [31, 'Lost Modron or Fast Food'], // Turn of Fortune's Wheel
  [35, 'Tale of Two Vecnas'], // Vecna: Eve of Ruin
]);

/**
 * Best-known adventure to farm for the given favor currency, or `null`
 * if we don't have a mapping. Defensive about non-numeric input — coerces
 * via `Number()` so callers can pass either the raw API value (a number)
 * or a string id from a URL/route parameter.
 *
 *   idealAdventureForFavor(1)   → 'Beast Intentions'
 *   idealAdventureForFavor('1') → 'Beast Intentions'
 *   idealAdventureForFavor(2)   → null   (Highharvestide — no mapping)
 *   idealAdventureForFavor(null)→ null
 *
 * @param {unknown} resetCurrencyId
 * @returns {string|null}
 */
export function idealAdventureForFavor(resetCurrencyId) {
  const id = Number(resetCurrencyId);
  if (!Number.isFinite(id)) return null;
  return IDEAL_BY_FAVOR_ID.get(id) ?? null;
}
