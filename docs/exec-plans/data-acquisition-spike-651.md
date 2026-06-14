# Spike #651 — Data-acquisition plan for the next projection-accuracy lever

## Status: Complete (2026-06-14)

> **Verdict:** Of seven candidate sources, only three clear the leakage-free,
> early-offseason, historical-availability bar well enough to validate on the
> held-out harness. Ranked shortlist:
>
> 1. **Coaching / offensive-coordinator change encodings** — cheap, nflverse
>    history, targets the QB/WR scheme-shift error. **Recommended first acquisition.**
> 2. **Snap-share / route-participation *projections*** (forward-looking role) —
>    highest signal hypothesis (WR/TE), but acquisition is the hard part because a
>    *projection* of snaps is itself a near-market product; see scoping below.
> 3. **Free-agency / contract movement (role-securing)** — OTC/Spotrac history,
>    medium cost, modest WR/RB signal.
>
> Everything else (beat-reporter news, strength-of-schedule, combine, injury
> history) is either un-backtestable, already-modeled, or too weak to prioritize.

---

## Why this spike (context)

The 2026-06 experiment wave produced four consecutive NEGATIVEs against the
active `v33_tuned_base` (#639 base tuning, #640 QB volume, #642 pass-catcher
ecosystem, #643 rank-aware objective). They triangulate one conclusion: **on the
current feature set, v33 is at the achievable frontier for both MAE and ranking.**
Every bet that re-derived a feature from existing data (nflverse stats, depth
charts, Vegas) or changed the objective on the same features tied or regressed.
The residual gap to FantasyPros is an **information gap**, not a modeling gap. So
the next lever is *new information* — subject to the hard constraint.

### Hard constraint (non-negotiable)

**No FantasyPros, ADP, or other market/consensus projections as model input.**
The value prop is generating upcoming-season projections *early in the offseason,
before external projections exist* (see `project_2026_projections_focus`). Any
source must be available early-offseason and must not be a repackaged market
consensus. Note: the `draft_sharks_values` already in the DB are auction-market
values — eval-time comparator only, **never** a model input.

### Where the gap actually is (held-out per-position, rolling protocol)

From [projection-holdout-eval-rolling.md](../generated/projection-holdout-eval-rolling.md)
(combined folds, best internal model per position vs `external_fantasypros_v1`):

| Pos | Internal best MAE | FP MAE | MAE gap | Internal ρ | FP ρ | Ranking gap |
|-----|-------------------|--------|---------|-----------|------|-------------|
| QB  | 3.665 (`v22`)     | 3.517  | **−0.148** | 0.677 | **0.812** | **large** |
| WR  | 2.192 (`v31`)     | 2.037  | **−0.155** | 0.794 | 0.813 | small |
| TE  | 1.530 (`v31`)     | 1.488  | −0.042  | 0.760 | **0.822** | moderate |
| RB  | 2.384 (`v4`)      | 2.597  | **+0.213** | 0.807 | 0.833 | ~tie (internal wins MAE) |

**Read:** QB is the worst position on both MAE and ordering, and the ordering gap
(ρ 0.68 → 0.81) is the single largest FP edge anywhere. WR has a real MAE gap with
nearly-matched ordering. TE is mostly an ordering gap. RB is already solved
internally — **do not** spend acquisition budget on RB-only signals. The FP edge
on QB/WR/TE ordering is exactly the kind of thing camp/role/scheme news drives.

---

## Existing data infrastructure (grounds "acquisition cost")

- **nflverse via `nfl_data_py`** is the established, free, leakage-checkable
  pipeline. Already wired: `import_snap_counts`, `import_depth_charts` (used in
  `backfill_depth_charts.py`), draft picks (`backfill_draft_capital.py`), and
  schedule/Vegas (`backfill_vegas_lines.py`). nfl_data_py also exposes
  `import_schedules` (**includes `home_coach`/`away_coach` per game**),
  `import_combine_data`, `import_seasonal_rosters`, and `import_ngs_data`.
- **Backfill pattern is a solved problem:** `scripts/backfill_*.py` →
  Supabase table → TS type + `db-schema.md` → feature class in
  `scripts/feature_projections/features/` → register in `features/__init__.py`.
  Adding a new nflverse-sourced table is low-friction.
- **Playwright scraping** exists (`scrape_draft_sharks.py`) for non-nflverse
  sources, but a scraped source still needs **historical** values for 2021–2025
  to be backtestable — most live web sources only show the current snapshot.
- **The hard gate:** every source must clear `just holdout-eval --protocol
  rolling` + `just significance <model> v33_tuned_base`. That requires
  **leakage-free historical values for 2021–2025** (the value the source had
  *before* each target season). A source with no retrievable history is out of
  scope until it accrues one.

---

## Candidate evaluation

Each scored on: (1) signal hypothesis, (2) availability & timing / leakage,
(3) acquisition cost, (4) backtest feasibility, (5) effort vs. expected gain.

### 1. Coaching / offensive-coordinator change encodings ✅ SHORTLIST (recommended first)

1. **Signal:** A new head coach / OC changes scheme, pace, and pass rate. This is
   the classic "QB/WR breakout or bust" driver our model can't see — it only sees
   the player's own PPG history, which is *stale* when the offense changed.
   Targets the **QB ordering gap** (new scheme = the biggest single-season QB
   swing) and **WR** role/volume shifts. Encodings: `head_coach_changed`,
   `oc_changed`, `coach_tenure_years`, and (richer) the prior team's pace/pass-rate
   carried by the incoming coordinator.
2. **Availability/leakage:** Coaching hires are essentially complete by late
   January–February (well before our offseason projection run). Leakage-free:
   the change is known before the target season starts. `home_coach`/`away_coach`
   are in nflverse schedules going back well past 2021, so the *head-coach* signal
   is directly derivable. OC history is thinner in nflverse — may need a small
   manual/scraped supplement (Wikipedia/PFR coaching tables have clean history).
3. **Cost:** **Low** for head-coach change (pure nflverse `import_schedules` diff:
   team's coach in season N vs N−1). Medium if we want OC-level granularity.
4. **Backtest feasibility:** **Strong** — head-coach-by-team-by-season is fully
   reconstructable 2021–2025 from schedules. Can build the feature and run the
   harness immediately.
5. **Effort vs gain:** Low effort, plausibly the **best ratio** in the list.
   Caveat: the *number* of coaching changes per season is small (~6–8 teams), so
   the player-clustered bootstrap has limited n on the affected cohort — expect a
   modest, possibly-not-significant effect. But it's cheap enough to try first,
   and it attacks the QB error directly. **Build as a two-stage residual** (like
   draft capital, #376): the signal is meaningful for a *minority* of player-seasons
   (those on a coach-changed team) and exactly neutral for everyone else, so a
   residual avoids the v23-style coefficient drift on the unaffected cohort.

### 2. Snap-share / route-participation *projections* (forward-looking role) ⚠️ SHORTLIST (with a caveat)

1. **Signal:** The single highest signal hypothesis. We currently use the
   **1/2/3 depth tier** (`depth_charts`) — coarse. A continuous *projected* snap or
   route share captures "ascending year-2 WR", "RBBC → bell-cow", "rookie taking
   over". Directly targets **WR/TE MAE** (volume is the dominant WR projection
   error) and **WR/TE ordering**.
2. **Availability/leakage — the catch:** A *historical actual* snap share is
   trivially available (`import_snap_counts`, already wired) but that's a
   **lagged** feature (last year's snaps), which the base PPG already largely
   encodes — the wave evidence (#640/#642) says lagged volume is priced in. The
   valuable thing is a *forward* projection of next-year snaps, and **any
   published forward snap projection is itself a near-market product** (it bakes in
   consensus role expectation) → fails the hard constraint.
3. **Cost / resolution:** This means the in-scope version is **a model we build
   ourselves**: project next-season snap share from depth-chart movement + draft
   capital + prior snaps + the coaching-change signal above, then feed it as a
   feature. That's not really "data acquisition" — it's a sub-model, and it's
   built from data we already have, which the wave predicts will tie. The genuinely
   *new* in-scope information is the **depth-chart-movement delta** (offseason
   roster churn: did the team add/lose a WR ahead of this player?), which requires
   **free-agency/draft roster data** → folds into candidate #3.
4. **Backtest feasibility:** Actuals: strong. A leakage-free *projected* share:
   only as good as the sub-model, validate on the harness like any feature.
5. **Effort vs gain:** High potential gain but **high effort and constraint
   risk**. Recommendation: do **not** chase a third-party snap *projection*
   (market). Instead capture the upstream *cause* — offseason role-securing
   movement (#3) and coaching change (#1) — and let the existing learned combiner
   turn those into the role signal. Keep this as the "north star" the other two
   feed, not a standalone acquisition.

### 3. Free-agency / contract movement (role-securing signal) ✅ SHORTLIST

1. **Signal:** A player who signs a new multi-year deal, or whose team *didn't*
   re-sign the back/receiver ahead of him, has a more secure/larger role. Contract
   value (guaranteed money, AAV) is a strong, **non-market-projection** proxy for
   how a team values a player's role. Targets **WR/RB volume** and the
   "ascending role" cases the depth tier misses.
2. **Availability/leakage:** Free agency opens mid-March; the bulk of signings
   land in March–April — **before** typical projection runs, leakage-free w.r.t.
   the season. Contract data is dated, so per-season historical snapshots are
   reconstructable.
3. **Cost:** **Medium.** nflverse does **not** carry contracts; OverTheCap (OTC)
   and Spotrac do. OTC publishes historical contract tables; `nflreadr` has an
   experimental contracts loader sourced from OTC. Likely a scraper or a one-time
   OTC bulk pull + a yearly refresh. Name-matching to our `players` is the usual
   tax (reuse `name_utils`).
4. **Backtest feasibility:** **Workable** — OTC has contract history covering
   2021–2025. Feature = "signed a new contract this offseason" (binary) +
   guaranteed $ / AAV percentile within position. Can assemble a 2021–2025 panel.
5. **Effort vs gain:** Medium effort, modest-but-real gain, and it's the cleanest
   *new* (non-nflverse, non-market) information in the list. Second priority after
   coaching because acquisition is heavier.

### 4. Beat-reporter / camp-news role signal ❌ OUT (un-backtestable)

1. **Signal:** Potentially the *strongest* — this is literally the information FP
   has and we don't (camp standouts, injury recoveries, role declarations).
2. **Leakage/availability:** Published in July–August camp — **after** our
   early-offseason run for much of it, and inseparable from market consensus.
3–4. **Backtest feasibility: fails.** There is no clean *historical* structured
   feed of "what beat reporters said about player X before season N". Reconstructing
   it is manual, subjective, and leak-prone. **Cannot clear the harness.**
5. **Verdict:** Out of scope until a structured, historical, leakage-free feed
   exists. Highest signal, lowest feasibility — do not pursue now.

### 5. Strength-of-schedule / opponent-defense-faced ❌ OUT (weak, partly already priced)

1. **Signal:** Modest. Season-long SOS washes out heavily over 17 games, and our
   target is **per-game PPG**, which damps schedule effects further.
2. **Availability:** Schedule releases mid-May (after win totals, before some
   runs); nflverse schedules give it for free.
3–4. **Feasible to backtest** (cheap, nflverse), but the prior is weak and Vegas
   implied team total (`v27`/`v33` already uses it) captures most of the
   game-environment signal SOS would add.
5. **Verdict:** Cheap but low expected gain and overlaps existing Vegas feature.
   Park it — only worth a quick ablation if a shortlist item needs a control.

### 6. Combine / athletic profile for rookies ❌ OUT of *this* path (separate track)

1. **Signal:** Real for **rookies only**, and rookie projection is a **separate
   path** ([rookie-backtest.md](../generated/rookie-backtest.md)) where
   draft_capital is the dominant signal. Combine adds marginal signal on top of
   draft capital (which already encodes most of what the combine informs).
2–4. nflverse `import_combine_data` has full history → backtestable, low cost.
5. **Verdict:** Out of scope for the *veteran* held-out harness this spike targets.
   Worth a separate, smaller experiment on the **rookie** backtest, not here.

### 7. Injury history / availability beyond games-played ❌ OUT (already modeled)

1. **Signal:** We **already** model expected games via #587 (`projected_games`,
   availability haircut). The marginal signal from richer injury history (e.g.
   soft-tissue recurrence) is small and noisy.
2–5. The structural-injury-model variant (#587b) was already tried and came back
   **negative**. **Verdict:** diminishing returns; the availability axis is spent
   for now.

---

## Recommended first acquisition + backtest plan

**Source #1 — Coaching / OC change encoding.** Best effort-to-feasibility ratio,
attacks the largest gap (QB ordering), and is buildable today from data we
already pull.

### Step plan

1. **Acquire (low cost):** Extend `import_schedules` usage (already in
   `backfill_vegas_lines.py`) to derive a `team_coaching` table:
   `(season, team, head_coach, head_coach_changed, coach_tenure_years)` for
   2021–2025. Supplement OC history from a one-time PFR/Wikipedia coaching-table
   pull if the head-coach signal alone is too sparse. Follow the standard
   backfill→TS-type→`db-schema.md` workflow.
2. **Feature:** Add `scripts/feature_projections/features/coaching_change.py`
   producing a per-player-season `coach_changed` flag (+ tenure). Register it.
   Add `TestCoachingChangeFeature` to `test_feature_projections.py`.
3. **Model:** Build as a **two-stage residual** on `v33_tuned_base`
   (`train_ridge_residual`, `fit_intercept=False`) so unaffected players get
   byte-identical base predictions — mirrors the draft-capital pattern (#376) and
   avoids coefficient drift on the ~90% of player-seasons with no coaching change.
4. **Generate held-out projections:** `just project <name> 2023,2024,2025`.
5. **Re-rank:**
   ```
   just holdout-eval --protocol rolling --eval-seasons 2023,2024,2025 --min-train-season 2021 \
     --models <name>,v33_tuned_base,naive_prior_season_ppg,position_mean_baseline
   ```
   Read the **per-position QB rows** specifically (MAE + Spearman ρ), since that's
   the hypothesis.
6. **Significance gate:**
   ```
   just significance <name> v33_tuned_base --protocol rolling --eval-seasons 2023,2024,2025 --min-train-season 2021
   ```
   Promote **only** on a significant held-out win (CI excludes 0). Given the small
   coached-team cohort, a not-significant tie is the likely outcome — that is a
   valid, informative result that tells us to move to source #3.

**Confirmation discipline (#594):** iterate on the rolling folds; treat the final
window as confirmation-only (one look). Restore the holdout cache / clear
`.cache/holdout` per the usual protocol.

### If #1 ties (expected ~50/50): proceed to Source #3 (FA/contract movement)

It's the next-cheapest genuinely-*new* information and the wave evidence says
same-data bets won't move — so a real external signal (contract-implied role) is
the higher-probability win even though acquisition is heavier.

---

## Devcontainer egress allowlist — domains to add

The autonomous devcontainer runs a **default-deny** egress firewall
(`.devcontainer/init-firewall.sh` resolving `.devcontainer/allowed-domains.txt`;
no wildcards — list concrete hosts). To run any of these acquisition experiments
*inside* the container, the source's host must be allowlisted.

**Already reachable — no change needed:** Every **nflverse** source downloads from
GitHub release assets / raw (`release-assets.githubusercontent.com`,
`objects.githubusercontent.com`, `raw.githubusercontent.com`, GitHub CIDR blocks)
— all already in the allowlist. That covers `import_schedules` (coaching),
`import_snap_counts`, `import_depth_charts`, `import_combine_data`,
`import_seasonal_rosters`, `import_ngs_data`, and the experimental `nflreadr`
**contracts** loader (also nflverse-hosted on GitHub). So coaching-change (#1),
snap actuals, combine, rosters, and even OTC-sourced contracts *via nflverse* need
**zero** new domains.

**New hosts to add** (only if you go to the primary source rather than the
nflverse mirror):

| Source | Host(s) to add | For which candidate |
|--------|----------------|---------------------|
| OverTheCap (contracts/FA) | `overthecap.com`, `www.overthecap.com` | #3 FA/contract movement (primary source if nflverse contracts is stale) |
| Spotrac (contracts/FA, role security) | `www.spotrac.com` | #3 FA/contract movement (alternate) |
| Wikipedia (coaching-staff history) | `en.wikipedia.org` | #1 OC-level coaching history supplement |
| Pro-Football-Reference (coaching, SOS) | `www.pro-football-reference.com` | #1 coaching / #5 SOS — **note: Cloudflare-walled**, scraping may 403 (same wall that killed the PFR Vegas source, #378) |

Suggested additions to `.devcontainer/allowed-domains.txt` (append under a new
`# Projection data sources (spike #651)` comment):

```
# Projection data sources (spike #651) — contracts / coaching
overthecap.com
www.overthecap.com
www.spotrac.com
en.wikipedia.org
# www.pro-football-reference.com  # Cloudflare-walled; uncomment only if a scrape path works
```

**Recommendation:** Add `overthecap.com` / `www.overthecap.com` and
`en.wikipedia.org` now — they unblock the two shortlist sources that aren't pure
nflverse (#3 contracts, #1 OC supplement). Skip PFR unless a scrape actually
clears Cloudflare. The recommended first experiment (#1 head-coach change via
nflverse schedules) needs **no allowlist change at all** — you can start it in the
container today.

## Definition-of-done checklist

- [x] Each candidate scored on signal / timing-leakage / cost / backtest-feasibility / effort-vs-gain.
- [x] Ranked shortlist of 2–3 with leakage-free historical-availability check: **coaching change**, **snap/route role (via causes)**, **FA/contract movement**.
- [x] Recommended first acquisition (**coaching change**) with a concrete
      `holdout-eval` + `significance` backtest plan that can clear the gate before any promote.
- [x] Out-of-scope sources documented with reasons (beat-reporter: un-backtestable;
      SOS: weak/overlaps Vegas; combine: rookie-path only; injury: already modeled #587).
