/**
 * serverCalls.js — the only module in the app that speaks HTTP to an Idle
 * Champions server. Every view and every state-mutation path lands here.
 *
 * Contract (FR-1, tech-design Appendix B #1):
 *
 *   - A single private `request()` helper centralizes:
 *       · boilerplate query-string injection (language_id, timestamp,
 *         mobile_client_version, …)
 *       · GET-via-query-string call style against `{baseUrl}post.php?...`
 *       · `switch_play_server` retry — EXACTLY ONCE, even on `success:true`
 *       · failure normalization into a typed `ApiError { kind, status?,
 *         message, raw }`
 *
 *   - Named public functions map 1:1 to the endpoints used by V1 reads.
 *     `getLegendaryDetails` is deliberately absent — the V1 read path
 *     pulls `legendary_details` from `getuserdetails.details` (see PRD
 *     §3.2.1 and Appendix B #8).
 *   - V1 is READ-ONLY: no UI surface in V1 calls the mutation helpers
 *     (`upgradeLegendaryItem`, `craftLegendaryItem`, `changeLegendaryItem`).
 *     They ship as library-level exports so V2 can restore the Forge Run
 *     / Reforge action flows without reimplementing the API contract.
 *     See tech-design-legendary.md Appendix B #7 and #12 for the scope
 *     decision.
 *
 *   - No `localStorage` access, no `state.js` coupling. Every function
 *     takes an explicit `{ playServer, userId, hash, instanceId, … }`
 *     context object so the module is unit-testable in Node and can be
 *     driven by `state.js` with whatever credentials are current.
 *
 *   - `fetchFn` defaults to `globalThis.fetch` but is injectable for tests.
 *
 *  See docs/server-calls.md for endpoint semantics and docs/PRD.md §3.1
 *  for the higher-level module description.
 */

export const MASTER_SERVER = 'https://master.idlechampions.com/~idledragons/';

// Boilerplate params the server expects on every call. Mirrors
// scripts/refresh-hero-images.js — keep the two in lockstep if either
// needs adjusting after a game update.
const BOILERPLATE = Object.freeze({
  language_id: '1',
  timestamp: '0',
  request_id: '0',
  mobile_client_version: '99999',
  include_free_play_objectives: 'true',
  instance_key: '1',
  offline_v2_build: '1',
  localization_aware: 'true',
});

/**
 * Typed error thrown by every function in this module on any failure.
 *
 *   kind: 'network'  — fetch() itself rejected (DNS, CORS, offline).
 *   kind: 'http'     — server returned a non-2xx status.
 *   kind: 'api'      — response parsed but carried `failure_reason`,
 *                      `success:false`, or is otherwise malformed.
 *
 *   status — set only for kind:'http'.
 *   message — human-readable text safe to surface to the user.
 *   raw — the underlying Response / body / Error, for logging.
 *
 * Callers (views, mutations.js, state.js) inspect `err.kind` to decide
 * whether to retry, clear credentials, or show a toast.
 */
export class ApiError extends Error {
  constructor({ kind, status, message, raw }) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status;
    this.raw = raw;
  }
}

function buildUrl(baseUrl, method, params) {
  const qs = new URLSearchParams({ call: method, ...BOILERPLATE, ...params });
  // The server expects GET `baseUrl + post.php` with query params (matches
  // Emmote's reference client and our refresh-hero-images.js). `baseUrl`
  // always ends with a trailing slash by convention.
  return `${baseUrl}post.php?${qs.toString()}`;
}

/**
 * Coerce an http:// URL to https://. The Idle Champions load balancer
 * intermittently hands back play-server URLs with an http:// scheme (in
 * both `body.play_server` and `body.switch_play_server`). Left untouched,
 * those URLs are (a) blocked by our CSP `connect-src` (https-only) and
 * (b) active mixed content on the https-served GitHub Pages site, so the
 * browser blocks them regardless of CSP. Upgrading the scheme is always
 * safe here — every idlechampions shard serves the same content over
 * https. This surfaced as an intermittent, shard-dependent "network
 * error" on refresh.
 *
 * Idempotent; tolerant of non-string / non-http input (returned as-is).
 *
 * @param {string} url
 * @returns {string}
 */
export function toHttps(url) {
  if (typeof url !== 'string') return url;
  return url.replace(/^http:\/\//i, 'https://');
}

/**
 * Issue one HTTP call to the play server (or master). Public for tests; most
 * callers use the named helpers below instead.
 *
 * @param {string} method              — API call name (e.g. "getuserdetails")
 * @param {string} baseUrl             — play server URL (trailing slash)
 * @param {object} [params]            — per-call query params
 * @param {object} [ctx]
 * @param {Function} [ctx.fetchFn]     — defaults to globalThis.fetch
 * @param {boolean} [ctx.allowSwitchRetry=true]
 * @returns {Promise<{ body: object, serverUrl: string }>}
 * @throws {ApiError}
 */
export async function request(method, baseUrl, params = {}, ctx = {}) {
  const fetchFn = ctx.fetchFn || globalThis.fetch;
  if (typeof fetchFn !== 'function') {
    throw new ApiError({
      kind: 'network',
      message: 'No fetch implementation available',
      raw: null,
    });
  }
  const allowSwitchRetry = ctx.allowSwitchRetry !== false;
  // Coerce the scheme up front so a caller-supplied http:// base (e.g. a
  // play-server URL persisted from a prior http response) can't slip past.
  const secureBaseUrl = toHttps(baseUrl);
  const url = buildUrl(secureBaseUrl, method, params);

  let res;
  try {
    res = await fetchFn(url);
  } catch (err) {
    throw new ApiError({
      kind: 'network',
      message: err?.message || 'Network request failed',
      raw: err,
    });
  }

  if (!res.ok) {
    throw new ApiError({
      kind: 'http',
      status: res.status,
      message: `${method} → HTTP ${res.status}`,
      raw: res,
    });
  }

  let body;
  try {
    body = await res.json();
  } catch (err) {
    throw new ApiError({
      kind: 'api',
      message: `${method}: response was not valid JSON`,
      raw: err,
    });
  }

  // switch_play_server: retry once against the indicated shard. The server
  // sets success:true alongside switch_play_server, so we explicitly retry
  // even on success — this is the documented behavior (server-calls.md).
  // The shard URL is scheme-normalized so an http:// shard is upgraded
  // before we recurse and before we hand it back as serverUrl.
  const switchServer =
    typeof body.switch_play_server === 'string' ? toHttps(body.switch_play_server) : null;

  if (switchServer && allowSwitchRetry) {
    return request(method, switchServer, params, {
      ...ctx,
      allowSwitchRetry: false,
    });
  }

  if (body.failure_reason) {
    throw new ApiError({
      kind: 'api',
      message: body.failure_reason,
      raw: body,
    });
  }
  if (body.success === false) {
    throw new ApiError({
      kind: 'api',
      message: `${method} returned success=false`,
      raw: body,
    });
  }

  return { body, serverUrl: switchServer || secureBaseUrl };
}

/**
 * Discover the current play-server URL from the master server.
 * Returns both the URL and the serverUrl we reached (which, for this
 * particular call, is always MASTER_SERVER).
 *
 * @param {object} [ctx]
 * @param {Function} [ctx.fetchFn]
 * @returns {Promise<{ playServer: string, body: object }>}
 */
export async function getPlayServerForDefinitions(ctx = {}) {
  const { body } = await request('getPlayServerForDefinitions', MASTER_SERVER, {}, {
    fetchFn: ctx.fetchFn,
  });
  const playServer = body.play_server;
  if (!playServer || typeof playServer !== 'string') {
    throw new ApiError({
      kind: 'api',
      message: 'getPlayServerForDefinitions returned no play_server URL',
      raw: body,
    });
  }
  // Upgrade http:// → https:// so the URL persisted in state (and reused
  // for every subsequent call this session) can never trip CSP / mixed
  // content. See toHttps() for the intermittent-failure background.
  return { playServer: toHttps(playServer), body };
}

/**
 * Fetch the account state. This is the single read-path for V1 (see
 * Appendix B #8) — `details.legendary_details` is a complete mirror of
 * `getlegendarydetails`, so we never need the standalone endpoint on the
 * read path.
 *
 * `instanceId` is optional on the *first* call of a session (the server
 * returns one back in `details.instance_id`) but required for every
 * authenticated call thereafter.
 *
 * @param {object} ctx
 * @param {string} ctx.playServer       — base URL (trailing slash)
 * @param {string|number} ctx.userId
 * @param {string} ctx.hash
 * @param {string|number} [ctx.instanceId]
 * @param {Function} [ctx.fetchFn]
 * @returns {Promise<{ details: object, body: object, serverUrl: string }>}
 */
export async function getUserDetails(ctx) {
  const { playServer, userId, hash, instanceId, fetchFn } = ctx || {};
  if (!playServer) throw new ApiError({ kind: 'api', message: 'playServer required', raw: null });
  if (userId == null || !hash) {
    throw new ApiError({ kind: 'api', message: 'userId and hash required', raw: null });
  }
  const params = { user_id: String(userId), hash: String(hash) };
  if (instanceId != null) params.instance_id = String(instanceId);
  const { body, serverUrl } = await request('getuserdetails', playServer, params, { fetchFn });
  if (!body.details || typeof body.details !== 'object') {
    throw new ApiError({
      kind: 'api',
      message: 'getuserdetails returned no details object',
      raw: body,
    });
  }
  return { details: body.details, body, serverUrl };
}

/**
 * Fetch the bundled definitions (heroes, attacks, legendary effects,
 * campaigns) the Legendary view consumes. We always request the full
 * payload — no `checksum`, no delta-merging — and rely on
 * `js/lib/definitions.js` + the runtime cache to keep the working-set
 * size manageable. See `Runtime defs patching` design doc for the
 * always-full-payload trade-off rationale.
 *
 * Filter is fixed to the four arrays the runtime parser
 * (`js/lib/legendaryDefsParser.js`) expects; broadening it later means
 * extending the parser at the same time.
 *
 * @param {object} ctx
 * @param {string} ctx.playServer       — base URL (trailing slash)
 * @param {string|number} ctx.userId
 * @param {string} ctx.hash
 * @param {string|number} ctx.instanceId
 * @param {Function} [ctx.fetchFn]
 * @returns {Promise<{ body: object, serverUrl: string }>}
 */
export async function getDefinitions(ctx) {
  const { playServer, userId, hash, instanceId, fetchFn } = ctx || {};
  if (!playServer) throw new ApiError({ kind: 'api', message: 'getDefinitions: playServer required', raw: null });
  if (userId == null || !hash) {
    throw new ApiError({ kind: 'api', message: 'getDefinitions: userId and hash required', raw: null });
  }
  if (instanceId == null) {
    throw new ApiError({ kind: 'api', message: 'getDefinitions: instanceId required', raw: null });
  }
  return request(
    'getdefinitions',
    playServer,
    {
      user_id: String(userId),
      hash: String(hash),
      instance_id: String(instanceId),
      supports_chunked_defs: '0',
      new_achievements: '1',
      challenge_sets_no_deltas: '0',
      filter: 'hero_defines,attack_defines,legendary_effect_defines,campaign_defines',
    },
    { fetchFn }
  );
}

// ---------------------------------------------------------------------------
// Mutations — V2-DEFERRED
//
// All three take the same context shape because they hit the same play server
// with the same auth triple + (hero_id, slot_id). They return the raw body so
// the caller can inspect `actions` for optional diagnostic UI.
//
// V1 IS READ-ONLY: no view module in V1 imports these helpers. The user
// upgrades / reforges / crafts in-game, then taps Refresh to re-hydrate the
// planner. These exports exist so that V2 (in-site mutations) can reuse the
// contract and tests without rebuilding it. See tech-design Appendix B #7
// and #12 for the scope decision.
// ---------------------------------------------------------------------------

function requireMutationCtx(fnName, ctx) {
  const { playServer, userId, hash, instanceId, heroId, slotId } = ctx || {};
  if (!playServer) throw new ApiError({ kind: 'api', message: `${fnName}: playServer required`, raw: null });
  if (userId == null || !hash) throw new ApiError({ kind: 'api', message: `${fnName}: userId and hash required`, raw: null });
  if (instanceId == null) throw new ApiError({ kind: 'api', message: `${fnName}: instanceId required`, raw: null });
  if (heroId == null) throw new ApiError({ kind: 'api', message: `${fnName}: heroId required`, raw: null });
  if (slotId == null) throw new ApiError({ kind: 'api', message: `${fnName}: slotId required`, raw: null });
  return {
    user_id: String(userId),
    hash: String(hash),
    instance_id: String(instanceId),
    hero_id: String(heroId),
    slot_id: String(slotId),
  };
}

/**
 * Upgrade an equipped legendary by one level.
 * Consumes Scales of Tiamat + the slot's favor currency.
 *
 * V2-deferred. Not called by any V1 view; see module header.
 */
export async function upgradeLegendaryItem(ctx) {
  const params = requireMutationCtx('upgradeLegendaryItem', ctx);
  const { body, serverUrl } = await request('upgradelegendaryitem', ctx.playServer, params, {
    fetchFn: ctx.fetchFn,
  });
  return { body, serverUrl };
}

/**
 * Craft a new legendary into an empty slot. Consumes epic inventory (see
 * `details.loot`) for the hero's crafting requirement. No favor.
 *
 * V2-deferred. Not called by any V1 view; see module header.
 */
export async function craftLegendaryItem(ctx) {
  const params = requireMutationCtx('craftLegendaryItem', ctx);
  const { body, serverUrl } = await request('craftlegendaryitem', ctx.playServer, params, {
    fetchFn: ctx.fetchFn,
  });
  return { body, serverUrl };
}

/**
 * Reforge a crafted legendary — rerolls `effect_id` from the hero's 6-effect
 * pool per Phase 1/2 rules (Appendix B #5b). Consumes the account-level
 * Scales-of-Tiamat reforge cost from `legendary_details.cost`.
 *
 * V2-deferred. Not called by any V1 view; see module header.
 */
export async function changeLegendaryItem(ctx) {
  const params = requireMutationCtx('changeLegendaryItem', ctx);
  const { body, serverUrl } = await request('changelegendaryitem', ctx.playServer, params, {
    fetchFn: ctx.fetchFn,
  });
  return { body, serverUrl };
}
