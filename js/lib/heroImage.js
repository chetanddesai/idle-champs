/**
 * js/lib/heroImage.js
 *
 * Pure helpers for resolving a hero's portrait URL against the bundled
 * `data/definitions.hero-images.json` map.
 *
 * The bundled map is produced by `scripts/refresh-defs.js` from Emmote's
 * ic_wiki directory listing (MIT licensed). Runtime simply reads the map
 * and composes base_url + slug + portrait_path — no remote calls, no
 * cache management. The browser's HTTP cache handles image reuse.
 *
 * Shape of the input map:
 *   {
 *     "base_url": "https://emmotes.github.io/ic_wiki/images",
 *     "portrait_path": "portraits/portrait.png",
 *     "heroes": { "1": "bruenor", "2": "celeste", ... }
 *   }
 *
 * The functions are tolerant of partially-loaded or missing maps: an
 * absent entry or a malformed map yields `null` instead of throwing,
 * so the view can degrade to the monogram fallback without branching
 * on the map's readiness state.
 */

/**
 * Return the portrait URL for a hero, or null if unmapped.
 *
 * @param {number|string} heroId
 * @param {object|null} images - parsed definitions.hero-images.json, or null
 * @returns {string|null}
 */
export function heroPortraitUrl(heroId, images) {
  if (!images || typeof images !== 'object') return null;
  const { base_url, portrait_path, heroes } = images;
  if (!base_url || !portrait_path || !heroes) return null;
  const slug = heroes[String(heroId)];
  if (!slug || typeof slug !== 'string') return null;
  return `${base_url}/${slug}/${portrait_path}`;
}

/**
 * Return true when the map can resolve at least one hero to a portrait.
 * Useful for gating "show avatars" vs "show monograms" decisions without
 * per-tile null checks.
 *
 * @param {object|null} images
 * @returns {boolean}
 */
export function hasHeroImages(images) {
  return Boolean(
    images &&
      typeof images === 'object' &&
      images.base_url &&
      images.portrait_path &&
      images.heroes &&
      Object.keys(images.heroes).length > 0
  );
}

/**
 * Short monogram fallback for heroes without a portrait slug — first two
 * letters of the display name, uppercase. Empty string for empty input.
 *
 * @param {string} name
 * @returns {string}
 */
export function heroMonogram(name) {
  if (!name || typeof name !== 'string') return '';
  const trimmed = name.trim();
  if (!trimmed) return '';
  // Try first letter of first two words (e.g., "Black Viper" → "BV").
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return trimmed.slice(0, 2).toUpperCase();
}
