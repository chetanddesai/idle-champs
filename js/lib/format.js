/**
 * format.js
 *
 * Pure, deterministic presentation helpers for the Legendary view and the
 * shared app shell. No DOM, no I/O, no framework dependencies — importable
 * from the browser (native ES module) and from Node (`node --test`).
 *
 * Design principles:
 *
 *   - Every function is total: invalid inputs (null, undefined, NaN, wrong
 *     type) return a safe display placeholder ("—") rather than throwing,
 *     so the view is never broken by a single missing field.
 *   - Output is **deterministic** across runtimes. We roll our own compact
 *     notation rather than leaning on `Intl.NumberFormat({notation:'compact'})`
 *     because compact-notation output varies across Node / Chromium / Safari
 *     versions (e.g. "1Q" vs. "1,000T" for 1e15), which would make unit
 *     tests flaky.
 *   - Grouping separators use `Intl.NumberFormat('en-US')` explicitly to
 *     avoid locale-dependent output.
 *
 * Semantic split (which formatter for which field):
 *
 *   Scales of Tiamat balance, per-slot upgrade_cost, XP counters
 *     → `formatInteger`       (exact value, with commas)
 *     or `formatCompact`      (short form when space is tight)
 *
 *   Favor balances, `upgrade_favor_cost`, `upgrade_favor_required`
 *     → `formatFavor`         (scientific once the value exceeds ~1000,
 *                              two decimals — chosen to match how IC's own
 *                              client renders very large favor balances)
 *
 *   Damage bonus amounts on Forge Run tiles (legendary effect amounts
 *   scale geometrically — see `effectFormat.js`)
 *     → `formatScientific`    (scientific with one decimal — keeps the
 *                              tile chip narrow and avoids the K/M/B/T
 *                              ambiguity at the high end of legendary
 *                              levels)
 *
 *   `fetched_at`, `last_refresh_at`, API response timestamps
 *     → `formatTimeAgo`
 *
 *   Reforge cooldown, event timers, `reforge_reduction_time`
 *     → `formatDuration`
 *
 *   Reforge "potential hits" badge
 *     → `formatPhase(x, y)`   ("X/Y")
 *
 * The em-dash fallback ("—") is chosen instead of "0" or "N/A" so the caller
 * can visually distinguish "this value is genuinely zero" from "we don't
 * know this value yet".
 */

const PLACEHOLDER = '—';

const INTEGER_FORMAT = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 0,
  useGrouping: true,
});

/**
 * True iff `n` is a finite number.
 * Returns false for NaN, +/-Infinity, and any non-number type.
 */
function isFiniteNumber(n) {
  return typeof n === 'number' && Number.isFinite(n);
}

/**
 * Format an integer-valued number with thousands separators.
 *
 *   formatInteger(0)        → "0"
 *   formatInteger(1234)     → "1,234"
 *   formatInteger(126995)   → "126,995"
 *   formatInteger(null)     → "—"
 *   formatInteger(NaN)      → "—"
 *
 * Decimal values are rounded to the nearest integer before grouping.
 *
 * @param {unknown} n
 * @returns {string}
 */
export function formatInteger(n) {
  if (!isFiniteNumber(n)) return PLACEHOLDER;
  return INTEGER_FORMAT.format(Math.round(n));
}

/**
 * Format a number using compact (K/M/B/T) notation, falling back to
 * scientific notation for values past the named units.
 *
 *   formatCompact(999)        → "999"
 *   formatCompact(1000)       → "1K"
 *   formatCompact(1234)       → "1.2K"
 *   formatCompact(12_345)     → "12K"
 *   formatCompact(1_200_000)  → "1.2M"
 *   formatCompact(1.5e9)      → "1.5B"
 *   formatCompact(1e12)       → "1T"
 *   formatCompact(1e15)       → "1.00e+15"
 *   formatCompact(-1_500_000) → "-1.5M"
 *
 * Compact notation is chosen so the grid cells in Forge Run and Reforge
 * stay narrow without losing useful magnitude information. We never land
 * in the locale-dependent "1Q" territory — past 1e15 we switch straight
 * to exponential, which is what favor costs need anyway.
 *
 * @param {unknown} n
 * @returns {string}
 */
export function formatCompact(n) {
  if (!isFiniteNumber(n)) return PLACEHOLDER;
  const abs = Math.abs(n);
  if (abs < 1000) return formatInteger(n);
  if (abs >= 1e15) return n.toExponential(2);

  const units = [
    { v: 1e12, s: 'T' },
    { v: 1e9, s: 'B' },
    { v: 1e6, s: 'M' },
    { v: 1e3, s: 'K' },
  ];
  for (const u of units) {
    if (abs >= u.v) {
      const scaled = n / u.v;
      const absScaled = Math.abs(scaled);
      // ≥10 → no decimal ("12M"); <10 → one decimal, trim trailing .0 ("1.2M","1M").
      const body =
        absScaled >= 10
          ? Math.round(scaled).toString()
          : scaled.toFixed(1).replace(/\.0$/, '');
      return `${body}${u.s}`;
    }
  }
  // Unreachable (abs >= 1000 guarantees one of the buckets hits), but keeps
  // the function total if someone tweaks the thresholds in the future.
  return formatInteger(n);
}

/**
 * Format a favor amount for display. Favor costs in IC span from a few
 * thousand at early game to 10^60+ at late game, so we force scientific
 * notation once the value is large enough that grouped digits would
 * be unreadable.
 *
 *   formatFavor(500)       → "500"
 *   formatFavor(999)       → "999"
 *   formatFavor(1000)      → "1.00e+3"
 *   formatFavor(2.3e58)    → "2.30e+58"
 *   formatFavor(null)      → "—"
 *
 * The threshold is lower than `formatCompact`'s because favor values are
 * always powers-of-whatever-currency and readers are used to reading them
 * in scientific form (this matches what the in-game UI does, too).
 *
 * @param {unknown} n
 * @returns {string}
 */
export function formatFavor(n) {
  if (!isFiniteNumber(n)) return PLACEHOLDER;
  if (Math.abs(n) < 1000) return formatInteger(n);
  return n.toExponential(2);
}

/**
 * Format a number using scientific notation once it exceeds the readable
 * range. Below 1000, falls through to `formatInteger` so small values stay
 * exact and grouped ("125", "999"). At or above 1000, uses single-decimal
 * exponential form to keep tile chips narrow.
 *
 *   formatScientific(125)        → "125"
 *   formatScientific(999)        → "999"
 *   formatScientific(1000)       → "1.0e+3"
 *   formatScientific(2000)       → "2.0e+3"
 *   formatScientific(32_000)     → "3.2e+4"
 *   formatScientific(65_536_000) → "6.6e+7"
 *   formatScientific(0)          → "0"
 *   formatScientific(null)       → "—"
 *
 * Used for the `+<amount>%` chip on Forge Run tiles where the geometric
 * legendary scaling can push values from ~100% at L1 into the tens-of-
 * millions percent at L20. Compact "K/M/B" notation hides too much
 * precision at the high end ("65M" vs. "104M" reads as nearly the same
 * even though they're a doubling apart), and scientific is the form
 * IC's own client uses for very large bonuses.
 *
 * @param {unknown} n
 * @param {number} [fractionDigits=1]
 * @returns {string}
 */
export function formatScientific(n, fractionDigits = 1) {
  if (!isFiniteNumber(n)) return PLACEHOLDER;
  if (Math.abs(n) < 1000) return formatInteger(n);
  return n.toExponential(fractionDigits);
}

/**
 * Format a timestamp relative to `now`. Accepts an ISO string, a numeric
 * epoch-ms, or a Date. Negative offsets (future timestamps) collapse to
 * "just now" — the app never displays future times.
 *
 *   formatTimeAgo(Date.now())                      → "just now"
 *   formatTimeAgo(Date.now() - 90_000)             → "1m ago"
 *   formatTimeAgo(Date.now() - 3_600_000)          → "1h ago"
 *   formatTimeAgo(Date.now() - 5 * 24 * 3600_000)  → "5d ago"
 *   formatTimeAgo(Date.now() - 40 * 24 * 3600_000) → "2026-03-15" (ISO date)
 *   formatTimeAgo(null)                            → "—"
 *   formatTimeAgo("not a date")                    → "—"
 *
 * @param {string | number | Date | null | undefined} when
 * @param {number | Date} [now=Date.now()]
 * @returns {string}
 */
export function formatTimeAgo(when, now = Date.now()) {
  if (when == null) return PLACEHOLDER;
  const t = when instanceof Date ? when.getTime() : new Date(when).getTime();
  if (!Number.isFinite(t)) return PLACEHOLDER;
  const nowMs = now instanceof Date ? now.getTime() : now;
  if (!Number.isFinite(nowMs)) return PLACEHOLDER;

  const diffMs = nowMs - t;
  // Clamp future offsets to "just now" rather than show "in 3 minutes" —
  // the only realistic source of a future timestamp in our app is clock
  // skew between the client and the play server.
  if (diffMs < 60_000) return 'just now';

  const diffS = Math.floor(diffMs / 1000);
  if (diffS < 3600) return `${Math.floor(diffS / 60)}m ago`;
  if (diffS < 86_400) return `${Math.floor(diffS / 3600)}h ago`;

  const diffD = Math.floor(diffS / 86_400);
  if (diffD < 30) return `${diffD}d ago`;

  // Past a month, relative time stops being useful. Fall back to an ISO
  // date stamp ("YYYY-MM-DD") which is unambiguous across locales.
  return new Date(t).toISOString().slice(0, 10);
}

/**
 * Format a duration in seconds as a compact two-unit label.
 *
 *   formatDuration(0)       → "0s"
 *   formatDuration(45)      → "45s"
 *   formatDuration(125)     → "2m 5s"
 *   formatDuration(3_600)   → "1h"
 *   formatDuration(3_660)   → "1h 1m"
 *   formatDuration(90_000)  → "1d 1h"
 *   formatDuration(null)    → "—"
 *
 * Negative durations clamp to "0s" (callers should treat a negative
 * duration as "already finished"; the formatter keeps the display stable).
 *
 * @param {unknown} seconds
 * @returns {string}
 */
export function formatDuration(seconds) {
  if (!isFiniteNumber(seconds)) return PLACEHOLDER;
  const s = Math.max(0, Math.floor(seconds));

  if (s < 60) return `${s}s`;

  if (s < 3600) {
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return rem === 0 ? `${m}m` : `${m}m ${rem}s`;
  }

  if (s < 86_400) {
    const h = Math.floor(s / 3600);
    const remMin = Math.floor((s % 3600) / 60);
    return remMin === 0 ? `${h}h` : `${h}h ${remMin}m`;
  }

  const d = Math.floor(s / 86_400);
  const remH = Math.floor((s % 86_400) / 3600);
  return remH === 0 ? `${d}d` : `${d}d ${remH}h`;
}

/**
 * Format the "potential hits: X/Y" badge shown on Reforge rows.
 *
 *   formatPhase(2, 4)   → "2/4"
 *   formatPhase(0, 6)   → "0/6"
 *   formatPhase(3, 0)   → "—"    (invalid — divisor must be positive)
 *   formatPhase(-1, 4)  → "—"    (invalid — numerator must be non-negative)
 *   formatPhase(null,4) → "—"
 *
 * The formatter is permissive about ordering (it never swaps X and Y) and
 * strict about validity: a malformed pair renders the em-dash rather than
 * a misleading "0/0" string.
 *
 * @param {unknown} x
 * @param {unknown} y
 * @returns {string}
 */
export function formatPhase(x, y) {
  if (!isFiniteNumber(x) || !isFiniteNumber(y)) return PLACEHOLDER;
  if (x < 0 || y <= 0) return PLACEHOLDER;
  return `${Math.floor(x)}/${Math.floor(y)}`;
}
