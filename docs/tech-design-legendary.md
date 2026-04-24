# Idle Champions — Legendary View & App Foundation: Technical Design

**Project:** Idle Champions GitHub Pages companion — Legendary Items / forge-run optimizer (PRD §3.2)
**Version:** 0.1 (Draft)
**Last Updated:** 2026-04-22
**Author(s):** Chetan Desai

---

## Status

Sections 1-7 are pending; they will be drafted collaboratively section by
section. This working document currently captures only the pre-draft
resolved decisions (Appendix B below) so alignment reached during design
discussions is durable between sessions. When §1-7 are written they
will cite these decisions rather than re-litigating them.

Related documents:
- [PRD](PRD.md) — product requirements, forge-run optimizer UX (§3.2)
- [API reference](server-calls.md) — play-server endpoint contracts
- [getlegendarydetails sample](getlegendarydetails.sample.json) — scrubbed raw response
- [Enriched legendary sample](getlegendarydetails.enriched.sample.json) — scrubbed, joined with definitions

---

## Appendix B. Resolved Decisions & Open Questions

Each row below was resolved collaboratively before the main sections of
this document were drafted. They exist here both to fix context for
future design sessions and to give §§1-7 a canonical list to cite.

Columns follow the template convention: **Status** is `Resolved`,
`Open`, or `Needs empirical verification`. **Resolution** captures the
decision and its rationale.

| # | Question | Status | Resolution |
|---|----------|--------|------------|
| 1 | **Error + retry model for `serverCalls.js`** — where does the `switch_play_server` retry live, how are failures surfaced to callers? | Resolved | Centralize in a single private `request(method, params)` helper. Every named public call (`getUserDetails`, `getLegendaryDetails`, `upgradeLegendaryItem`, `craftLegendaryItem`, `changeLegendaryItem`) goes through it. The helper handles credential injection (`user_id`/`hash`/`instance_id` pulled from the store), retries **exactly once** when a response carries `switch_play_server` (even with `success:true`), and normalizes failures into a typed `ApiError { kind: 'network' \| 'http' \| 'api', status?, message, raw }`. Callers receive parsed `details` (the payload they want) or catch `ApiError`. No `.success` checks, retry logic, or credential plumbing leak into views. |
| 2 | **State shape + subscription model** — what's the source of truth, how do views update, what triggers re-fetches? | Resolved | **localStorage is the single source of truth.** `state.js` exposes a tiny pub/sub store: `get(key)`, `set(key, val)` (writes through to localStorage and fires a change event), `subscribe(key, callback)`. Keys namespaced `ic.*` (e.g., `ic.credentials`, `ic.instance_id`, `ic.play_server`, `ic.userdetails`, `ic.legendarydetails`, `ic.last_refresh_at`, `ic.selected_dps_id`). **No TTL, no auto-expiry, no background polling.** Staleness is user-driven: an explicit Refresh button in the global header **or** an automatic post-mutation re-fetch both call the same `refreshAccount()` function. Views re-render from pub/sub events, no framework. |
| 3 | **Bootstrap + credential-gate flow** — what loads when, where do uncredentialed users land? | Resolved | Bootstrap order: (a) load bundled `data/*.json` synchronously; (b) check `ic.credentials` in localStorage; (c) if absent, route directly to `#/settings` regardless of the URL hash and block all other route renders; (d) once credentials exist, run `refreshAccount()` (same function the Refresh button calls) then render the routed view. Global header always shows "Last refreshed: Xm ago" (computed from `ic.last_refresh_at`) and a refresh icon-button. Stale thresholds for visual treatment TBD in §2; expected `> 5 min = yellow`, `> 1 hr = amber`. |
| 4 | **Forge-run runtime data model** — what is the pure function that builds what the view renders? | Resolved | Pure function `buildForgeRun(inputs) → ForgeRunState` in a new module `js/lib/forgeRunModel.js`, testable via `node:test` in the same pattern as `scopeMatcher.js`. Inputs: bundled scopes/effects/heroes + `getlegendarydetails.legendary_items` + `costs_by_hero` + `getuserdetails.loot` + selected DPS hero id. Output shape (to be formalized in §2): `ForgeRunState { selectedDps, dpsHeroRow, supportingHeroes[], favorBreakdown[] }`. `HeroForgeRow` captures `role ∈ { dps, supporting }`, `beneficialPool[]`, `beneficialHitRate`, and a per-slot `SlotClassification` with `state ∈ { level-up, reforge }`. The DPS hero is always rendered as a privileged row (every equipped slot affects them by game-design invariant, see #5); supporting heroes are filtered to those whose pool has ≥ 1 DPS-affecting effect. |
| 5a | **Reforge-candidate detection (binary)** — when is a slot worth reforging at all? | Resolved | The hero's pool `hero.legendary_effect_id` (6 entries, bundled in `data/definitions.heroes.json`) is curated by game design such that **every effect in a hero's pool affects that hero**. Implication: a DPS hero's own equipped slots always affect them → they are always `level-up` candidates, never `reforge` candidates. For **supporting** heroes, a slot is a reforge candidate iff (a) the currently-equipped effect does **not** affect DPS AND (b) the hero's pool contains ≥ 1 effect that **does** affect DPS. Set intersection of `hero.legendary_effect_id × effectsAffectingDps` — O(1) per slot given `scopeMatcher.js`. Supporting heroes whose pool intersects zero DPS-affecting effects don't appear in the forge-run view at all. |
| 5b | **`effects_unlocked` reroll mechanic — Phase 1 vs. Phase 2** — until all 6 are unlocked for a hero, rerolls draw only from effects not yet unlocked (guaranteed new). Once all 6 are unlocked, rerolls draw uniformly from all 6. Affects the `X/6` "Potential hits" badge formula: under Phase 1 the denominator is `|pool \ unlocked|`, not 6. | **Needs empirical verification** | Open sub-questions: (i) Is `effects_unlocked` per-slot (independent progression per slot) or is the "unlocked set" hero-wide (union of effects that have ever appeared on any slot for that hero)? The sample payload stores `effects_unlocked` per slot but the user's description reads as hero-level semantics. (ii) Once resolved, the `X/Y` formula: in Phase 1, `X = |(pool \ unlocked) ∩ dpsAffecting|`, `Y = |pool \ unlocked|`; in Phase 2, `X = |pool ∩ dpsAffecting|`, `Y = 6`. (iii) PRD §3.2.5 currently references both the hero's pool (in the "Potential hits: X/6" addition) and `effects_unlocked` (in the detection rule) — needs to be reconciled once the mechanic is verified. **Plan:** verify empirically during §2 drafting by comparing a fresh reforge's pre/post state, then update PRD §3.2.4 / §3.2.5 in one clean pass. |
| 6 | **Favor prioritization + reforge cost sourcing** — what makes a slot "upgradeable," how is cost determined? | Resolved | **Upgrade eligibility:** `slot.level < 20` AND `user.loot[requiredFavor] >= upgradeCost`. Upgrade cost is static per `(hero, slot, level)` and read from `getlegendarydetails.costs_by_hero`. **Priority metric for the favor breakdown panel:** count of DPS-affecting slots currently upgradeable with each favor type (V1 chosen metric). Sort favors desc by this count. **Reforge cost is dynamic** — every reforge bumps the Scales-of-Tiamat cost up, which then decays back to 1000 Tiamat over 7 days. Therefore we **read the current reforge cost from the API response, never compute it**. The exact field is TBD during §2 (likely in `getlegendarydetails` or a dedicated call); if we can't find it empirically the reforge tile falls back to showing "Reforge" without a cost hint. |
| 7 | **Mutation UX — optimistic vs. pessimistic** | Resolved | **Pessimistic for V1.** Falls directly out of #2: state-is-server, refetch after mutation. Click → button disables + spinner. On 2xx with `success:true` → `refreshAccount()` runs, view re-renders from fresh truth, button re-enables. On non-2xx, network failure, or `success:false` → toast appears with the server's `failure_reason` (or HTTP status + message for network/HTTP errors), button re-enables, no state mutation. The same toast component is reused for Refresh-button failures in the global header. Optimistic UI is deferred to V2; revisit if per-click latency feels sluggish in real use. |

### Questions that surfaced but are out of scope for V1

| # | Question | Status | Resolution |
|---|----------|--------|------------|
| O-1 | Probabilistic cost-benefit of reforges (expected DPS gain per Tiamat spent accounting for reforge cost decay) | Open, deferred | V1 shows raw "Potential hits: X/Y" and current cost; user makes risk call. Revisit if the forge-run view needs deeper analytical guidance. |
| O-2 | Batch/queued mutations (e.g., "upgrade all") with optimistic UI | Open, deferred | PRD §3.2.4 mentions a bulk upgrade; V1 will use sequential pessimistic calls. Revisit once V1 is shipped and usage data reveals patterns. |
| O-3 | Specializations view (PRD §3.3) | Open, deferred | Out of scope until Legendary view ships. |

---

*Sections 1-7 will be drafted next.*
