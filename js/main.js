/**
 * main.js — application entry point.
 *
 * Responsibilities (FR-3, tech-design §6.1):
 *
 *   1. Init state.js with the browser's localStorage.
 *   2. Wire the hash router.
 *   3. Run the credential gate: if no credentials, force-route to #/settings
 *      and block every other view from rendering.
 *   4. On first load with credentials, trigger `refreshAccount()` and, on
 *      success, render the routed view.
 *   5. Maintain the "Last refreshed" badge in the header and the Refresh
 *      button's enabled state.
 *   6. Listen for changes on ic.credentials and ic.userdetails so settings
 *      saves and mutations re-flow through the same bootstrap logic.
 *
 * All network, state, and credential-parsing logic lives in the modules
 * imported below — main.js is glue only.
 */

import * as state from './state.js';
import { KEYS } from './state.js';
import { getPlayServerForDefinitions, getUserDetails } from './serverCalls.js';
import { isValidCredentials } from './credentials.js';
import { formatTimeAgo } from './lib/format.js';
import { el, mount } from './lib/dom.js';
import { showToast, showError, describeError } from './lib/toast.js';
import * as settingsView from './views/settings.js';
import * as homeView from './views/home.js';
import * as legendaryView from './views/legendary/index.js';

// ---------------------------------------------------------------------------
// Router — Phase 1 routes. Legendary + Specializations are placeholders
// until their views land.
// ---------------------------------------------------------------------------

const ROUTES = {
  '': renderHome,
  '#/': renderHome,
  '#/home': renderHome,
  '#/settings': renderSettings,
  '#/legendary': renderLegendary,
  '#/specializations': renderSpecsPlaceholder,
};

function currentRoute() {
  const hash = globalThis.location.hash || '';
  if (Object.prototype.hasOwnProperty.call(ROUTES, hash)) return hash;
  return '#/home';
}

function navigate(hash) {
  if (globalThis.location.hash === hash) {
    // Force a re-render when the hash is already current.
    renderCurrentRoute();
  } else {
    globalThis.location.hash = hash;
  }
}

function getMainHost() {
  return document.getElementById('app-main');
}

function renderCurrentRoute() {
  const host = getMainHost();
  if (!host) return;

  // Credential gate: when credentials are absent, only the settings view
  // is allowed to render. Everything else is short-circuited to Settings.
  const creds = state.get(KEYS.CREDENTIALS);
  if (!isValidCredentials(creds) && currentRoute() !== '#/settings') {
    navigate('#/settings');
    return;
  }

  // Top-level error boundary. Any uncaught exception inside a view's
  // render path falls through here so customers see a friendly card
  // (and a reload button) instead of a half-rendered page. We also
  // surface the error to GA via gtag('event', 'exception', ...) so
  // these show up in analytics next time something regresses.
  const route = currentRoute();
  const fn = ROUTES[route] || renderHome;
  try {
    fn(host);
  } catch (err) {
    renderErrorBoundary(host, err, route);
  }
}

function reportException(err, route) {
  // eslint-disable-next-line no-console
  console.error('[ic-helper] view render failed:', route, err);
  try {
    if (typeof globalThis.gtag === 'function') {
      const stack = err && err.stack ? String(err.stack).slice(0, 500) : '';
      globalThis.gtag('event', 'exception', {
        description: `${route} :: ${describeError(err)}`,
        stack,
        fatal: true,
      });
    }
  } catch {
    // GA is best-effort; never let logging break the boundary itself.
  }
}

function renderErrorBoundary(host, err, route) {
  reportException(err, route);

  try {
    mount(host, [
      el('section', { class: 'card placeholder error-boundary' }, [
        el('h2', { class: 'placeholder__title', text: 'Something went wrong' }),
        el('p', {
          class: 'placeholder__body',
          text:
            'This is a bug. Reloading usually clears it, and the error has been logged so we can investigate.',
        }),
        el('div', { class: 'btn-row error-boundary__actions' }, [
          el('button', {
            class: 'btn btn--primary',
            attrs: { type: 'button' },
            text: 'Reload page',
            on: {
              click: () => globalThis.location.reload(),
            },
          }),
        ]),
      ]),
    ]);
  } catch (mountErr) {
    // Last-ditch fallback: the boundary itself failed to render. Use
    // plain DOM so the user is never left staring at a blank page.
    // eslint-disable-next-line no-console
    console.error('[ic-helper] error boundary failed:', mountErr);
    if (host) {
      host.textContent = 'Something went wrong. Please reload the page.';
    }
  }
}

function renderHome(host) {
  homeView.render(host);
}

function renderSettings(host) {
  settingsView.render(host);
}

function renderLegendary(host) {
  legendaryView.render(host);
}

function renderSpecsPlaceholder(host) {
  mount(host, [
    el('section', { class: 'card placeholder' }, [
      el('h2', { class: 'placeholder__title', text: 'Specialization picker — later milestone' }),
      el('p', {
        class: 'placeholder__body',
        text:
          'Slotted into PRD §3.3 after the Legendary view ships. Will recommend specialization + feat choices for each champion against the currently selected DPS lineup.',
      }),
    ]),
  ]);
}

// ---------------------------------------------------------------------------
// Header status — refresh button + last-refreshed badge
// ---------------------------------------------------------------------------

let refreshing = false;

function updateRefreshBadge() {
  const statusHost = document.getElementById('refresh-status');
  if (!statusHost) return;

  const valueNode = statusHost.querySelector('[data-role="last-refreshed"]');
  const btn = statusHost.querySelector('[data-action="refresh"]');
  const lastRefresh = state.get(KEYS.LAST_REFRESH_AT);
  const creds = state.get(KEYS.CREDENTIALS);

  if (valueNode) {
    valueNode.textContent = lastRefresh ? formatTimeAgo(lastRefresh) : '—';
    const ageMs = lastRefresh ? Date.now() - lastRefresh : 0;
    let freshness = '';
    if (lastRefresh) {
      if (ageMs > 60 * 60 * 1000) freshness = 'very-stale';
      else if (ageMs > 5 * 60 * 1000) freshness = 'stale';
    }
    if (freshness) valueNode.dataset.freshness = freshness;
    else delete valueNode.dataset.freshness;
  }

  if (btn) {
    btn.disabled = refreshing || !isValidCredentials(creds);
    btn.dataset.busy = refreshing ? 'true' : 'false';
    btn.textContent = refreshing ? 'Refreshing…' : 'Refresh';
  }
}

async function doRefresh() {
  if (refreshing) return false;
  refreshing = true;
  updateRefreshBadge();
  let success = false;
  try {
    await state.refreshAccount({ getPlayServerForDefinitions, getUserDetails });
    showToast('Account refreshed.', 'success');
    success = true;
  } catch (err) {
    showError(err);
  } finally {
    refreshing = false;
    updateRefreshBadge();
  }
  return success;
}

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

function wireHeader() {
  const statusHost = document.getElementById('refresh-status');
  const header = document.getElementById('app-header');
  if (statusHost) {
    statusHost.addEventListener('click', (ev) => {
      const target = ev.target.closest('[data-action="refresh"]');
      if (target) doRefresh();
    });
  }
  if (header) {
    header.addEventListener('click', (ev) => {
      const target = ev.target.closest('[data-action="open-settings"]');
      if (target) navigate('#/settings');
    });
  }
}

function wireStateListeners() {
  state.subscribe(KEYS.LAST_REFRESH_AT, updateRefreshBadge);
  state.subscribe(KEYS.CREDENTIALS, (creds) => {
    updateRefreshBadge();

    if (!isValidCredentials(creds)) {
      // Credentials were cleared — credential gate inside
      // renderCurrentRoute() will bounce off-route views to Settings.
      renderCurrentRoute();
      return;
    }

    // Credentials just became valid. If the user is sitting on the
    // Settings view (which is where Save-credentials fires from) we
    // want to auto-navigate to Home once their account data is ready,
    // so the save-and-go-home flow doesn't strand them on Settings.
    const onSettings = currentRoute() === '#/settings';
    const hasCachedDetails = !!state.get(KEYS.USER_DETAILS);

    renderCurrentRoute();

    if (!hasCachedDetails) {
      // First-refresh case: kick off the hydration call and, on success,
      // jump to Home if this save happened from Settings. On failure,
      // doRefresh already surfaced the error via toast and we stay on
      // Settings so the user can correct the creds.
      doRefresh().then((ok) => {
        if (ok && onSettings) navigate('#/home');
      });
    } else if (onSettings) {
      // Credentials were re-saved but we already have cached account
      // data — no refresh needed, just land on Home.
      navigate('#/home');
    }
  });
  state.subscribe(KEYS.USER_DETAILS, () => {
    // userdetails changed (refresh or mutation) — re-render current view
    // so the Home card's roster summary stays in sync.
    renderCurrentRoute();
  });
}

async function bootstrap() {
  state.init(globalThis.localStorage);
  wireHeader();
  wireStateListeners();

  globalThis.addEventListener('hashchange', renderCurrentRoute);

  renderCurrentRoute();
  updateRefreshBadge();

  // If we already have credentials and no cached userdetails, trigger a
  // first refresh in the background.
  const creds = state.get(KEYS.CREDENTIALS);
  const cached = state.get(KEYS.USER_DETAILS);
  if (isValidCredentials(creds) && !cached) {
    doRefresh();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
