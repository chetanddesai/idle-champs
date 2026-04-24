# Idle Champions Helper — Product Requirements Document

**Project:** Idle Champions of the Forgotten Realms — Player Companion Site
**Version:** 0.1 (Draft)
**Last Updated:** 2026-04-22
**Inspiration:** Community tooling from [Emmotes/ic_servercalls](https://github.com/Emmotes/ic_servercalls) — a JavaScript client that talks directly to the live Idle Champions play servers.

---

## 1. Overview

A static GitHub Pages website that augments the Idle Champions of the Forgotten Realms (ICFR) game client with **player-friendly companion tools**. It uses a player's own account credentials (`user_id` + `hash`) to call the official play-server API directly from the browser, then presents the data in views that are easier to scan, compare, and act on than the in-game UI.

The site is intentionally **zero-backend**: no server code, no database, no analytics pipeline. Everything runs as HTML, CSS, and JavaScript served from GitHub Pages. Credentials never leave the player's browser.

### Core Thesis

> The Idle Champions play-server API already exposes everything a power-user needs — legendary item state, specialization choices, formations, patrons, events, and more. What's missing is a clean, mobile-friendly surface that lets a player quickly answer *"what should I do next?"* without trawling through menus inside the game client.

### Initial Scope (V1)

Two gameplay areas are supported in V1. Each is a self-contained "category" with its own view, its own set of server calls, and its own actions:

1. **Legendary Items** — pick your DPS champion, then use two tabs that share that DPS context: **Forge Run** (V1 priority; deterministic upgrade of DPS-affecting legendaries — each upgrade spends **both** Scales of Tiamat and a campaign-specific favor currency, with the view ranked by favor since favor is the per-campaign gating resource) and **Reforge** (ships after Forge Run; probabilistic Scales-of-Tiamat reroll of supporting-hero slots into DPS-affecting effects, timed against the decaying Tiamat cost floor). See §3.2.
2. **Specialization Choices** — view and update each champion's specialization picks across the player's saved formations.

Additional categories (Patrons, Events, Chests, Blacksmith, Potions, etc.) are listed in §11 as future enhancements — the architecture is designed so adding a new category is a matter of adding a new view module, not rewriting the shell.

---

## 2. Non-Functional Requirements

### 2.1 Hosting & Technology


| Constraint             | Detail                                                                                                                                                                                                               |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Hosting**            | GitHub Pages (static only — no server-side rendering, no serverless functions)                                                                                                                                       |
| **Allowed assets**     | HTML, CSS, JavaScript (vanilla or lightweight library — no framework build step required), JSON data files, image assets                                                                                             |
| **Build step**         | None required. The site must work by serving the repo root (or a configured `/docs` or `/dist` publish directory) directly. A lightweight build step is acceptable only if the **output** is committed static files. |
| **Browser support**    | Latest two versions of Chrome, Safari, Firefox, Edge; mobile Safari & Chrome on iOS/Android                                                                                                                          |
| **Mobile form factor** | First-class. The site must be fully usable on a 375px-wide phone viewport — every action that works on desktop must work on mobile with equivalent ergonomics.                                                       |


### 2.2 Credentials & Privacy


| Requirement                  | Detail                                                                                                                                                                                                                         |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Credential storage**       | `user_id` and `hash` are stored **only** in the player's browser `localStorage`. They are never transmitted anywhere except directly to the official Idle Champions play servers (same endpoints the game client itself uses). |
| **No telemetry**             | The site makes **no** network calls to any host other than the Idle Champions master/play servers. No analytics, no error reporting, no third-party CDNs that could see request headers.                                       |
| **Clear-credentials action** | The settings panel provides an explicit "Clear credentials" button that wipes the stored `user_id` and `hash` (and any cached account data) from `localStorage`.                                                               |
| **Security warning**         | The settings panel displays a short notice explaining that `hash` grants full account access, and that the player should only paste it into trusted tools running on their own device.                                         |


### 2.3 Performance & Accessibility


| Requirement                  | Detail                                                                                                                  |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| **Lighthouse score targets** | Performance ≥ 90, Accessibility ≥ 95, Best Practices ≥ 90, SEO ≥ 80                                                     |
| **Page weight**              | < 300 KB first load for the site shell (excluding API payloads and any game-art images)                                 |
| **Accessibility**            | Semantic HTML, ARIA landmarks, sufficient color contrast (WCAG AA), keyboard-navigable, alt text on all images          |
| **Responsive design**        | Mobile-first. Must look great on 375px–1440px+ viewports. Dense tables must degrade to stacked cards on narrow screens. |


### 2.4 Favicons, Manifest & Branding

**The visual language is shared with my sibling site [chetanddesai/ic-specs](https://github.com/chetanddesai/ic-specs)** so the two read as one family. All favicon and touch-icon files are the same assets across both repos (committed to `img/`, no regeneration). The web app manifest lives at the repo root as `site.webmanifest`.


| Asset                            | Specification                                                                                                                                                            |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `img/favicon.svg`                | SVG favicon — shared with ic-specs                                                                                                                                       |
| `img/favicon-32x32.png`          | 32×32 PNG favicon — shared with ic-specs                                                                                                                                 |
| `img/favicon-16x16.png`          | 16×16 PNG favicon — shared with ic-specs                                                                                                                                 |
| `img/apple-touch-icon.png`       | 180×180 Apple touch icon — shared with ic-specs                                                                                                                          |
| `img/android-chrome-192x192.png` | 192×192 Android icon — shared with ic-specs                                                                                                                              |
| `img/android-chrome-512x512.png` | 512×512 Android icon — shared with ic-specs                                                                                                                              |
| `site.webmanifest`               | Shared shape with ic-specs; `name` / `short_name` are specific to this site. `theme_color` and `background_color` remain `#0f0e17` to keep the visual family consistent. |


The `<head>` of `index.html` must reference the icons with the same paths and attribute order as the sibling `ic-specs` site:

```html
<link rel="icon" type="image/svg+xml" href="img/favicon.svg">
<link rel="icon" type="image/png" sizes="32x32" href="img/favicon-32x32.png">
<link rel="icon" type="image/png" sizes="16x16" href="img/favicon-16x16.png">
<link rel="apple-touch-icon" sizes="180x180" href="img/apple-touch-icon.png">
<link rel="manifest" href="site.webmanifest">
<meta name="theme-color" content="#0f0e17">
```

### 2.5 SEO & Social Sharing


| Requirement   | Detail                                                                                                       |
| ------------- | ------------------------------------------------------------------------------------------------------------ |
| **Meta tags** | `<title>`, `<meta description>`, Open Graph (`og:title`, `og:description`, `og:image`), Twitter Card         |
| **robots**    | Public indexing allowed. No credential-entry page should be cached by search engines beyond its description. |


---

## 3. Functional Requirements

### 3.0 Settings & Credential Entry

The site header includes a **settings icon** (gear) that opens a settings panel (inline drawer on desktop, full-screen sheet on mobile). The panel contains:

#### Credential entry — two supported modes


| Mode                    | Input                               | Behavior                                                                                                                                                                                                               |
| ----------------------- | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Manual**              | `user_id` field + `hash` field      | User types or pastes each value. On save, both are written to `localStorage` under `icHelper.userId` and `icHelper.hash`.                                                                                              |
| **Support URL parsing** | Single "Paste support URL" textarea | The site parses the URL, extracts the `user_id` and `device_hash` query parameters, and populates the manual fields. `device_hash` is stored as `hash` (the play-server API calls it `hash`). User confirms and saves. |


#### Additional controls in the settings panel

- **Validate credentials** button — calls `getuserdetails`; success shows the account name and last-login; failure shows the exact API error (e.g., "Security hash failure" → credentials invalid).
- **Clear credentials** button — wipes stored credentials and any cached API data.
- **Play server display** — shows the currently selected play-server URL (obtained from `getPlayServerForDefinitions`) and a "Re-discover" button that forces a fresh discovery call.
- **Security notice** — one paragraph explaining that the `hash` is a full-account credential and must not be shared.

#### Credential gating

All category views require valid credentials to load. Until credentials are saved:

- A dismissible banner on the home page invites the user to open settings.
- Each category view shows a "No credentials configured" empty state with a button that opens the settings panel.

#### Persistence


| Key                   | Value                                                  | Lifetime                        |
| --------------------- | ------------------------------------------------------ | ------------------------------- |
| `icHelper.userId`     | Account `user_id`                                      | Until user clears or replaces   |
| `icHelper.hash`       | Account `hash` (from `device_hash` on support URL)     | Until user clears or replaces   |
| `icHelper.playServer` | Discovered play-server base URL                        | 24h TTL, refreshes on expiry    |
| `icHelper.instanceId` | Current `instance_id` from latest `getuserdetails`     | Refreshed on each session start |
| `icHelper.lastSync`   | ISO timestamp of last successful `getuserdetails` call | Updated on every sync           |


### 3.1 Server Calls Module (`serverCalls.js`)

All play-server communication is encapsulated in a single JavaScript module modeled after the reference `[serverCalls.js](https://github.com/Emmotes/ic_servercalls/blob/main/docs/scripts/serverCalls.js)` documented in `[docs/server-calls.md](./server-calls.md)`.

#### Responsibilities


| Concern                    | Behavior                                                                                                                                                                                                                                                                                 |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Play-server discovery**  | First call per session is `getPlayServerForDefinitions` against `https://master.idlechampions.com/~idledragons/`. Result cached for 24h in `localStorage`.                                                                                                                               |
| **Boilerplate parameters** | Automatically attaches the standard parameters (`language_id=1`, `timestamp=0`, `request_id=0`, `mobile_client_version=99999`, `include_free_play_objectives=true`, `instance_key=1`, `offline_v2_build=1`, `localization_aware=true`).                                                  |
| **Auth parameters**        | Automatically attaches `user_id`, `hash`, and `instance_id` to calls that require them.                                                                                                                                                                                                  |
| **Error handling**         | Implements the retry/recovery table from §7 of `[server-calls.md](./server-calls.md)`: `switch_play_server` → swap base URL and retry; `Outdated instance id` → call `getuserdetails` to refresh and retry; hard failures throw. Capped at 4 retry attempts.                             |
| **Timeout**                | 40-second default per request, matching the reference client.                                                                                                                                                                                                                            |
| **API surface**            | A clean set of named functions — one per server call used by the site (e.g., `getUserDetails()`, `getLegendaryDetails()`, `craftLegendaryItem(heroId, slotId)`, `saveFormation(...)`). Not a generic `call(name, params)` passthrough — each function has a typed, documented signature. |


The module is the **only** place in the codebase that knows the shape of the play-server HTTP protocol. Every category view imports it and calls the named functions it needs.

#### V1 server calls used


| Category               | Calls used                                                                                                  |
| ---------------------- | ----------------------------------------------------------------------------------------------------------- |
| Session / account      | `getPlayServerForDefinitions`, `getuserdetails`, `getdefinitions`                                           |
| Legendary Items        | `getlegendarydetails`, `craftlegendaryitem`, `upgradelegendaryitem`, `changelegendaryitem`                  |
| Specialization Choices | `getallformationsaves`, `SaveFormation` (updating the `specializations` field), `getuserdetails` (fallback) |


### 3.2 Category: Legendary Items

The Legendary tab helps players make two distinct decisions about their legendaries, through a single pick-your-DPS lens. It is rendered as one dashboard card with two tabs that share the DPS selector and scope classification:

- **Forge Run** (V1 priority) — a **deterministic, favor-gated upgrade view**. Every upgrade costs both Scales of Tiamat and a campaign-specific favor currency; the view is *ranked* by favor because favor is the per-campaign gating resource — scales accumulate passively, favor is what you actively farm. Answers *"I've earned favor from running campaign X; which legendary upgrades will boost my DPS?"* Every tile is a level-up candidate with a known Tiamat + favor cost (see §3.2.4).
- **Reforge** (ships after Forge Run) — a **probabilistic Tiamat-spend view**. Answers *"Which supporting hero's slot is worth rerolling right now, given that the Scales of Tiamat cost decays toward a 1000 floor over 7 days?"* Each candidate tile carries an `X/Y hits` badge quantifying re-roll risk and a "ready" indicator for the cost floor (see §3.2.5).

Pick your DPS once; switch tabs freely. Only heroes and slots relevant to the chosen view appear — neither tab is a generic roster browser. Last-selected tab is remembered in `localStorage.icHelper.legendary.activeTab`, defaulting to Forge Run.

#### 3.2.1 Data sources

- **`getuserdetails`** is the single read-path for V1. `details.legendary_details` mirrors the full `getlegendarydetails` payload byte-for-byte (verified empirically — see `tech-design-legendary.md` Appendix B item 8), so one call hydrates the whole Legendary view. Inside the response:
  - `details.legendary_details.legendary_items[heroId][slotId]` — per-slot legendary state (`level`, `effect_id`, `effects_unlocked`, `upgrade_cost`, `upgrade_favor_cost`, `upgrade_favor_required`, `reset_currency_id`).
  - `details.legendary_details.costs_by_hero` — next craft cost in Scales of Tiamat, keyed by `hero_id`.
  - `details.legendary_details.cost` / `next_cost` / `reforge_reduction_time` — account-wide reforge cost state (scalar; see Appendix B item 5c).
  - `details.heroes[]` — roster + ownership (`owned`), equipment slots, epic/legendary gear levels.
  - **`details.stats.multiplayer_points` — Scales of Tiamat balance.** Verified against the player's in-game balance. *Not* stored in `details.loot` despite loot being the inventory bag; it lives under `stats`.
  - **`details.reset_currencies[]` — per-favor balances.** An array of `{id, current_amount, total_earned, …}` entries, not a map — the client builds an `id → entry` lookup at ingest. Joined against `slot.reset_currency_id` to compute favor eligibility.
  - Note: `details.loot` carries the player's loot inventory (for epic-gear gating on future Craft flows). It does **not** hold either currency balance — Scales are in `stats`, favor is in `reset_currencies`.
- **`getlegendarydetails`** remains documented for completeness but is **not called in V1** — it's strictly a proper subset of `getuserdetails.details.legendary_details`. If a future mutation ever fails to reflect in `getuserdetails` without delay, the V1 design falls back to calling `getlegendarydetails` on post-mutation refresh only.
- **`getdefinitions`** (filtered) → `hero_defines` and `legendary_effect_defines` ship from the bundled baseline in `data/` (see §4.2); `campaign_defines` is additionally required — it is the **only** source for favor display names. Each entry carries a `reset_currency_id` and a `short_name` (e.g. "Tiamat's Favor"); the Legendary view joins on `slot.reset_currency_id → campaign_defines[].reset_currency_id → campaign_defines[].short_name`. There is **no** `reset_currency_defines` group on this endpoint — `getdefinitions` does not expose one, and any documentation or code that reads `getuserdetails.defines.reset_currency_defines` is chasing a path that does not exist in the live payload (empirically verified 2026-04-24). `campaign_defines` is added to the bundled baseline as a V1 follow-up before Forge Run ships; see §4.2.

#### 3.2.2 Scope classification — "does this effect affect the DPS?"

The Idle Champions API does **not** expose a structured targeting field for legendary effects. The targeting is encoded in the human-readable description template. Fortunately the template is a single regular grammar; we parse it once at bundle-refresh time and store a machine-readable scope tag per effect.

**Effect shapes in the legendary pool** (as of refresh):

| `effect_string`              | `targets`             | Count | Semantic                                                              |
| ---------------------------- | --------------------- | ----- | --------------------------------------------------------------------- |
| `global_dps_multiplier_mult` | `["active_campaign"]` | 54    | Global; affects every champion in the active formation.               |
| `hero_dps_multiplier_mult`   | `["all_slots"]`       | 56    | Per-hero scoped; affects only champions matching the scope in the description. |

**Scope taxonomy** (parsed from the description of every `hero_dps_multiplier_mult` effect, all of which follow the pattern `"Increases the damage of all X by $(amount)%"`):

| Scope kind         | Examples                                                                                                                                                                      | Hero record field used for matching     |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `race`             | Human, Dwarf, Elf, Half-Elf, Dragonborn, Tiefling, Warforged, Gnome, Kobold, Aasimar, Aarakocra, Tabaxi, Tortle, Halfling, Firbolg, Gith, Githyanki, Giff, Plasmoid, Goliath, Genasi, Goblin, Minotaur, Lizardfolk, Saurial, Yuan-ti, Half-Orc | `hero.tags.includes('human')` — API pre-tokenizes |
| `gender`           | Male, Female, Nonbinary                                                                                                                                                        | `hero.tags.includes('female')`          |
| `alignment`        | Good, Evil, Lawful, Chaotic, Neutral                                                                                                                                          | `hero.tags.includes('good')` — the API splits two-word alignments (e.g., "Chaotic Good" → `['chaotic','good']`) into separate tags, so matching is a clean set membership check per axis |
| `damage_type`      | Melee, Ranged, Magic                                                                                                                                                          | `hero.damage_types.includes('magic')` — array, because heroes can be in multiple buckets (e.g., Cazrin is both `magic` and `ranged`). Derived at refresh time from the hero's `base_attack_id` |
| `stat_threshold`   | "Champions with a STR score of 11 or higher" (and 13, 15; for STR/DEX/CON/INT/WIS/CHA)                                                                                         | `hero.ability_scores[stat] >= min` — keys are lowercase (`str`, `dex`, `con`, `int`, `wis`, `cha`) |

Notes:
- Hero **class** is never used in legendary effect scoping (though the tags array still carries the class tag for display).
- The game has a data typo — description text uses "Halfing" but hero tags correctly spell "halfling". Normalized to "Halfling" at refresh time, then lowercased at match time.
- `Nonbinary` has zero matching heroes in the current roster, but the effect exists in the pool; the matcher correctly returns `false` for all heroes until/unless a hero is tagged `nonbinary`.
- Anything the parser can't classify is tagged `{"kind": "unknown"}`, its id is appended to `unknown_scope_ids` in the metadata file, and a stderr warning fires. The run still succeeds — it's a soft tripwire, not a build failure.

**Runtime matcher (pure, deterministic, no I/O):**

```js
function effectAffectsHero(scope, hero) {
  switch (scope.kind) {
    case 'global':          return true;
    case 'race':            return hero.tags.includes(scope.value.toLowerCase());
    case 'gender':          return hero.tags.includes(scope.value.toLowerCase());
    case 'alignment':       return hero.tags.includes(scope.value.toLowerCase());
    case 'damage_type':     return hero.damage_types.includes(scope.value.toLowerCase());
    case 'stat_threshold':  return (hero.ability_scores?.[scope.stat] ?? 0) >= scope.min;
    case 'unknown':         // fall through to conservative no
    default:                return false;
  }
}
```

The site runs this once per legendary effect in the pool against the selected DPS; results cache in-session. On a freshly refreshed bundle, every effect matches a known kind, so the `unknown` branch is dead code — but it's present because a game update is the natural way for it to become live, at which point `unknown_scope_ids` in the checksum file tells us exactly what to teach the parser about.

**Empirical sanity check** (against Cazrin — Human / Female / Chaotic Good / Wizard / Ranged+Magic / INT 18, DEX 13, WIS 13, CHA 13, CON 14, STR 8): the matcher reports 71 of 110 legendary effects affect her — 54 global, plus one gender (Female), one race (Human), two alignments (Chaotic + Good), two damage types (Ranged + Magic), and 11 stat thresholds (all of the DEX/CON/INT/WIS/CHA tiers she clears, including INT ≥ 15). Bruenor (Male Dwarf Fighter, Melee, INT 8) lands at 68 effects with a completely different scoped set, confirming the matcher differentiates correctly.

#### 3.2.3 Shared workflow and header

The workflow and header chrome are identical across both tabs — the DPS selector, the classification chips, and the tab switcher all live above the per-tab content.

**Workflow:**

1. User opens the Legendary tab.
2. Site restores the last-selected DPS from `localStorage.icHelper.legendary.dpsHeroId` and the last-selected tab from `localStorage.icHelper.legendary.activeTab` (defaulting to Forge Run).
3. If no DPS is remembered, the page shows a shared empty state: a DPS dropdown with the prompt *"Pick your DPS champion to start."* No tab content renders until a DPS is picked.
4. User selects a DPS from the dropdown. The dropdown lists **all owned champions** (heroes with `user_details.heroes[id].has === true`), sorted alphabetically, with a small chip showing each hero's race/class for disambiguation.
5. On selection, the site:
   a. Stores `dpsHeroId` in `localStorage`.
   b. Computes `affects = effectAffectsHero(scope, dps)` for every effect in the pool (memoized in session).
   c. Classifies every legendary slot once; both tabs then filter this shared classification to their view.
   d. Renders the active tab.

**Header (always visible above both tabs):** centered DPS portrait + name; below it, a single-line chip row showing the five classification axes used by scope matching: `Human · Female · Good · Magic · STR 10 · DEX 14 · INT 16` etc. This makes the classification model legible to the user — they can see *why* a given legendary does or doesn't affect their pick. Scales of Tiamat balance is a badge to the right, matching ic-specs header pill style (§7.3). A tab switcher ("Forge Run" | "Reforge") sits between the header and the tab content.

#### 3.2.4 Forge Run view (V1 priority)

Deterministic view for spending **Scales of Tiamat + campaign favor** on DPS upgrades. Every tile has a known effect and a known two-part cost (`upgrade_cost` = Tiamat, `upgrade_favor_cost` + `upgrade_favor_required` = favor). The view is organized by favor currency because favor is the per-campaign gating resource — scales accumulate passively, favor is what you actively farm. The goal is to let the user scan "what campaign should I run next to unlock the most useful upgrades?" at a glance.

**Favor priority panel (hero element):** a ranked list of favor currencies, one row per currency the DPS would benefit from. Each row shows:

| Column                        | Meaning                                                                                                   |
| ----------------------------- | --------------------------------------------------------------------------------------------------------- |
| Rank + favor name             | 1…N, most DPS-affecting upgradeable legendaries first.                                                    |
| Affecting count               | Total legendaries across all champions that affect the DPS and are tied to this favor currency.           |
| Upgradeable now               | Subset of the above that can be upgraded right now (scales + favor balances both sufficient).             |
| Current balance               | Player's current balance of this favor.                                                                   |

**V1 ranking** is by *upgradeable-now count* (descending), tiebroken by *affecting count*. This is deliberately the simplest useful metric; a DPS-gain-per-favor-unit weighted ranking is V2 material (§9, decision 13).

Clicking a favor row filters the upgrade candidate list to only that favor.

**Upgrade candidate list:** one card per champion that has at least one DPS-affecting equipped slot, with the DPS champion rendered first (their own slots are always beneficial by game-design invariant — see `tech-design-legendary.md` Appendix B, item 5a). Each card shows:

- Hero portrait + name + class/race.
- Six slot tiles laid out 1–6, each colored per the state table below.
- Per-card summary: *"3 affecting · 2 upgradeable now"*.
- Bulk action: **Upgrade all upgradeable** (fires `upgradelegendaryitem` once per upgradeable slot on this champion, with a single confirmation listing total favor + scales cost).

Champions with zero DPS-affecting equipped slots are hidden from the Forge Run tab — those whose slots are only reforge candidates surface in the Reforge tab instead. A collapsed *"N champions contribute nothing to this DPS"* disclosure at the bottom is informational only (no action from this tab).

**Cell color semantics (Forge Run view):**

| Slot state                 | Visual                                      | Condition                                                                            | Available action              |
| -------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------- |
| **Affecting, upgradeable** | `--accent-gold` filled border + level badge | Current `effect_id` affects DPS AND scales + favor both sufficient for next upgrade. | **Upgrade**                   |
| **Affecting, blocked**     | Gold border + muted fill                    | Current `effect_id` affects DPS AND upgrade blocked (insufficient scales or favor).  | Tooltip shows what's missing. |
| **Affecting, maxed**       | Gold border + "MAX" badge                   | Current `effect_id` affects DPS AND `level === 20`.                                  | None (at cap).                |

Slots in a *reforge candidate* or *not affecting* state do **not** appear in this view — reforge candidates live in §3.2.5; non-affecting slots with no reforge potential are hidden from both views. Empty craftable slots surface only as a tooltip hint "Craft first →"; crafting is out of V1 forge-run scope.

Tile hover/tap reveals a small effect card: effect name (resolved from `legendary_effect_defines`), level, resolved description with `$(amount)` substituted, the scope kind + value, and the inline Upgrade button.

**Actions:**

| Action       | API call                                  | Confirmation required                                              | After success                                                                                |
| ------------ | ----------------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| Upgrade      | `upgradelegendaryitem`                    | Single confirmation with full cost                                 | Re-fetch `getlegendarydetails` + `getuserdetails`; re-render; toast.                         |
| Bulk upgrade | N sequential `upgradelegendaryitem` calls | Single confirmation listing total scales + total favor by currency | Re-fetch `getlegendarydetails` + `getuserdetails` once after all complete; toast summarizes. |

Mutation UX is pessimistic (button disabled + spinner until response); see `tech-design-legendary.md` Appendix B, item 7.

**Empty states specific to the Forge Run tab:**

- **No upgradeable slots** → *"You've maxed out every DPS-affecting legendary for this hero. Try picking another DPS, or check the Reforge tab for slots worth rerolling."*
- **All upgrade paths blocked by missing favor** → the favor priority panel still ranks; tiles show the blocked state with tooltips explaining what's missing. No separate empty state.

#### 3.2.5 Reforge view (ships after Forge Run)

Probabilistic view for turning Scales of Tiamat into new legendary effects on **supporting** heroes. Reforge cost is dynamic — every reforge ramps the cost up; it then decays to the 1000-Tiamat floor over 7 days — so this tab is time-sensitive. The view surfaces which slots are *ready* (cost at floor) vs. *still cooling down*, and quantifies re-roll risk via an `X/Y hits` badge.

The selected DPS champion is **not** shown in this view — their own legendaries are always beneficial by game-design invariant (see `tech-design-legendary.md` Appendix B, item 5a) and never need rerolling.

**Layout:** one card per supporting hero that has at least one slot worth rerolling. A hero is shown iff:

- The hero has ≥ 1 equipped slot whose current `effect_id` does **not** affect DPS, AND
- The hero's 6-effect pool contains ≥ 1 effect that would affect DPS.

Each card shows:

- Hero portrait + name + class/race.
- Six slot tiles, with only reforge candidates highlighted (see state table below).
- Per-card summary: *"2 ready · 1 cooling down"*.

Sort order is ready-first (cost at the 1000 floor), then by `X/Y` hit rate descending, then by hero name.

**Reforge candidate detection:** a slot is a reforge candidate iff both of the following hold:

1. The slot's current `effect_id`'s scope does **not** match the DPS.
2. The hero's pool `hero.legendary_effect_id` contains **at least one** effect whose scope **does** match the DPS.

If the hero's pool has nothing for the DPS, the hero doesn't appear in the Reforge tab at all.

**Potential hits — "X/Y" metric:** each reforge candidate tile shows a small badge `X/Y hits` where Y = the number of distinct effects the next reforge on that slot could roll into, and X = how many of those Y possible outcomes would affect the selected DPS. The "unlocked set" that drives the denominator is **hero-wide** — specifically the **union of `effects_unlocked` across every crafted slot on that hero** (empirically verified; see `tech-design-legendary.md` Appendix B item 5b). Denote that union `U`, the hero's 6-effect pool `P`, and the DPS-affecting subset of the pool `A = P ∩ effectsAffectingDps`. Idle Champions has two reforge phases:

- **Phase 1 — discovery** (`|U| < 6`). A reforge is guaranteed to unlock a **new** effect, drawn from `P \ U`. So `Y = |P \ U| = 6 − |U|` (a number between 1 and 5), and `X = |(P \ U) ∩ A|`.
- **Phase 2 — steady state** (`|U| = 6`, so `U = P`). Rerolls draw uniformly from the full pool. `Y = 6` and `X = |A|`.

Interpretive guidance for the user:

- `X == Y` — every possible reforge outcome helps DPS; near-risk-free.
- `X / Y ≥ 0.5` — majority of outcomes land on a beneficial effect; high-value reforge.
- `X / Y < 0.5` — gamble; user should weigh cost against expected payoff. In Phase 1 a "miss" still has consolation value because it advances the hero toward all-6-unlocked.
- `X == 0` — the tile would not be classified as a reforge candidate in the first place and is not shown.

The tile tooltip lists the *specific* pool members that would pay off; the badge is the quick scannable summary of the same information.

**Cost tracking:** reforge cost is **account-wide**, not per-slot or per-hero (empirically verified; see `tech-design-legendary.md` Appendix B item 5c). The current cost, its next-multiplier, and its decay timer all live as top-level scalars on `getuserdetails.details.legendary_details` — `cost` (integer Scales at the 1000 floor, rises per reforge, decays back over time), `next_cost` (multiplier for the next reforge), `reforge_reduction_time` (seconds remaining on the decay window). The Reforge tab surfaces these values **once** as an account-level banner at the top of the view, not on every tile. All tiles are simultaneously *ready* (banner cost = 1000), *cooling* (banner cost > 1000 and player has enough Scales), or *blocked* (player's Scales < banner cost).

Per-tile visual treatment (driven by the account-level cost banner):

- **Ready** — banner cost at 1000 → green "ready" chip on every candidate tile.
- **Cooling down** — banner cost > 1000 and player has enough Scales → yellow chip on every candidate tile; if `reforge_reduction_time` yields a time-to-floor estimate, show it once in the banner ("ready in ~2h").
- **Blocked** — player's Scales balance (from `details.stats.multiplayer_points`) < banner cost → muted chip on every tile, no reforge action.

**Cell color semantics (Reforge view):**

| Slot state                     | Visual                                                               | Condition                                                                                   | Available action                             |
| ------------------------------ | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------- |
| **Reforge candidate, ready**   | Gold dashed border + `🔄` + green "ready" chip + `X/Y hits` badge   | Pool has ≥ 1 DPS-affecting effect AND banner `cost` at the 1000 floor AND player Scales balance ≥ 1000.        | **Reforge**                                  |
| **Reforge candidate, cooling** | Gold dashed border + `🔄` + yellow "cooling" chip + `X/Y hits` badge | Pool has ≥ 1 DPS-affecting effect AND banner `cost` > floor AND player Scales balance ≥ banner `cost`.          | **Reforge anyway** (tooltip nudges to wait — actual cost is in the banner, not repeated per tile). |
| **Reforge candidate, blocked** | Muted dashed border + insufficient-funds badge                       | Pool has ≥ 1 DPS-affecting effect BUT player Scales balance < banner `cost`.                                    | None (tooltip shows shortfall against the banner).      |

Slots that are not reforge candidates do **not** appear in this view.

Tile hover/tap reveals the currently-equipped effect name + resolved description (the effect that would be replaced), the specific pool members that would affect DPS (the `X` in `X/Y`), and the inline Reforge button.

**Actions:**

| Action  | API call              | Confirmation required                                                                                           | After success                                                                                                          |
| ------- | --------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Reforge | `changelegendaryitem` | Explicit confirmation with random-roll warning listing the `X` beneficial outcomes and the `Y - X` neutral ones | Re-fetch `getlegendarydetails` + `getuserdetails`; re-classify slot; toast summarizes the new roll and whether it hit. |

No bulk reforge in V1 — reforges are too expensive and too probabilistic to batch.

Mutation UX is pessimistic (button disabled + spinner until response); see `tech-design-legendary.md` Appendix B, item 7.

**Empty states specific to the Reforge tab:**

- **No supporting heroes with DPS-affecting pool members** → *"For this DPS, no supporting hero has a legendary worth rerolling. All beneficial effects in their pools are already equipped, or their pools don't overlap this DPS."*
- **All reforge candidates cooling down** → tiles render with their yellow chips + cost; the list is informational. No separate empty state (the "ready when" is the information).

#### 3.2.6 Shared empty states and error handling

- **No DPS selected** → shared empty state with dropdown and one-sentence hint. Neither tab renders content.
- **No legendaries on any champion** → friendly shared banner: *"You don't have any legendaries crafted yet. A simple craft view is planned post-V1; for now, craft your first few from the in-game client."* No blocking CTA; both tabs display the banner in place of their content.
- **DPS classification returns `unknown` for one or more effects** → small banner above the tab switcher: *"N effects couldn't be classified; please file an issue with the effect ID."* Doesn't block either view.
- **Session-level refresh button** in the global header re-fetches `getlegendarydetails` + `getuserdetails` and updates `ic.last_refresh_at`.

#### 3.2.7 Mobile layout

- Header chip row wraps to two lines if needed.
- Tab switcher becomes a sticky row below the header.
- **Forge Run tab:** favor priority panel becomes a horizontal scroll strip of currency cards above the upgrade list. Champion cards stack vertically; slot tiles are a 6-tile grid (3×2 on very narrow screens) with touch-friendly 44×44 pt targets.
- **Reforge tab:** hero cards stack; `X/Y` badges and ready-chips scale down but remain legible. Cost chips wrap to a second line under the tile if needed.
- Sticky DPS + scales bar at the top across both tabs; selecting a new DPS scrolls the active tab back to the top.

### 3.3 Category: Specialization Choices

#### Data sources

- `getallformationsaves` → every saved formation with its `specializations` JSON blob
- `getdefinitions` (with `filter=hero_defines`) → champion display names + the set of specialization options available per champion per tier
- `SaveFormation` (with the existing `formation_save_id`) → persist updated specialization choices for a given formation

#### Display


| Element                    | Detail                                                                                                                                                                                                 |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Formation list**         | Grouped by campaign, showing formation name + favorite flag. Clicking expands to show the formation detail view.                                                                                       |
| **Formation detail**       | Per-champion row showing: champion name, current specialization picks (one per tier), and a dropdown for each tier listing the available alternatives.                                                 |
| **Diff indicator**         | If the player has changed any pick, the row shows a dot + "Unsaved changes" pill. Explicit **Save formation** button persists via `SaveFormation`; **Discard** reverts local state.                    |
| **Bulk actions (stretch)** | "Apply pick to all formations containing this champion" — updates every saved formation's `specializations` for the selected champion in one pass (N `SaveFormation` calls with a progress indicator). |
| **Search / filter**        | Filter formations by campaign; search by champion name across all formations ("show me every formation where champion X is placed and their current spec choices").                                    |


#### Mobile layout

Formation list stacks vertically. Tapping a formation opens a full-screen detail view. Dropdowns are native `<select>` elements for thumb-friendliness.

### 3.4 Home / Dashboard

Landing view when valid credentials exist. Shows:

- Account name, current Scales of Tiamat balance, last-sync timestamp.
- Cards linking to each category:
  - **Legendary Items** — if a DPS is remembered, one-line summary like *"DPS: Cazrin · Forge Run: 14 upgrades ready · Reforge: 3 ready, 2 cooling down."* Clicking the card opens the last-selected tab (Forge Run by default on first visit). If no DPS has been picked yet, prompt *"Pick your DPS to start →"*.
  - **Specialization Choices** — one-line summary like *"4 formations · 2 with pending recommendations."*
- Settings icon top-right.
- Manual "Refresh" button that forces a fresh `getuserdetails`.

---

## 4. Data & Caching

### 4.1 Runtime caches


| Cache                          | Scope                        | TTL                                                                       | Invalidation                                                                                                                                       |
| ------------------------------ | ---------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Play-server URL                | Session + `localStorage`     | 24h                                                                       | Auto on TTL; manual via settings "Re-discover"                                                                                                     |
| Game definitions (baseline)    | Repo-committed `data/*.json` | Refreshed manually via `scripts/refresh-defs.js` after major game updates | Read at every page load; serves as the zero-network fallback for labels (see §4.3)                                                                 |
| Game definitions (live deltas) | `localStorage`               | Until the player clicks "Refresh Data" in settings                        | Optional background refresh: site calls `getdefinitions?filter=…` on load; new entries are merged on top of the bundled baseline in `localStorage` |
| User details / legendary state | In-memory only, per session  | Invalidated on mutations                                                  | Refetched after any craft/upgrade/reforge; manual "Refresh" button                                                                                 |
| Formation saves                | In-memory only, per session  | Invalidated on `SaveFormation`                                            | Refetched after save; manual "Refresh" button                                                                                                      |


### 4.2 Bundled definitions strategy

**V1 ships a curated, trimmed subset of `getdefinitions` output as static JSON files in `data/`, committed to the repo.** This gives the site a zero-latency first paint for all human-readable labels (hero names, legendary-effect descriptions) without an initial API round trip. The live server is still the source of truth for player **state**; `data/*.json` only covers reference data (names, descriptions, IDs).

#### Bundled files


| File                                      | Contents                                                                                                                                                                                                                                                              | Approx size |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `data/definitions.heroes.json`                  | Trimmed + enriched `hero_defines` — one entry per hero with `id`, `name`, `seat_id`, `class`, `race`, `tags` (lowercased string array — pre-tokenized race / gender / alignment / class / role / campaign / etc.), `damage_types` (lowercased string array, subset of `["melee", "ranged", "magic"]` derived at refresh time by joining `attack_defines[base_attack_id]`), `ability_scores` (`{str,dex,con,int,wis,cha}`), `legendary_effect_id`. The five classification axes used by the legendary scope matcher (tags for race/gender/alignment, plus damage_types and ability_scores) are the exact fields consumed by §3.2.2. All other hero fields (graphic IDs, level curves, feats, etc.) dropped. | ~105 KB     |
| `data/definitions.legendary-effects.json`       | Trimmed `legendary_effect_defines` — one entry per effect with `id`, `effect_string`, `targets`, `description`. The `description` template uses `$amount` / `$(amount)` placeholders as documented in `[server-calls.md](./server-calls.md#resolving-legendary-effect-ids)`. | ~25 KB      |
| `data/definitions.legendary-effect-scopes.json` | **Derived**, not fetched. Produced by `scripts/refresh-defs.js` by parsing each effect's description. One entry per effect: `{id, kind, value?, stat?, min?}` where `kind ∈ {global, race, gender, alignment, damage_type, stat_threshold, unknown}`. Enables the O(1) runtime matcher in §3.2.2 with no runtime regex. | ~6 KB       |
| `data/definitions.checksum.json`                | Metadata: `server_checksum` (null for filtered responses — server doesn't include a checksum when a `filter` is supplied), `fetched_at`, `hero_count`, `legendary_effect_count`, `scope_count`, `unknown_scope_ids` (effect IDs the scope parser couldn't classify — flag for investigation on next refresh), `source`. | < 1 KB      |


Total bundle weight: **~135 KB uncompressed / ~13 KB gzipped** (what GitHub Pages actually serves). Comfortably under the §2.3 300 KB shell budget. All four files are pretty-printed with 2-space indentation so they diff cleanly in PRs and are readable in the browser.

**Fields dropped deliberately.** `hero_defines` entries from the live API are ~2 KB each (173 × 2 KB = ~340 KB). We keep only the fields the UI and the scope matcher use. `attack_defines` is fetched at refresh time to derive `damage_types` but never persisted; only the per-hero record ships.

**Scope derivation (at refresh time).** The refresh script parses every `hero_dps_multiplier_mult` effect's description against the template `"Increases the damage of all X by"` and maps the captured token to a `kind`/`value` pair per §3.2.2. Effects starting with `global_` are tagged `{kind: "global"}` without parsing. Stat-threshold effects use a dedicated regex. Any effect that doesn't match a known shape is tagged `{kind: "unknown"}`, its ID is appended to `unknown_scope_ids`, and a stderr warning fires — making it obvious when a new game update introduces an effect shape the parser doesn't recognize. The "Halfing" typo in the game's effect description is normalized to "Halfling" at derivation time (hero tags already spell it correctly).

**Damage-type derivation.** Per-hero `damage_types` is computed at refresh time as the intersection of `{melee, ranged, magic}` with the union of `attack_defines[hero.base_attack_id].tags` and `...damage_types`. This cleanly lands heroes in multiple buckets when appropriate (e.g., Cazrin's Magic Missile is `tags:["ranged"]` + `damage_types:["magic"]` → hero `damage_types = ["ranged", "magic"]`). All 173 heroes currently classify into at least one of the three buckets.

#### Runtime read order

For every label that needs resolving at runtime, the site looks up IDs in this order:

1. `localStorage.icHelper.defs.{group}` — the merged live-delta copy (if present).
2. `data/definitions.{group}.json` — the bundled baseline (always present).
3. Fallback placeholder (e.g. `"(unknown hero 999)"`) — only if an ID is in live state but not in either definitions source. The UI must render gracefully in this case.

#### Opportunistic background refresh

On each page load, after the bundled data is rendered, the site optionally fires `getdefinitions?filter=hero_defines,legendary_effect_defines` in the background. Any entries it returns are merged into `localStorage` under `icHelper.defs.hero_defines` and `icHelper.defs.legendary_effect_defines`, and views refresh their labels from those if present. If the bundled baseline already covers everything the current state references, the user never sees a label flicker.

> **Empirical note for V1 implementers:** filtered `getdefinitions` responses do **not** include a top-level `checksum` field (only unfiltered responses do). The V1 refresh strategy therefore always re-fetches the filtered groups wholesale rather than trying to use `checksum` for delta-only responses. This keeps the refresh simple; if V2 ever needs checksum-based deltas it will need an unfiltered call.

### 4.3 Refreshing the bundled baseline

The bundle needs to be regenerated after major Idle Champions updates (new champion releases, new legendary effects, renamed items). The repo ships a CLI for this:

```bash
# One-time setup — copy the example and fill in your own credentials.
cp .credentials.example.json .credentials.json
# Edit .credentials.json with your user_id + hash (never committed — .gitignored).

# Refresh the bundled files from live getdefinitions.
node scripts/refresh-defs.js
```

**Credential handling — security invariant.** The refresh script reads credentials exclusively from `.credentials.json` at the repo root. That file is listed in `.gitignore` and must never be committed. `.credentials.example.json` is the committed template that documents the required shape. The repo's CI (if any) must also refuse to run the refresh script with credentials from environment variables or CLI args — a single, gitignored credential file is the only sanctioned path, keeping the security surface tiny.

The script:

1. Reads `.credentials.json`; fails with a clear error if missing or malformed.
2. Calls `getPlayServerForDefinitions` against the master server.
3. Calls `getuserdetails` to obtain `instance_id`, transparently retrying on `switch_play_server`.
4. Calls `getdefinitions?filter=hero_defines,legendary_effect_defines`.
5. Trims each entry to the V1-required fields listed in §4.2.
6. Writes the three bundled files in `data/`, sorted by `id` for stable diffs.

**Recommended cadence.** Run after any Idle Champions year/season release or whenever the UI begins rendering `(unknown hero N)` placeholders, then commit the updated `data/*.json`.

---

## 5. Architecture

### 5.1 File layout

```
/
├── index.html                      # Site shell, header, settings drawer, category outlets
├── css/
│   ├── base.css                    # Reset + design tokens (shared with ic-specs; see §7.1) + typography
│   ├── layout.css                  # Header, drawer, responsive grid
│   └── components.css              # Cards, tables, buttons, dropdowns, toasts
├── js/
│   ├── main.js                     # Bootstrap, routing (hash-based), credential gate
│   ├── serverCalls.js              # All play-server HTTP logic (see §3.1)
│   ├── credentials.js              # localStorage read/write, support-URL parser
│   ├── state.js                    # In-memory app state, event bus
│   ├── views/
│   │   ├── home.js                 # Dashboard
│   │   ├── settings.js             # Settings drawer
│   │   ├── legendary.js            # §3.2 — host for both Forge Run (§3.2.4) and Reforge (§3.2.5) tabs
│   │   └── specializations.js      # §3.3
│   └── lib/
│       ├── dom.js                  # Tiny DOM helpers (no framework dependency)
│       ├── format.js               # Number / cost / timestamp formatting
│       └── scopeMatcher.js         # Pure classifier for legendary-effect scope → hero match (§3.2.2)
├── img/                            # Favicons / touch icons — shared with my sibling ic-specs site
│   ├── favicon.svg
│   ├── favicon-16x16.png
│   ├── favicon-32x32.png
│   ├── apple-touch-icon.png
│   ├── android-chrome-192x192.png
│   └── android-chrome-512x512.png
├── data/                           # Bundled trimmed game definitions (see §4.2)
│   ├── definitions.heroes.json
│   ├── definitions.legendary-effects.json
│   ├── definitions.legendary-effect-scopes.json  # Derived scope tags, see §3.2.2 / §4.2
│   └── definitions.checksum.json
├── scripts/
│   └── refresh-defs.js             # Regenerates data/*.json from live getdefinitions (see §4.3)
├── test/                           # Node `node:test` suites — run with `npm test`
│   ├── scopeMatcher.test.js        # Unit tests for js/lib/scopeMatcher.js
│   └── fixtures/
│       └── scopeMatcher.fixtures.js # Frozen hero + scope fixtures (see header comment)
├── package.json                    # `"type": "module"`, zero runtime deps, `test` + `refresh` scripts
├── .credentials.example.json       # Template for local creds used by refresh-defs.js — commit
├── .credentials.json               # Gitignored. Never commit. Required only for refresh-defs.js.
├── .gitignore
├── site.webmanifest                # Same shape as ic-specs; name/short_name specific to this site
└── docs/
    ├── PRD.md                      # This document
    ├── server-calls.md             # API reference
    ├── getlegendarydetails.sample.json          # Raw response sample (scrubbed)
    └── getlegendarydetails.enriched.sample.json # Enriched (joined with defs) sample (scrubbed)
```

### 5.2 Routing

Hash-based routing inside a single `index.html`:

- `#/` → Home
- `#/legendary` → Legendary Items
- `#/specializations` → Specialization Choices
- `#/settings` → Settings (or opened as an overlay drawer from any route)

No multi-page or client-side router library required — a ~30-line hash-change handler is sufficient.

### 5.3 Adding a new category

To add a new category in a future release:

1. Create `js/views/{category}.js` with a render function that takes a DOM outlet.
2. Add the category to the route table in `main.js`.
3. Add the necessary server calls to `serverCalls.js` (named functions, not a passthrough).
4. Add a card for the category to the Home dashboard.
5. No changes to `index.html`, CSS tokens, or the settings/credential flow.

---

## 6. Site Map & Navigation

```
/ (Home)
├── Header (ic-specs pattern — centered title + top-right pill links)
│   ├── Site title (Cinzel gold)
│   ├── One-line description below title
│   ├── Top-right "Contribute" GitHub pill (matches ic-specs `.gh-link`)
│   ├── Settings icon (gear) pill next to Contribute — opens drawer from any route
│   └── Account badge (name + Scales balance, clickable → Home) rendered under header once credentials are valid
├── #/ — Home / Dashboard
│   ├── Account summary card (name, Scales of Tiamat, last-sync)
│   ├── Category cards (one per §3.2, §3.3)
│   └── Refresh button
├── #/legendary — Legendary Items (§3.2)
├── #/specializations — Specialization Choices (§3.3)
├── Settings drawer (overlay, invoked by gear icon from any route)
│   ├── Credential entry (manual fields)
│   ├── Support-URL paste field
│   ├── Validate / Clear credentials buttons
│   ├── Play-server status + Re-discover
│   └── Security notice
└── Footer (ic-specs pattern — centered, `--text-muted`, 0.85rem, top border)
    ├── Link to sibling site [ic-specs](https://github.com/chetanddesai/ic-specs)
    ├── Link to [Emmotes/ic_servercalls](https://github.com/Emmotes/ic_servercalls) (credit)
    ├── Fan-made / not-affiliated disclaimer (§8.2)
    └── "This site stores credentials only in your browser." disclosure
```

---

## 7. Visual Design Direction

**The visual language is shared with my sibling site [chetanddesai/ic-specs](https://github.com/chetanddesai/ic-specs)** so the two read as one family. The CSS design tokens, font stack, header gradient, card treatment, gold-accent button / selected states, and footer pattern all match. Any new UI primitives introduced by this project (roster table, settings drawer, toasts, confirmation dialog) are designed on top of the same token set. This section is authoritative and self-contained — the tokens and patterns below are the spec, not a reference to another repo.

### 7.1 Design Tokens

```css
:root {
  --bg-dark: #0f0e17;
  --bg-card: #1a1926;
  --bg-input: #252336;
  --accent-gold: #e8a948;
  --accent-gold-dim: #b8862e;
  --accent-green: #27c93f;
  --text-primary: #fffffe;
  --text-secondary: #a7a9be;
  --text-muted: #6b6d80;
  --border: #2e2c42;
  --shadow: 0 4px 24px rgba(0, 0, 0, 0.4);
  --radius: 10px;
  color-scheme: dark;
}
```

### 7.2 Typography

- Headings: **Cinzel** (weights 500, 700) — used for the site title, category titles, and champion / item names. Never inside dense tables.
- Body / UI: **Source Sans 3** (weights 400, 600, 700).
- Loaded from Google Fonts with the same `<link>` as ic-specs:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@500;700&family=Source+Sans+3:wght@400;600;700&display=swap" rel="stylesheet">
```

### 7.3 Header

- Centered, padded `3rem 1rem 2rem`, `linear-gradient(180deg, #1c1a2e 0%, var(--bg-dark) 100%)`, bottom border `1px solid var(--border)`.
- Site title in Cinzel gold (`--accent-gold`), `clamp(1.5rem, 4vw, 2.4rem)`.
- One-line secondary description beneath the title in `--text-secondary`.
- **Top-right pill link** matching the `.gh-link` pattern in ic-specs — GitHub octicon SVG + "Contribute" label, linking to this repo. Same 1px border, `--radius` 8px, same hover (border → `--accent-gold-dim`, background → `--bg-card`).
- **Top-left (or next to `.gh-link`) pill**: Settings gear icon using the identical pill styling. On click, opens the settings drawer from §3.0.

### 7.4 Cards & actions

- Category content (Legendary roster rows, formation cards, champion detail, settings drawer sections) uses the ic-specs `.champion-card` treatment: `--bg-card` background, 1px `--border` border, `--radius`, `--shadow`, `1.8rem` padding, border transitions to `--accent-gold-dim` on hover.
- Champion / item names use the `.champion-name` pattern: Cinzel, 1.5rem, `--accent-gold`.
- Meta rows (seat / class / guide link, or "Slot 3 · iLvl 670 · Legendary Lv 12") mirror `.champion-meta` — 0.9rem, `--text-muted`, inline links use the dashed-underline + gold-on-hover pattern.
- Selected / winning states (the currently equipped legendary, the chosen specialization, the currently selected seat, the confirmed action) use the `.winner` / `.selected` treatment: `--accent-gold` border, 16px soft gold glow `box-shadow: 0 0 16px rgba(232, 169, 72, 0.15)`, result text in `--accent-green`.
- Primary action buttons (Craft / Upgrade / Reforge, Save formation, Validate credentials) use the `.tile.selected` solid-gold fill: `background: var(--accent-gold)`, text in `--bg-dark`. Secondary buttons use the tile default (`--bg-dark` fill, `--border` border).
- Toast / inline recommendation banners follow the `.recommendation` pattern: `rgba(232, 169, 72, 0.08)` fill, 4px left border in `--accent-gold`, text in `--text-secondary` with key values in `--accent-gold` / `--accent-green`.

### 7.5 Tables & mobile

- Max content width `960px`, matching ic-specs `main`.
- Roster / formation lists are dense tables on desktop. Below 480px they collapse to stacked cards (same breakpoint ic-specs uses — `@media (max-width: 480px)` forces single-column `.spec-grid` and reduced `.champion-card` padding).
- Sticky header for long rosters.
- Touch targets ≥ 44px; rely on the `.tile` / `.seat-btn` tap-highlight reset (`-webkit-tap-highlight-color: transparent`) and `:active { transform: scale(0.94); }` press-down feedback.

### 7.6 Footer

Centered, `2rem 1rem`, `--text-muted`, 0.85rem, 1px top border `--border`. Contents:

- Link back to the ic-specs sibling site.
- Credit to [Emmotes/ic_servercalls](https://github.com/Emmotes/ic_servercalls).
- The fan-made / not-affiliated disclaimer from §8.2.
- The "credentials stored only in your browser" disclosure from §2.2.

---

## 8. Licensing, Trademarks & Disclaimers

### 8.1 Code license

Source code is licensed under the **MIT License** (`LICENSE` file in repo root).

### 8.2 Not affiliated with Codename Entertainment

The site must clearly disclose in its footer and About section:

> Idle Champions of the Forgotten Realms is a trademark of Codename Entertainment / Wizards of the Coast. This site is an unaffiliated, fan-made companion tool and is not endorsed by, affiliated with, or supported by the game's publisher.

### 8.3 API usage

The site uses the same public play-server endpoints the official game client uses, with the player's own credentials. No endpoints are reverse-engineered beyond what is already publicly documented in [Emmotes/ic_servercalls](https://github.com/Emmotes/ic_servercalls). Credit to that project is displayed in the footer.

---

## 9. Resolved Decisions


| #   | Question                          | Decision                                                                                                                                                                                                                                                                                                                                                |
| --- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Hosting**                       | GitHub Pages, static only. No backend of any kind.                                                                                                                                                                                                                                                                                                      |
| 2   | **Credential storage**            | `localStorage` only; never transmitted except to the official Idle Champions play servers.                                                                                                                                                                                                                                                              |
| 3   | **Credential entry modes**        | Two: manual (`user_id` + `hash` fields) and support-URL paste (extract `user_id` + `device_hash` query params). Support URL path stores `device_hash` as the `hash` field.                                                                                                                                                                              |
| 4   | **Server-call module**            | Single `serverCalls.js` modeled after [Emmotes/ic_servercalls](https://github.com/Emmotes/ic_servercalls), exposing named functions per call. All retry / play-server-swap / hash-refresh logic lives here.                                                                                                                                             |
| 5   | **V1 categories**                 | Two: Legendary Items and Specialization Choices. Architecture supports adding more without shell changes.                                                                                                                                                                                                                                               |
| 6   | **Mobile parity**                 | Every action available on desktop must be available on mobile. Dense tables degrade to stacked cards.                                                                                                                                                                                                                                                   |
| 7   | **Framework**                     | Vanilla HTML/CSS/JS. No React/Vue/Svelte build step. A tiny DOM helper module is acceptable.                                                                                                                                                                                                                                                            |
| 8   | **Data caching**                  | Definitions: bundled trimmed baseline in `data/*.json` (committed) + optional live-delta merge into `localStorage` (see §4.2). Play-server URL cached 24h. User/legendary state is in-memory per session and invalidated on mutation.                                                                                                                   |
| 9   | **Disclaimer**                    | Footer + About section clearly state unaffiliated fan-made tool; trademarks belong to Codename Entertainment / Wizards of the Coast.                                                                                                                                                                                                                    |
| 10  | **Branding & styling**            | Shared with my sibling site [chetanddesai/ic-specs](https://github.com/chetanddesai/ic-specs). `img/` favicons and `site.webmanifest` are the same assets across both (see §2.4). CSS tokens, font stack, header/footer/card patterns are identical (see §7). The two sites read as one visual family; PRD §7 is the self-contained authoritative spec. |
| 11  | **Definitions strategy**          | Ship trimmed baseline in `data/*.json` (committed), refresh via `scripts/refresh-defs.js` after major game updates, optionally fetch live deltas in the background and merge into `localStorage`. Runtime read order: localStorage → bundled `data/` → `(unknown …)` placeholder (see §4.2 & §4.3).                                                     |
| 12  | **Credential handling (tooling)** | `scripts/refresh-defs.js` reads credentials **only** from `.credentials.json` at the repo root. That file is gitignored. `.credentials.example.json` is the committed template. No CLI-arg or env-var fallback is provided, keeping the credential surface small and auditable.                                                                         |
| 13  | **Legendary tab framing**         | The Legendary tab is **DPS-first**, not a generic roster browser. It is rendered as one card with **two tabs sharing the DPS context**: **Forge Run** (deterministic upgrade of DPS-affecting legendaries — each upgrade costs Scales of Tiamat *and* a campaign-specific favor; favor is the gating resource so the view is ranked by favor) and **Reforge** (probabilistic Scales-of-Tiamat reroll of supporting-hero slots into DPS-affecting effects). Forge Run ships first in V1; Reforge is the immediate follow-up. A generic browse / craft-everywhere view is explicitly out of V1 scope (see §3.2).                                                                                              |
| 14  | **Legendary effect scope classification** | Derived at bundle-refresh time by parsing `legendary_effect_defines` descriptions into a `{kind, value\|stat+min}` tag per effect (see §3.2.2). Five scope kinds cover 100% of current effects: `race`, `gender`, `alignment`, `damage_type`, `stat_threshold`, plus `global`. Any unrecognized effect is tagged `unknown` and logged so new game content is caught explicitly. |
| 15  | **Forge-run favor ranking**       | V1 ranks favor currencies by *count of upgradeable-now DPS-affecting legendaries* (descending, ties broken by total affecting count). Weighted "DPS-gain per favor unit" rankings are V2 material and explicitly deferred.                                                                                                                              |
| 16  | **DPS selection persistence**     | Last-selected DPS hero ID stored at `localStorage.icHelper.legendary.dpsHeroId`; last-selected tab stored at `localStorage.icHelper.legendary.activeTab` (defaults to `forge-run`). On first visit (nothing stored), the tab renders an empty state with a dropdown prompt; no auto-picking.                                                            |
| 17  | **Legendary view as two tabs**    | The Legendary category is one card with two tabs — **Forge Run** (§3.2.4) and **Reforge** (§3.2.5) — sharing the DPS selector, classification chips, and shared refresh/error chrome (§3.2.3, §3.2.6). **Forge Run ships first**: it's deterministic (all costs known, no probabilistic outcomes), answers the higher-frequency question ("where should I spend the favor I just earned?"), and depends on fewer TBD empirical questions than Reforge (the `effects_unlocked` mechanic and reforge-cost field shape — Appendix B items 5b and 5c — can be nailed before §3.2.5 is built). |


---

## 10. Open Questions


| #   | Question                                                                                                                                                                  | Notes                                                                                                                                             |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | What is the canonical format of a support URL that contains both `user_id` and `device_hash`?                                                                             | Needed to write a robust parser and an example placeholder in the settings panel.                                                                 |
| 2   | Does the site need to handle multiple `game_instance_id`s per account (e.g., alt campaigns), or only the primary instance?                                                | `getuserdetails` returns a primary `instance_id`; other calls allow overrides. V1 can assume primary only, but confirm before locking in.         |
| 3   | For Specialization Choices, should we ever write specializations **outside** of a saved formation (e.g., the "live" loadout), or is `SaveFormation` the only entry point? | `server-calls.md` only documents `SaveFormation` for specs. Confirming no other call exists (e.g., a hypothetical `setSpecialization`) before V1. |
| 4   | Rate limiting — are there known per-account or per-IP limits on the play-server API that the site should respect?                                                         | If yes, add a client-side throttle to `serverCalls.js`.                                                                                           |
| 5   | Should the site offer an export / import of credentials between browsers?                                                                                                 | Out of scope for V1; trade-off is convenience vs. another vector for accidental credential leakage.                                               |


---

## 11. Future Enhancements (Out of Scope for V1)

- **Additional categories**: Patrons (`getpatrondetails`, `purchasepatronshopitem`), Events (`geteventsdetails`, `pickeventflexhero`), Chests (`buysoftcurrencychest`, `opengenericchest`), Blacksmith / Buffs (`useServerBuff`, `convertcontracts`), Potions (`brewpotions`, `enhancepotions`, `distillpotions`), Daily Login (`getdailyloginrewards`, `claimdailyloginreward`), Mastery Challenges (`getmasterychallengesdata`, `setmasterychallengeoptions`), Trials (`trialsrefreshdata` + friends).
- **Offline mode / PWA**: service worker that shells up the UI while the play server is unreachable.
- **Dark / light theme toggle**.
- **Cross-account comparisons** (for players who run multiple accounts).
- **Notifications** — e.g., desktop alert when daily login is available.
- **Export of legendary / specialization state** as JSON for personal backup.
- **Per-category change history** — locally logged mutations so the player can see what actions the site has taken on their behalf.

---

## 12. Success Criteria

- A player can go from "zero credentials" to "seeing their ranked DPS-targeted forge-run upgrade list" in under 60 seconds on both desktop and mobile.
- Every craft / upgrade / reforge action in the Legendary view succeeds against the live play server and the UI reflects the updated state within one refresh cycle.
- The legendary scope matcher classifies 100% of current legendary effects without any `unknown` tags on a freshly refreshed bundle (`unknown_scope_ids` in `data/definitions.checksum.json` is an empty list). If a refresh ever lands with a non-empty `unknown_scope_ids`, that's a build-level signal to extend the parser before merging.
- Selecting a DPS champion resolves the full slot classification (affecting / not affecting / reforge candidate / empty) for all 173 heroes in under 100 ms on a mid-range mobile device, using bundled `data/` only — no network.
- Every specialization change saved in the Specializations view is persisted via `SaveFormation` and re-reading `getallformationsaves` reflects the change.
- The site shell (HTML + CSS + JS, excluding API payloads) loads in < 300 KB.
- Passes Lighthouse audits at target thresholds (§2.3).
- Works on iOS Safari and Android Chrome at 375px viewport with no horizontal scrolling on any view.
- `serverCalls.js` handles the four documented error conditions (`switch_play_server`, `Outdated instance id`, `Security hash failure`, `non-atomic`) per the behavior table in `[docs/server-calls.md](./server-calls.md)`.
- Credentials are never transmitted to any host other than `*.idlechampions.com`.
- No external analytics, ad, or telemetry network requests are made.
- Visual consistency with my sibling site [chetanddesai/ic-specs](https://github.com/chetanddesai/ic-specs): same design tokens (§7.1), fonts (§7.2), header pattern with top-right Contribute pill (§7.3), card treatment (§7.4), and footer pattern (§7.6). Favicons and manifest are the same assets across both repos (§2.4).
- Bundled definition files (`data/*.json`) total under 50 KB, cover every label needed by the Legendary and Specializations views, and enable the site to render correctly with zero network round trips.
- `scripts/refresh-defs.js` regenerates the bundled files end-to-end from credentials in `.credentials.json` (gitignored) with no arguments, and never writes credentials into any committed file.

---

## 13. References

- [chetanddesai/ic-specs](https://github.com/chetanddesai/ic-specs) — sibling Idle Champions companion site I maintain. Shares this project's branding (favicons, manifest) and visual system (design tokens, fonts, header / card / footer patterns). PRD §7 is the authoritative design spec, so this project is self-contained if the sibling repo ever changes or moves.
- [Emmotes/ic_servercalls](https://github.com/Emmotes/ic_servercalls) — reference JavaScript client for the Idle Champions play-server API.
- `[docs/server-calls.md](./server-calls.md)` — complete local reference of the API calls used by this project.
- [Idle Champions of the Forgotten Realms](https://www.idlechampions.com/) — the game this site is a companion to (Codename Entertainment / Wizards of the Coast).

