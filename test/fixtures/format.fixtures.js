/**
 * Frozen fixtures for js/lib/format.js tests.
 *
 * Every expectation is a tuple the test runner iterates over with a clear
 * case name so failures point to the exact pair. Fixtures are Object.frozen
 * so an accidental mutation inside a test can't taint a later one.
 */

export const INTEGER_CASES = Object.freeze([
  { name: 'zero', input: 0, expected: '0' },
  { name: 'one', input: 1, expected: '1' },
  { name: 'thousand', input: 1000, expected: '1,000' },
  { name: 'user scales balance', input: 126995, expected: '126,995' },
  { name: 'negative grouped', input: -1234567, expected: '-1,234,567' },
  { name: 'rounds up', input: 1.5, expected: '2' },
  { name: 'rounds toward zero for .4', input: 1.4, expected: '1' },
  { name: 'null → placeholder', input: null, expected: '—' },
  { name: 'undefined → placeholder', input: undefined, expected: '—' },
  { name: 'NaN → placeholder', input: Number.NaN, expected: '—' },
  { name: 'Infinity → placeholder', input: Number.POSITIVE_INFINITY, expected: '—' },
  { name: 'string → placeholder', input: '1234', expected: '—' },
]);

export const COMPACT_CASES = Object.freeze([
  { name: '999 → formatInteger', input: 999, expected: '999' },
  { name: '1000 boundary', input: 1000, expected: '1K' },
  { name: '1234 one decimal', input: 1234, expected: '1.2K' },
  { name: '12345 no decimal', input: 12345, expected: '12K' },
  { name: '127000 scales display', input: 127000, expected: '127K' },
  { name: '1.2M', input: 1_200_000, expected: '1.2M' },
  { name: '12M', input: 12_000_000, expected: '12M' },
  { name: '1.5B', input: 1_500_000_000, expected: '1.5B' },
  { name: '1T', input: 1_000_000_000_000, expected: '1T' },
  { name: '999T edge of named buckets', input: 9.99e14, expected: '999T' },
  { name: '1e15 scientific switchover', input: 1e15, expected: '1.00e+15' },
  { name: '2.3e58', input: 2.3e58, expected: '2.30e+58' },
  { name: 'negative 1.5M', input: -1_500_000, expected: '-1.5M' },
  { name: 'null → placeholder', input: null, expected: '—' },
  { name: 'NaN → placeholder', input: Number.NaN, expected: '—' },
]);

export const FAVOR_CASES = Object.freeze([
  { name: 'small grouped', input: 500, expected: '500' },
  { name: '999 still integer', input: 999, expected: '999' },
  { name: '1000 switches to scientific', input: 1000, expected: '1.00e+3' },
  { name: '2.3e58 cost', input: 2.3e58, expected: '2.30e+58' },
  { name: '1e30 balance', input: 1e30, expected: '1.00e+30' },
  { name: 'negative large', input: -1e30, expected: '-1.00e+30' },
  { name: 'zero balance', input: 0, expected: '0' },
  { name: 'null → placeholder', input: null, expected: '—' },
  { name: 'NaN → placeholder', input: Number.NaN, expected: '—' },
]);

// Anchor `now` to a fixed epoch so tests are stable across clock drift.
// 2026-04-24T22:00:00.000Z.
export const NOW = new Date('2026-04-24T22:00:00.000Z').getTime();

export const TIMEAGO_CASES = Object.freeze([
  { name: 'same instant', input: NOW, expected: 'just now' },
  { name: '30 seconds ago', input: NOW - 30_000, expected: 'just now' },
  { name: '60 seconds ago', input: NOW - 60_000, expected: '1m ago' },
  { name: '5 minutes ago', input: NOW - 5 * 60_000, expected: '5m ago' },
  { name: '59 minutes ago', input: NOW - 59 * 60_000, expected: '59m ago' },
  { name: '1 hour ago', input: NOW - 3_600_000, expected: '1h ago' },
  { name: '23 hours ago', input: NOW - 23 * 3_600_000, expected: '23h ago' },
  { name: '1 day ago', input: NOW - 24 * 3_600_000, expected: '1d ago' },
  { name: '29 days ago', input: NOW - 29 * 24 * 3_600_000, expected: '29d ago' },
  {
    name: '30 days ago → ISO date',
    input: NOW - 30 * 24 * 3_600_000,
    expected: '2026-03-25',
  },
  {
    name: '90 days ago → ISO date',
    input: NOW - 90 * 24 * 3_600_000,
    expected: '2026-01-24',
  },
  { name: 'future clamps to just now', input: NOW + 60_000, expected: 'just now' },
  { name: 'ISO string input', input: '2026-04-24T21:30:00.000Z', expected: '30m ago' },
  { name: 'Date input', input: new Date(NOW - 120_000), expected: '2m ago' },
  { name: 'null → placeholder', input: null, expected: '—' },
  { name: 'undefined → placeholder', input: undefined, expected: '—' },
  { name: 'invalid string → placeholder', input: 'not a date', expected: '—' },
]);

export const DURATION_CASES = Object.freeze([
  { name: 'zero', input: 0, expected: '0s' },
  { name: '45s', input: 45, expected: '45s' },
  { name: '59s', input: 59, expected: '59s' },
  { name: '1m exact', input: 60, expected: '1m' },
  { name: '2m 5s', input: 125, expected: '2m 5s' },
  { name: '59m 59s', input: 59 * 60 + 59, expected: '59m 59s' },
  { name: '1h exact', input: 3600, expected: '1h' },
  { name: '1h 1m', input: 3660, expected: '1h 1m' },
  { name: '23h 59m', input: 23 * 3600 + 59 * 60, expected: '23h 59m' },
  { name: '1d exact', input: 86_400, expected: '1d' },
  { name: '1d 1h', input: 86_400 + 3600, expected: '1d 1h' },
  { name: '7d 0h', input: 7 * 86_400, expected: '7d' },
  { name: 'negative clamps to 0s', input: -30, expected: '0s' },
  { name: 'fractional seconds floor', input: 65.9, expected: '1m 5s' },
  { name: 'null → placeholder', input: null, expected: '—' },
  { name: 'NaN → placeholder', input: Number.NaN, expected: '—' },
]);

export const PHASE_CASES = Object.freeze([
  { name: '0/6', x: 0, y: 6, expected: '0/6' },
  { name: '2/4', x: 2, y: 4, expected: '2/4' },
  { name: '6/6 full pool', x: 6, y: 6, expected: '6/6' },
  { name: 'floors fractional', x: 2.7, y: 4.9, expected: '2/4' },
  { name: 'divisor zero invalid', x: 3, y: 0, expected: '—' },
  { name: 'negative x invalid', x: -1, y: 4, expected: '—' },
  { name: 'null x', x: null, y: 4, expected: '—' },
  { name: 'null y', x: 3, y: null, expected: '—' },
  { name: 'both null', x: null, y: null, expected: '—' },
]);
