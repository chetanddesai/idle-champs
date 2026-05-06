/**
 * backToTop.js — floating "Back to top" button.
 *
 * Shows a fixed button in the bottom-right corner after the user
 * scrolls past SCROLL_THRESHOLD px. Clicking smooth-scrolls back
 * to the top. Works on any view; wired once from main.js bootstrap().
 */

const SCROLL_THRESHOLD = 600;

let btn = null;
let ticking = false;

function updateVisibility() {
  if (!btn) return;
  const past = globalThis.scrollY > SCROLL_THRESHOLD;
  btn.classList.toggle('back-to-top--visible', past);
  btn.setAttribute('aria-hidden', past ? 'false' : 'true');
}

function onScroll() {
  if (ticking) return;
  ticking = true;
  globalThis.requestAnimationFrame(() => {
    updateVisibility();
    ticking = false;
  });
}

export function init() {
  if (btn) return; // guard against double-init

  btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'back-to-top';
  btn.setAttribute('aria-label', 'Back to top');
  btn.setAttribute('aria-hidden', 'true');
  // Upward chevron via inline SVG — same-origin, no external request.
  btn.innerHTML =
    '<svg aria-hidden="true" viewBox="0 0 16 16" width="16" height="16">' +
    '<path fill="currentColor" d="M7.646 4.646a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1-.708.708L8 5.707l-5.646 5.647a.5.5 0 0 1-.708-.708l6-6z"/>' +
    '</svg>';

  btn.addEventListener('click', () => {
    globalThis.scrollTo({ top: 0, behavior: 'smooth' });
  });

  document.body.appendChild(btn);
  globalThis.addEventListener('scroll', onScroll, { passive: true });
  updateVisibility();
}
