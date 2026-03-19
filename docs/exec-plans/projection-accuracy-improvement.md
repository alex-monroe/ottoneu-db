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
- [#281](https://github.com/alex-monroe/ottoneu-db/issues/281) — ~~Improve rookie projection~~ ✅ (v12: disabled H2/H1 snap trajectory for QB and K. A first-year QB taking over mid-season has an inflated H2/H1 snap ratio that reflects role acquisition, not future performance signal. First-year QBs/Ks now use raw season PPG. MAE 2.530→2.525, R² 0.522→0.526; K improves meaningfully, QB neutral)

### Phase 4: New Data & ML

New data sources and learned models. Expected: MAE < 2.3, R² > 0.60.

- [#283](https://github.com/alex-monroe/ottoneu-db/issues/283) — Stacked ensemble with learned weights
- [#284](https://github.com/alex-monroe/ottoneu-db/issues/284) — ADP integration as projection signal
- [#285](https://github.com/alex-monroe/ottoneu-db/issues/285) — Fix usage_share: complete rethink

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

## Key Files

| File | Role |
|------|------|
| `scripts/feature_projections/model_config.py` | Model definitions — every new model registered here |
| `scripts/feature_projections/combiner.py` | Feature combination logic — needs changes for position-specific + ensemble |
| `scripts/feature_projections/features/weighted_ppg.py` | Base feature — recency weights and rookie trajectory |
| `scripts/feature_projections/features/age_curve.py` | Best adjustment feature — parameter tuning target |
| `scripts/feature_projections/backtest.py` | Validation framework for measuring all changes |
| `scripts/feature_projections/accuracy_report.py` | Comparison table generation |
| `scripts/feature_projections/features/__init__.py` | Feature registry — add new features here |
