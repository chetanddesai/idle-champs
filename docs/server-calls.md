# Idle Champions Server Calls — API Reference

> **Source:** [Emmotes/ic_servercalls](https://github.com/Emmotes/ic_servercalls) — community-built tooling for Idle Champions of the Forgotten Realms.
>
> All call definitions extracted from `[docs/scripts/serverCalls.js](https://github.com/Emmotes/ic_servercalls/blob/main/docs/scripts/serverCalls.js)`. Additional context from the tab-specific scripts in the same repository.

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