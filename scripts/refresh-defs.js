#!/usr/bin/env node
/**
 * scripts/refresh-defs.js
 *
 * Regenerates the bundled definition files in `data/` from a live call to the
 * Idle Champions play server's `getdefinitions` endpoint.
 *
 * Output files:
 *   - data/definitions.heroes.json                      (trimmed + enriched hero_defines)
 *   - data/definitions.legendary-effects.json           (trimmed legendary_effect_defines)
 *   - data/definitions.legendary-effect-scopes.json     (derived scope tags per effect)
 *   - data/definitions.favors.json                      (reset_currency_id → short_name lookup)
 *   - data/definitions.hero-images.json                 (hero_id → Emmote's wiki slug)
 *   - data/definitions.checksum.json                    (metadata, counts, unknown scopes)
 *
 * Hero image slugs (see tech-design-legendary.md Appendix B, Decision 9):
 *   Portraits are served directly from Emmote's ic_wiki GitHub Pages site
 *   (https://emmotes.github.io/ic_wiki/, MIT licensed). We fetch the public
 *   directory listing at refresh time, match each bundled hero to a slug via
 *   name-normalization heuristics (ligature expansion, diacritic stripping,
 *   word permutations), and emit a lean { hero_id: slug } map. Heroes that
 *   can't be auto-resolved fall through to HERO_SLUG_OVERRIDES for manual
 *   mapping; anything still unresolved is listed in the checksum file so new
 *   heroes don't silently disappear from the UI.
 *
 * Hero enrichment (see PRD §4.2):
 *   - tags            — pre-tokenized race/gender/alignment/role tags from the API
 *   - damage_types    — intersection of attack.tags ∪ attack.damage_types with {melee,ranged,magic}
 *   - ability_scores  — {str, dex, con, int, wis, cha} for stat-threshold matching
 *   - class, race     — convenience display fields
 *   - legendary_effect_id — signature effect id(s)
 *
 * Scope derivation (see PRD §3.2.2):
 *   Each legendary_effect_define is tagged with {kind, value?|stat+min?} where
 *   kind ∈ {global, race, gender, alignment, damage_type, stat_threshold, unknown}.
 *   Effects with effect_string starting `global_` are tagged {kind:"global"}.
 *   Scoped effects have description "Increases the damage of all X by $(amount)%";
 *   X is parsed into the appropriate kind. The "Halfing" typo in-game is
 *   normalized to "halfling" to match hero tags. Unclassified effects are
 *   tagged {kind:"unknown"} and their ids are listed in the metadata file
 *   so new game content is caught explicitly on the next refresh.
 *
 * Credentials: read from `.credentials.json` at the repo root (gitignored).
 *   { "user_id": "YOUR_USER_ID", "hash": "YOUR_DEVICE_HASH" }
 *
 * See `.credentials.example.json` for the committed template.
 *
 * Usage:  node scripts/refresh-defs.js
 *
 * No dependencies — pure Node built-ins (Node 18+ for global `fetch`).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const CRED_PATH = path.join(REPO_ROOT, '.credentials.json');
const DATA_DIR = path.join(REPO_ROOT, 'data');

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

const DAMAGE_TYPE_TOKENS = new Set(['melee', 'ranged', 'magic']);
const GENDER_TOKENS = new Set(['Male', 'Female', 'Nonbinary']);
const ALIGNMENT_TOKENS = new Set(['Good', 'Evil', 'Lawful', 'Chaotic', 'Neutral']);

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

// Known-typo normalization: the effect description says "Halfing Champions"
// but hero tags spell it correctly as "halfling". Map at derivation time so
// the runtime matcher is trivially hero.tags.includes(scope.value).
const SCOPE_VALUE_ALIASES = {
  Halfing: 'Halfling',
};

function die(msg) {
  console.error(`\n[refresh-defs] ${msg}\n`);
  process.exit(1);
}

function loadCredentials() {
  if (!fs.existsSync(CRED_PATH)) {
    die(
      `No credentials file found at ${CRED_PATH}.\n` +
      `Copy .credentials.example.json to .credentials.json and fill in your user_id and hash.\n` +
      `See README.md §"Refreshing bundled definitions".`
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
    console.log(`[refresh-defs] ${callName} asked to switch to ${body.switch_play_server}; retrying`);
    return call(body.switch_play_server, callName, params, { allowSwitchRetry: false });
  }
  if (body.failure_reason) die(`${callName} failed: ${body.failure_reason}`);
  if (body.success === false) die(`${callName} returned success=false`);
  return { body, serverUrl: body.switch_play_server || serverUrl };
}

/**
 * Derive the per-hero damage_types array (subset of {melee, ranged, magic})
 * from the hero's base_attack_id resolved against attack_defines.
 *
 * Ranged vs. melee is encoded in `attack.tags` (attack style / distance),
 * magic is encoded in `attack.damage_types` (damage type). We union both
 * and intersect with {melee, ranged, magic} so a hero can land in multiple
 * buckets (e.g., Cazrin is both `magic` and `ranged`).
 */
function deriveDamageTypes(hero, attackById) {
  const attack = attackById.get(hero.base_attack_id);
  if (!attack) return [];
  const merged = new Set([
    ...(attack.tags || []).map((t) => String(t).toLowerCase()),
    ...(attack.damage_types || []).map((t) => String(t).toLowerCase()),
  ]);
  return ['melee', 'ranged', 'magic'].filter((t) => merged.has(t));
}

/**
 * Parse a legendary_effect_define into a machine-readable scope tag.
 * Returns one of:
 *   {kind:'global'}
 *   {kind:'race',          value:'Human'}
 *   {kind:'gender',        value:'Female'}
 *   {kind:'alignment',     value:'Good'}
 *   {kind:'damage_type',   value:'Magic'}
 *   {kind:'stat_threshold',stat:'str', min:11}
 *   {kind:'unknown'}
 *
 * Scope token `value` is stored in its canonical cased form (e.g. "Half-Elf")
 * so display is easy; runtime matching lowercases on compare.
 */
function deriveScope(effect) {
  const eff = (effect.effects && effect.effects[0]) || {};
  const effectString = eff.effect_string || '';
  const description = eff.description || '';

  if (effectString.startsWith('global_')) {
    return { kind: 'global' };
  }

  // Stat threshold: "Champions with a STR score of 11 or higher"
  const statMatch = description.match(
    /Champions with a (STR|DEX|CON|INT|WIS|CHA) score of (\d+) or higher/i
  );
  if (statMatch) {
    return {
      kind: 'stat_threshold',
      stat: statMatch[1].toLowerCase(),
      min: Number(statMatch[2]),
    };
  }

  // General scoped pattern: "all X Champions" (allowing letters, spaces, hyphens)
  const tokenMatch = description.match(/damage of all ([\w\- ]+?) Champions/);
  if (tokenMatch) {
    const raw = tokenMatch[1].trim();
    const normalized = SCOPE_VALUE_ALIASES[raw] || raw;
    if (DAMAGE_TYPE_TOKENS.has(normalized.toLowerCase())) {
      return { kind: 'damage_type', value: normalized };
    }
    if (GENDER_TOKENS.has(normalized)) {
      return { kind: 'gender', value: normalized };
    }
    if (ALIGNMENT_TOKENS.has(normalized)) {
      return { kind: 'alignment', value: normalized };
    }
    // Assume race for everything else; caller can audit via unknown_scope_ids
    // if a new category shape appears that shouldn't land in race.
    return { kind: 'race', value: normalized };
  }

  return { kind: 'unknown' };
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
      `  Without the listing we can't verify slug→image mapping. Retry or set\n` +
      `  SKIP_HERO_IMAGES=1 to bypass this step and reuse the previous map.`
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
  console.log(`[refresh-defs] Using credentials from ${CRED_PATH}`);

  console.log(`[refresh-defs] Discovering play server…`);
  const disc = await call(MASTER_SERVER, 'getPlayServerForDefinitions');
  const playServer = disc.body.play_server;
  if (!playServer) die('Master server did not return a play_server URL');
  console.log(`[refresh-defs]   play_server = ${playServer}`);

  console.log(`[refresh-defs] Fetching instance_id via getuserdetails…`);
  const ud = await call(playServer, 'getuserdetails', {
    user_id: creds.user_id,
    hash: creds.hash,
  });
  const instanceId = ud.body.details?.instance_id;
  if (!instanceId) die('getuserdetails did not return details.instance_id');
  console.log(`[refresh-defs]   instance_id = ${instanceId}`);

  console.log(`[refresh-defs] Fetching getdefinitions (filtered: heroes, attacks, legendary effects, campaigns)…`);
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

  const heroDefines = body.hero_defines;
  const attackDefines = body.attack_defines;
  const effectDefines = body.legendary_effect_defines;
  const campaignDefines = body.campaign_defines;
  if (!Array.isArray(heroDefines) || !Array.isArray(attackDefines) || !Array.isArray(effectDefines)) {
    die(
      'Response missing hero_defines, attack_defines, or legendary_effect_defines. ' +
      'Server may have returned a delta-only payload; try clearing data/definitions.checksum.json and re-running.'
    );
  }
  if (!Array.isArray(campaignDefines)) {
    die(
      'Response missing campaign_defines. ' +
      'Required for favor display-name resolution (server-calls.md → Favor display-name resolution).'
    );
  }

  // Index attacks for O(1) lookup during hero enrichment. We never persist
  // attack_defines itself — the derived damage_types array is enough.
  const attackById = new Map(attackDefines.map((a) => [a.id, a]));

  const heroes = heroDefines
    .map((h) => {
      const csd = h.character_sheet_details || {};
      return {
        id: h.id,
        name: h.name,
        seat_id: h.seat_id,
        class: csd.class ?? null,
        race: csd.race ?? null,
        tags: Array.isArray(h.tags) ? h.tags.map((t) => String(t).toLowerCase()) : [],
        damage_types: deriveDamageTypes(h, attackById),
        ability_scores: csd.ability_scores ?? null,
        legendary_effect_id: h.properties?.legendary_effect_id ?? null,
      };
    })
    .sort((a, b) => a.id - b.id);

  const effects = effectDefines
    .map((e) => {
      const eff = (e.effects && e.effects[0]) || {};
      return {
        id: e.id,
        effect_string: eff.effect_string ?? null,
        targets: eff.targets ?? null,
        description: eff.description ?? null,
      };
    })
    .sort((a, b) => a.id - b.id);

  const unknownScopeIds = [];
  const scopes = effectDefines
    .map((e) => {
      const scope = deriveScope(e);
      if (scope.kind === 'unknown') unknownScopeIds.push(e.id);
      return { id: e.id, ...scope };
    })
    .sort((a, b) => a.id - b.id);

  // Favor bundle: one record per campaign that has an associated reset currency.
  // We dedupe on reset_currency_id just in case two campaigns share a currency
  // (not expected, but deterministic if it happens — first wins by campaign id).
  const favorsById = new Map();
  for (const c of campaignDefines) {
    const rid = c.reset_currency_id;
    if (rid == null || rid === 0) continue;
    if (favorsById.has(rid)) continue;
    favorsById.set(rid, {
      reset_currency_id: rid,
      short_name: c.short_name ?? null,
      name: c.name ?? null,
      campaign_id: c.id ?? null,
    });
  }
  const favors = [...favorsById.values()].sort(
    (a, b) => a.reset_currency_id - b.reset_currency_id
  );
  const favorsMissingShortName = favors
    .filter((f) => !f.short_name)
    .map((f) => f.reset_currency_id);

  let heroImages;
  if (process.env.SKIP_HERO_IMAGES === '1') {
    console.log(`[refresh-defs] SKIP_HERO_IMAGES=1 set; reusing existing hero-images.json if present.`);
    heroImages = null;
  } else {
    console.log(`[refresh-defs] Resolving hero image slugs against Emmote's wiki…`);
    heroImages = await buildHeroImageMap(heroes);
    console.log(
      `[refresh-defs]   wiki dirs=${heroImages.wikiSlugCount}, ` +
      `mapped=${Object.keys(heroImages.heroes).length}, ` +
      `unresolved=${heroImages.unresolved.length}`
    );
  }

  fs.mkdirSync(DATA_DIR, { recursive: true });
  const heroesPath = path.join(DATA_DIR, 'definitions.heroes.json');
  const effectsPath = path.join(DATA_DIR, 'definitions.legendary-effects.json');
  const scopesPath = path.join(DATA_DIR, 'definitions.legendary-effect-scopes.json');
  const favorsPath = path.join(DATA_DIR, 'definitions.favors.json');
  const heroImagesPath = path.join(DATA_DIR, 'definitions.hero-images.json');
  const metaPath = path.join(DATA_DIR, 'definitions.checksum.json');

  fs.writeFileSync(heroesPath, JSON.stringify(heroes, null, 2) + '\n');
  fs.writeFileSync(effectsPath, JSON.stringify(effects, null, 2) + '\n');
  fs.writeFileSync(scopesPath, JSON.stringify(scopes, null, 2) + '\n');
  fs.writeFileSync(favorsPath, JSON.stringify(favors, null, 2) + '\n');
  if (heroImages) {
    fs.writeFileSync(
      heroImagesPath,
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
  }
  fs.writeFileSync(
    metaPath,
    JSON.stringify(
      {
        server_checksum: body.checksum ?? null,
        fetched_at: new Date().toISOString(),
        source: `${ud.serverUrl}post.php?call=getdefinitions&filter=hero_defines,attack_defines,legendary_effect_defines,campaign_defines`,
        hero_count: heroes.length,
        legendary_effect_count: effects.length,
        scope_count: scopes.length,
        favor_count: favors.length,
        unknown_scope_ids: unknownScopeIds,
        favors_missing_short_name: favorsMissingShortName,
        hero_image_source: 'https://github.com/Emmotes/ic_wiki',
        hero_image_mapped_count: heroImages ? Object.keys(heroImages.heroes).length : null,
        hero_image_unresolved_ids: heroImages ? heroImages.unresolved : null,
      },
      null,
      2
    ) + '\n'
  );

  const size = (p) => fs.statSync(p).size;
  console.log(`[refresh-defs] Wrote:`);
  console.log(`  ${heroesPath}  (${size(heroesPath)} bytes, ${heroes.length} heroes)`);
  console.log(`  ${effectsPath}  (${size(effectsPath)} bytes, ${effects.length} effects)`);
  console.log(`  ${scopesPath}  (${size(scopesPath)} bytes, ${scopes.length} scopes)`);
  console.log(`  ${favorsPath}  (${size(favorsPath)} bytes, ${favors.length} favors)`);
  if (heroImages) {
    console.log(
      `  ${heroImagesPath}  (${size(heroImagesPath)} bytes, ` +
      `${Object.keys(heroImages.heroes).length} mapped)`
    );
  }
  console.log(`  ${metaPath}   (checksum=${body.checksum ?? 'n/a'})`);

  if (unknownScopeIds.length > 0) {
    console.warn(
      `[refresh-defs] WARNING: ${unknownScopeIds.length} effect(s) could not be classified into a scope kind.\n` +
      `  IDs: ${unknownScopeIds.join(', ')}\n` +
      `  Extend deriveScope() to handle the new shape, then re-run.`
    );
  } else {
    console.log(`[refresh-defs] All ${scopes.length} effects classified into known scope kinds.`);
  }
  if (favorsMissingShortName.length > 0) {
    console.warn(
      `[refresh-defs] WARNING: ${favorsMissingShortName.length} favor(s) have no short_name.\n` +
      `  reset_currency_ids: ${favorsMissingShortName.join(', ')}\n` +
      `  Display will fall back to "Favor #<id>" until fixed upstream.`
    );
  }
  if (heroImages && heroImages.unresolved.length > 0) {
    // Filter out known placeholder heroes (name="Y4E15") since those intentionally
    // have no art on the wiki; surface only the genuinely surprising misses.
    const placeholderIds = new Set(
      heroes.filter((h) => h.name === 'Y4E15').map((h) => h.id)
    );
    const surprising = heroImages.unresolved.filter((id) => !placeholderIds.has(id));
    if (surprising.length > 0) {
      const byId = new Map(heroes.map((h) => [h.id, h.name]));
      console.warn(
        `[refresh-defs] WARNING: ${surprising.length} hero(es) could not be mapped to a wiki slug.\n` +
        surprising.map((id) => `    #${id} ${byId.get(id)}`).join('\n') + '\n' +
        `  Add an entry to HERO_SLUG_OVERRIDES in scripts/refresh-defs.js, then re-run.`
      );
    } else {
      console.log(
        `[refresh-defs] ${heroImages.unresolved.length} placeholder hero(es) intentionally unmapped.`
      );
    }
  }
  console.log(`[refresh-defs] Done.`);
}

main().catch((e) => die(e.stack || String(e)));
