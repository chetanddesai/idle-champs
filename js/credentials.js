/**
 * credentials.js — pure helpers for parsing and validating Idle Champions
 * account credentials. Split out of state.js so the parsing rules are
 * testable in isolation (no localStorage, no DOM).
 *
 * Credential shape used throughout the app:
 *
 *   { userId: string, hash: string }
 *
 * Both fields are stored as non-empty strings. `userId` is numeric in the
 * API but we keep it as a string so leading zeros or future ID-shape
 * changes don't coerce through Number.
 *
 * Support URL format (PRD §3.1, Settings view):
 *
 *   https://support.idlechampions.com/.../?user_id=NNNNNNN&device_hash=HHHH...
 *
 * The play-server API calls the hash `hash`, but the support URL exposes
 * it as `device_hash`. This module normalizes both forms into the canonical
 * `{ userId, hash }` shape.
 */

/**
 * Parse a pasted support URL and return `{ userId, hash }` if both query
 * params are present, otherwise null. Whitespace is trimmed; malformed
 * URLs return null rather than throwing so the settings UI can show a
 * validation error without a try/catch.
 *
 * Both `?device_hash=…` and `?hash=…` are accepted — if both are present
 * `device_hash` wins (it's the one the support URL actually uses).
 *
 * @param {unknown} raw — anything the user might paste (string, null, undefined)
 * @returns {{ userId: string, hash: string } | null}
 */
export function parseSupportUrl(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed === '') return null;

  let url;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  const userId = url.searchParams.get('user_id');
  const deviceHash = url.searchParams.get('device_hash');
  const plainHash = url.searchParams.get('hash');
  const hash = deviceHash || plainHash;

  if (!userId || !hash) return null;
  // Defensive: reject empty-after-trim values even though the API would
  // already have dropped them from searchParams in practice.
  if (userId.trim() === '' || hash.trim() === '') return null;

  return { userId: userId.trim(), hash: hash.trim() };
}

/**
 * Validate a candidate credentials object — used by both the settings save
 * path (before persisting) and the bootstrap credential gate (before
 * calling the API).
 *
 *   - `userId` and `hash` must be non-empty strings after trimming
 *   - `userId` must be all digits (matches every known account ID shape)
 *   - `hash` must match `/^[A-Za-z0-9]+$/` and be at least 16 chars
 *
 * Returns `true` iff the object passes all checks. The function is
 * intentionally conservative — a false positive here would send a
 * malformed request to the play server; a false negative just nudges
 * the user to paste a different URL.
 *
 * @param {unknown} creds
 * @returns {boolean}
 */
export function isValidCredentials(creds) {
  if (!creds || typeof creds !== 'object') return false;
  const { userId, hash } = creds;
  if (typeof userId !== 'string' || typeof hash !== 'string') return false;
  const uid = userId.trim();
  const h = hash.trim();
  if (uid === '' || h === '') return false;
  if (!/^\d+$/.test(uid)) return false;
  if (!/^[A-Za-z0-9]{16,}$/.test(h)) return false;
  return true;
}

/**
 * Normalize a credentials object into the canonical `{ userId, hash }`
 * shape. Accepts three input styles:
 *
 *   1. Canonical `{ userId, hash }` — returned as-is (trimmed).
 *   2. Support-URL form `{ user_id, device_hash }` — rekeyed.
 *   3. Legacy manual form `{ user_id, hash }` — rekeyed.
 *
 * Returns null if no recognizable shape is present. Does NOT call
 * isValidCredentials — the caller decides whether to persist invalid
 * shapes (the settings form surfaces the error in the UI).
 *
 * @param {unknown} input
 * @returns {{ userId: string, hash: string } | null}
 */
export function normalizeCredentials(input) {
  if (!input || typeof input !== 'object') return null;
  const userId = input.userId ?? input.user_id;
  const hash = input.hash ?? input.device_hash;
  if (typeof userId !== 'string' && typeof userId !== 'number') return null;
  if (typeof hash !== 'string') return null;
  return { userId: String(userId).trim(), hash: hash.trim() };
}
