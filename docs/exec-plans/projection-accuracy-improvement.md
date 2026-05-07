# Projection Accuracy Improvement Plan

## Status: Active

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

## Prioritized Backlog (2026-05-05)

Issue audit (2026-05-05) consolidated duplicates and ranked open work by impact × effort, weighted toward **early, season-long projection accuracy** (i.e., features knowable in the offseason are favored). Closed: #56, #58, #59, #60 (done or stale); #392 (dup of #376), #394 (dup of #378), #393 (split into #375 + #379).

### Tier 1 — Do first (high impact, low/medium effort)

| # | Title | Effort | Why first |
|---|---|---|---|
| [#380](https://github.com/alex-monroe/ottoneu-db/issues/380) | Backfill 2021 training season | medium | Enabler — raises feature-dimension ceiling for everything below |
| ~~[#376](https://github.com/alex-monroe/ottoneu-db/issues/376)~~ | ~~NFL draft capital~~ ✅ | low | v25_draft_capital_residual: ALL MAE 2.370 (current best), R² 0.575, vet predictions byte-identical to v22 |
| [#391](https://github.com/alex-monroe/ottoneu-db/issues/391) | Depth chart / offseason movement | medium | Directly targets early-season failure mode (team/role changes invisible to historical PPG) |
| ~~[#375](https://github.com/alex-monroe/ottoneu-db/issues/375)~~ | ~~Advanced receiving (target_share, air_yards, WOPR)~~ ✅ | low | v22_advanced_receiving: ALL MAE 2.380 (vs v20 2.412), R² 0.572, n=583 backtest seasons |
| ~~[#378](https://github.com/alex-monroe/ottoneu-db/issues/378)~~ | ~~Vegas implied team totals~~ ✅ | low | v27_vegas_full_refit: ALL MAE 2.458 (vs v25 2.551), R² 0.582, bias −0.041. 320 (team, season) rows from nflverse; replaces broken `team_context` |

### Tier 2 — Strong second wave (medium effort)

| # | Title | Effort | Notes |
|---|---|---|---|
| [#377](https://github.com/alex-monroe/ottoneu-db/issues/377) | Expand raw features + asymmetric regression fix | medium | Addresses +2.69 elite under-projection bias |
| [#379](https://github.com/alex-monroe/ottoneu-db/issues/379) | Red zone usage from PBP | medium | New pipeline cost; RB/TE TD signal |
| [#381](https://github.com/alex-monroe/ottoneu-db/issues/381) | LightGBM combiner | medium | Eliminates manual interaction terms; benefits from #380 |
| [#382](https://github.com/alex-monroe/ottoneu-db/issues/382) | Position-specific learned models | medium | Biggest QB win; benefits from #380 |

### Tier 3 — High impact but heavy

| # | Title | Effort | Notes |
|---|---|---|---|
| [#384](https://github.com/alex-monroe/ottoneu-db/issues/384) | Injury availability model | high | 24% of error budget; two-stage modeling, possibly new data |
| [#383](https://github.com/alex-monroe/ottoneu-db/issues/383) | Stacked ensemble | medium | Worth most after #381 + #382 land |

### Tier 4 — Defer

| # | Title | Effort | Notes |
|---|---|---|---|
| [#387](https://github.com/alex-monroe/ottoneu-db/issues/387) | Coaching/scheme change detection | high | Vegas (#378) captures most of the same signal more efficiently |
| [#386](https://github.com/alex-monroe/ottoneu-db/issues/386) | Transfer learning weekly→season | high | Requires weekly data pipeline; high complexity |
| [#385](https://github.com/alex-monroe/ottoneu-db/issues/385) | Bayesian hierarchical model | high | Small MAE gain; main value is decision-quality intervals |

Issues are labeled `priority:p1`–`priority:p4` and `effort:low/medium/high` on GitHub.

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
