# Idle Champions Helper

> Short name: **IC Helper** (used as the home-screen label when installed as a PWA).

Static GitHub Pages companion site for **Idle Champions of the Forgotten Realms**. V1 covers **Legendary Items** and **Specialization Choices**.

**Live site:** <https://chetanddesai.github.io/idle-champs>

- **PRD:** `[docs/PRD.md](./docs/PRD.md)`
- **Play-server API reference:** `[docs/server-calls.md](./docs/server-calls.md)`
- **Sample responses:**
  - `[docs/getlegendarydetails.sample.json](./docs/getlegendarydetails.sample.json)` — raw, scrubbed
  - `[docs/getlegendarydetails.enriched.sample.json](./docs/getlegendarydetails.enriched.sample.json)` — enriched (joined with definitions), scrubbed

Not affiliated with or endorsed by Codename Entertainment / Wizards of the Coast.

## Hosting

Plain HTML/CSS/JS served from GitHub Pages at <https://chetanddesai.github.io/idle-champs> — no build step, no backend. Credentials are kept in the player's browser `localStorage`; the site calls `*.idlechampions.com` directly, exactly as the game client does.

## Running locally

Because the site loads `data/definitions.hero-images.json` and ES modules via `fetch` + dynamic import, it must be served over HTTP — opening `index.html` directly with `file://` will fail the module loads and the CORS checks. The simplest dev server that matches how GitHub Pages will serve the site:

```bash
npx http-server . -p 8080 -c-1
```

Then open <http://127.0.0.1:8080/> in a browser. The `-c-1` flag disables caching so edits to HTML / CSS / JS / JSON show up on the next reload without needing a hard refresh. No `npm install` needed — `npx` fetches `http-server` on demand.

Any other static file server works equally well (`python3 -m http.server 8080`, `php -S 127.0.0.1:8080`, VS Code's Live Server extension, …) — the requirement is just "serve over HTTP from the repo root."

## Tests

Pure modules (`js/lib/*`, `js/serverCalls.js`, `js/credentials.js`, `js/state.js`) are covered by Node's built-in test runner against frozen fixtures — no framework, no jsdom. Requires Node 18+.

```bash
npm test
```

## Repo layout


| Path                        | Purpose                                                                                     |
| --------------------------- | ------------------------------------------------------------------------------------------- |
| `index.html`                | App shell — header, main, footer, CSP meta, module entry point.                             |
| `css/`                      | `base.css` (tokens + reset), `layout.css`, `components.css`. See PRD §7 for the spec.       |
| `js/serverCalls.js`         | Single HTTP boundary to the play server; centralized retry + typed `ApiError`.              |
| `js/state.js`               | `localStorage`-backed pub/sub store under the `ic.*` namespace + `refreshAccount()`.        |
| `js/credentials.js`         | Support-URL parser, validator, and canonical-shape normalizer.                              |
| `js/main.js`                | Bootstrap, hash router, credential gate, Refresh button + toast surface.                    |
| `js/lib/`                   | Pure helpers: `scopeMatcher`, `legendaryModel`, `format`, `dom`. All `node:test`-covered.   |
| `js/views/`                 | DOM-rendering view modules (Settings today; Legendary + Specializations in later milestones). |
| `test/`                     | `node:test` suite + frozen fixtures for each pure module.                                   |
| `img/`, `site.webmanifest`  | Favicons & PWA manifest.                                                                    |
| `data/`                     | The single bundled file, `definitions.hero-images.json`. Hero/effect/scope/favor defs come from a runtime `getdefinitions` call cached in `localStorage` — see "Refreshing definitions" below. |
| `scripts/refresh-hero-images.js` | Regenerates `data/definitions.hero-images.json` against Emmote's wiki listing. Maintainer-only, runs after a new champion releases. |
| `skills/`                   | Project-local AI-agent skills (`refresh-hero-images`); symlinked into `.cursor/skills/` and `.claude/skills/` for tool discovery. |
| `docs/`                     | PRD, tech design, API reference, and scrubbed sample responses.                             |


## Refreshing definitions

There are **two separate refresh paths** depending on what changed:

### Hero / effect / scope / favor definitions — runtime, no maintainer step

These come from a live `getdefinitions` API call on every Refresh and are cached in the browser's `localStorage` under `ic.definitions.cache`. New champions, new legendary effects, renamed items, etc. all land in the planner the next time the user clicks **Refresh** in the header — no maintainer push required.

The trade-off is a slightly larger Refresh payload (~200–500 KB depending on filter scope). The upside is that the planner stays current automatically; we never need to redeploy just because Idle Champions released a new champion or favor.

If a new effect lands that the parser doesn't recognise, the UI shows a `?` badge and a banner; the maintainer extends `js/lib/legendaryDefsParser.js` and pushes a release.

### Hero portraits — manual, maintainer-only

The portrait map (`data/definitions.hero-images.json`) maps hero IDs to slug names on Emmote's `ic_wiki` GitHub Pages site (MIT licensed, attribution at the bottom of the site). Browsers can't regenerate it because resolution requires scraping a directory listing that GitHub Pages doesn't expose to JS — only a server-side script can do it. New champions render with a monogram fallback (initials in a tinted circle) until the next maintainer push.

The dedicated [`refresh-hero-images` skill](./skills/refresh-hero-images/SKILL.md) walks any AI agent through this maintenance step end-to-end. The summary version:

#### One-time setup — local credentials

`scripts/refresh-hero-images.js` reads your account credentials from a **gitignored** file at the repo root:

```bash
cp .credentials.example.json .credentials.json
# Edit .credentials.json and fill in your own user_id + hash.
```

The file shape:

```json
{
  "user_id": "YOUR_USER_ID",
  "hash":    "YOUR_DEVICE_HASH"
}
```

- `.credentials.json` is listed in `[.gitignore](./.gitignore)` — **never commit it**.
- `.credentials.example.json` is the committed template; it contains no real credentials.
- The script has no CLI-arg or environment-variable fallback by design. A single gitignored file is the only sanctioned path.

#### How to get your `user_id` and `hash`

Inside the Idle Champions game client, open **Settings → Support → Copy Support URL** (paths vary slightly across platforms). Paste the URL somewhere safe — it contains `user_id=…` and `device_hash=…` query parameters. Copy those into `.credentials.json` (note: `device_hash` becomes `hash`).

Treat `hash` as a full-account credential. Do not paste it into anything you don't trust.

#### Running the refresh

```bash
npm run refresh-hero-images
```

(Requires Node 18+ for global `fetch`. No `npm install` needed — the script uses only Node built-ins.)

The script:

1. Reads `.credentials.json`.
2. Discovers the current play server via `getPlayServerForDefinitions`.
3. Fetches `instance_id` via `getuserdetails`.
4. Fetches `getdefinitions?filter=hero_defines,attack_defines,legendary_effect_defines,campaign_defines`.
5. Runs the shared parser (`js/lib/legendaryDefsParser.js`) for sanity-check warnings (informational only — nothing is written from this).
6. Resolves hero-name → wiki-slug against `https://github.com/Emmotes/ic_wiki/contents/docs/images` and writes `data/definitions.hero-images.json`.

After committing, bump `__BUILD_ID__` in [`index.html`](./index.html) so customers pick up the new portraits immediately rather than waiting for GitHub Pages's CDN cache to expire.

## Acknowledgments

- **`[Emmotes/ic_servercalls](https://github.com/Emmotes/ic_servercalls)`** — the foundational community reference for the Idle Champions play-server API. The endpoint catalog and parameter shapes in `[docs/server-calls.md](./docs/server-calls.md)` were learned from Emmote's project; the empirical notes, response-enrichment strategy, and suggested client-side data models are this project's own additions. Thanks to [@Emmotes](https://github.com/Emmotes) for the foundational work and for making the repo MIT-licensed so the community tooling story is cleanly aligned.
- **Codename Entertainment / Wizards of the Coast** — authors of *Idle Champions of the Forgotten Realms*. This project is an unaffiliated fan-made tool; all game names, characters, and trademarks belong to their respective owners.

## License

All code and documentation in this repo are © Chetan Desai and licensed under **MIT**; see `[LICENSE](./LICENSE)`.