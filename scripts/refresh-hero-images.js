#!/usr/bin/env node
/**
 * scripts/refresh-hero-images.js
 *
 * Regenerates the bundled hero-portrait slug map at
 * `data/definitions.hero-images.json` from a live Idle Champions
 * `getdefinitions` call + Emmote's wiki directory listing.
 *
 * THIS IS THE ONLY DATA-FILE-PRODUCING SCRIPT IN THE REPO.
 * Hero/effect/scope/favor definitions come from a runtime `getdefinitions`
 * call cached in localStorage (see js/lib/definitions.js + the
 * `Runtime defs patching` design doc) — only hero portraits remain
 * bundled because slug resolution requires scraping a directory listing
 * that GitHub Pages doesn't expose to browsers (CORS + no public listing
 * API → maintainer-only step).
 *
 * Output file:
 *   - data/definitions.hero-images.json   (hero_id → Emmote's wiki slug)
 *
 * Side-effect (informational only, never written):
 *   - Runs the same parser the runtime uses (`js/lib/legendaryDefsParser.js`)
 *     against the live response to surface "unknown scope kind" warnings
 *     for new game content. Acts as an early-warning that
 *     `legendaryDefsParser.js` needs extending before customers see `?`
 *     badges in the UI.
 *
 * Hero image slugs (see tech-design-legendary.md Appendix B, Decision 9):
 *   Portraits are served directly from Emmote's ic_wiki GitHub Pages site
 *   (https://emmotes.github.io/ic_wiki/, MIT licensed). We fetch the
 *   public directory listing at refresh time, match each defined hero to
 *   a slug via name-normalization heuristics (ligature expansion,
 *   diacritic stripping, word permutations), and emit a lean
 *   { hero_id: slug } map. Heroes that can't be auto-resolved fall through
 *   to HERO_SLUG_OVERRIDES for manual mapping; anything still unresolved
 *   prints a warning so new heroes don't silently disappear from the UI.
 *
 * Credentials: read from `.credentials.json` at the repo root (gitignored).
 *   { "user_id": "YOUR_USER_ID", "hash": "YOUR_DEVICE_HASH" }
 *
 * See `.credentials.example.json` for the committed template.
 *
 * Usage:  npm run refresh-hero-images
 *         (or: node scripts/refresh-hero-images.js)
 *
 * No npm dependencies — pure Node built-ins (Node 18+ for global `fetch`).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseDefinitions } from '../js/lib/legendaryDefsParser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const CRED_PATH = path.join(REPO_ROOT, '.credentials.json');
const DATA_DIR = path.join(REPO_ROOT, 'data');
const HERO_IMAGES_PATH = path.join(DATA_DIR, 'definitions.hero-images.json');

const MASTER_SERVER = 'https://master.idlechampions.com/~idledragons/';
const BOILERPLATE = {
  language_id: '1',
  timestamp: '0',
  request_id: '0',
  mobile_client_version: '99999',
  include_free_play_objectives: 'true',
  instance_key: '1',
  offline_v2_build: '1',
  localization_aware: 'true',
};

// Emmote's IC Wiki configuration (https://github.com/Emmotes/ic_wiki, MIT).
const WIKI_IMAGES_API =
  'https://api.github.com/repos/Emmotes/ic_wiki/contents/docs/images?ref=main';
const WIKI_IMAGES_BASE_URL = 'https://emmotes.github.io/ic_wiki/images';
const WIKI_PORTRAIT_PATH = 'portraits/portrait.png';
const WIKI_ATTRIBUTION =
  "Hero portraits © Emmote (@Emmotes), MIT licensed. Source: https://github.com/Emmotes/ic_wiki";

// Manual slug overrides for heroes whose wiki slug can't be inferred from
// the name via the heuristics in `heroSlugCandidates`. Keep this list tight:
// every entry is a maintenance debt if the wiki reorganizes.
const HERO_SLUG_OVERRIDES = {
  146: 'darkurge', // "The Dark Urge" — wiki strips leading article.
};

function die(msg) {
  console.error(`\n[refresh-hero-images] ${msg}\n`);
  process.exit(1);
}

function loadCredentials() {
  if (!fs.existsSync(CRED_PATH)) {
    die(
      `No credentials file found at ${CRED_PATH}.\n` +
      `Copy .credentials.example.json to .credentials.json and fill in your user_id and hash.\n` +
      `See README.md §"Refreshing hero portraits".`
    );
  }
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(CRED_PATH, 'utf8'));
  } catch (e) {
    die(`Failed to parse ${CRED_PATH}: ${e.message}`);
  }
  if (!raw.user_id || !raw.hash) {
    die(`${CRED_PATH} must contain "user_id" and "hash" fields.`);
  }
  return { user_id: String(raw.user_id), hash: String(raw.hash) };
}

async function call(serverUrl, callName, params = {}, { allowSwitchRetry = true } = {}) {
  const qs = new URLSearchParams({ call: callName, ...BOILERPLATE, ...params });
  const url = `${serverUrl}post.php?${qs.toString()}`;
  const res = await fetch(url);
  if (!res.ok) die(`${callName} → HTTP ${res.status}`);
  const body = await res.json();
  if (body.switch_play_server && allowSwitchRetry) {
    console.log(`[refresh-hero-images] ${callName} asked to switch to ${body.switch_play_server}; retrying`);
    return call(body.switch_play_server, callName, params, { allowSwitchRetry: false });
  }
  if (body.failure_reason) die(`${callName} failed: ${body.failure_reason}`);
  if (body.success === false) die(`${callName} returned success=false`);
  return { body, serverUrl: body.switch_play_server || serverUrl };
}

/**
 * Generate candidate wiki-directory slugs for a hero, in order of preference.
 * The resolver tries each candidate against the live wiki listing and picks
 * the first hit. Handles the three real-world wrinkles: ligatures (`æ`→`ae`,
 * `ß`→`ss`), diacritics (`ô`→`o`), and multi-word names (first word, full
 * concatenation, last word). Returns [] if the name is empty.
 */
function heroSlugCandidates(hero) {
  const name = hero.name || hero.english_name || '';
  const expanded = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[æÆ]/g, 'ae')
    .replace(/[œŒ]/g, 'oe')
    .replace(/[ßẞ]/g, 'ss')
    .toLowerCase();
  const alphaNum = expanded.replace(/[^a-z0-9 ]/g, '').trim();
  const words = alphaNum.split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const set = new Set();
  set.add(words[0]);
  set.add(words.join(''));
  if (words.length >= 2) set.add(words.slice(0, 2).join(''));
  set.add(words[words.length - 1]);
  return [...set];
}

/**
 * Resolve hero→slug mapping against Emmote's wiki directory listing.
 * Returns { heroes: { [id]: slug }, unresolved: [ids], wikiSlugCount }.
 * Heroes with a HERO_SLUG_OVERRIDES entry bypass the heuristic. Heroes with
 * no matching slug (e.g., placeholder "Y4E15" entries) are recorded in
 * `unresolved` and omitted from the map — the view layer falls back to the
 * monogram treatment for any id that isn't present.
 */
async function buildHeroImageMap(heroes) {
  let wikiSlugs;
  try {
    const res = await fetch(WIKI_IMAGES_API);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const entries = await res.json();
    if (!Array.isArray(entries)) throw new Error('Unexpected response shape');
    wikiSlugs = new Set(
      entries.filter((e) => e.type === 'dir').map((e) => e.name)
    );
  } catch (e) {
    die(
      `Failed to fetch wiki image listing (${WIKI_IMAGES_API}): ${e.message}\n` +
      `  Without the listing we can't verify slug→image mapping. Retry, or\n` +
      `  if the wiki structure changed, inspect the listing manually before\n` +
      `  re-running. Don't write an empty file.`
    );
  }

  if (wikiSlugs.size === 0) {
    die(
      `Wiki listing returned 0 directory entries — Emmote's repo layout may have\n` +
      `  changed. Inspect ${WIKI_IMAGES_API} manually before re-running.\n` +
      `  Refusing to write an empty hero-images map (would blank every portrait).`
    );
  }

  const mapped = {};
  const unresolved = [];
  for (const h of heroes) {
    const override = HERO_SLUG_OVERRIDES[h.id];
    if (override && wikiSlugs.has(override)) {
      mapped[h.id] = override;
      continue;
    }
    const hit = heroSlugCandidates(h).find((c) => wikiSlugs.has(c));
    if (hit) mapped[h.id] = hit;
    else unresolved.push(h.id);
  }
  return { heroes: mapped, unresolved, wikiSlugCount: wikiSlugs.size };
}

async function main() {
  const creds = loadCredentials();
  console.log(`[refresh-hero-images] Using credentials from ${CRED_PATH}`);

  console.log(`[refresh-hero-images] Discovering play server…`);
  const disc = await call(MASTER_SERVER, 'getPlayServerForDefinitions');
  const playServer = disc.body.play_server;
  if (!playServer) die('Master server did not return a play_server URL');
  console.log(`[refresh-hero-images]   play_server = ${playServer}`);

  console.log(`[refresh-hero-images] Fetching instance_id via getuserdetails…`);
  const ud = await call(playServer, 'getuserdetails', {
    user_id: creds.user_id,
    hash: creds.hash,
  });
  const instanceId = ud.body.details?.instance_id;
  if (!instanceId) die('getuserdetails did not return details.instance_id');
  console.log(`[refresh-hero-images]   instance_id = ${instanceId}`);

  console.log(`[refresh-hero-images] Fetching getdefinitions (filtered: heroes, attacks, legendary effects, campaigns)…`);
  const defs = await call(ud.serverUrl, 'getdefinitions', {
    user_id: creds.user_id,
    hash: creds.hash,
    instance_id: instanceId,
    supports_chunked_defs: '0',
    new_achievements: '1',
    challenge_sets_no_deltas: '0',
    filter: 'hero_defines,attack_defines,legendary_effect_defines,campaign_defines',
  });
  const body = defs.body;

  if (!Array.isArray(body.hero_defines)) {
    die(
      'Response missing hero_defines. Server may have returned a delta-only payload; ' +
      're-run with the supports_chunked_defs=0 we already send and see if shape changed.'
    );
  }

  // Run the runtime parser once for its side-effects (heroes for slug
  // resolution + audit warnings). We never persist the parser output —
  // those shapes come from the runtime cache now.
  const parsed = parseDefinitions(body);
  const heroes = parsed.heroes;
  console.log(
    `[refresh-hero-images] Parsed: heroes=${heroes.length}, ` +
    `effects=${parsed.effects.length}, scopes=${parsed.scopes.length}, ` +
    `favors=${parsed.favors.length}.`
  );

  console.log(`[refresh-hero-images] Resolving hero image slugs against Emmote's wiki…`);
  const heroImages = await buildHeroImageMap(heroes);
  console.log(
    `[refresh-hero-images]   wiki dirs=${heroImages.wikiSlugCount}, ` +
    `mapped=${Object.keys(heroImages.heroes).length}, ` +
    `unresolved=${heroImages.unresolved.length}`
  );

  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(
    HERO_IMAGES_PATH,
    JSON.stringify(
      {
        source: 'https://github.com/Emmotes/ic_wiki',
        attribution: WIKI_ATTRIBUTION,
        base_url: WIKI_IMAGES_BASE_URL,
        portrait_path: WIKI_PORTRAIT_PATH,
        heroes: heroImages.heroes,
      },
      null,
      2
    ) + '\n'
  );

  const size = fs.statSync(HERO_IMAGES_PATH).size;
  console.log(
    `[refresh-hero-images] Wrote ${HERO_IMAGES_PATH} ` +
    `(${size} bytes, ${Object.keys(heroImages.heroes).length} mapped).`
  );

  // -------------------------------------------------------------------
  // Sanity-check warnings — informational only, exit code stays 0.
  // -------------------------------------------------------------------
  if (parsed.unknownScopeIds.length > 0) {
    console.warn(
      `[refresh-hero-images] WARN: ${parsed.unknownScopeIds.length} effect(s) returned unknown scope kind.\n` +
      `  IDs: ${parsed.unknownScopeIds.join(', ')}\n` +
      `  This is orthogonal to hero portraits, but signals new game content.\n` +
      `  Extend deriveScope() in js/lib/legendaryDefsParser.js — file a separate\n` +
      `  issue, do NOT block this hero-images PR on it.`
    );
  } else {
    console.log(
      `[refresh-hero-images] All ${parsed.scopes.length} effects classified into known scope kinds.`
    );
  }

  if (parsed.favorsMissingShortName.length > 0) {
    console.warn(
      `[refresh-hero-images] WARN: ${parsed.favorsMissingShortName.length} favor(s) have no short_name.\n` +
      `  reset_currency_ids: ${parsed.favorsMissingShortName.join(', ')}\n` +
      `  Display will fall back to "Favor #<id>" in the UI until fixed upstream.`
    );
  }

  if (heroImages.unresolved.length > 0) {
    // Filter out known placeholder heroes (name="Y4E15") since those
    // intentionally have no art on the wiki; surface only the genuinely
    // surprising misses that the maintainer should investigate.
    const placeholderIds = new Set(
      heroes.filter((h) => h.name === 'Y4E15').map((h) => h.id)
    );
    const surprising = heroImages.unresolved.filter((id) => !placeholderIds.has(id));
    if (surprising.length > 0) {
      const byId = new Map(heroes.map((h) => [h.id, h.name]));
      console.warn(
        `[refresh-hero-images] WARN: ${surprising.length} hero(es) have no resolved slug.\n` +
        surprising.map((id) => `    #${id} ${byId.get(id)}`).join('\n') + '\n' +
        `  If the wiki has the portrait but the auto-resolver missed it, add an\n` +
        `  entry to HERO_SLUG_OVERRIDES at the top of this script and re-run.\n` +
        `  If the wiki doesn't have a portrait yet, leave it — runtime falls\n` +
        `  back to a monogram. Don't invent a slug.`
      );
    } else {
      console.log(
        `[refresh-hero-images] ${heroImages.unresolved.length} placeholder hero(es) intentionally unmapped.`
      );
    }
  }

  console.log(`[refresh-hero-images] Done.`);
}

main().catch((e) => die(e.stack || String(e)));
