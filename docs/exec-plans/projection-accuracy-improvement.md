# Projection Accuracy Improvement Plan

## Status: Active

> ⚠️ **Read first:** [projection-methodology-audit.md](projection-methodology-audit.md)
> (2026-06-08) found that the headline `ALL MAE` for learned models (`v20`–`v31`)
> in the tables below is **in-sample** (trained on the seasons it is scored on),
> so the cross-model ranking is not trustworthy as stated. A clean held-out
> re-ranking (`just holdout-eval`, train ≤2023 / eval 2024–2025) **inverts the
> order**: the promoted `v31` falls to rank 22/30 and the entire learned family
> (`v20`–`v31`) lands at the bottom, beaten by every additive model, by the naive
> `v1` baseline, and by FantasyPros — see
> [projection-holdout-eval.md](../generated/projection-holdout-eval.md). Treat the
> in-sample tables below as **not** a valid model ranking. Tracking issues:
> #571–#577.

---

## Diagnosis: Why v3-v6 Features Degrade Accuracy

Our best internal model (`v2_age_adjusted`, MAE 2.615, R² 0.489) is close to FantasyPros (MAE 2.607, R² 0.561) on aggregate MAE but significantly behind on R². Every feature added after `age_curve` (v3-v6) **degrades** accuracy. Root causes:

| Feature | Impact | Root Cause |
|---------|--------|------------|
| `stat_efficiency` (v3) | +0.34 MAE | Redundantly re-derives PPG from component stats with slightly different recency weights, capturing noise not signal |
| `games_played` (v4) | Negligible MAE change, R² drops | Double-counts injury discounting already embedded in base feature's `games_played/17` scaling |
| `team_context` (v5) | +0.47 MAE | Uses player's *current* team with *historical* ratings — wrong for team-changers. Also applies to kickers where team offense is irrelevant |
| `usage_share` (v6) | +0.96 MAE, R² → -0.87 | Extrapolates noisy share trends with oversized scaling (0.5×), amplifying small fluctuations into huge PPG swings |

### Key Insight

The combiner stacks features additively. When a feature adds noise (even small), it compounds with other noisy features. This explains why v3 alone might be marginal but v3+v4+v5+v6 is catastrophic.

---

## Current Accuracy (All Seasons Combined, ALL positions, n=844 across 2022–2025)

| Model | MAE | R² | Bias |
|-------|-----|-----|------|
| `v1_baseline` | 2.671 | 0.472 | -0.379 |
| `v2_age_adjusted` | 2.587 | 0.499 | -0.110 |
| v3-v6 | 2.95–4.01 | degrades | — |
| `v8_age_regression` | 2.534 | 0.521 | +0.084 |
| `v14_qb_starter` | 2.519 | 0.541 | +0.179 |
| `v20_learned_usage` | 2.566 | 0.547 | -0.483 |
| `v22_advanced_receiving` | 2.551 | 0.534 | -0.601 |
| `v23_draft_capital` (full refit) | 2.535 | 0.557 | -0.437 |
| `v25_draft_capital_residual` | 2.551 | 0.534 | -0.627 |
| `v26_vegas_residual` | 2.530 | 0.537 | -0.647 |
| **`v27_vegas_full_refit`** | **2.458** | **0.582** | **-0.041** |
| FantasyPros | 2.544 | 0.584 | +1.299 |

`v27` is the new best across every metric — it pushes MAE below v25 by 0.093 and shrinks bias from -0.627 to -0.041 (six-fold reduction). It also wins every position vs v25 (QB -0.084, RB -0.105, WR -0.171, K -0.117; TE flat). Counter-intuitively, the v23-style full refit *did not* repeat the vet-regression problem: vet-heavy WR is the biggest winner. v26 (Vegas as residual on top of v25) only marginally improves MAE — see Lessons Learned below. The full per-position breakdown lives in [docs/generated/projection-accuracy.md](../generated/projection-accuracy.md).

---

## Improvement Phases

### Phase 1: Quick Wins

Tune existing model parameters and add simple features. Expected: MAE ~2.50, R² ~0.52.

- [#271](https://github.com/alex-monroe/ottoneu-db/issues/271) — ~~Tune base feature recency weights~~ ✅
- [#272](https://github.com/alex-monroe/ottoneu-db/issues/272) — ~~Tune age curve parameters via grid search~~ ✅ (MAE 2.615→2.584, R² 0.489→0.499)
- [#273](https://github.com/alex-monroe/ottoneu-db/issues/273) — Add regression-to-positional-mean feature
- [#276](https://github.com/alex-monroe/ottoneu-db/issues/276) — Per-player backtest diagnostics

### Phase 2: Position-Specific Models

Different features per position. Expected: further MAE improvement.

- [#277](https://github.com/alex-monroe/ottoneu-db/issues/277) — ~~Position-specific model configurations~~ ✅ (v9_pos_specific: QB/K use weighted_ppg only, RB/TE add age_curve, WR/fallback uses all three)

### Phase 3: Fix Broken Features

Repair v3-v6 features so they contribute positively.

- [#278](https://github.com/alex-monroe/ottoneu-db/issues/278) — ~~Fix stat_efficiency~~ ✅ (v10: rate-based efficiency deltas)
- [#279](https://github.com/alex-monroe/ottoneu-db/issues/279) — ~~Fix team_context~~ ✅ (v11: K exclusion, position-specific scaling 0.02-0.05, historical team tracking via `nfl_stats.recent_team`, team-change dampening. Neutral to v8: MAE 2.535 vs 2.530)
- [#280](https://github.com/alex-monroe/ottoneu-db/issues/280) — Test snap_trend feature
- [#281](https://github.com/alex-monroe/ottoneu-db/issues/281) — ~~Improve rookie projection~~ ✅ (v12: disabled H2/H1 snap trajectory for QB and K. v17: added position-specific rookie growth curves computed from 2018-2025 data (WR 1.04, RB 1.047, TE 1.051, QB 0.95) and small-sample blending for <4 game rookies. Growth delta applied only when snap data absent; dampened 50%. Neutral to v14 overall (ALL MAE 2.516 vs 2.515); existing age_curve + regression_to_mean already capture most rookie growth signal. Analysis script `analyze_rookie_growth.py` added for future tuning. Draft capital deferred — no data source.)

### Phase 4: New Data & ML

New data sources and learned models. Expected: MAE < 2.3, R² > 0.60.

- [#283](https://github.com/alex-monroe/ottoneu-db/issues/283) — Stacked ensemble with learned weights (scaffolding via #367)
- [#284](https://github.com/alex-monroe/ottoneu-db/issues/284) — ADP integration as projection signal
- [#285](https://github.com/alex-monroe/ottoneu-db/issues/285) — ~~Fix usage_share: complete rethink~~ ✅ (v19: level-based, neutral MAE, best RMSE/bias)
- [#367](https://github.com/alex-monroe/ottoneu-db/issues/367) — ~~Usage share as ML ensemble input~~ ✅ (v20: Ridge regression with interaction terms. ALL MAE 2.412, R² 0.577, bias -0.026. Beats v14 on all metrics and FantasyPros on MAE+bias. Introduces sklearn, learned combiner, LOSO CV scaffolding for future #283 work.)
- [#304](https://github.com/alex-monroe/ottoneu-db/issues/304) — ~~Bench-tier mean-reversion~~ ✅ (v21: tiered regression with negative factors for below-mean players. Bench bias -1.274→-0.866, starter/elite unchanged. Further improvement likely requires variance-aware or learned approaches.)
- [#375](https://github.com/alex-monroe/ottoneu-db/issues/375) — ~~Advanced receiving metrics~~ ✅ (v22: target_share, air_yards_share, wopr, racr from nflverse for WR/TE only. ALL MAE 2.380, WR MAE 2.336→2.185 vs v20.)
- [#376](https://github.com/alex-monroe/ottoneu-db/issues/376) — ~~NFL draft capital~~ ✅ (Two iterations: v23 full refit hit a vet-regression problem; v25 two-stage residual fixed it. ALL MAE 2.370, current best.)
- [#378](https://github.com/alex-monroe/ottoneu-db/issues/378) — ~~Vegas implied team totals~~ ✅ (Two variants: v26 stacked-residual on v25 [neutral, −0.021 MAE]; **v27 full refit including draft + Vegas [BEST: ALL MAE 2.458, R² 0.582, bias −0.041]**. Source: nflverse `games.csv` aggregated to per-team season implied points; PFR is now Cloudflare-walled.)

---

## Experiment Backlog (post-audit 2026-06-10)

> The pre-audit backlog below this was **invalidated** by the
> [methodology audit](projection-methodology-audit.md). Its ranking was built on
> leaked, in-sample numbers; the held-out re-ranking inverted it (every learned
> model `v20`–`v31` fell below the additive `v14`), and the `#579` diagnostic
> showed recalibration can only *tie* `v14`, while adding features (`v27`) made
> out-of-sample accuracy *worse*. So "add more features / fancier learned models"
> is the wrong direction. The pre-audit issues (#377, #379, #381–#387, #570) are
> **closed**. The new backlog is grounded in the honest held-out evidence and
> every item must clear `just holdout-eval` + `just significance` (not the leaked
> backtest).

**Active model: `v14_qb_starter`** (additive — the honest out-of-sample leader).

### Priority 1 — Orthogonal axis (the real opportunity)

| # | Experiment | Why |
|---|---|---|
| [#587](https://github.com/alex-monroe/ottoneu-db/issues/587) | Availability / expected-games model | Availability is a large *unmodeled* budget (+0.633 MAE / ~20% for `v14`, Finding 3) and is **orthogonal** to rate accuracy where `v14` is near a ceiling. Highest-value direction. |

### Priority 2 — Honest re-validation (cheap, high information)

| # | Experiment | Why |
|---|---|---|
| [#588](https://github.com/alex-monroe/ottoneu-db/issues/588) | Honest feature ablation under the held-out harness | Every feature was validated on leaked data; `v27` (all features) de-biases *worse* than minimal `v20`. Prune, don't add. |
| [#589](https://github.com/alex-monroe/ottoneu-db/issues/589) **(blocked on [#595](https://github.com/alex-monroe/ottoneu-db/issues/595))** | Tune the base `weighted_ppg` — on the **inner folds**, confirm once on the held-out window | `v14` ≈ base + tiny adjustments; the base does ~all the work and is the highest-leverage target. Must use the honest tuning protocol (`tuning_protocol.py`) — tuning directly on the held-out window would burn it (Finding A). |

### Priority 3 — Bounded recalibration / ranking experiments

> **Re-scoped 2026-06-10 after the #599 backfill.** Fixing the 2021–2023 coverage
> bug removed the learned models' over-projection bias and lifted the whole family
> back to parity with `v14` out-of-sample (v31 #1 by 0.020 MAE, *not* significant).
> So #590/#592 are now bets on a **calibrated, competitive** learned base rather
> than a discredited one, and **#591 is moot** — the "level mismatch" it set out to
> fix was the coverage artifact, now corrected.

| # | Experiment | Why |
|---|---|---|
| [#590](https://github.com/alex-monroe/ottoneu-db/issues/590) | Delta-anchored learned model | Anchor to the per-player base for robustness; now starting from a learned family that already ties `v14` post-backfill — aim for a *significant* held-out win. |
| [#592](https://github.com/alex-monroe/ottoneu-db/issues/592) | QB-specific anchored model | QB is where learned has the clearest edge; per-position significance on the corrected population. |
| ~~[#591](https://github.com/alex-monroe/ottoneu-db/issues/591)~~ **moot** | ~~Training-window recalibration (level-matched 2018–2020)~~ | The level mismatch was the #599 coverage bug (2021–2023 under-ingested), not a real scoring-environment shift. Now that all seasons are ~6.2 mean, a wider/level-matched window has no recalibration premise. |

Deferred (not in the accuracy plan): uncertainty-aware/Bayesian intervals (a separate decision-quality value prop, not point-MAE).

---

## Pre-audit backlog (2026-05-05) — SUPERSEDED, kept for history

_The ranking and "current best" claims below are in-sample and **not valid** — see the audit. All issues here are closed._

### Tier 1 — Do first (high impact, low/medium effort)

| # | Title | Effort | Why first |
|---|---|---|---|
| ~~[#380](https://github.com/alex-monroe/ottoneu-db/issues/380)~~ | ~~Backfill 2021 training season~~ ✅ | medium | Enabler — backfilled `player_stats` 2018–2020, added 2021 + 2025 as training seasons |
| ~~[#376](https://github.com/alex-monroe/ottoneu-db/issues/376)~~ | ~~NFL draft capital~~ ✅ | low | v25_draft_capital_residual (in-sample numbers — not OOS-validated) |
| ~~[#391](https://github.com/alex-monroe/ottoneu-db/issues/391)~~ | ~~Depth chart / offseason movement~~ ✅ | medium | v31_depth_chart (in-sample) |
| ~~[#375](https://github.com/alex-monroe/ottoneu-db/issues/375)~~ | ~~Advanced receiving~~ ✅ | low | v22_advanced_receiving (in-sample) |
| ~~[#378](https://github.com/alex-monroe/ottoneu-db/issues/378)~~ | ~~Vegas implied team totals~~ ✅ | low | v27_vegas_full_refit (in-sample) |

### Tiers 2–4 (all closed post-audit)

#377, #379, #381, #382, #383 (learned-model expansion — superseded by #588/#590/#592; learned approach only ties `v14` OOS); #384 (injury — superseded by #587); #570 (expand 2016–2020 — superseded by #591); #385/#386/#387 (deferred/closed).

---

## Verification

Every change measured via:
```bash
python scripts/feature_projections/accuracy_report.py --run-backtest --seasons 2022,2023,2024,2025 --output docs/generated/projection-accuracy.md
```

### Success Criteria

| Phase | MAE Target | R² Target |
|-------|-----------|-----------|
| Phase 1-2 | < 2.607 (beat FP) | > 0.53 |
| Phase 3 | < 2.50 | > 0.56 (match FP) |
| Phase 4 | < 2.30 | > 0.60 (beat FP) |

---

## Lessons Learned

### Feature interaction effects (from #281 rookie growth)

New features that modify the base PPG can **compound** with existing features in
unexpected ways. During the v17 rookie growth work, a multiplicative growth
ratio (×1.04) applied on top of the snap trajectory factor caused systematic
over-projection because the snap trajectory already captured within-season
momentum. The fix was to make the growth delta **additive and conditional** —
only applied when snap data is absent.

### Asymmetric regression effect (from #304 bench-tier bias)

The `regression_to_mean` feature pulls all players toward the positional mean
with a uniform factor (0.12). For **above-mean** players this pulls projections
*down* (corrective). For **below-mean** players it pulls projections *up* —
which *increases* over-projection for bench-tier players who are already
systematically projected too high.

"Stronger regression" means opposite things depending on which side of the mean
a player sits:
- Above mean: stronger → more pull down → reduces elite under-projection ✓
- Below mean: stronger → more pull up → worsens bench over-projection ✗

The fix (v21_tiered_regression) uses **negative factors** for below-mean
players, actively pulling projections *down*. Three-zone approach:
- Above mean: +0.12 (standard)
- Floor to mean: -0.05 (mild downward)
- Below starter floor: -0.20 (strong downward)

Result: bench-tier bias -1.274 → -0.866 (32% improvement), starter/elite
essentially unchanged.

**Guideline:** When adding a new adjustment to the projection pipeline:
1. Check whether the signal is already partially captured by existing features
   (age_curve, regression_to_mean, snap trajectory)
2. Test multiplicative vs additive formulations — multiplicative compounds,
   additive is safer
3. Use `segment-analysis --segments experience` to isolate the target population
   before and after the change
4. If the raw effect is < 5%, dampen it (e.g., 50% scaling) to account for
   overlap with existing features

### Full ridge refit vs two-stage residual (from #376 draft capital)

When a new feature only carries signal for a minority subset (e.g., draft
capital is identically 0 for 4+-year veterans), refitting the entire learned
model is risky. v23 added `draft_capital_raw` and re-fit the full ridge on all
583 player-seasons; the new feature's coefficient was nominally what we
expected, **but unrelated coefficients also shifted** (`weighted_ppg` 4.76→4.07,
`regression_to_mean` 1.09→0.74) to absorb the now-explained rookie variance.
Result: vets — for whom the new feature is exactly 0 — still saw their
predictions drift, and LOSO CV regressed (2.406 → 2.428).

The fix (v25) was a **two-stage residual**:
- Freeze the previous best model (v22) as the base.
- Fit a tiny ridge on `(actual − base_pred)` using only the new feature(s)
  and only on samples where the feature is meaningful
  (`seasons_since_draft ≤ 3`).
- Use `fit_intercept=False` so a sample whose residual feature values are all
  zero contributes exactly zero — those samples receive byte-identical base
  predictions.

The residual model JSON embeds the base model's params under
`base_model_params` so deployment stays single-file. Result: all-seasons MAE
2.380 → 2.370 with provable veteran stability and no upstream coefficient
drift.

**Guideline:** Prefer a two-stage residual when:
- The new feature is informative for a minority of samples and zero/missing
  for the rest.
- You want to ship the new feature without risking regressions in the
  unaffected cohort.
- Retraining the base independently (e.g., with new training-season data)
  shouldn't invalidate the residual; the residual remains valid as long as
  the base predictions don't change.

Caveats:
- The residual gives up the bias-correction that a joint refit can provide
  (v23's all-seasons bias was -0.026 vs v25's -0.191).
- The base remains fixed: if the base itself has issues on the residual's
  target subset, the residual can mask but not repair them.

### When a full refit *does* win (from #378 Vegas)

v27 refit the full ridge on v22's features + `draft_capital_raw` +
`implied_team_total_raw` and beat v25 by 0.093 MAE — without the v23-style
vet regression. Two factors flipped the outcome:

1. **Vegas is dense.** Unlike `draft_capital_raw` (zero for 4+-year vets),
   `implied_team_total_raw` is non-zero for every player. The ridge has a
   real feature distinguishing vets-on-good-offenses from vets-on-bad-ones,
   so it doesn't have to drift `weighted_ppg` to absorb variance the model
   couldn't otherwise explain.
2. **More training data.** The 2026-05 backtest spans 844 player-seasons
   vs the 583 v23 was trained on; coefficient drift shrinks with sample
   size.

**Refined guideline:** Two-stage residual remains the safe default when
the new feature is sparse *and* the dataset is small. Once at least one
**dense** new feature lands and the training set has grown, a full refit
is worth retrying — the joint fit can recover bias that a frozen base
keeps trapped (v25 bias -0.627 → v27 -0.041).

### Graceful degradation when Vegas data is missing

Sportsbook **win totals** are published in March/April but per-game
spread/total lines (which `implied_total` is derived from) require the
NFL schedule, typically released in mid-May. For a few weeks every
spring `team_vegas_lines` may carry `win_total` while `implied_total`
is `NULL`. A 2026 row was seeded on 2026-05-07 with this shape.

The `implied_team_total_raw` feature is **centered** against each
season's league mean (so the average value is ≈ 0). When inference
encounters a player on a team with no `implied_total`, the feature
returns `None`, the learned combiner substitutes `0.0` in the feature
vector, the scaler normalizes that to roughly `-mean/scale ≈ 0`, and
the position-conditional vegas coefficients add a near-zero PPG delta.
**v27 with no `implied_total` collapses to roughly v23 behavior**
(full refit minus the vegas signal): ALL MAE 2.535 / R² 0.557 /
bias -0.437.

So if you need season-projection accuracy *before* the schedule drops
each spring, v27 stays the right active model — its preseason output
without vegas is still better than v25 (2.551). Once
`backfill_vegas_lines.py` runs after schedule release and populates
`implied_total`, v27 picks up its full -0.093 MAE edge automatically
(`run --model v27_vegas_full_refit --seasons {season}` re-projects
with the now-present feature).

---

## Key Files

| File | Role |
|------|------|
| `scripts/feature_projections/model_config.py` | Model definitions — every new model registered here |
| `scripts/feature_projections/combiner.py` | Additive feature combination logic |
| `scripts/feature_projections/learned_combiner.py` | Learned (`combine_features_learned` / `predict`) and residual (`combine_features_residual` / `predict_residual`) combiners — Ridge with interactions (#367, #376) |
| `scripts/feature_projections/train_model.py` | Training: `train_ridge_loso` for full-refit learned models, `train_ridge_residual` for two-stage residuals (#376) |
| `scripts/feature_projections/features/weighted_ppg.py` | Base feature — recency weights and rookie trajectory |
| `scripts/feature_projections/features/age_curve.py` | Best adjustment feature — parameter tuning target |
| `scripts/feature_projections/features/advanced_receiving.py` | Target share / air-yards share / WOPR / RACR for WR/TE (#375) |
| `scripts/feature_projections/features/draft_capital.py` | Log-scaled overall pick, first 3 NFL seasons, 0 for vets (#376) |
| `scripts/feature_projections/features/vegas_team_total.py` | Vegas implied team total centered vs season league mean (#378) |
| `scripts/feature_projections/backtest.py` | Validation framework for measuring all changes |
| `scripts/feature_projections/accuracy_report.py` | Comparison table generation |
| `scripts/feature_projections/features/__init__.py` | Feature registry — add new features here |
| `scripts/backfill_draft_capital.py` | nflverse → `draft_capital` table loader (#376) |
| `scripts/backfill_vegas_lines.py` | nflverse `games.csv` → `team_vegas_lines` table loader (#378) |
