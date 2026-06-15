# Spike #667 — Structural projection levers beyond the same-data MAE frontier

## Status: In progress (2026-06-15) · L4 ranking-gate **built + validated** · L1 v1 (TD-regression xFP) → **held-out TIE** · L3 v1 (EB partial pooling) → **SIGNIFICANT at QB** (spike's first significant win)

> **TL;DR.** The 2026-06 wave's four NEGATIVEs proved *same-data features are
> tapped on MAE*. They did **not** prove the model is optimal — they proved MAE
> on realized season PPG is **saturated and underpowered**. This spike scopes the
> five structural levers that sit inside the no-market-inputs constraint and
> attack ordering + target construction instead, and ships the linchpin (L4)
> first so the rest become detectable.
>
> **Concrete result this spike already produced:** a ranking-metric significance
> gate (`just significance … --metric spearman --position QB`). Its first run is
> the evidence the whole spike rests on — on the rolling held-out window FP
> **significantly** out-orders the active model `v33_tuned_base` at QB
> (ρ **0.805 vs 0.707**, Δ −0.098, 95% CI **[−0.167, −0.040]**, **p=0.001**),
> while the *MAE* bootstrap on the same QBs never clears significance. The
> ordering gap is real and detectable; the MAE wall was a power artifact.

---

## Why this spike (context)

The 2026-06 experiment wave produced four consecutive NEGATIVEs vs
`v33_tuned_base` (#639 base tuning, #640 QB volume, #642 pass-catcher ecosystem,
#643 rank-aware objective; #645 Huber tie). Its stated conclusion — *"v33 is at
the achievable frontier for both MAE and ranking; the residual gap to FantasyPros
is an information gap, not a modeling gap"* — drove data-acquisition spike #651
(coaching change built → held-out TIE; contract movement next).

Spike #667 challenges the **second half** of that conclusion. The four NEGATIVEs
prove MAE on realized season PPG is saturated and statistically underpowered —
a different, more fixable problem than "the model is optimal."

### The structural critique (grounded in the code)

The base feature is `weighted_ppg_tuned_no_qb`
([weighted_ppg.py](../../scripts/feature_projections/features/weighted_ppg.py)):
a recency-weighted, games-scaled average of the player's **own past realized
PPG**, with recency weights `[0.65, 0.20, 0.15]`. The training target is the
player's **realized next-season PPG**
([backtest.py](../../scripts/feature_projections/backtest.py)). Realized PPG =
`opportunity × efficiency × availability`. Availability is split off (#587 →
`projected_games`), but the target+base still bundle **volume** (stable, ~AR(1))
with **efficiency** (TD rate, YPA, catch rate — noise that regresses hard year to
year). Autoregressing a noise-contaminated quantity onto a noisier version of
itself hits a variance floor no combiner can get under. That is exactly the
log's recurring pattern — *every same-data feature ties at ±0.02 MAE; QB effects
unresolvable below ~0.2 MAE at ~62 clusters* — and it is the signature of a
**power/target-construction** problem, not a true frontier. It also explains why
FP out-*ranks* us (QB ρ 0.71 → 0.81) while barely differing on MAE: good
projectors strip efficiency noise before ordering.

### What the harness already has (so we scope deltas, not rebuilds)

- **Held-out, leakage-free, rolling-origin re-rank**:
  [holdout_eval.py](../../scripts/feature_projections/holdout_eval.py) retrains
  learned/residual models inside an expanding-window sandbox per fold and scores
  every model out-of-sample. It already computes per-position **Spearman ρ** and
  **top-N hit** (`rank_metrics`) and renders a "Ranking quality" section (#598).
- **Significance**:
  [significance.py](../../scripts/feature_projections/significance.py) does a
  player-clustered paired bootstrap of the **MAE** delta (#573/#594). The gate
  was MAE-only — that is what L4 changes.
- **Prediction cache** (#597) makes rolling re-runs cheap.

---

## L4 — Gate on the decision metric (built first; validated) ✅

**Decision (DoD item 1).** Add a **ranking-metric significance gate** to the
held-out harness and make a per-position **Spearman-ρ delta** a first-class,
testable statistic alongside MAE. Sequenced first (per the issue) so every later
lever's win is *detectable* — the MAE bootstrap is too underpowered to see a
0.1-MAE effect at ~62 QB clusters, but the ranking signal is larger.

**What shipped in this PR.** `significance.py --metric spearman --position <P>`:

- New `bootstrap_spearman_difference()` — player-clustered paired bootstrap of
  `ρ(A) − ρ(B)`. Spearman is a property of the whole vector (not summable per
  row), so it resamples whole players (their multiple eval-season rows together,
  GH #594 Finding C) and **recomputes both models' ρ on each resampled vector**.
- Higher-is-better sign convention (positive delta ⇒ A orders better), with the
  printer and CLI handling both metrics. `--metric spearman` requires a non-ALL
  `--position` because ordering is a within-position decision (#598); ALL errors
  out with a teaching message.
- Tests: `TestSpearmanBootstrap` in
  [test_holdout_eval.py](../../scripts/tests/test_holdout_eval.py) (sign,
  empty-input, tie-not-significant, constant-vector-is-0-not-NaN).
- Runs through the existing `just significance` recipe (it forwards `*args`).

**Validation run (the spike's central evidence).** Rolling origin, eval
2023/2024/2025, min-train 2021:

```
just significance v33_tuned_base external_fantasypros_v1 \
  --metric spearman --position QB \
  --protocol rolling --eval-seasons 2023,2024,2025 --min-train-season 2021
```

| | ρ | Δ (v33 − FP) | 95% CI | p | verdict |
|---|---|---|---|---|---|
| `v33_tuned_base` | 0.707 | **−0.098** | **[−0.167, −0.040]** | **0.001** | FP **significantly** orders QBs better |
| `external_fantasypros_v1` | 0.805 | | | | (54 unique QBs, 118 player-seasons) |

The *MAE* bootstrap on the same QBs (the historical gate) does **not** clear
significance — the ~0.15 MAE gap is inside its noise band. The ranking gate
detects the gap the MAE gate is blind to. **L4 is the linchpin: it gives the
underpowered bootstrap something to detect, and it confirms the gap is in
ordering, not level.**

**Remaining L4 work (follow-up, not this PR).**
1. **Top-N decision metric.** Spearman is a good cheap proxy, but the truest
   consumer metric is *realized points-above-replacement captured when you draft
   the top-N off each projection*. Scope: add `--metric decision` = bootstrap of
   `Σ actual_PaR over each model's predicted top-N` per position (NDCG@N as a
   middle-ground proxy). Signal is even larger than ρ here.
2. **Make ranking a reportable promote gate.** Document in CLAUDE.md's
   "Projection Model Update Requirements" that a model may promote on a
   **significant ranking win** at a target position even when MAE ties, provided
   MAE does not significantly *regress* (guard against shipping a worse-level,
   better-ordered model into VORP/surplus without noticing). This is a policy
   change to land alongside the first lever that actually wins on ρ.

**Ship P10/P50/P90 (the issue's L4 part 2).** Falls out of L3 (below) for free;
deferred until L3 produces a posterior. Tracked there.

---

## L1 — Regress on expected points (xFP), not realized points (scoped)

**The change (DoD item 2).** Replace the base's "weighted past *realized* PPG"
with "weighted past *expected* PPG" — `xFP_t` reconstructed from **opportunity**,
with efficiency regressed to expectation. Distinct from #641 (which added
opportunity/efficiency as *features* on top of the realized base and tied on
same-season MAE). L1 changes **what the base autoregresses on**; its win shows up
in next-year **ordering + calibration**, which #641 never gated on — and which
L4 now makes measurable.

**Inputs per position (all already ingested — no new acquisition).**
`nfl_stats` (season-level, `(player_id, season)`) carries `passing_attempts`,
`completions`, `passing_tds`, `interceptions`, `rushing_attempts`, `targets`,
`receptions`, `receiving_yards`, `offense_snaps`. The model already consumes
`target_share_raw`, `air_yards_share_raw`, `wopr_raw`, `racr_raw`,
`usage_share_raw` as features (computed from nflverse). So xFP is a
**re-derivation of data we have**, not new ingestion.

| Pos | xFP volume drivers | Efficiency → regress to expectation |
|-----|--------------------|--------------------------------------|
| WR/TE | targets, air-yards share, aDOT, RZ targets, WOPR | catch rate, YPRR, **TD rate → expected TDs** |
| RB | carries, RZ carries, targets | YPC, **TD rate → expected TDs** |
| QB | attempts, aDOT, designed-rush volume | YPA, **passing-TD rate → expected TDs from attempts/air yards** |

**TD-rate regression method (the crux).** Per-position, fit `expected_TDs =
f(volume, field-position proxy)` on the training window and replace realized TDs
with the fitted expectation in the xFP reconstruction. Cheapest defensible
version: shrink each player's TD rate toward the position-season mean TD-per-
opportunity with strength ∝ opportunity count (a one-parameter empirical-Bayes
shrink — same machinery as L3, which is why L3 should land first or together).

**Build as.** A new base feature `weighted_xfp` (sibling of `weighted_ppg`),
reusing the identical recency-weight + games-reliability scaling so it is a
drop-in base swap. First model: `v42_xfp_base` = `v33_tuned_base` with the base
feature swapped `weighted_ppg_tuned_no_qb → weighted_xfp`. **Run first among the
modeling levers** (issue's recommendation), and **measure on L4's ρ gate at QB +
WR**, not MAE.

**Risk / kill criterion.** If xFP ties realized-PPG on *both* MAE and ρ at every
position, the efficiency-noise hypothesis is wrong and we stop — same discipline
as #651's source #1.

> **Outcome — v1 (TD-regression-only) → held-out TIE (2026-06-15).**
> `weighted_xfp_tuned_no_qb` (realized TDs → opportunity-expected TDs,
> volume-weighted shrink toward league priors; yards/receptions stay realized)
> ran the full rolling gate. **MAE** 2.238 vs v33 2.226 (Δ +0.011, p=0.25, NS);
> **QB ρ** 0.674 vs 0.670 (Δ +0.004, **p=0.58** on the L4 gate) — a dead tie on
> the position the hypothesis targeted. v33's existing usage/target_share/wopr
> features already proxy most opportunity de-noising, and FP's ρ-0.10 QB edge is
> far larger than any TD-luck slice. **The cheap slice of L1 ties; not promoted.**
> Unexplored: the *fuller* xFP (air-yards/aDOT/RZ reconstruction) and a per-fold
> β sweep — but a p=0.58 tie on the target metric is unlikely to be β-rescued.
> Next per sequencing: **L3** (empirical-Bayes pooling — also supplies a
> principled version of L1's TD shrink) or the **decorrelated ensemble** cheap
> win. See the #667 section in [experiment-log.md](../generated/experiment-log.md).

---

## L3 — Empirical-Bayes / hierarchical partial pooling (scoped)

**The change (DoD item 3).** Replace the hand-tuned constant shrinkage in
[regression_to_mean.py](../../scripts/feature_projections/features/regression_to_mean.py)
(+ v21 tiered) with **partial pooling**: shrink each player toward a
`(position, age-bucket, role)` prior with strength scaling to **observed sample
size** (games / snaps / targets). A 3-game player is pulled hard toward the
prior; a 16-game workhorse barely moves. The lessons-learned doc shows a uniform
factor does the wrong thing on each side of the mean — partial pooling fixes that
asymmetry as a property of the math, not a tuned tier.

**Formulation.** Per position group `g`, model player-season mean PPG as
`μ_p = w_p · y_p + (1 − w_p) · μ_g`, with shrinkage weight
`w_p = n_p / (n_p + k_g)` where `n_p` = the player's reliability-weighted games
(the same `games_played/17` factor the base already uses) and `k_g` is the
pooling strength estimated per group from the train fold (method-of-moments /
James–Stein, or a light hierarchical fit). The prior `μ_g` can itself be a
shallow hierarchy `(position → position×age-bucket → position×age×role)` so thin
cohorts (QB, TE) borrow strength from their parent.

**Why it subsumes three things at once.** (1) Replaces `regression_to_mean` +
the bench-tier asymmetry hack with one principled object. (2) The shrinkage is
the same one-parameter shrink L1 needs for TD-rate regression — **build the
shrink primitive once, reuse in both.** (3) The posterior yields
**uncertainty for free** → delivers L4's P10/P50/P90 with no extra modeling.

**Build as.** A `partial_pooling` feature replacing `regression_to_mean` in a
`v43_eb_pooling` = `v33_tuned_base` variant; quantiles emitted as
`projected_ppg_p10/p50/p90` columns once the posterior exists (new
`model_projections` columns + a TS type update — see CLAUDE.md migration
workflow). Gate on **both** MAE (must not regress) **and** calibration
(coverage of the P10–P90 interval on the held-out fold).

**Note on the constraint.** Pure shrinkage toward own-data priors — no market
input; compatible with the early-offseason value prop (FantasyPros/ADP are
eval-time comparators only, never model inputs).

> **Outcome — v1 (sample-size-scaled shrink, positional-mean prior, k=1) →
> SIGNIFICANT at QB (2026-06-15).** `v43_eb_pooling` (= v33 with
> `regression_to_mean` → `partial_pooling`) is the **spike's first significant
> win**. **QB MAE −0.119, CI [−0.247, −0.004], p=0.041** (bias −0.549→−0.317);
> **balanced MAE 2.450→2.418**; QB ρ +0.019 (p=0.087, trending, NS). ALL MAE a
> tie (−0.005, p=0.72 — QB is a small slice of the pool), WR/RB tiny wins, TE
> tiny loss. The fixed-factor `regression_to_mean` was leaving QB accuracy on the
> table; sample-size-aware pooling helps exactly the thin-n / high-value position
> where v33 was worst — as predicted. **Doesn't clear the strict ALL-MAE gate, so
> not auto-promoted** (operator call, from main). Follow-ups to push it over:
> hierarchical (position×age/role) prior, per-position / per-fold `k`, and the
> free posterior P10/P50/P90. See the #667 L3 section in
> [experiment-log.md](../generated/experiment-log.md).

---

## L2 — Game/week-level modeling (feasibility note)

**The power argument (DoD item 4).** The recurring "~62 QB clusters, can't
resolve sub-0.2-MAE effects" is a **power** problem. Season-level modeling has
~1.2k rows; week-level is ~17× that (~20k), making currently-unresolvable
effects resolvable and giving a within-season prior for free.

**Plumbing feasibility — the honest cost.** Today **both** `player_stats` and
`nfl_stats` are keyed `(player_id, season)` — **season-level only; there is no
weekly table.** So L2 is the one lever that needs new ingestion plumbing
(everything else re-uses ingested data):

1. **New table `nfl_weekly_stats`** keyed `(player_id, season, week)`, populated
   from nflverse `nfl_data_py.import_weekly_data()` (already the established,
   leakage-checkable pipeline used by `backfill_*`). Migration + TS type +
   db-schema doc per the standard workflow. This table is **>1000 rows per
   season** → all reads must use the paginated helpers (`fetch_all_rows` /
   `fetchAllRows`) and will be picked up by `LARGE_TABLES` pagination scanners.
2. **Aggregation layer.** A game-level volume model (targets/carries/attempts per
   game) → aggregate to a season distribution (mean + variance) → feed the
   season projection. The issue's "partial version (season volume from
   game-level volume models) still helps" is the right first slice: it does not
   require rebuilding the whole stack at week granularity, only the volume base.
3. **Leakage discipline.** Weekly rows make in-season leakage *easier* to commit
   — the rolling-origin harness must still train only on seasons strictly before
   the eval season; within-season weekly priors are fine for *in-season* use but
   **not** for the early-offseason next-season projection that is the value prop.

**Verdict.** Feasible but the **biggest lift**; correctly sequenced **after**
L1/L4 prove the reframe pays. Do the partial (game-level volume → season) slice
first if L1's xFP win points at volume as the carrier.

---

## L5 — QB-specific volume × regressed-TD model (scoped)

QB is the worst position (3.7 MAE), has the **largest FP ordering gap anywhere**
(now *quantified* by L4: ρ 0.707 vs 0.805, p=0.001), and — this is **Superflex**
— the most *valuable* position, so a 0.1-MAE QB gain beats a 0.2 WR gain in
decision value. L5 is **L1 applied where it matters most**: project QB as
`stable_volume × heavily-regressed-efficiency`, passing-TD rate regressed to
expected TDs. Build as the QB position-override of `v42_xfp_base`, or as a
QB-only residual on v33 (the `v34_qb_residual` pattern already exists). **Gate on
the QB ρ delta** — that is the metric with the demonstrated, significant gap.

---

## Cheap win — held-out-validated ensemble of decorrelated models (scoped)

We have models that tie on MAE but make *different* errors (additive v14/v33
anchor own-PPG; learned v31 fits the variance shape). Classic variance reduction.
**Build as.** A `holdout_eval` helper that, on each rolling fold, blends a small
decorrelated set (e.g. v33 + a learned + an additive) with weights/calibration
(isotonic or Platt) **fit on the held-out fold only** to avoid reintroducing the
over-projection bias. Validate the blend through the *same* gate as everything
else (MAE significance + the new ρ gate). A few hours; pure fundamentals; run in
parallel as a baseline-raiser. No validated blend exists in the log yet.

---

## Validation plan — applies to every lever (DoD item 5)

Non-negotiable, identical to the methodology audit / #594 protocol:

1. **Leakage-free rolling-origin held-out re-rank** against `v33_tuned_base` +
   naïve baselines:
   ```
   just holdout-eval --protocol rolling --eval-seasons 2023,2024,2025 \
     --min-train-season 2021 \
     --models <name>,v33_tuned_base,naive_prior_season_ppg,position_mean_baseline
   ```
   Learned models retrain out-of-sample per fold; additive/external need their
   held-out projections generated first (`just project <name> 2023,2024,2025`).
2. **Significance — now on *both* metrics:**
   - MAE (the accuracy guard — must not significantly regress):
     `just significance <name> v33_tuned_base --protocol rolling --eval-seasons 2023,2024,2025 --min-train-season 2021`
   - **Ranking (the new decision gate, #667 L4):**
     `just significance <name> v33_tuned_base --metric spearman --position QB --protocol rolling --eval-seasons 2023,2024,2025 --min-train-season 2021`
     (repeat for WR/TE/RB as relevant).
3. **Availability-touching changes** additionally run `just availability-backtest`
   and report both rate and availability MAE (#574). **L3 quantile changes**
   additionally report **interval coverage** (share of actuals inside P10–P90).
4. **Promotion bar.** A *significant* held-out win (CI excludes 0) over the active
   model on the **gated metric for that lever** — ρ for ordering-targeted levers
   (L1/L5), MAE for level-targeted ones — **and no significant regression on the
   other**. Point-estimate deltas are never a result.
5. **Confirmation discipline (#594).** Iterate on the rolling folds; the final
   window is confirmation-only — one look per experiment (garden-of-forking-paths:
   40+ looks at one window means it is no longer fully held out).

---

## Recommended sequencing (unchanged from the issue, now with L4 done)

1. ✅ **L4 gate** — *built + validated this spike.* Ranking signal is real and
   significant at QB; the MAE wall was a power artifact.
2. **L1 — xFP target** (`v42_xfp_base`). Highest leverage, same data, attacks
   QB + ordering. Gate on the L4 ρ metric. **Run first among modeling levers.**
3. **L3 — empirical-Bayes pooling** (`v43_eb_pooling`). Delivers L4 intervals,
   replaces hand-tuned shrinkage, supplies L1's TD-rate shrink primitive.
4. **Ensemble** — cheap baseline-raiser, run in parallel.
5. **L5 — QB-specific** — L1 focused where the gap is largest and most valuable.
6. **L2 — game-level** — biggest lift; only after L1/L4 prove the reframe pays.

**Position vs #651.** Keep coaching/contract acquisition, but **after** L1/L3/L4
— the wave proved same-data *features* are tapped on MAE, not that same-data
*target construction + metric choice* are tapped on **ranking**. Those are the
unexploited, free levers, and L4 just demonstrated the ordering gap they target
is real and measurable.

## Definition of done — status

- [x] **L4 decision/ranking metric decided + added to the harness as a reportable
      gate** — Spearman-ρ delta gate shipped (`significance.py --metric spearman`),
      tested, and validated (QB FP-vs-v33 significant, p=0.001). Top-N/decision
      metric + promote-policy doc update scoped as follow-up.
- [x] **L1 xFP-target prototype scoped** — inputs per position, TD-rate
      regression method, `weighted_xfp` base feature + `v42_xfp_base` model.
- [x] **L3 partial-pooling formulation scoped** — `μ_p = w_p y_p + (1−w_p) μ_g`,
      `w_p = n_p/(n_p+k_g)`, hierarchical prior, replaces `regression_to_mean`,
      yields posterior/quantiles.
- [x] **L2 feasibility note** — needs new `nfl_weekly_stats` table (only lever
      requiring ingestion); partial volume-only slice first; biggest lift.
- [x] **Each lever has a leakage-free rolling-origin + significance validation
      plan** — including the new dual-metric (MAE-guard + ρ-gate) promotion bar.

_Filed from spike #667. Built on the methodology audit, the rolling held-out
tables, and the #651 acquisition spike._
