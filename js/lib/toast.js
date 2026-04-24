/**
 * toast.js — transient notification surface (FR-5, tech-design §5).
 *
 * The app uses toasts for exactly two things in V1:
 *
 *   1. Refresh-button feedback — "Account refreshed." on success,
 *      human-readable error text on failure.
 *   2. Settings-action confirmation — "Credentials saved.", etc.
 *
 * In V2 the same component surfaces mutation failures (tech-design
 * Appendix B #7) — no API churn expected when that lands.
 *
 * The module is split into a pure part and a DOM-touching part:
 *
 *   - `describeError(err)` is a pure function that normalizes an `ApiError`
 *     (or any thrown `Error`) into a one-line human-readable string. It's
 *     covered by `node:test` and can be composed with anything — toast,
 *     banner, inline text — without reimporting this module's DOM surface.
 *   - `showToast(...)` and `showError(...)` are the DOM helpers; they
 *     lazily look up the `#toast-region` host at call time, so they're
 *     safe to import in Node even though they can't actually run there.
 *
 * The toast region is created in `index.html` (`<div id="toast-region">`)
 * and styled in `css/components.css` (`.toast`, `.toast--error`,
 * `.toast--success`, `.toast-region`).
 */

import { ApiError } from '../serverCalls.js';

const DEFAULT_TIMEOUT_MS = 5000;
const TOAST_REGION_ID = 'toast-region';

/**
 * Pure: normalize an error into a single line of display text.
 *
 * Recognizes `ApiError` and reports its kind-specific message. Falls back
 * to `err.message` for generic errors, and finally to a generic string so
 * the UI never shows "undefined" or "[object Object]".
 *
 *   describeError(new ApiError({kind:'network', message:'offline'}))
 *     → "Network error: offline"
 *   describeError(new ApiError({kind:'http', status:500, message:'x'}))
 *     → "Server error (HTTP 500)"
 *   describeError(new ApiError({kind:'api', message:'Security hash failure'}))
 *     → "Security hash failure"
 *   describeError(new Error('boom'))
 *     → "boom"
 *   describeError(null)
 *     → "Unexpected error"
 *
 * @param {unknown} err
 * @returns {string}
 */
export function describeError(err) {
  if (err instanceof ApiError) {
    switch (err.kind) {
      case 'network':
        return `Network error: ${err.message || 'request failed'}`;
      case 'http':
        return `Server error (HTTP ${err.status ?? 'unknown'})`;
      case 'api':
      default:
        return err.message || 'API error';
    }
  }
  if (err && typeof err === 'object' && typeof err.message === 'string' && err.message) {
    return err.message;
  }
  return 'Unexpected error';
}

/**
 * Impure: render a toast into the document's toast region.
 *
 * Gracefully no-ops if the region isn't in the DOM (e.g. during early
 * bootstrap or in a test harness without the `index.html` shell).
 *
 *   showToast('Account refreshed.', 'success');
 *   showToast('Security hash failure', 'error');
 *
 * @param {string} message
 * @param {'info' | 'success' | 'error'} [kind='info']
 * @param {object} [options]
 * @param {number} [options.timeoutMs=5000] — 0 disables auto-dismiss.
 * @returns {HTMLElement | null} the inserted node (or null if no host).
 */
export function showToast(message, kind = 'info', options = {}) {
  if (typeof document === 'undefined') return null;
  const host = document.getElementById(TOAST_REGION_ID);
  if (!host) return null;

  const className =
    kind === 'error'
      ? 'toast toast--error'
      : kind === 'success'
        ? 'toast toast--success'
        : 'toast';

  const node = document.createElement('div');
  node.className = className;
  node.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  node.textContent = String(message ?? '');
  host.appendChild(node);

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (timeoutMs > 0) {
    setTimeout(() => {
      if (node.isConnected) node.remove();
    }, timeoutMs);
  }

  return node;
}

/**
 * Convenience: run `describeError(err)` through `showToast(_, 'error')`.
 * Returns the inserted node for symmetry with `showToast`.
 *
 * @param {unknown} err
 * @param {object} [options]
 * @returns {HTMLElement | null}
 */
export function showError(err, options = {}) {
  return showToast(describeError(err), 'error', options);
}
