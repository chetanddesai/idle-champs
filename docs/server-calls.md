# Idle Champions Server Calls — API Reference

> **Scope.** This document catalogs endpoints, parameters, and response shapes for the Idle Champions play-server API operated by Codename Entertainment. Those are **facts** about a public API and are not copyrightable.
>
> **Attribution.** The initial catalog of endpoint and parameter names was learned from [`Emmotes/ic_servercalls`](https://github.com/Emmotes/ic_servercalls) — a community reference tool by Emmote. No prose or source code from that project is reproduced here; this file is written fresh and extended with our own empirical findings (request flow, `switch_play_server` retry behavior, legendary-effect `$amount` resolution, enrichment strategy, suggested client-side data models). Credit to Emmote for the foundational research. See README Acknowledgments.
>
> **License.** This document is licensed under CC BY 4.0; see `../LICENSE-docs`.

---

## Overview

Every API call is an HTTP GET to a play-server endpoint:

```
{SERVER}/post.php?call={callName}&{params}
```

The `SERVER` URL is obtained dynamically by first calling `getPlayServerForDefinitions` against the master server (`https://master.idlechampions.com/~idledragons/`). That returns a play-server like `https://ps6.idlechampions.com/~idledragons/`.

Most calls also attach **boilerplate** parameters automatically:


| Boilerplate Param              | Value   |
| ------------------------------ | ------- |
| `language_id`                  | `1`     |
| `timestamp`                    | `0`     |
| `request_id`                   | `0`     |
| `mobile_client_version`        | `99999` |
| `include_free_play_objectives` | `true`  |
| `instance_key`                 | `1`     |
| `offline_v2_build`             | `1`     |
| `localization_aware`           | `true`  |


Authenticated calls additionally include `user_id`, `hash`, and `instance_id`.

### Observed request flow (empirical)

Verified end-to-end against live play servers. A fresh client with no cached state goes through four steps to reach an authenticated GET:

1. **Discover the play server.**
  `GET https://master.idlechampions.com/~idledragons/post.php?call=getPlayServerForDefinitions` (+ boilerplate).
   Returns:
   Cache the `play_server` URL (e.g. 24h). All subsequent calls go to this host.
2. **Fetch `instance_id` via `getuserdetails`.**
  `GET {playServer}post.php?call=getuserdetails&user_id=…&hash=…` (+ boilerplate).
   The response `details.instance_id` is required for most other authenticated calls.
3. **Handle the "successful-but-empty" switch response.** When the play server wants you elsewhere, it can return a body that **looks successful but carries no `details`**:
  ```json
   {
     "success": true,
     "switch_play_server": "https://psN.idlechampions.com/~idledragons/",
     "memory_usage": "10 mb",
     "apc_stats": { … },
     "db_stats": { … },
     "processing_time": "…"
   }
  ```
   Note that the target URL can be **the same host you just called**. The client **must** treat any response containing `switch_play_server` as "update the cached play-server URL (even if unchanged) and replay the same call" — otherwise downstream code will see a missing `details` and assume a logical error. This is true on both successful and failed HTTP responses.
4. **Make the authenticated call.** With a valid `instance_id`, make the target call (e.g. `getlegendarydetails`) to the (possibly updated) play server.

> In practice the `serverCalls.js` client performs steps 1 + 2 + 3 transparently, retries once on `switch_play_server`, and exposes only step 4 to callers.

### Composing `getdefinitions` with state-returning calls

Almost every state-returning call (`getuserdetails`, `getlegendarydetails`, `getallformationsaves`, `getpatrondetails`, etc.) returns **raw numeric IDs** — `hero_id`, `slot_id`, `effect_id`, `reset_currency_id`, `buff_id`, `chest_type_id`, and so on. None of them return display names or descriptions. Those come from `getdefinitions`, which returns ~50 parallel define groups, one per ID-space.

Think of `getdefinitions` as the **schema / dictionary** and the state calls as the **rows**. A typical view is built by joining the two.

#### Which define groups matter for which state calls


| State call             | Needs (from `getdefinitions`)                                                                             | Plus (other sources)                                                                                                |
| ---------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `getuserdetails`       | `hero_defines` (names, class, seat_id), `stat_defines`, `hero_feat_defines`                               | `defines.reset_currency_defines` is returned **inline** on this call — no separate lookup needed.                   |
| `getlegendarydetails`  | `hero_defines`, `legendary_effect_defines`                                                                | `getuserdetails.defines.reset_currency_defines` (for favor names), `getuserdetails.details.loot` (for epic gating). |
| `getallformationsaves` | `hero_defines` (spec names live in `properties.specializations`), `adventure_defines`, `campaign_defines` | `getuserdetails.details.heroes` for ownership + current spec picks.                                                 |
| `getpatrondetails`     | `patron_defines`, `patron_perk_defines`, `patron_perk_tier_defines`, `patron_shop_item_defines`           | —                                                                                                                   |
| `geteventsdetails`     | `event_v2_defines` (in `getuserdetails.defines`), `buff_defines`, `loot_defines`                          | —                                                                                                                   |
| `getredistributehero`  | `hero_defines`, `buff_defines` (for reward potions)                                                       | —                                                                                                                   |


#### Calling `getdefinitions`

- Without a `filter`, every group is returned (~19 MB on current live data). Fine once per session.
- With a `filter` (comma-separated group names, e.g. `hero_defines,legendary_effect_defines`), only those groups are returned — dramatically smaller and much faster.
- Most groups return as **arrays** of objects each with an `id` — clients should build `Map<id, entry>` lookups on first load.
- `getdefinitions` supports a `checksum` parameter: if the client passes the checksum of its cached copy and the server's copy hasn't changed, only the deltas are returned. Cache defines in `localStorage` keyed by checksum.

#### Convention for the helper site

1. **Session start:** `getPlayServerForDefinitions` → cache URL.
2. **First authenticated load:** `getuserdetails` → extract `instance_id`, keep `details.heroes`, `details.loot`, `details.legendary_details`, and `defines.reset_currency_defines` in memory.
3. **Definitions load:** `getdefinitions?filter={only-the-groups-this-view-needs}` → build per-group ID→entry lookup maps. Pass the stored `checksum` from the last successful call on subsequent loads.
4. **Category views:** join state (steps 2–3) against the definition maps to produce rendered rows. Don't re-fetch definitions when switching views — they're effectively static within a session.
5. **Mutations** (craft/upgrade/reforge, SaveFormation, etc.): on success, re-fetch **only** the relevant state call (e.g. `getlegendarydetails` after a craft) — never `getdefinitions`.

This keeps every category view to at most one "live" state fetch, with one cached schema fetch shared across the entire session.

---

## Table of Contents

- [Core / Account](#core--account)
- [Legendary](#legendary)
- [Chests](#chests)
- [Blacksmith / Buffs](#blacksmith--buffs)
- [Formations](#formations)
- [Adventures / Campaigns](#adventures--campaigns)
- [Time Gates](#time-gates)
- [Patrons](#patrons)
- [Trials](#trials)
- [Champions / Feats / Dismantles](#champions--feats--dismantles)
- [Shop / Offers / Rewards](#shop--offers--rewards)
- [Codes / Coupons](#codes--coupons)
- [Favour / Currency](#favour--currency)
- [Apothecary / Potions](#apothecary--potions)
- [Events](#events)
- [Mastery Challenges](#mastery-challenges)
- [Card Sleeves](#card-sleeves)
- [Miscellaneous](#miscellaneous)

---

## Core / Account

### `getPlayServerForDefinitions`

Called against the **master** server to obtain the play-server URL for all subsequent calls.


| Parameter                 | Value | Notes                                                    |
| ------------------------- | ----- | -------------------------------------------------------- |
| *(none beyond call name)* |       | Sent to `https://master.idlechampions.com/~idledragons/` |


**Response:** `{ "play_server": "https://ps{N}.idlechampions.com/~idledragons/" }`

---

### `getuserdetails`

Fetches full account details including heroes, loot, buffs, legendary details, and the current `instance_id`.


| Parameter | Required | Notes |
| --------- | -------- | ----- |
| `user_id` | Yes      |       |
| `hash`    | Yes      |       |


---

### `getdefinitions`

Fetches game definitions (hero data, buff data, loot data, etc.). Supports filtering and checksums for caching.


| Parameter                  | Required | Notes                                                                           |
| -------------------------- | -------- | ------------------------------------------------------------------------------- |
| `supports_chunked_defs`    | Yes      | Always `0`                                                                      |
| `new_achievements`         | Yes      | Always `1`                                                                      |
| `challenge_sets_no_deltas` | Yes      | Always `0`                                                                      |
| `filter`                   | No       | Comma-separated definition types, e.g. `hero_defines,buff_defines,loot_defines` |
| `checksum`                 | No       | If provided, `filter` is omitted; returns only changed data                     |


---

## Legendary

### `getlegendarydetails`

Returns all legendary item data, costs per hero, and legendary state. Read-only.


| Parameter     | Required | Notes |
| ------------- | -------- | ----- |
| `user_id`     | Yes      |       |
| `hash`        | Yes      |       |
| `instance_id` | Yes      |       |


#### Response shape

Verified against a live account. A trimmed sample with a handful of representative heroes/slots lives at `[getlegendarydetails.sample.json](./getlegendarydetails.sample.json)`.

```json
{
  "success": true,
  "legendary_details": { /* see below */ },
  "actions": [],
  "memory_usage": "…",
  "apc_stats": { … },
  "db_stats": { … },
  "processing_time": "…"
}
```

The same `legendary_details` object is also embedded at `getuserdetails.details.legendary_details`, so a client that has just called `getuserdetails` can render the Legendary view without a second round trip. Call `getlegendarydetails` on explicit refresh or after a mutation (craft / upgrade / reforge).

#### `legendary_details` fields


| Field                    | Type   | Example           | Meaning                                                                                                                                                                                                                |
| ------------------------ | ------ | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cost`                   | float  | `1180.98`         | **Hypothesized current Scales of Tiamat balance.** This is the only plausible location for it in the payload. Confirm empirically by watching it decrease after a `craftlegendaryitem` or `upgradelegendaryitem` call. |
| `next_cost`              | float  | `1.0628819…`      | **Meaning not yet confirmed.** Likely a cost-scaling multiplier or next-vessel cost.                                                                                                                                   |
| `reduction_time`         | int    | `-1`              | Seconds remaining on a crafting-time reduction buff. `-1` = inactive.                                                                                                                                                  |
| `reforge_reduction_time` | int    | `46320`           | Seconds remaining on a reforge-time reduction (`46320 ≈ 12h 52m`).                                                                                                                                                     |
| `costs_by_hero`          | object | `{ "1": 500, … }` | **Keyed by `hero_id` (string).** Next Scales-of-Tiamat cost to craft one more legendary on that hero. Contains an entry for every hero the account owns (owned and unowned).                                           |
| `legendary_items`        | object | `{ "34": { … } }` | **Keyed by `hero_id` (string).** Only heroes with at least one legendary appear. Each value is a nested object keyed by `slot_id` (`"1"`–`"6"`). See table below.                                                      |


#### `costs_by_hero` semantics

Verified pattern across a real account:

```
cost = 500 + 100 × (legendaries already crafted on that hero)
```

Confirmation: the set of heroes with `costs_by_hero[h] > 500` exactly matches the set of heroes that appear in `legendary_items` (intersection = full overlap, zero mismatches). So `costs_by_hero` is the canonical source for "how many legendaries has this hero been forged?" even when you don't need per-slot detail.


| Scales cost | Legendaries crafted on this hero | Meaning                      |
| ----------- | -------------------------------- | ---------------------------- |
| 500         | 0                                | Never crafted                |
| 600         | 1                                |                              |
| 700         | 2                                |                              |
| 800         | 3                                |                              |
| 900         | 4                                |                              |
| 1000        | 5                                |                              |
| 1100        | 6                                | All 6 equipment slots filled |


#### `legendary_items[hero_id][slot_id]` — each owned legendary

Slot keys observed are strings `"1"`–`"6"`. Each item is an object:


| Field                    | Type  | Example                         | Meaning                                                                                                                                                                                                                                                   |
| ------------------------ | ----- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `level`                  | int   | `1`–`20`                        | Current legendary level. The account-wide cap (`getuserdetails.details.legendary_level_cap`) is `20`.                                                                                                                                                     |
| `effect_id`              | int   | `12`                            | The **currently active** effect on this legendary. Resolve the name/description via `getdefinitions.legendary_effect_defines` (a dedicated define group — **not** `buff_defines`; the two share no ID space). See *Resolving legendary effect IDs* below. |
| `effects_unlocked`       | int[] | `[12]`, `[23, 1]`, `[45,10,52]` | All effects ever unlocked for this slot (via reforging). Typical length 1; can grow to 2 or 3 as the player reforges and adds new effects to the pool.                                                                                                    |
| `reset_currency_id`      | int   | `15`                            | Which campaign favor (reset currency) the upgrade consumes. Resolve via `getuserdetails.defines.reset_currency_defines` (`id=22` → *Tiamat's Favor*, etc.).                                                                                               |
| `upgrade_cost`           | int   | `499`, `958`, `1111`            | Scales of Tiamat cost to upgrade this legendary by one level.                                                                                                                                                                                             |
| `upgrade_favor_cost`     | float | `2.3e+58`                       | Favor cost (in the currency named by `reset_currency_id`) to upgrade.                                                                                                                                                                                     |
| `upgrade_favor_required` | float | `1e+30`                         | Minimum favor balance the player must possess to be allowed to upgrade. Separate from `upgrade_favor_cost`.                                                                                                                                               |


#### Complementary data needed to render a legendary view

`getlegendarydetails` alone is not enough to display human-readable names or to gate the Craft action on "does this slot actually have an epic?". The following pieces are also required:


| Need                                                           | Source                                                                                                                            |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Hero display name for each `hero_id`                           | `getdefinitions` with `filter=hero_defines` — returns `{id, name, class, …}` per hero.                                            |
| Equipment slot display name (slot 1 → weapon, etc.)            | Per-hero in `hero_defines` (equipment slots are hero-specific).                                                                   |
| Hero ownership (filter roster to owned heroes)                 | `getuserdetails.details.heroes[]` — each entry has `hero_id` and `owned` (`"0"`/`"1"`).                                           |
| Epic rarity + iLvl per slot (required before a Craft is legal) | `getuserdetails.details.loot[]` — one entry per `{hero_id, slot_id}` with `rarity` (4 = epic) and `enchant` (iLvl).               |
| Effect name/description for `effect_id` / `effects_unlocked`   | `getdefinitions.legendary_effect_defines` (dedicated group — **not** `buff_defines`). See *Resolving legendary effect IDs* below. |
| "Signature" effect per hero (the hero's canonical legendary)   | `getdefinitions.hero_defines[…].properties.legendary_effect_id` — the on-theme effect the hero is designed around.                |
| Currency name + icon for `reset_currency_id`                   | `getuserdetails.defines.reset_currency_defines` (already included in every `getuserdetails` response).                            |
| Scales of Tiamat balance                                       | Hypothesis: `legendary_details.cost`. Confirm by observing the value decrement after a craft/upgrade.                             |


#### Resolving legendary effect IDs

`getdefinitions` returns `legendary_effect_defines` (110 entries on current live data) when called without a filter or with that group in the filter list. Each entry:

```json
{
  "id": 1,
  "effects": [
    {
      "effect_string": "global_dps_multiplier_mult,100",
      "targets": ["active_campaign"],
      "description": "Increases the damage of all Champions by $amount%"
    }
  ]
}
```

Key points for rendering:

1. **Effect-scaling:** the integer after the comma in `effect_string` is the **per-level amount**. To show the in-game text, substitute `amount = base × level` into the `description` template. The template uses either `$amount` or `$(amount)` as a placeholder (both forms appear in the live data — replace both).
2. **No display name:** unlike `buff_defines`, legendary effects have no `name` field. The resolved `description` is the label the UI should show.
3. **Targets:** `["active_campaign"]` means the effect only fires in the adventure where the corresponding favor is earned; `["all_slots"]` means it applies globally. Worth displaying as a secondary badge.
4. **ID-space is disjoint from `buff_defines`.** A lookup by the same integer against both will silently return the wrong record (e.g. `buff_id=1` is "Small Potion of Giant's Strength"; `legendary_effect_id=1` is the global DPS effect above).
5. **Signature effect per hero:** `getdefinitions.hero_defines[…].properties.legendary_effect_id` is the on-theme legendary effect the hero was designed around. Useful for a "reforge to signature" recommendation.

Minimal resolver:

```js
function resolveLegendaryEffect(effectId, level, legendaryEffectDefines) {
  const def = legendaryEffectDefines.find(e => e.id === effectId);
  if (!def) return { id: effectId, description: `(unknown effect ${effectId})` };
  const eff = def.effects[0];
  const base = Number(eff.effect_string.split(',').pop());      // e.g. 100
  const amount = base * level;                                  // e.g. level=5 → 500
  const description = eff.description
    .replace(/\$\(amount\)/g, String(amount))
    .replace(/\$amount/g, String(amount));
  return { id: effectId, description, targets: eff.targets, effect_string: eff.effect_string };
}
```

#### Enriched response sample

A scrubbed end-to-end enrichment (summary + top 12 heroes of `costs_by_hero` resolved to names/classes + one hero's 6 slots fully resolved with effect descriptions and favor currency names) lives at `[getlegendarydetails.enriched.sample.json](./getlegendarydetails.enriched.sample.json)`. It's the output of merging `getlegendarydetails` + `getuserdetails` + `getdefinitions` using the rules in this document.

#### Suggested client-side data model

One row per `{hero_id, slot_id}` pair:

```ts
type LegendarySlot = {
  heroId: number
  slotId: 1 | 2 | 3 | 4 | 5 | 6
  heroName: string
  heroOwned: boolean
  slotName: string
  epic: {
    equipped: boolean    // loot.rarity === 4
    iLvl: number         // loot.enchant
  }
  legendary?: {
    level: number        // 1..20
    activeEffect: { id: number; name: string; description: string }
    effectPool: { id: number; name: string }[]   // effects_unlocked resolved
    upgradeCost: {
      scales: number                              // upgrade_cost
      favor: number                               // upgrade_favor_cost
      favorRequired: number                       // upgrade_favor_required
      currency: { id: number; name: string }      // resolved from reset_currency_defines
    }
  }
  nextCraftCost: number  // costs_by_hero[heroId]
}
```

This model cleanly gates the three mutating calls:


| Action      | Enabled when                                                                           | API call                                 |
| ----------- | -------------------------------------------------------------------------------------- | ---------------------------------------- |
| **Craft**   | `epic.equipped && !legendary && balance ≥ nextCraftCost`                               | `craftlegendaryitem(hero_id, slot_id)`   |
| **Upgrade** | `legendary && level < 20 && balance ≥ upgradeCost.scales && favor ≥ upgradeCost.favor` | `upgradelegendaryitem(hero_id, slot_id)` |
| **Reforge** | `legendary` exists (warn: `activeEffect` may change, `effectPool` may grow)            | `changelegendaryitem(hero_id, slot_id)`  |


---

### `craftlegendaryitem`

Forges a **new** legendary item on a champion's equipment slot. Costs Scales of Tiamat (starting at 500, increasing per champion).


| Parameter | Required | Notes                                                                           |
| --------- | -------- | ------------------------------------------------------------------------------- |
| `hero_id` | Yes      | Numeric champion ID                                                             |
| `slot_id` | Yes      | Equipment slot (1–6) — must have an epic in that slot and no existing legendary |


**Response includes:** `points` (remaining scales), `legendary_details.costs_by_hero`.

---

### `upgradelegendaryitem`

Upgrades an **existing** legendary item to the next level.


| Parameter | Required | Notes                                                |
| --------- | -------- | ---------------------------------------------------- |
| `hero_id` | Yes      | Numeric champion ID                                  |
| `slot_id` | Yes      | Equipment slot (1–6) — must already have a legendary |


---

### `changelegendaryitem`

Reforges (re-rolls the effects on) an existing legendary item.


| Parameter | Required | Notes                                                |
| --------- | -------- | ---------------------------------------------------- |
| `hero_id` | Yes      | Numeric champion ID                                  |
| `slot_id` | Yes      | Equipment slot (1–6) — must already have a legendary |


---

## Chests

### `buysoftcurrencychest`

Purchases chests using gems or event tokens.


| Parameter               | Required | Notes                                |
| ----------------------- | -------- | ------------------------------------ |
| `chest_type_id`         | Yes      | Chest type identifier                |
| `count`                 | Yes      | Number of chests to buy              |
| `spend_event_v2_tokens` | Yes      | `1` if `chest_type_id > 2`, else `0` |


---

### `opengenericchest`

Opens chests and receives loot rewards.


| Parameter         | Required | Notes                                     |
| ----------------- | -------- | ----------------------------------------- |
| `gold_per_second` | Yes      | Always `0`                                |
| `checksum`        | Yes      | Always `4c5f019b6fc6eefa4d47d21cfaf1bc68` |
| `chest_type_id`   | Yes      | Chest type identifier                     |
| `count`           | Yes      | Number to open                            |
| `pack_id`         | No       | Optional pack identifier                  |


---

### `purchasenotarychestbundle`

Purchases a notary chest bundle.


| Parameter       | Required | Notes                 |
| --------------- | -------- | --------------------- |
| `chest_type_id` | Yes      | Chest type identifier |
| `count`         | Yes      | Number of bundles     |


---

## Blacksmith / Buffs

### `useServerBuff`

Applies blacksmith contracts (or other server buffs) to a champion.


| Parameter  | Required | Notes                                            |
| ---------- | -------- | ------------------------------------------------ |
| `buff_id`  | Yes      | The buff/contract ID                             |
| `hero_id`  | Yes      | Target champion ID                               |
| `slot_id`  | Yes      | Target slot (use `0` for random distribution)    |
| `num_uses` | Yes      | Number of contracts to apply (max 1000 per call) |


**Response includes:** `buffs_remaining`, `actions` (array of slot iLvl changes).

---

### `convertcontracts`

Converts contracts between types (e.g. large → small) or to event tokens.


| Parameter         | Required | Notes                                         |
| ----------------- | -------- | --------------------------------------------- |
| `source_buff_id`  | Yes      | Source contract buff ID                       |
| `result_buff_id`  | Yes      | Target contract buff ID                       |
| `count`           | Yes      | Number to convert                             |
| `to_event_tokens` | Yes      | `1` to convert to event tokens, `0` otherwise |


---

## Formations

### `getallformationsaves`

Retrieves all saved formations for the account.


| Parameter     | Required | Notes |
| ------------- | -------- | ----- |
| `user_id`     | Yes      |       |
| `hash`        | Yes      |       |
| `instance_id` | Yes      |       |


---

### `SaveFormation`

Creates or updates a saved formation.


| Parameter           | Required | Notes                                                           |
| ------------------- | -------- | --------------------------------------------------------------- |
| `campaign_id`       | Yes      | Campaign the formation is for                                   |
| `name`              | Yes      | Formation name                                                  |
| `favorite`          | Yes      | `0` or `1`                                                      |
| `formation`         | Yes      | JSON array of hero positions                                    |
| `familiars`         | Yes      | JSON object of familiar placements                              |
| `specializations`   | Yes      | JSON object of spec choices                                     |
| `feats`             | Yes      | JSON object of feat selections                                  |
| `formation_save_id` | No       | If provided (> 0), updates existing save; otherwise creates new |


---

### `DeleteFormationSave`

Deletes a saved formation.


| Parameter           | Required | Notes                         |
| ------------------- | -------- | ----------------------------- |
| `formation_save_id` | Yes      | ID of the formation to delete |


---

### `saveModron`

Saves modron automation core configuration.


| Parameter           | Required | Notes                                  |
| ------------------- | -------- | -------------------------------------- |
| `core_id`           | Yes      | Modron core identifier                 |
| `grid`              | Yes      | JSON string of the modron grid layout  |
| `game_instance_id`  | Yes      | Target game instance                   |
| `formation_saves`   | Yes      | JSON string of linked formation saves  |
| `area_goal`         | Yes      | Area reset target                      |
| `buffs`             | Yes      | JSON string of buff selections         |
| `checkin_timestamp` | Yes      | Unix timestamp (current time + 7 days) |
| `properties`        | Yes      | JSON string of additional properties   |


---

## Adventures / Campaigns

### `setcurrentobjective`

Starts (loads) an adventure objective. Use **either** `patron_id` or `time_gate_objective`, never both.


| Parameter             | Required    | Notes                                                  |
| --------------------- | ----------- | ------------------------------------------------------ |
| `game_instance_id`    | Yes         |                                                        |
| `adventure_id`        | Yes         |                                                        |
| `patron_tier`         | Conditional | `0` when using patron_id path                          |
| `patron_id`           | Conditional | Patron identifier (default `0`)                        |
| `time_gate_objective` | Conditional | Used instead of patron params for time gate adventures |


---

### `softreset`

Ends (soft-resets) the current adventure.


| Parameter          | Required | Notes |
| ------------------ | -------- | ----- |
| `game_instance_id` | Yes      |       |


---

### `getusergameinstance`

Gets data for a specific game instance.


| Parameter          | Required | Notes |
| ------------------ | -------- | ----- |
| `game_instance_id` | Yes      |       |


---

### `getcampaigndetails`

Gets campaign details for the account.


| Parameter     | Required | Notes |
| ------------- | -------- | ----- |
| `user_id`     | Yes      |       |
| `hash`        | Yes      |       |
| `instance_id` | Yes      |       |


---

## Time Gates

### `opentimegate`

Opens a time gate for a specific champion.


| Parameter     | Required | Notes                                |
| ------------- | -------- | ------------------------------------ |
| `champion_id` | Yes      | The champion to open a time gate for |


---

### `closetimegate`

Closes the currently active time gate.


| Parameter                        | Required | Notes |
| -------------------------------- | -------- | ----- |
| *(none beyond auth/boilerplate)* |          |       |


---

## Patrons

### `getpatrondetails`

Gets patron unlock status, progress, and shop inventory.


| Parameter     | Required | Notes |
| ------------- | -------- | ----- |
| `user_id`     | Yes      |       |
| `hash`        | Yes      |       |
| `instance_id` | Yes      |       |


---

### `purchasepatronshopitem`

Buys an item from a patron's shop.


| Parameter      | Required | Notes               |
| -------------- | -------- | ------------------- |
| `patron_id`    | Yes      | Which patron's shop |
| `shop_item_id` | Yes      | Item to purchase    |
| `count`        | Yes      | Quantity            |


---

## Trials

### `trialsrefreshdata`

Refreshes the current trials state.


| Parameter     | Required | Notes |
| ------------- | -------- | ----- |
| `user_id`     | Yes      |       |
| `hash`        | Yes      |       |
| `instance_id` | Yes      |       |


---

### `trialsopencampaign`

Creates a new trials campaign.


| Parameter       | Required | Notes                                                   |
| --------------- | -------- | ------------------------------------------------------- |
| `difficulty_id` | Yes      | Difficulty tier                                         |
| `private`       | Yes      | `True` or `False`                                       |
| `cost_choice`   | Yes      | `-1` for difficulty 1; `1` for prismatic; `0` otherwise |
| `auto_start`    | Yes      | `True` or `False`                                       |


---

### `trialsjoincampaign`

Joins an existing trials campaign.


| Parameter      | Required | Notes             |
| -------------- | -------- | ----------------- |
| `join_key`     | Yes      | Campaign join key |
| `player_index` | Yes      | Always `0`        |


---

### `trialskickplayer`

Kicks a player from a trials campaign.


| Parameter      | Required | Notes                       |
| -------------- | -------- | --------------------------- |
| `player_index` | Yes      | Index of the player to kick |


---

### `trialsstartcampaign`

Starts a trials campaign that has been created.


| Parameter     | Required | Notes             |
| ------------- | -------- | ----------------- |
| `campaign_id` | Yes      | Campaign to start |


---

### `trialspickrolehero`

Picks a hero for a role in a trials campaign.


| Parameter     | Required | Notes                            |
| ------------- | -------- | -------------------------------- |
| `role_id`     | Yes      | Role to fill                     |
| `hero_id`     | Yes      | Champion to assign               |
| `cost_choice` | Yes      | `1` for prismatic, `0` otherwise |


---

### `trialsclaimrewards`

Claims rewards from a completed trials campaign.


| Parameter     | Required | Notes                  |
| ------------- | -------- | ---------------------- |
| `campaign_id` | Yes      | Campaign to claim from |


---

## Champions / Feats / Dismantles

### `purchasefeat`

Purchases a feat for a champion.


| Parameter | Required | Notes                |
| --------- | -------- | -------------------- |
| `feat_id` | Yes      | The feat to purchase |


---

### `getredistributehero`

Gets available dismantle (redistribute) options. Returns which champions can be dismantled and their reward breakdowns.


| Parameter     | Required | Notes |
| ------------- | -------- | ----- |
| `user_id`     | Yes      |       |
| `hash`        | Yes      |       |
| `instance_id` | Yes      |       |


---

### `redistributehero`

Dismantles a champion, returning potions and other rewards.


| Parameter         | Required | Notes                                                  |
| ----------------- | -------- | ------------------------------------------------------ |
| `hero_id`         | Yes      | Champion to dismantle                                  |
| `redistribute_id` | Yes      | The redistribute event ID (from `getredistributehero`) |


---

### `usesummonscoll`

Uses a summon scroll on a hero. *(Note: the API endpoint has a typo — `scoll` instead of `scroll`.)*


| Parameter | Required | Notes              |
| --------- | -------- | ------------------ |
| `hero_id` | Yes      | Champion to summon |


---

### `exchangesummonscroll`

Exchanges summon scrolls (e.g. for other rewards).


| Parameter | Required | Notes                         |
| --------- | -------- | ----------------------------- |
| `count`   | Yes      | Number of scrolls to exchange |


---

### `usegildingscroll`

Uses a gilding scroll on a hero to increase their gilding level.


| Parameter | Required | Notes            |
| --------- | -------- | ---------------- |
| `hero_id` | Yes      | Champion to gild |


---

## Shop / Offers / Rewards

### `getshop`

Gets the current shop inventory.


| Parameter                  | Required | Notes       |
| -------------------------- | -------- | ----------- |
| `return_all_items_live`    | Yes      | `1`         |
| `return_all_items_ever`    | Yes      | `0`         |
| `show_hard_currency`       | Yes      | `1`         |
| `prioritize_item_category` | Yes      | `recommend` |


---

### `getdailyloginrewards`

Gets daily login reward information.


| Parameter     | Required | Notes |
| ------------- | -------- | ----- |
| `user_id`     | Yes      |       |
| `hash`        | Yes      |       |
| `instance_id` | Yes      |       |


---

### `claimdailyloginreward`

Claims the daily login reward.


| Parameter  | Required | Notes                            |
| ---------- | -------- | -------------------------------- |
| `is_boost` | No       | `1` to claim the boosted version |


---

### `revealalacarteoffers`

Reveals the weekly a la carte offers.


| Parameter     | Required | Notes |
| ------------- | -------- | ----- |
| `user_id`     | Yes      |       |
| `hash`        | Yes      |       |
| `instance_id` | Yes      |       |


---

### `getalacarteoffers`

Gets the current weekly a la carte offers.


| Parameter     | Required | Notes |
| ------------- | -------- | ----- |
| `user_id`     | Yes      |       |
| `hash`        | Yes      |       |
| `instance_id` | Yes      |       |


---

### `rerollalacarteoffer`

Re-rolls a specific weekly offer.


| Parameter  | Required | Notes            |
| ---------- | -------- | ---------------- |
| `offer_id` | Yes      | Offer to re-roll |


---

### `PurchaseALaCarteOffer`

Purchases a weekly a la carte offer.


| Parameter  | Required | Notes             |
| ---------- | -------- | ----------------- |
| `offer_id` | Yes      | Offer to purchase |


---

### `claimsalebonus`

Claims a sale bonus item.


| Parameter                  | Required | Notes            |
| -------------------------- | -------- | ---------------- |
| `premium_item_id`          | Yes      | The premium item |
| `return_all_items_live`    | Yes      | `1`              |
| `return_all_items_ever`    | Yes      | `0`              |
| `show_hard_currency`       | Yes      | `1`              |
| `prioritize_item_category` | Yes      | `recommend`      |


---

### `purchaseshopvaultoffer`

Purchases an item from the shop vault.


| Parameter   | Required | Notes                    |
| ----------- | -------- | ------------------------ |
| `item_type` | Yes      | Type of vault item       |
| `item_id`   | Yes      | Specific item identifier |


---

## Codes / Coupons

### `redeemcoupon`

Redeems a chest code or celebration combination.


| Parameter | Required | Notes                       |
| --------- | -------- | --------------------------- |
| `code`    | Yes      | The code/combination string |


---

## Favour / Currency

### `convertresetcurrency`

Converts favour (divine favour / reset currency) from one campaign to another.


| Parameter               | Required | Notes                       |
| ----------------------- | -------- | --------------------------- |
| `converted_currency_id` | Yes      | Source campaign currency ID |
| `target_currency_id`    | Yes      | Target campaign currency ID |


---

## Apothecary / Potions

### `distillpotions`

Distills potions into essence.


| Parameter    | Required | Notes                                    |
| ------------ | -------- | ---------------------------------------- |
| `to_distill` | Yes      | JSON object — `{"buff_id": amount, ...}` |


---

### `brewpotions`

Brews potions from essence.


| Parameter | Required | Notes                  |
| --------- | -------- | ---------------------- |
| `buff_id` | Yes      | Potion buff ID to brew |
| `count`   | Yes      | Number to brew         |


---

### `enhancepotions`

Enhances (upgrades) potions from one tier to another.


| Parameter        | Required | Notes                            |
| ---------------- | -------- | -------------------------------- |
| `source_buff_id` | Yes      | Source potion buff ID            |
| `result_buff_id` | Yes      | Target (enhanced) potion buff ID |
| `count`          | Yes      | Number to enhance                |


---

## Events

### `geteventsdetails`

Gets details about currently running events.


| Parameter     | Required | Notes |
| ------------- | -------- | ----- |
| `user_id`     | Yes      |       |
| `hash`        | Yes      |       |
| `instance_id` | Yes      |       |


---

### `pickeventflexhero`

Picks a flex hero for an event slot.


| Parameter     | Required | Notes                                                |
| ------------- | -------- | ---------------------------------------------------- |
| `event_id`    | Yes      | Event identifier                                     |
| `hero_id`     | Yes      | Champion to assign                                   |
| `slot_id`     | Yes      | Flex slot to assign to                               |
| `reset_tiers` | Yes      | `1` to reset event tiers for the hero, `0` otherwise |


---

## Mastery Challenges

### `getmasterychallengesdata`

Gets mastery challenge state and options.


| Parameter     | Required | Notes |
| ------------- | -------- | ----- |
| `user_id`     | Yes      |       |
| `hash`        | Yes      |       |
| `instance_id` | Yes      |       |


---

### `setmasterychallengeoptions`

Sets restriction options on a mastery challenge.


| Parameter      | Required | Notes                                    |
| -------------- | -------- | ---------------------------------------- |
| `challenge_id` | Yes      | Challenge identifier                     |
| `restrictions` | Yes      | JSON array of restriction IDs (integers) |


---

## Card Sleeves

### `purchasecardsleeve`

Purchases a card sleeve for a champion.


| Parameter    | Required | Notes                            |
| ------------ | -------- | -------------------------------- |
| `sleeve_id`  | Yes      | Card sleeve identifier           |
| `hero_id`    | Yes      | Champion to buy it for           |
| `auto_equip` | Yes      | `1` to auto-equip, `0` otherwise |


---

### `equipcardsleeve`

Equips a card sleeve on a champion.


| Parameter   | Required | Notes                  |
| ----------- | -------- | ---------------------- |
| `sleeve_id` | Yes      | Card sleeve identifier |
| `hero_id`   | Yes      | Champion to equip on   |


To **unequip**, call the same endpoint with only `hero_id` (omit `sleeve_id`).

---

## Miscellaneous

### `saveinstancename`

Renames a game instance.


| Parameter          | Required | Notes              |
| ------------------ | -------- | ------------------ |
| `name`             | Yes      | New name           |
| `game_instance_id` | Yes      | Instance to rename |


---

### `getdynamicdialog`

Fetches dynamic dialog content from the server.


| Parameter | Required | Notes             |
| --------- | -------- | ----------------- |
| `dialog`  | Yes      | Dialog identifier |
| `ui_type` | Yes      | Always `standard` |


---

### `getcompletiondata`

Gets adventure completion data.


| Parameter | Required | Notes      |
| --------- | -------- | ---------- |
| `level`   | Yes      | Always `0` |


---

### `getPlayHistory`

Gets play history records (chest opens, purchases, etc.).


| Parameter | Required | Notes                                                                                                         |
| --------- | -------- | ------------------------------------------------------------------------------------------------------------- |
| `page`    | Yes      | Page number for pagination                                                                                    |
| `types`   | Yes      | Array of history type IDs: `[0,1,2,3,6,11,12,13,19,20,21,28,30,37,45,50]` (optionally includes `18` for gems) |


---

### `claimcollectionquestrewards`

Claims collection quest rewards.


| Parameter             | Required | Notes                                    |
| --------------------- | -------- | ---------------------------------------- |
| `collection_quest_id` | Yes      | Quest ID, or `-1` to claim all available |


---

### `getactivetasksdata`

Gets active tasks data.


| Parameter     | Required | Notes |
| ------------- | -------- | ----- |
| `user_id`     | Yes      |       |
| `hash`        | Yes      |       |
| `instance_id` | Yes      |       |


---

## Error Handling

The `serverCalls.js` client handles several error conditions automatically:


| Error                            | Behavior                                                            |
| -------------------------------- | ------------------------------------------------------------------- |
| `switch_play_server` in response | Switches to the new server URL and retries                          |
| `Outdated instance id`           | Refreshes `instance_id` via `getuserdetails` and retries            |
| `Security hash failure`          | Throws — user credentials are incorrect                             |
| `non-atomic`                     | Throws — interrupted by a non-atomic action (e.g. in-game activity) |
| HTTP 404 / 500 / 502             | Throws — play server appears to be dead                             |
| Timeout (40s default)            | Throws — server did not respond in time                             |


Retries are capped at **4 attempts** before giving up.

---

*Generated from [Emmotes/ic_servercalls](https://github.com/Emmotes/ic_servercalls) — `docs/scripts/serverCalls.js` (v3.026).*