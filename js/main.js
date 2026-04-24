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
import { showToast, showError } from './lib/toast.js';
import * as settingsView from './views/settings.js';
import * as homeView from './views/home.js';

// ---------------------------------------------------------------------------
// Router — Phase 1 routes. Legendary + Specializations are placeholders
// until their views land.
// ---------------------------------------------------------------------------

const ROUTES = {
  '': renderHome,
  '#/': renderHome,
  '#/home': renderHome,
  '#/settings': renderSettings,
  '#/legendary': renderLegendaryPlaceholder,
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

  const fn = ROUTES[currentRoute()] || renderHome;
  fn(host);
}

function renderHome(host) {
  homeView.render(host);
}

function renderSettings(host) {
  settingsView.render(host);
}

function renderLegendaryPlaceholder(host) {
  mount(host, [
    el('section', { class: 'card placeholder' }, [
      el('h2', { class: 'placeholder__title', text: 'Legendary view — coming soon' }),
      el('p', {
        class: 'placeholder__body',
        text:
          'This is where Forge Run (favor-gated upgrade ranker) and Reforge (probabilistic reroll planner) will live. The pure data-model modules (scopeMatcher + legendaryModel) and the bundled hero / effect / scope / favor definitions are already in place; the views themselves land next.',
      }),
    ]),
  ]);
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
  if (refreshing) return;
  refreshing = true;
  updateRefreshBadge();
  try {
    await state.refreshAccount({ getPlayServerForDefinitions, getUserDetails });
    showToast('Account refreshed.', 'success');
  } catch (err) {
    showError(err);
  } finally {
    refreshing = false;
    updateRefreshBadge();
  }
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
    // If credentials just became valid, re-render (route guard may have
    // parked us on Settings) and kick off a refresh.
    if (isValidCredentials(creds)) {
      renderCurrentRoute();
      // If there's no cached userdetails yet, fetch. If there IS cached
      // data, skip the auto-refresh — the user can tap Refresh explicitly.
      if (!state.get(KEYS.USER_DETAILS)) doRefresh();
    } else {
      renderCurrentRoute();
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
