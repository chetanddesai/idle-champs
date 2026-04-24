/**
 * settings.js — the Settings view.
 *
 * Responsibilities (PRD §3.1, FR-3):
 *
 *   1. Render a form for the user to paste a support URL OR enter
 *      user_id + hash manually.
 *   2. On Save, normalize + validate credentials and persist them to
 *      state.ic.credentials.
 *   3. Trigger a refresh (the caller — main.js — subscribes to the
 *      credentials change event and runs refreshAccount in response).
 *   4. Provide a Clear-credentials action that wipes all ic.* keys.
 *
 * The view does not directly call serverCalls or run refreshAccount —
 * that plumbing lives in main.js. This keeps the view's only concerns
 * the form + validation, which keeps it easy to test manually in the
 * browser and trivial to move if we ever split views across files.
 */

import * as state from '../state.js';
import { KEYS } from '../state.js';
import { parseSupportUrl, isValidCredentials, normalizeCredentials } from '../credentials.js';
import { el, mount } from '../lib/dom.js';

// Placeholders are intentionally obvious fakes — never put real credentials here.
const HASH_PLACEHOLDER = '32-character hex string from your support URL';
const SUPPORT_URL_PLACEHOLDER =
  'https://support.idlechampions.com/hc/en-us/requests/new?user_id=NNNNNNN&device_hash=HHHHHHHH...';

export function render(host) {
  const existing = state.get(KEYS.CREDENTIALS) || {};

  const errorNode = el('div', { class: 'form-field__error', attrs: { hidden: true } });
  const statusNode = el('div', { attrs: { 'aria-live': 'polite' } });

  const userIdInput = el('input', {
    class: 'input',
    attrs: {
      id: 'field-user-id',
      name: 'user_id',
      type: 'text',
      inputmode: 'numeric',
      autocomplete: 'off',
      spellcheck: 'false',
      placeholder: '7-digit number from your support URL',
      value: existing.userId || '',
    },
  });

  const hashInput = el('input', {
    class: 'input',
    attrs: {
      id: 'field-hash',
      name: 'hash',
      type: 'text',
      autocomplete: 'off',
      spellcheck: 'false',
      placeholder: HASH_PLACEHOLDER,
      value: existing.hash || '',
    },
  });

  const supportUrlInput = el('textarea', {
    class: 'textarea',
    attrs: {
      id: 'field-support-url',
      name: 'support_url',
      placeholder: SUPPORT_URL_PLACEHOLDER,
      rows: '3',
      autocomplete: 'off',
      spellcheck: 'false',
    },
  });

  /**
   * When the user pastes or types into the support URL field, try to
   * parse it and populate the manual fields. This gives instant feedback
   * that the paste worked without forcing a separate "Parse" button.
   */
  supportUrlInput.addEventListener('input', () => {
    const parsed = parseSupportUrl(supportUrlInput.value);
    if (parsed) {
      userIdInput.value = parsed.userId;
      hashInput.value = parsed.hash;
      hideError();
    }
  });

  function showError(message) {
    errorNode.textContent = message;
    errorNode.removeAttribute('hidden');
  }

  function hideError() {
    errorNode.textContent = '';
    errorNode.setAttribute('hidden', '');
  }

  function showStatus(node) {
    mount(statusNode, node);
  }

  const form = el(
    'form',
    {
      class: 'settings__form',
      attrs: { novalidate: true, 'aria-labelledby': 'settings-title' },
      on: {
        submit: (ev) => {
          ev.preventDefault();

          // Support URL takes precedence if it parses cleanly; otherwise
          // use the manual fields. The support-URL parser handles whitespace
          // and various query-param shapes per credentials.js.
          const pastedUrl = supportUrlInput.value.trim();
          let candidate = null;
          if (pastedUrl) {
            candidate = parseSupportUrl(pastedUrl);
            if (!candidate) {
              showError(
                'Could not parse a user_id and device_hash from that URL. Double-check the paste or fill in the manual fields below.'
              );
              return;
            }
          } else {
            candidate = normalizeCredentials({
              userId: userIdInput.value,
              hash: hashInput.value,
            });
          }

          if (!isValidCredentials(candidate)) {
            showError(
              'Credentials look malformed. user_id must be numeric and hash must be at least 16 alphanumeric characters.'
            );
            return;
          }

          hideError();
          state.set(KEYS.CREDENTIALS, candidate);
          showStatus(
            el('div', { class: 'banner banner--success' }, [
              el('strong', { text: 'Credentials saved.' }),
              ' The app will fetch your account state on the next refresh.',
            ])
          );
          // Clear the support URL paste so repeated submits don't resubmit
          // the same string.
          supportUrlInput.value = '';
        },
      },
    },
    [
      el('div', { class: 'form-field' }, [
        el('label', {
          class: 'form-field__label',
          attrs: { for: 'field-support-url' },
          text: 'Support URL (recommended)',
        }),
        supportUrlInput,
        el('span', {
          class: 'form-field__hint',
          text:
            'Paste the URL from Idle Champions → Options → Support. We parse user_id and device_hash from the query string; the fields below populate automatically.',
        }),
      ]),

      el('div', { class: 'form-field' }, [
        el('label', {
          class: 'form-field__label',
          attrs: { for: 'field-user-id' },
          text: 'user_id',
        }),
        userIdInput,
      ]),

      el('div', { class: 'form-field' }, [
        el('label', {
          class: 'form-field__label',
          attrs: { for: 'field-hash' },
          text: 'hash',
        }),
        hashInput,
        el('span', {
          class: 'form-field__hint',
          text:
            'The support URL calls this "device_hash"; the play-server API calls it "hash". Both refer to the same 32-character value.',
        }),
      ]),

      errorNode,

      el('div', { class: 'btn-row' }, [
        el('button', {
          class: 'btn btn--primary',
          attrs: { type: 'submit' },
          text: 'Save credentials',
        }),
        el('button', {
          class: 'btn btn--danger',
          attrs: { type: 'button' },
          text: 'Clear credentials',
          on: {
            click: () => {
              if (!confirm('Wipe all saved credentials and cached account data from this browser?')) {
                return;
              }
              state.clearAll();
              userIdInput.value = '';
              hashInput.value = '';
              supportUrlInput.value = '';
              hideError();
              showStatus(
                el('div', { class: 'banner banner--error' }, [
                  el('strong', { text: 'Credentials cleared.' }),
                  ' The app will route back here on the next action.',
                ])
              );
            },
          },
        }),
      ]),
    ]
  );

  const section = el('section', { class: 'card' }, [
    el('h2', { class: 'card__title', attrs: { id: 'settings-title' }, text: 'Settings' }),
    el('p', {
      class: 'card__meta',
      text:
        'Your credentials are stored only in this browser\'s localStorage and sent only to the official Idle Champions play servers.',
    }),
    form,
    statusNode,
  ]);

  mount(host, section);
}
