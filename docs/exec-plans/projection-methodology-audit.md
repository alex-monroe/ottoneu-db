# Projection Methodology Audit (2026-06-08)

## Status: Active — remediation in progress

A data-science / ML-quality audit of the projection system: the feature
pipeline, the learned/residual combiners, the backtest harness, and the
experiment history recorded in
[experiment-log.md](../generated/experiment-log.md) and
[projection-accuracy.md](../generated/projection-accuracy.md).

The *engineering* is strong (composable features, a model registry, an
experiment log that records failures, pagination-correctness discipline, and a
genuinely sound two-stage residual design). The **evaluation methodology**,
however, has one structural flaw that undermines most model-selection
conclusions from `v20` onward, plus several secondary issues that make reported
gains look larger and more certain than they are.

This document is the system of record for the findings. Each finding has a
GitHub issue (linked below) for tracking remediation.

---

## 🔴 Finding 1 (Critical): train/test leakage in the headline accuracy numbers

**The headline `ALL MAE` for every learned/residual model (`v20`–`v31`) is
in-sample fit quality, not held-out accuracy.**

- `just train` defaults to `seasons="2021,2022,2023,2024,2025"`
  (`Justfile:122`).
- `just backtest` / `accuracy-report` default to
  `seasons="2022,2023,2024,2025"` (`Justfile:110,114`).
- The backtest (`scripts/feature_projections/backtest.py:62`) scores
  `model_projections` against actuals. For a learned model those projections
  come from coefficients fit on the **same** seasons being scored — the final
  fit in `train_ridge_loso` uses *all* data (`train_model.py:294-299`), and the
  saved coefficients then project every backtest season.

So the comparison table mixes in-sample scores (learned models `v20`–`v31`) and
genuinely out-of-sample scores (additive models `v1`–`v19`, which have no
learned parameters, and `external_fantasypros_v1`) in the same column and picks
winners from it.

**This is quantified in the log itself.** `v22` LOSO CV is `2.406` but its
reported backtest MAE is `2.380`; `v23` LOSO is `2.428`
([experiment-log.md](../generated/experiment-log.md), v23 row). That
~0.03–0.05 in-sample optimism is the *same order of magnitude as the entire
`v20`→`v31` "improvement" journey* (2.412 → 2.358 ≈ 0.054). The optimism grows
with model capacity (more features + interaction terms), so the leakage is
**correlated with the quantity being optimized** — it can reorder the ranking,
not just inflate it uniformly.

There is also an inconsistency in how the leakage was applied: the `/experiment`
skill trains on `2022,2023,2024` (leaving 2025 as a clean-ish holdout), while
the `Justfile` default and the `v31` retrain trained on all of 2021–2025. So
different experiment-log rows had different amounts of contamination.

**Remediation (this plan):**
1. **(shipped here)** Make the accuracy report honest: detect train/eval season
   overlap from each trained model's JSON, flag leaked models in the tables, and
   surface the out-of-sample **LOSO CV MAE** next to the in-sample backtest MAE
   so the optimism gap is visible. See `accuracy_report.py`
   `generate_leakage_section` / `--no-leakage-section`.
2. **(shipped, Finding 1b)** Adopt a fixed held-out window — train on ≤2023,
   evaluate 2024–2025 for *all* models (additive, learned, external) — so every
   model is judged on the same untouched data. See results below.

### Finding 1b result — held-out re-ranking (`just holdout-eval`, #572)

`scripts/feature_projections/holdout_eval.py` retrains every learned/residual
model on **2021–2023** (into a temp dir, so production JSONs and
`model_projections` are untouched) and scores **2024–2025** out-of-sample, with
additive/external models read from their already-held-out projections — all
through the identical `backtest_model` filter. Full table:
[projection-holdout-eval.md](../generated/projection-holdout-eval.md).

**The leaked ranking does not just compress — it inverts.** Combined held-out
ALL MAE (N≈635–647):

| | Leaked (in-sample) | Held-out (honest) |
|---|---|---|
| #1 model | `v31_depth_chart` 2.358 | `v14_qb_starter` (additive) **2.450** |
| `v31_depth_chart` rank | 1 / 30 | **22 / 30** (2.660) |
| Learned family (`v20`–`v31`) | top of table | **ranks 22–30 — the entire bottom** |
| `v1_baseline` | last | rank 21 (2.633) — beats every learned model |
| FantasyPros | mid-pack | rank 3 (2.462) |

Every additive model and FantasyPros beat every learned model out-of-sample.
The learned stack's apparent superiority was an artifact of train/test leakage.
Out of sample the learned models also carry a large **over-projection bias**
(−1.0 to −1.3 PPG vs additive ≈ −0.2), i.e. they systematically project too
high — they only "win" on R²/RMSE because they fit the variance shape while
being biased.

Nuance (don't over-read): the learned models *do* win **QB** MAE
(e.g. `v22` 3.589 vs `v14` 3.783), so the learned approach captures real
QB-specific signal; it is the aggregate, dominated by over-projection on
RB/WR/TE/K, that sinks them.

Caveats: under the clean protocol the learned models train on 3 seasons
(2021–2023) vs the 5 they used (with leakage) in production, and they score a
slightly smaller player set (N≈635 vs 647) due to advanced-feature
availability. A rolling-origin (expanding-window) protocol would be a fairer
next refinement. But the central conclusion is robust: **the promoted `v31` is
not the best model out-of-sample, and the learned-model ranking that justified
v20→v31 was driven by leakage.**

**Recommended actions (new follow-ups):** (a) **done** — prod reverted to the
additive `v14_qb_starter` (the honest OOS leader, far better calibrated);
(b) [#579](https://github.com/alex-monroe/ottoneu-db/issues/579) — before any
learned model is trusted/re-promoted, fix its out-of-sample over-projection bias
(recalibration) and re-evaluate via `just holdout-eval`, not the leaked
backtest.

### Rolling-origin protocol (`just holdout-eval --protocol rolling`, #594)

The fixed single-window holdout has two weaknesses the 2026-06 review flagged:
the same 2024–2025 window driving ≥6 planned experiments recreates the Finding 2
multiple-comparisons problem one floor up (the window stops being held out once
it drives many accept/reject decisions), and learned models train on only 3
seasons vs the 5 production would use (the caveat above). Both are fixed by an
**expanding-window (rolling-origin)** protocol:

```
just holdout-eval --protocol rolling --eval-seasons 2023,2024,2025 --min-train-season 2021
just significance NEW v14_qb_starter --protocol rolling --eval-seasons 2023,2024,2025 --min-train-season 2021
```

Each eval season is scored by models retrained on *only the seasons strictly
before it* (`train 2021,2022 → eval 2023`; `train 2021,2022,2023 → eval 2024`;
`train 2021,2022,2023,2024 → eval 2025`). Learned models therefore get a
growing, time-honest training window (5 seasons by the final fold); additive and
external models need no retraining (their projections already only use
prior-season data). The combined report rows pool every fold's player-seasons;
the per-season tables are the individual folds.

`significance.py` pools the paired errors across folds and **clusters the
bootstrap by player** — the same player appearing in 2024 and 2025 is one
correlated unit, not two independent rows, so the CI no longer narrows
artificially (review Finding C). The player-cluster bootstrap is now the default
for the fixed protocol too.

**Protocol for experiments (#587–#592):** iterate against the rolling folds; the
**final window (2025, then 2026 actuals when they arrive) is confirmation-only —
one look per experiment.** Promotion still requires a *significant* held-out win
over the active model (`just significance`), never a point-estimate delta.

---

## 🟠 Finding 2: backtest overfitting / multiple comparisons

31 model variants have been evaluated against the same four seasons (n≈154–274
each), and promote/verdict decisions are made on differences as small as 0.01
MAE (the `/experiment` `NEUTRAL` band is literally ±0.01). With that many looks
at one small dataset, some "winners" are sampling noise. No promotion decision
has been tested for significance.

**Remediation (shipped):** `scripts/feature_projections/significance.py`
(`just significance MODEL_A MODEL_B`) computes a paired bootstrap over players of
the held-out MAE difference, returning a 95% CI and a bootstrap p-value. A
difference counts as real only if the CI excludes zero. It reuses
`holdout_eval.gather_predictions`, so it tests the leakage-free out-of-sample
numbers by default.

### Finding 2 result — most historical "improvements" are within noise

Paired bootstrap on the held-out window (train 2021–2023, eval 2024–2025, ALL,
10k resamples):

| Comparison | ΔMAE (A−B) | 95% CI | Verdict |
|---|---|---|---|
| `v14_qb_starter` vs `v31_depth_chart` (new prod vs old) | −0.263 | [−0.40, −0.13] | **significant** — v14 better |
| `v14_qb_starter` vs `v19_usage_level_full` (held-out #1 vs #2) | −0.006 | [−0.028, +0.017] | not significant |
| `v22_advanced_receiving` vs `v27_vegas_full_refit` | −0.029 | [−0.079, +0.022] | not significant |

The promotion back to `v14` clears the bar (CI excludes 0, p≈0). But the
in-sample "improvements" the experiment log celebrated — e.g. advanced-receiving
→ draft-capital → Vegas, each worth ~0.01–0.03 MAE — are **not statistically
distinguishable** out-of-sample. Going forward, no model should be promoted on a
point-estimate delta that fails `just significance`.

---

## 🟠 Finding 3: survivorship/selection bias in the actuals (and it's circular)

The backtest only scores players with `games_played ≥ MIN_GAMES` (=4) in the
*target* season (`backtest.py:144`). Anyone who got hurt, benched, or busted out
of a role is dropped from the actuals. This (a) inflates every model's apparent
accuracy by removing the hardest cases, and (b) is self-defeating relative to
the roadmap: issue #384 (injury/availability, "24% of error budget") targets
exactly the population the evaluation filters out. You cannot measure progress
on availability while deleting unavailable players from the test set.

**Remediation (shipped):** `scripts/feature_projections/availability_backtest.py`
(`just availability-backtest`) keeps every non-rookie with ≥1 game and scores
each projection against two targets: **Rate** (actual PPG) and **Avail**
(production per scheduled game, `ppg × min(games,17)/17`, missed games = 0). The
gap is the **availability error budget**. Report:
[projection-availability-eval.md](../generated/projection-availability-eval.md).

### Finding 3 result — the availability budget is large, and the discarded feature was right

Combined 2022–2025, inclusive population (N=1069 internal, mean games **12.6** —
the average rostered player missed ~4 of 17 games):

| Model | Rate MAE | Avail MAE | Avail budget | Avail bias |
|---|---|---|---|---|
| `v7_regression_to_mean` (has `games_played`) | 2.652 | **3.096** | **+0.444** | −1.53 |
| `v4_availability_adjusted` (has `games_played`) | 2.673 | **3.106** | **+0.434** | −1.53 |
| `v14_qb_starter` (**production**) | 2.555 | 3.188 | +0.633 | −1.75 |
| `v1_baseline_weighted_ppg` | 2.693 | 3.510 | +0.817 | −2.24 |

Two findings:

1. **The availability budget is real and unmodeled.** Every internal model pays
   +0.43 to +0.82 MAE purely for ignoring playing-time loss — for production
   `v14`, +0.633, ≈20% of its availability-inclusive error (the audit's #384
   cited ~24%). It shows up as a large negative bias (systematic
   over-projection): a PPG rate projection assumes the player suits up.

2. **The feature the rate-only backtest discarded was measuring the right
   thing.** The `v3`–`v7` family carries a `games_played`/availability
   adjustment and was dropped because it *raised* rate MAE (see the v3–v6
   regression table above). On the availability target the ordering flips:
   `v4`/`v5`/`v7` have the **lowest** budget *and* the **lowest avail MAE**,
   beating both production `v14` and the naive `v1`. The feature traded a little
   rate accuracy for a lot of availability accuracy — value the rate-only metric
   was structurally blind to.

Caveats: this population (games ≥ 1) is harder than the standard report's
(games ≥ 4), so the MAE numbers are **not** comparable to
[projection-accuracy.md](../generated/projection-accuracy.md). QB avail figures
are extreme (the inclusive pool is dominated by 1–3 game backups). FantasyPros'
row (N=703, mean games 13.1) is scored on its own smaller, more-available
projected set, so its low budget is partly sample selection — don't read it as
"FP models availability." Players with literally 0 games (no stats row) are
still missing, so the true budget is a lower bound.

**Recommended follow-up:** revisit a `games_played`/availability feature
evaluated against the availability objective (ties directly to #384), and report
both rate and availability MAE for any future availability work via
`just availability-backtest`.

---

## 🟠 Finding 4: single benchmark, unfairly compared, missing naïve baselines

`external_fantasypros_v1` is the only external yardstick, it is evaluated
out-of-sample against in-sample internal models (Finding 1), and it is matched
on fewer players (n=103–187 vs 154–274) so the `ALL` rows are not even the same
sample. Cheap honest baselines are missing: prior-season PPG (naïve persistence)
and a per-position mean. Notably, `v1_baseline` is already within ~0.05 MAE of
the best "improved" model on most positions — the most under-discussed result in
the log.

**Remediation (shipped):** two baseline models — `naive_prior_season_ppg`
(next season = last season's PPG) and `position_mean_baseline` (everyone at the
positional mean) — are registered and now appear in every report. And
`just holdout-eval --matched` scores all models on the common player set for an
apples-to-apples FantasyPros comparison.

### Finding 4 result — the models barely clear "use last year," and FP ties when matched

Held-out 2024–2025 (`just holdout-eval`), the naïve baselines bracket the field:

| Model | Held-out ALL MAE | Note |
|---|---|---|
| `v14_qb_starter` (production) | **2.450** | best |
| `v1_baseline_weighted_ppg` (3-yr weighted) | 2.633 | rank 21 |
| learned family `v20`–`v31` | 2.65–2.73 | ranks 22–31 |
| **`naive_prior_season_ppg`** (persistence) | 2.754 | rank 32 |
| **`position_mean_baseline`** (no-skill) | 3.710 | rank 33 (floor) |

Two readings:

1. **The whole learned family barely beats persistence.** `v20`–`v31` (2.65–2.73)
   sit just above "use last year's PPG" (2.754) and *below* the 3-year weighted
   `v1` (2.633). All that feature engineering buys almost nothing over the
   simplest possible projection — the under-discussed result the audit flagged,
   now quantified against an explicit floor. `position_mean` (3.710) sets the
   no-skill floor; good models clear it by ~1.3 MAE and on R² (0.19 → 0.61),
   confirming they *do* rank players — they just don't beat persistence by much.
2. **FantasyPros ties the best internal models once the sample is matched.** The
   full report shows FP at rank 3 (2.462, N=430) vs internal (N=647) — different
   players. Restricted to the **common 416 players** (`--matched`,
   [projection-holdout-eval-matched.md](../generated/projection-holdout-eval-matched.md)),
   FP (2.502) is statistically tied with `v14` (2.494) and `v19` (2.501) — a gap
   far inside the bootstrap noise (Finding 2) — while still over-projecting
   (+1.0 bias). FP is neither clearly ahead nor behind; the earlier "mid-pack FP"
   impression was a sample artifact.

---

## 🟡 Finding 5: R² used as a cross-position / cross-season headline

R² depends on the variance of actuals within each slice, so comparing or
averaging it across positions and seasons conflates model skill with how
spread-out each group happened to be. K is correctly noted as "essentially
random" (R² ≈ −1) yet is still folded into `ALL R²`, and the combined report
already concedes R² is "indicative only" (`accuracy_report.py:190`).

**Remediation (shipped):** combined R² is no longer weight-averaged anywhere.

- Where raw residuals are available (`holdout_eval.py`, `availability_backtest.py`),
  the combined tables now **pool the raw (pred, actual) pairs across seasons and
  compute one R²** (`_combined_metrics` / `_combined_avail_metrics`) — the
  statistically correct combine. MAE/Bias/RMSE are unchanged by this (they're
  exact under N-weighting); only R² moves (e.g. `v14` combined held-out R²
  0.611 → 0.626).
- Where only cached per-slice metrics exist (`accuracy_report.py`'s All-Seasons
  table), a proper pooled R² can't be reconstructed, so combined **R² is omitted
  (—)** with a note, rather than printing a misleading weighted average. MAE/RMSE
  (exact under N-weighting) remain the combined headline.

Per-slice (per-season, per-position) R² is unchanged and still shown — those are
proper pooled-over-players values. R² is never averaged across positions.

`ALL` pools QB (~3.7 MAE) with K (~1.0 MAE), implicitly weighting by how many of
each position cleared the games filter that year — a mix that drifts season to
season (2022 n=154 vs 2024 n=274). A model that merely changes the position mix
of qualifiers can look like an accuracy gain.

**Remediation (shipped):** every report now shows a **position-balanced MAE**
alongside the pooled `ALL` — the unweighted mean of the per-position MAEs over a
fixed set (QB/RB/WR/TE; K excluded as essentially random and not projected by
every model, so it's comparable across models). `holdout_eval.py` and
`availability_backtest.py` add a `Bal MAE` column; `accuracy_report.py` adds a
Position-balanced ranking table.

### Finding 6 result — balanced metric confirms the leader and exposed a coverage confound

- On the **matched** held-out sample (same 416 players, the clean comparison),
  `v14` leads on **both** pooled (2.494) and balanced (2.564) MAE — the
  position-mix worry does not overturn the top of the board.
- In the **full** (unmatched) held-out report the two disagree: `v14` wins
  pooled (2.450) but FantasyPros wins balanced (2.544 vs `v14` 2.653). That flip
  is **not** real skill — it's FP's smaller, per-position-favourable coverage
  (N=430 vs 647), and it vanishes once players are matched. So the balanced
  metric and matched mode (#575) are complementary: balanced guards against
  position-mix gaming, matched guards against coverage gaming, and only together
  do they show `v14` robustly ahead.

Net: the balanced headline mostly **confirms** the pooled ranking here rather
than overturning it — which is the reassuring outcome — while making any future
mix-driven illusion visible at a glance.

---

## 🔬 Modeling follow-up (#579): recalibration ties `v14` but doesn't beat it — NEGATIVE RESULT

Finding 1b left a 🔴 follow-up: the learned models over-project out-of-sample
(bias −1.0 to −1.3) — recalibrate before re-promoting. A diagnostic settled it,
and the answer is a **negative result**: recalibration alone cannot make a
learned model beat the additive production model.

**Why they over-project.** The eval population's mean PPG swings from ~9.7 in the
training seasons (2021–2023) to ~7.0 in the held-out seasons (2024–2025) —
partly scoring environment, largely coverage (the qualifying N nearly tripled,
2022 N=154 → 2025 N=398, as more marginal players are tracked). A Ridge with a
global intercept (≈ mean training PPG) plus an amplified `regression_to_mean`
coefficient (1.46) pulling toward stale, high positional means **bakes in the
training-season scoring level**, which doesn't transfer to the lower-mean eval
population. The additive `v14` avoids this by anchoring each prediction to the
player's own recency-weighted PPG (which adapts per-season) and using small fixed
adjustment factors.

**The deficit is almost entirely correctable bias — but the ceiling is a tie.**
Held-out (train 2021–2023, eval 2024–2025):

| Model | Raw MAE | Raw bias | MAE after oracle de-bias |
|---|---|---|---|
| `v14_qb_starter` (additive, production) | 2.450 | −0.149 | 2.437 |
| `v20_learned_usage` | 2.683 | −1.060 | **2.465** |
| `v27_vegas_full_refit` (all features) | 2.707 | −1.066 | 2.512 |

Removing the systematic bias collapses `v20`'s gap to `v14` from 0.233 to **0.015
— a tie**, confirming the *ranking* is fine and only the *level* was wrong. But
even with an **oracle** de-bias (not achievable in practice), the learned models
only **match** `v14`; they never beat it. And `v27`, with the full
receiving/draft/Vegas feature set, de-biases *worse* than the minimal `v20`
(2.512 vs 2.465) — extra features add no out-of-sample value.

**Decision.** Keep `v14_qb_starter` in production. Pure recalibration is not
worth shipping (best case = parity with a simpler, already-deployed model).
Beating `v14` requires **better ranking signal or an orthogonal axis
(availability), not calibration** — which reframes the whole projection backlog
(see [the new experiment plan](projection-accuracy-improvement.md#experiment-backlog-post-audit-2026-06-10)).
The leakage-free tooling built for Findings 1b/2/3/6 (`just holdout-eval`,
`just significance`, `just availability-backtest`, `--matched`, balanced MAE) is
now the harness every new experiment must clear.

### Decision-relevant metrics: the v14-vs-field conclusion is metric-dependent (GH #598)

The held-out report and availability backtest now also report **per-position
Spearman ρ and top-N hit rate** (N≈12 QB/TE, 24 RB/WR — the starter pool the
projections actually feed via VORP/auction/keepers). This matters because #579
showed level and ordering dissociate: a model can win MAE while misranking the
starters. Re-reading the held-out 2024–2025 numbers under these metrics:

- **On MAE, `v14` leads; on within-position ordering, it does not.** FantasyPros
  has the best Spearman ρ at QB (0.80 vs v14 0.71), RB (0.83 vs 0.78) and TE
  (0.79 vs 0.75), and the over-projecting `v20_learned_usage` — which loses MAE
  badly (bias −1.3) — is essentially tied with `v14` on ρ and *ahead* on top-N
  hit rate at RB/WR. So the "v14 is the out-of-sample leader" conclusion is a
  **level (MAE) conclusion, not an ordering one.**
- **Implication for the backlog.** Because the consumers care about ordering and
  the top tier, the delta-anchored (#590) and QB-specific (#592) learned bets
  should be optimized and judged on **rank metrics**, not just MAE — a learned
  model that out-*ranks* `v14` could be worth promoting even at parity MAE. The
  headline ML conclusion (the leaked learned ranking was driven by leakage) is
  unchanged; what changes is the *target metric* for beating `v14`.

---

## What the audit found to be sound (keep doing)

- **Two-stage residual design (`v25`)** — freezing the base, `fit_intercept=False`
  on a sparse feature so zero-feature samples get a provably zero correction,
  with the v23 coefficient-drift diagnosis as motivation. Correct ML reasoning.
- **"When a full refit wins" follow-up (`v27`)** — dense feature + more data lets
  a joint fit recover trapped bias. Right nuance, evidence-driven.
- **Rookie exclusion** from cross-model comparison (`backtest.py:123-149`).
- **Honest negative results** logged (v3–v6, v13, v24 null, v30).
- **Pagination-correctness audits** (the systemic 1000-row cap work).
- **LOSO CV already exists** — Finding 1's reporting fix is a surfacing change,
  not new infrastructure.

---

## Remediation tracking

| Finding | Severity | Issue | Status |
|---|---|---|---|
| 1 — train/test leakage (report honesty) | 🔴 | [#571](https://github.com/alex-monroe/ottoneu-db/issues/571) | shipped in this PR |
| 1b — held-out evaluation window | 🔴 | [#572](https://github.com/alex-monroe/ottoneu-db/issues/572) | shipped (`just holdout-eval`); ranking inverts — see above |
| 2 — bootstrap significance on MAE deltas | 🟠 | [#573](https://github.com/alex-monroe/ottoneu-db/issues/573) | shipped (`just significance`); see Finding 2 result |
| (rec) recalibrate learned models before re-promotion | 🔴 | [#579](https://github.com/alex-monroe/ottoneu-db/issues/579) | closed — NEGATIVE RESULT (recalibration ties but can't beat `v14`); backlog re-planned |
| 3 — availability-inclusive evaluation | 🟠 | [#574](https://github.com/alex-monroe/ottoneu-db/issues/574) | shipped (`just availability-backtest`); see Finding 3 result |
| 4 — naïve baselines + matched-sample FP | 🟠 | [#575](https://github.com/alex-monroe/ottoneu-db/issues/575) | shipped (2 baseline models + `--matched`); see Finding 4 result |
| 5 — R² aggregation discipline | 🟡 | [#576](https://github.com/alex-monroe/ottoneu-db/issues/576) | shipped (pooled R² where possible, omitted where not) |
| 6 — position-balanced headline MAE | 🟡 | [#577](https://github.com/alex-monroe/ottoneu-db/issues/577) | shipped (`Bal MAE` in all reports); see Finding 6 result |
</content>
</invoke>
