/**
 * lib/userBalances.js — pure helper that extracts the `{scales, favorById}`
 * shape consumed by `legendaryModel.buildForgeRun` / `buildReforge` from the
 * raw `getuserdetails.details` payload.
 *
 * Kept as its own module (rather than inlined in the view) because:
 *
 *   1. It encodes an empirical fact about the live API shape that we learned
 *      the hard way — see quirk #1 below. Isolating it means tests can pin
 *      the fact and catch regressions if a future refactor re-introduces
 *      the `entry.id` mistake.
 *   2. Node's test runner can import it without pulling in the DOM-touching
 *      parts of the Legendary view.
 *
 * Live-API shape for each entry in `details.reset_currencies[]`:
 *
 *   { currency_id, current_amount, total_earned, total_spent, converted_currency }
 *
 * Two quirks worth noting:
 *
 *   1. The key is `currency_id`, NOT `id`. An earlier draft of
 *      docs/server-calls.md said `id`; empirical probing of the live play
 *      server on 2026-04-25 showed `currency_id` is the real field name.
 *      We accept either as a defensive fallback in case older snapshots or
 *      mocks still use the legacy name, but the live play server
 *      consistently emits `currency_id`.
 *
 *   2. `current_amount` is a string for large favors — e.g.
 *      `"1.8413299067526E+53"`. `Number(str)` handles scientific notation
 *      correctly (returns `1.8413…e+53`), so we don't need a custom parser,
 *      but we do need to keep passing it through `Number()` rather than
 *      assuming it's already numeric.
 *
 * Scales of Tiamat balance lives at `details.stats.multiplayer_points` and
 * IS a plain number on the wire, so we just coerce defensively.
 */

/**
 * @typedef {object} UserBalances
 * @property {number}                scales      Scales of Tiamat balance.
 * @property {Map<number, number>}   favorById   reset_currency_id → amount.
 */

/**
 * @param {object|null|undefined} userDetails  getuserdetails.details
 * @returns {UserBalances}
 */
export function deriveUserBalances(userDetails) {
  const scalesRaw = userDetails?.stats?.multiplayer_points;
  const scales = Number.isFinite(Number(scalesRaw)) ? Number(scalesRaw) : 0;

  const favorById = new Map();
  const rc = userDetails?.reset_currencies;
  if (Array.isArray(rc)) {
    for (const entry of rc) {
      if (!entry) continue;
      const idRaw = entry.currency_id ?? entry.id;
      const id = Number(idRaw);
      const amount = Number(entry.current_amount ?? 0);
      if (Number.isFinite(id) && Number.isFinite(amount)) {
        favorById.set(id, amount);
      }
    }
  }

  return { scales, favorById };
}
