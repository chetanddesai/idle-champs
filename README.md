# idle-champs

Static GitHub Pages companion site for **Idle Champions of the Forgotten Realms**, built as a sibling to [chetanddesai/ic-specs](https://github.com/chetanddesai/ic-specs). V1 covers **Legendary Items** and **Specialization Choices**.

- **PRD:** `[docs/PRD.md](./docs/PRD.md)`
- **Play-server API reference:** `[docs/server-calls.md](./docs/server-calls.md)`
- **Sample responses:**
  - `[docs/getlegendarydetails.sample.json](./docs/getlegendarydetails.sample.json)` — raw, scrubbed
  - `[docs/getlegendarydetails.enriched.sample.json](./docs/getlegendarydetails.enriched.sample.json)` — enriched (joined with definitions), scrubbed

Not affiliated with or endorsed by Codename Entertainment / Wizards of the Coast.

## Hosting

Plain HTML/CSS/JS served from GitHub Pages — no build step, no backend. Credentials are kept in the player's browser `localStorage`; the site calls `*.idlechampions.com` directly, exactly as the game client does.

## Repo layout


| Path                        | Purpose                                                                                     |
| --------------------------- | ------------------------------------------------------------------------------------------- |
| `index.html`, `css/`, `js/` | Site shell, routing, category views, and `serverCalls.js` API client. (Coming in V1 build.) |
| `img/`, `site.webmanifest`  | Favicons & manifest — copied verbatim from ic-specs so the two sites read as one family.    |
| `data/`                     | Bundled trimmed game definitions used as a zero-network baseline for labels (see below).    |
| `scripts/refresh-defs.js`   | Regenerates `data/*.json` from a live `getdefinitions` call.                                |
| `docs/`                     | PRD, API reference, and scrubbed sample responses.                                          |


## Refreshing bundled definitions

The repo ships a curated slice of `getdefinitions` as committed JSON at `data/definitions.*.json` (~40 KB total). This lets the site render hero names and legendary-effect descriptions without an initial API round trip. The bundle needs to be refreshed after major Idle Champions updates (new champion releases, new legendary effects, renamed items). The PRD's [§4.2](./docs/PRD.md) documents the runtime read order and delta-merge strategy.

### One-time setup — local credentials

`scripts/refresh-defs.js` reads your account credentials from a **gitignored** file at the repo root:

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

### How to get your `user_id` and `hash`

Inside the Idle Champions game client, open **Settings → Support → Copy Support URL** (paths vary slightly across platforms). Paste the URL somewhere safe — it contains `user_id=…` and `device_hash=…` query parameters. Copy those into `.credentials.json` (note: `device_hash` becomes `hash`).

Treat `hash` as a full-account credential. Do not paste it into anything you don't trust.

### Running the refresh

```bash
node scripts/refresh-defs.js
```

(Requires Node 18+ for global `fetch`. No `npm install` needed — the script uses only Node built-ins.)

The script:

1. Reads `.credentials.json`.
2. Discovers the current play server via `getPlayServerForDefinitions`.
3. Fetches `instance_id` via `getuserdetails`, transparently retrying on `switch_play_server`.
4. Fetches `getdefinitions?filter=hero_defines,legendary_effect_defines`.
5. Trims each entry to the V1-required fields and writes:
  - `data/definitions.heroes.json`
  - `data/definitions.legendary-effects.json`
  - `data/definitions.checksum.json`

Commit the updated files. A typical refresh cadence is "after any Idle Champions year/season release, or whenever the UI begins rendering `(unknown hero N)` placeholders."

## Acknowledgments

- **[Emmotes/ic_servercalls](https://github.com/Emmotes/ic_servercalls)** — the foundational community reference for the Idle Champions play-server API. The endpoint catalog and parameter shapes in `[docs/server-calls.md](./docs/server-calls.md)` were learned from Emmote's project; the empirical notes, response-enrichment strategy, and suggested client-side data models are our own additions. Huge thanks to [@Emmotes](https://github.com/Emmotes) for doing the hard work of making this API understandable to the community.
- **[chetanddesai/ic-specs](https://github.com/chetanddesai/ic-specs)** — sibling project this repo inherits its visual language from. All files in `[img/](./img/)` and `[site.webmanifest](./site.webmanifest)` are copied verbatim from that repo.
- **Codename Entertainment / Wizards of the Coast** — authors of *Idle Champions of the Forgotten Realms*. This project is an unaffiliated fan-made tool; all game names, characters, and trademarks belong to their respective owners.

## License

This repo uses a split license so each kind of content gets the treatment it deserves:


| Content                                                                       | License                                | File                             |
| ----------------------------------------------------------------------------- | -------------------------------------- | -------------------------------- |
| Source code — HTML, CSS, JS, `data/*.json`, `scripts/refresh-defs.js`, config | **MIT**                                | `[LICENSE](./LICENSE)`           |
| Documentation — everything under `docs/` and this `README.md`                 | **CC BY 4.0**                          | `[LICENSE-docs](./LICENSE-docs)` |
| Favicons in `img/` and `site.webmanifest`                                     | Inherited from `chetanddesai/ic-specs` | See that repo                    |


**Why this split?** MIT is the convention across Idle Champions community tooling and has the smallest legal surface for a static fan site — short, permissive, familiar. CC BY 4.0 is the canonical "credit required" license for prose; it ensures downstream reusers of `[docs/server-calls.md](./docs/server-calls.md)` preserve the attribution chain back to Emmote's foundational work. Using MIT on documentation would be legal but mismatched in intent; CC BY on code would add awkward attribution requirements to every JavaScript file. Matching each license to its content type keeps the intent clear and the obligations minimal.

### A note on upstream licensing

At the time of writing, `[Emmotes/ic_servercalls](https://github.com/Emmotes/ic_servercalls)` does not carry a `LICENSE` file, which means it defaults to "all rights reserved" under copyright law. This repo therefore does **not** redistribute any of Emmote's source code or prose — it only references facts about the public Idle Champions API, which are not copyrightable (see Google v. Oracle, 2021). A PR proposing an MIT license upstream has been submitted at `[Emmotes/ic_servercalls#3](https://github.com/Emmotes/ic_servercalls/pull/3)`; once that lands the attribution story will be even cleaner.