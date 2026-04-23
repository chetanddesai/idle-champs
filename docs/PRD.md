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

1. **Legendary Items** — view every champion's legendary slots at a glance; craft, upgrade, and reforge directly from the site.
2. **Specialization Choices** — view and update each champion's specialization picks across the player's saved formations.

Additional categories (Patrons, Events, Chests, Blacksmith, Potions, etc.) are listed in §11 as future enhancements — the architecture is designed so adding a new category is a matter of adding a new view module, not rewriting the shell.

---

## 2. Non-Functional Requirements

### 2.1 Hosting & Technology

| Constraint          | Detail                                                                                                                                                                                                                |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Hosting**         | GitHub Pages (static only — no server-side rendering, no serverless functions)                                                                                                                                        |
| **Allowed assets**  | HTML, CSS, JavaScript (vanilla or lightweight library — no framework build step required), JSON data files, image assets                                                                                              |
| **Build step**      | None required. The site must work by serving the repo root (or a configured `/docs` or `/dist` publish directory) directly. A lightweight build step is acceptable only if the **output** is committed static files. |
| **Browser support** | Latest two versions of Chrome, Safari, Firefox, Edge; mobile Safari & Chrome on iOS/Android                                                                                                                           |
| **Mobile form factor** | First-class. The site must be fully usable on a 375px-wide phone viewport — every action that works on desktop must work on mobile with equivalent ergonomics.                                                     |

### 2.2 Credentials & Privacy

| Requirement          | Detail                                                                                                                                                                                                                                                                                                                                                                |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Credential storage** | `user_id` and `hash` are stored **only** in the player's browser `localStorage`. They are never transmitted anywhere except directly to the official Idle Champions play servers (same endpoints the game client itself uses).                                                                                                                                    |
| **No telemetry**     | The site makes **no** network calls to any host other than the Idle Champions master/play servers. No analytics, no error reporting, no third-party CDNs that could see request headers.                                                                                                                                                                           |
| **Clear-credentials action** | The settings panel provides an explicit "Clear credentials" button that wipes the stored `user_id` and `hash` (and any cached account data) from `localStorage`.                                                                                                                                                                                       |
| **Security warning** | The settings panel displays a short notice explaining that `hash` grants full account access, and that the player should only paste it into trusted tools running on their own device.                                                                                                                                                                            |

### 2.3 Performance & Accessibility

| Requirement                  | Detail                                                                                                                 |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Lighthouse score targets** | Performance ≥ 90, Accessibility ≥ 95, Best Practices ≥ 90, SEO ≥ 80                                                    |
| **Page weight**              | < 300 KB first load for the site shell (excluding API payloads and any game-art images)                                |
| **Accessibility**            | Semantic HTML, ARIA landmarks, sufficient color contrast (WCAG AA), keyboard-navigable, alt text on all images         |
| **Responsive design**        | Mobile-first. Must look great on 375px–1440px+ viewports. Dense tables must degrade to stacked cards on narrow screens. |

### 2.4 Favicons, Manifest & Branding

**Branding is inherited directly from the sibling project [chetanddesai/ic-specs](https://github.com/chetanddesai/ic-specs)** so the two sites feel like one family. All favicon and touch-icon files are copied verbatim from that repo's `img/` directory into this repo's `img/` directory (committed, no regeneration). The web app manifest is copied verbatim into the repo root as `site.webmanifest`.

| Asset                           | Specification                                                                                                               |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `img/favicon.svg`               | SVG favicon — copied from ic-specs                                                                                          |
| `img/favicon-32x32.png`         | 32×32 PNG favicon — copied from ic-specs                                                                                    |
| `img/favicon-16x16.png`         | 16×16 PNG favicon — copied from ic-specs                                                                                    |
| `img/apple-touch-icon.png`      | 180×180 Apple touch icon — copied from ic-specs                                                                             |
| `img/android-chrome-192x192.png`| 192×192 Android icon — copied from ic-specs                                                                                 |
| `img/android-chrome-512x512.png`| 512×512 Android icon — copied from ic-specs                                                                                 |
| `site.webmanifest`              | Copied from ic-specs, edited only to update `name` / `short_name` for this site. `theme_color` and `background_color` remain `#0f0e17` to keep the visual family consistent. |

The `<head>` of `index.html` must reference the icons with the same paths and attribute order as ic-specs:

```html
<link rel="icon" type="image/svg+xml" href="img/favicon.svg">
<link rel="icon" type="image/png" sizes="32x32" href="img/favicon-32x32.png">
<link rel="icon" type="image/png" sizes="16x16" href="img/favicon-16x16.png">
<link rel="apple-touch-icon" sizes="180x180" href="img/apple-touch-icon.png">
<link rel="manifest" href="site.webmanifest">
<meta name="theme-color" content="#0f0e17">
```

### 2.5 SEO & Social Sharing

| Requirement   | Detail                                                                                                             |
| ------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Meta tags** | `<title>`, `<meta description>`, Open Graph (`og:title`, `og:description`, `og:image`), Twitter Card               |
| **robots**    | Public indexing allowed. No credential-entry page should be cached by search engines beyond its description.       |

---

## 3. Functional Requirements

### 3.0 Settings & Credential Entry

The site header includes a **settings icon** (gear) that opens a settings panel (inline drawer on desktop, full-screen sheet on mobile). The panel contains:

#### Credential entry — two supported modes

| Mode                    | Input                                              | Behavior                                                                                                                                                                                                                          |
| ----------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Manual**              | `user_id` field + `hash` field                     | User types or pastes each value. On save, both are written to `localStorage` under `icHelper.userId` and `icHelper.hash`.                                                                                                         |
| **Support URL parsing** | Single "Paste support URL" textarea                | The site parses the URL, extracts the `user_id` and `device_hash` query parameters, and populates the manual fields. `device_hash` is stored as `hash` (the play-server API calls it `hash`). User confirms and saves.            |

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

| Key                  | Value                                                   | Lifetime                        |
| -------------------- | ------------------------------------------------------- | ------------------------------- |
| `icHelper.userId`    | Account `user_id`                                       | Until user clears or replaces   |
| `icHelper.hash`      | Account `hash` (from `device_hash` on support URL)      | Until user clears or replaces   |
| `icHelper.playServer`| Discovered play-server base URL                         | 24h TTL, refreshes on expiry    |
| `icHelper.instanceId`| Current `instance_id` from latest `getuserdetails`      | Refreshed on each session start |
| `icHelper.lastSync`  | ISO timestamp of last successful `getuserdetails` call  | Updated on every sync           |

### 3.1 Server Calls Module (`serverCalls.js`)

All play-server communication is encapsulated in a single JavaScript module modeled after the reference [`serverCalls.js`](https://github.com/Emmotes/ic_servercalls/blob/main/docs/scripts/serverCalls.js) documented in [`docs/server-calls.md`](./server-calls.md).

#### Responsibilities

| Concern                    | Behavior                                                                                                                                                                                                                  |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Play-server discovery**  | First call per session is `getPlayServerForDefinitions` against `https://master.idlechampions.com/~idledragons/`. Result cached for 24h in `localStorage`.                                                                |
| **Boilerplate parameters** | Automatically attaches the standard parameters (`language_id=1`, `timestamp=0`, `request_id=0`, `mobile_client_version=99999`, `include_free_play_objectives=true`, `instance_key=1`, `offline_v2_build=1`, `localization_aware=true`). |
| **Auth parameters**        | Automatically attaches `user_id`, `hash`, and `instance_id` to calls that require them.                                                                                                                                   |
| **Error handling**         | Implements the retry/recovery table from §7 of [`server-calls.md`](./server-calls.md): `switch_play_server` → swap base URL and retry; `Outdated instance id` → call `getuserdetails` to refresh and retry; hard failures throw. Capped at 4 retry attempts. |
| **Timeout**                | 40-second default per request, matching the reference client.                                                                                                                                                             |
| **API surface**            | A clean set of named functions — one per server call used by the site (e.g., `getUserDetails()`, `getLegendaryDetails()`, `craftLegendaryItem(heroId, slotId)`, `saveFormation(...)`). Not a generic `call(name, params)` passthrough — each function has a typed, documented signature.                                                          |

The module is the **only** place in the codebase that knows the shape of the play-server HTTP protocol. Every category view imports it and calls the named functions it needs.

#### V1 server calls used

| Category                  | Calls used                                                                                                  |
| ------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Session / account         | `getPlayServerForDefinitions`, `getuserdetails`, `getdefinitions`                                           |
| Legendary Items           | `getlegendarydetails`, `craftlegendaryitem`, `upgradelegendaryitem`, `changelegendaryitem`                  |
| Specialization Choices    | `getallformationsaves`, `SaveFormation` (updating the `specializations` field), `getuserdetails` (fallback) |

### 3.2 Category: Legendary Items

#### Data sources

- `getlegendarydetails` → legendary state per hero/slot + `costs_by_hero` (in Scales of Tiamat)
- `getuserdetails` → hero roster, equipment slots, epic/legendary gear levels, current Scales of Tiamat balance
- `getdefinitions` (with `filter=hero_defines,loot_defines`) → champion display names, slot display names

#### Display

| Element                    | Detail                                                                                                                                                                       |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Roster table**           | One row per champion. Columns for each of the 6 equipment slots. Each cell shows: epic iLvl, legendary level (or "—" if none), and a per-cell action button.                 |
| **Scales of Tiamat balance** | Prominent header badge showing current balance + per-champion next-craft cost.                                                                                             |
| **Cell actions**           | **Craft** (slot has epic but no legendary), **Upgrade** (slot has a legendary), **Reforge** (slot has a legendary) — each with the cost displayed inline.                    |
| **Filters**                | Toggle: "Has legendaries" / "Can craft" / "All". Search by champion name. Sort by craft cost ascending.                                                                      |
| **Confirmation**           | Every mutating action (craft/upgrade/reforge) shows an explicit confirmation dialog with cost before firing the API call. Reforge has extra copy warning that effects re-roll. |
| **Refresh behavior**       | After any mutation, re-fetch `getlegendarydetails` and `getuserdetails` to update balance and state. Show a toast with the result.                                           |

#### Mobile layout

Roster table collapses to a stack of per-champion cards. Each card has a 6-slot grid with touch-friendly action buttons. Sticky header shows the Scales of Tiamat balance.

### 3.3 Category: Specialization Choices

#### Data sources

- `getallformationsaves` → every saved formation with its `specializations` JSON blob
- `getdefinitions` (with `filter=hero_defines`) → champion display names + the set of specialization options available per champion per tier
- `SaveFormation` (with the existing `formation_save_id`) → persist updated specialization choices for a given formation

#### Display

| Element                    | Detail                                                                                                                                                                                                             |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Formation list**         | Grouped by campaign, showing formation name + favorite flag. Clicking expands to show the formation detail view.                                                                                                    |
| **Formation detail**       | Per-champion row showing: champion name, current specialization picks (one per tier), and a dropdown for each tier listing the available alternatives.                                                              |
| **Diff indicator**         | If the player has changed any pick, the row shows a dot + "Unsaved changes" pill. Explicit **Save formation** button persists via `SaveFormation`; **Discard** reverts local state.                                 |
| **Bulk actions (stretch)** | "Apply pick to all formations containing this champion" — updates every saved formation's `specializations` for the selected champion in one pass (N `SaveFormation` calls with a progress indicator).               |
| **Search / filter**        | Filter formations by campaign; search by champion name across all formations ("show me every formation where champion X is placed and their current spec choices").                                                 |

#### Mobile layout

Formation list stacks vertically. Tapping a formation opens a full-screen detail view. Dropdowns are native `<select>` elements for thumb-friendliness.

### 3.4 Home / Dashboard

Landing view when valid credentials exist. Shows:

- Account name, current Scales of Tiamat balance, last-sync timestamp.
- Cards linking to each category (Legendary Items, Specialization Choices) with a one-line status summary (e.g., "12 legendaries crafted · 4 slots ready to craft").
- Settings icon top-right.
- Manual "Refresh" button that forces a fresh `getuserdetails`.

---

## 4. Data & Caching

### 4.1 Runtime caches

| Cache                          | Scope                       | TTL                                  | Invalidation                                                           |
| ------------------------------ | --------------------------- | ------------------------------------ | ---------------------------------------------------------------------- |
| Play-server URL                | Session + `localStorage`    | 24h                                  | Auto on TTL; manual via settings "Re-discover"                         |
| Game definitions               | Session + `localStorage`    | Until `checksum` returned by server changes | `getdefinitions` supports `checksum` param; we pass the cached value and only update the local copy when the server returns new data |
| User details / legendary state | In-memory only, per session | Invalidated on mutations             | Refetched after any craft/upgrade/reforge; manual "Refresh" button     |
| Formation saves                | In-memory only, per session | Invalidated on `SaveFormation`       | Refetched after save; manual "Refresh" button                          |

### 4.2 No server-side data

The site ships **no** bundled game data (no plant JSON equivalents, no hero database). Every piece of data is fetched live from the play server using the player's credentials.

---

## 5. Architecture

### 5.1 File layout

```
/
├── index.html                      # Site shell, header, settings drawer, category outlets
├── css/
│   ├── base.css                    # Reset + design tokens (copied from ic-specs §7.1) + typography
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
│   │   ├── legendary.js            # §3.2
│   │   └── specializations.js      # §3.3
│   └── lib/
│       ├── dom.js                  # Tiny DOM helpers (no framework dependency)
│       └── format.js               # Number / cost / timestamp formatting
├── img/                            # Favicons / touch icons — copied verbatim from ic-specs
│   ├── favicon.svg
│   ├── favicon-16x16.png
│   ├── favicon-32x32.png
│   ├── apple-touch-icon.png
│   ├── android-chrome-192x192.png
│   └── android-chrome-512x512.png
├── site.webmanifest                # Copied from ic-specs; only name/short_name edited
└── docs/
    ├── PRD.md                      # This document
    └── server-calls.md             # API reference
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

**The visual language is inherited verbatim from [chetanddesai/ic-specs](https://github.com/chetanddesai/ic-specs)** so the two sites read as a family. The CSS design tokens, font stack, header gradient, card treatment, gold-accent button / selected states, and footer pattern all match ic-specs. Any new UI primitives introduced by this project (roster table, settings drawer, toasts, confirmation dialog) must be designed on top of the same token set.

### 7.1 Design Tokens (match ic-specs exactly)

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

| #   | Question                      | Decision                                                                                                                                                                                         |
| --- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | **Hosting**                   | GitHub Pages, static only. No backend of any kind.                                                                                                                                               |
| 2   | **Credential storage**        | `localStorage` only; never transmitted except to the official Idle Champions play servers.                                                                                                       |
| 3   | **Credential entry modes**    | Two: manual (`user_id` + `hash` fields) and support-URL paste (extract `user_id` + `device_hash` query params). Support URL path stores `device_hash` as the `hash` field.                       |
| 4   | **Server-call module**        | Single `serverCalls.js` modeled after [Emmotes/ic_servercalls](https://github.com/Emmotes/ic_servercalls), exposing named functions per call. All retry / play-server-swap / hash-refresh logic lives here. |
| 5   | **V1 categories**             | Two: Legendary Items and Specialization Choices. Architecture supports adding more without shell changes.                                                                                         |
| 6   | **Mobile parity**             | Every action available on desktop must be available on mobile. Dense tables degrade to stacked cards.                                                                                            |
| 7   | **Framework**                 | Vanilla HTML/CSS/JS. No React/Vue/Svelte build step. A tiny DOM helper module is acceptable.                                                                                                     |
| 8   | **Data caching**              | Definitions keyed by server checksum in `localStorage`; play-server URL cached 24h; user/legendary state is in-memory per session and invalidated on mutation.                                    |
| 9   | **Disclaimer**                | Footer + About section clearly state unaffiliated fan-made tool; trademarks belong to Codename Entertainment / Wizards of the Coast.                                                             |
| 10  | **Branding & styling**        | Inherited directly from the sibling site [chetanddesai/ic-specs](https://github.com/chetanddesai/ic-specs). `img/` favicons and `site.webmanifest` are copied verbatim from that repo (see §2.4). CSS tokens, font stack, header/footer/card patterns match ic-specs exactly (see §7). The two sites must read as one visual family. |

---

## 10. Open Questions

| #   | Question                                                                                                                 | Notes                                                                                                                                                       |
| --- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | What is the canonical format of a support URL that contains both `user_id` and `device_hash`?                            | Needed to write a robust parser and an example placeholder in the settings panel.                                                                           |
| 2   | Does the site need to handle multiple `game_instance_id`s per account (e.g., alt campaigns), or only the primary instance? | `getuserdetails` returns a primary `instance_id`; other calls allow overrides. V1 can assume primary only, but confirm before locking in.                   |
| 3   | For Specialization Choices, should we ever write specializations **outside** of a saved formation (e.g., the "live" loadout), or is `SaveFormation` the only entry point? | `server-calls.md` only documents `SaveFormation` for specs. Confirming no other call exists (e.g., a hypothetical `setSpecialization`) before V1.            |
| 4   | Rate limiting — are there known per-account or per-IP limits on the play-server API that the site should respect?       | If yes, add a client-side throttle to `serverCalls.js`.                                                                                                     |
| 5   | Should the site offer an export / import of credentials between browsers?                                                | Out of scope for V1; trade-off is convenience vs. another vector for accidental credential leakage.                                                         |

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

- A player can go from "zero credentials" to "viewing their legendary roster" in under 60 seconds on both desktop and mobile.
- Every craft / upgrade / reforge action in the Legendary view succeeds against the live play server and the UI reflects the updated state within one refresh cycle.
- Every specialization change saved in the Specializations view is persisted via `SaveFormation` and re-reading `getallformationsaves` reflects the change.
- The site shell (HTML + CSS + JS, excluding API payloads) loads in < 300 KB.
- Passes Lighthouse audits at target thresholds (§2.3).
- Works on iOS Safari and Android Chrome at 375px viewport with no horizontal scrolling on any view.
- `serverCalls.js` handles the four documented error conditions (`switch_play_server`, `Outdated instance id`, `Security hash failure`, `non-atomic`) per the behavior table in [`docs/server-calls.md`](./server-calls.md).
- Credentials are never transmitted to any host other than `*.idlechampions.com`.
- No external analytics, ad, or telemetry network requests are made.
- Visual parity with [chetanddesai/ic-specs](https://github.com/chetanddesai/ic-specs): identical design tokens (§7.1), fonts (§7.2), header pattern with top-right Contribute pill (§7.3), card treatment (§7.4), and footer pattern (§7.6). Favicons and manifest are byte-identical copies (§2.4).

---

## 13. References

- [chetanddesai/ic-specs](https://github.com/chetanddesai/ic-specs) — sibling Idle Champions companion site. Source of this project's branding (favicons, manifest) and visual system (design tokens, fonts, header / card / footer patterns).
- [Emmotes/ic_servercalls](https://github.com/Emmotes/ic_servercalls) — reference JavaScript client for the Idle Champions play-server API.
- [`docs/server-calls.md`](./server-calls.md) — complete local reference of the API calls used by this project.
- [Idle Champions of the Forgotten Realms](https://www.idlechampions.com/) — the game this site is a companion to (Codename Entertainment / Wizards of the Coast).
