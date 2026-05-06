---
name: refresh-hero-images
description: Refresh the bundled hero-portrait slug map (`data/definitions.hero-images.json`) when a new Idle Champions champion launches and customers see a monogram instead of a portrait. Use when the user asks to refresh hero images, pull a portrait for a newly-released champion (e.g. "Laurana just dropped, pull her image"), or sees an `unresolved heroes` warning. Do NOT use this skill for missing effects/scopes/favors — those are sourced from the runtime `getdefinitions` API call now and only need the in-app Refresh button.
---

# Refresh hero images

This is the **only** data-file-producing maintenance step in the
[idle-champs](https://github.com/chetanddesai/idle-champs) repo. Hero,
legendary effect, scope, and favor definitions all come from a runtime
`getdefinitions` call cached in `localStorage`. Hero portraits stay
bundled because slug resolution requires scraping a directory listing
that GitHub Pages doesn't expose to browsers (CORS + no public listing
API → maintainer-only step).

## When to use

- A new champion released and customers see a monogram (initials in a
  tinted circle) where the portrait should be.
- The user explicitly says "refresh hero images" or names a champion to
  pull (e.g. "Laurana just dropped, pull her image").
- The script's previous run left an `unresolved heroes` warning in the
  console.

## When NOT to use

- The user reports a hero is missing from the **DPS dropdown**, or a
  legendary effect / scope / favor is wrong. Those come from the
  runtime API now — point the user at the in-app **Refresh** button
  in the header instead. There's nothing for the maintainer to do.
- The user reports a portrait shows but is the wrong image. That's a
  wiki-side issue (Emmote's `ic_wiki` has the wrong slug); file an issue
  upstream rather than overriding here.

## Procedure

### 1. Confirm credentials

The script needs an `idlechampions.com` `user_id` + `hash` to call
`getdefinitions`. They live in `.credentials.json` at the repo root
(gitignored).

```bash
cat .credentials.json
```

If the file is missing or empty, ask the maintainer to populate it from
`.credentials.example.json` before continuing. **Do not commit
`.credentials.json`.**

### 2. Run the script

```bash
npm run refresh-hero-images
```

This runs `node scripts/refresh-hero-images.js` which:

1. Discovers the play server from `master.idlechampions.com`.
2. Calls `getuserdetails` for an `instance_id`.
3. Calls `getdefinitions` for the full hero / effect / campaign payload.
4. Runs `parseDefinitions(...)` from `js/lib/legendaryDefsParser.js` for
   sanity-check warnings (informational only — no JSON gets written from
   this).
5. Fetches Emmote's wiki directory listing and resolves
   `hero_id → wiki-slug` via name normalisation (ligatures, diacritics,
   word permutations).
6. Writes `data/definitions.hero-images.json`.

### 3. Read the script's stdout

Three signals matter:

- **`Wrote ... (... bytes, N mapped).`** — success. Move on.

- **`WARN: N heroes have no resolved slug:`** — auto-resolver missed one
  or more heroes. For each:
  - **If the wiki has a portrait but the resolver can't match the name**
    → add a manual override to `HERO_SLUG_OVERRIDES` near the top of
    `scripts/refresh-hero-images.js` and re-run. Verify the slug exists
    by visiting `https://emmotes.github.io/ic_wiki/images/<slug>/portraits/portrait.png`.
  - **If the wiki doesn't have a portrait yet** → file a tracking issue
    on the [Emmotes/ic_wiki](https://github.com/Emmotes/ic_wiki) repo
    (or note it in our own backlog) and leave the warning alone. The
    runtime falls back to a monogram. **Never invent a slug** — a 404
    on the portrait URL is worse than a monogram fallback.

- **`WARN: N effects returned unknown scope kind:`** — orthogonal to
  hero images, but signals new game content that
  `js/lib/legendaryDefsParser.js` doesn't recognise. Open a separate
  issue against the parser; **do not block the hero-images PR on it**.
  Customers will see a `?` badge for those effects in the UI, which is
  the existing fallback behaviour.

### 4. Inspect the diff

```bash
git diff data/definitions.hero-images.json
```

Expected: new `hero_id → slug` entries appended in the `heroes`
sub-object. Existing entries should not change unless Emmote renamed a
directory (rare). If the diff is unexpectedly large or wholesale — stop
and investigate before committing.

### 5. Bump the cache-buster

In `index.html`:

1. Increment `window.__BUILD_ID__ = N;` to `N+1`.
2. Find-replace every occurrence of `?v=N` to `?v=N+1` (CSS links + the
   `<script type="importmap">` block + the bottom `<script type="module">`).

Without this, customers on cached HTML wait up to 10 minutes for GitHub
Pages's CDN cache to expire — not catastrophic, but visibly delayed for
a launch-day champion.

### 6. Commit + push

The skill itself does **not** auto-commit. Lay out the changes and ask
the maintainer to confirm before running:

```bash
git add data/definitions.hero-images.json index.html scripts/refresh-hero-images.js
git commit -m "chore: refresh hero-images for <champion name(s)>"
git push
```

If `HERO_SLUG_OVERRIDES` was edited, include `scripts/refresh-hero-images.js`
in the commit. Otherwise drop it from the `git add`.

## Failure modes

- **Script exits non-zero on `loadCredentials`** — `.credentials.json` is
  missing or malformed. Bail and report; do not retry blindly.
- **Script exits non-zero on `getdefinitions`** — credentials are
  rejected, or the user's account is in a bad state. Bail and report;
  the maintainer needs to re-pull credentials from the game.
- **Wiki listing fetch returns 0 entries** — Emmote's repo layout has
  changed (rare). The script refuses to write an empty file (would blank
  every portrait in production). Bail and ask the maintainer to inspect
  `https://api.github.com/repos/Emmotes/ic_wiki/contents/docs/images?ref=main`
  manually.
- **`HERO_SLUG_OVERRIDES` block grows large** — every entry is
  maintenance debt. Periodically (every 6 months or so) re-check whether
  the wiki has caught up and entries can be removed.

## See also

- `scripts/refresh-hero-images.js` — the script itself.
- `js/lib/legendaryDefsParser.js` — the shared parser invoked for
  sanity-check warnings.
- `js/lib/heroImage.js` — the runtime image resolver that consumes
  `data/definitions.hero-images.json`.
- `docs/tech-design-legendary.md` Appendix B Decision 9 — the why behind
  the wiki-listing-scrape approach.
