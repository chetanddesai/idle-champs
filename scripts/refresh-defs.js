#!/usr/bin/env node
/**
 * scripts/refresh-defs.js
 *
 * Regenerates the bundled definition files in `data/` from a live call to the
 * Idle Champions play server's `getdefinitions` endpoint.
 *
 * Output files:
 *   - data/definitions.heroes.json
 *   - data/definitions.legendary-effects.json
 *   - data/definitions.checksum.json
 *
 * Credentials: read from `.credentials.json` at the repo root (gitignored).
 *   {
 *     "user_id": "YOUR_USER_ID",
 *     "hash":    "YOUR_DEVICE_HASH"
 *   }
 *
 * See `.credentials.example.json` for the committed template.
 *
 * Usage:  node scripts/refresh-defs.js
 *
 * No dependencies — pure Node built-ins (Node 18+ for global `fetch`).
 */

const fs = require('fs');
const path = require('path');

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

  console.log(`[refresh-defs] Fetching getdefinitions (filtered)…`);
  const defs = await call(ud.serverUrl, 'getdefinitions', {
    user_id: creds.user_id,
    hash: creds.hash,
    instance_id: instanceId,
    supports_chunked_defs: '0',
    new_achievements: '1',
    challenge_sets_no_deltas: '0',
    filter: 'hero_defines,legendary_effect_defines',
  });
  const body = defs.body;

  const heroDefines = body.hero_defines;
  const effectDefines = body.legendary_effect_defines;
  if (!Array.isArray(heroDefines) || !Array.isArray(effectDefines)) {
    die('Response missing hero_defines or legendary_effect_defines. ' +
        'Server may have returned a delta-only payload; try clearing data/definitions.checksum.json and re-running.');
  }

  const heroes = heroDefines
    .map((h) => ({
      id: h.id,
      name: h.name,
      seat_id: h.seat_id,
      class: h.character_sheet_details?.class ?? null,
      race: h.character_sheet_details?.race ?? null,
      legendary_effect_id: h.properties?.legendary_effect_id ?? null,
    }))
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

  fs.mkdirSync(DATA_DIR, { recursive: true });
  const heroesPath = path.join(DATA_DIR, 'definitions.heroes.json');
  const effectsPath = path.join(DATA_DIR, 'definitions.legendary-effects.json');
  const metaPath = path.join(DATA_DIR, 'definitions.checksum.json');

  fs.writeFileSync(heroesPath, JSON.stringify(heroes));
  fs.writeFileSync(effectsPath, JSON.stringify(effects));
  fs.writeFileSync(
    metaPath,
    JSON.stringify(
      {
        server_checksum: body.checksum ?? null,
        fetched_at: new Date().toISOString(),
        source: `${ud.serverUrl}post.php?call=getdefinitions&filter=hero_defines,legendary_effect_defines`,
        hero_count: heroes.length,
        legendary_effect_count: effects.length,
      },
      null,
      2
    ) + '\n'
  );

  const size = (p) => fs.statSync(p).size;
  console.log(`[refresh-defs] Wrote:`);
  console.log(`  ${heroesPath}  (${size(heroesPath)} bytes, ${heroes.length} heroes)`);
  console.log(`  ${effectsPath}  (${size(effectsPath)} bytes, ${effects.length} effects)`);
  console.log(`  ${metaPath}   (checksum=${body.checksum ?? 'n/a'})`);
  console.log(`[refresh-defs] Done.`);
}

main().catch((e) => die(e.stack || String(e)));
