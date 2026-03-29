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

## Current Accuracy (All Seasons Combined, ALL positions)

| Model | MAE | R² | Bias |
|-------|-----|-----|------|
| `v1_baseline` | 2.666 | 0.472 | -0.389 |
| `v2_age_adjusted` | 2.584 | 0.499 | -0.120 |
| v3-v6 | 2.95–4.01 | degrades | — |
| `v8_age_regression` | 2.530 | 0.522 | +0.075 |
| **`v12_no_qb_trajectory`** | **2.525** | **0.526** | **+0.103** |
| `v14_qb_starter` | 2.515 | 0.542 | +0.170 |
| **`v20_learned_usage`** | **2.412** | **0.577** | **-0.026** |
| FantasyPros | 2.607 | 0.561 | +1.317 |

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

### Elite Consistency Feature (GH #305)

Segment analysis showed elite players (top 12 at position) are under-projected
by ~2.6 PPG across all models.  The `elite_consistency` feature identifies
players whose worst qualifying season (2+ seasons, 6+ games) still exceeds
the positional starter floor, and applies a positive boost:

```
delta = (min_ppg - starter_floor) * 0.50 * consistency_multiplier
```

Where `consistency_multiplier = clamp(1.0 - ppg_std/min_ppg, 0.5, 1.0)`.
Boost is capped at 3.0 PPG.  Asymmetric — never penalises non-qualifying
players.

Result: elite bias +2.632 → +2.112 (v22 vs v8), R² 0.216 → 0.246.
Bench/starter tiers minimally affected.  The remaining ~2.1 bias is inherent
to the base weighted_ppg feature under-projecting elite production, not
recoverable by an additive adjustment alone.

**Guideline:** When adding a new adjustment to the projection pipeline:
1. Check whether the signal is already partially captured by existing features
   (age_curve, regression_to_mean, snap trajectory)
2. Test multiplicative vs additive formulations — multiplicative compounds,
   additive is safer
3. Use `segment-analysis --segments experience` to isolate the target population
   before and after the change
4. If the raw effect is < 5%, dampen it (e.g., 50% scaling) to account for
   overlap with existing features

---

## Key Files

| File | Role |
|------|------|
| `scripts/feature_projections/model_config.py` | Model definitions — every new model registered here |
| `scripts/feature_projections/combiner.py` | Additive feature combination logic |
| `scripts/feature_projections/learned_combiner.py` | Learned combiner — Ridge regression with interaction terms (GH #367) |
| `scripts/feature_projections/train_model.py` | Training script for learned models with LOSO cross-validation |
| `scripts/feature_projections/features/weighted_ppg.py` | Base feature — recency weights and rookie trajectory |
| `scripts/feature_projections/features/age_curve.py` | Best adjustment feature — parameter tuning target |
| `scripts/feature_projections/backtest.py` | Validation framework for measuring all changes |
| `scripts/feature_projections/accuracy_report.py` | Comparison table generation |
| `scripts/feature_projections/features/__init__.py` | Feature registry — add new features here |
