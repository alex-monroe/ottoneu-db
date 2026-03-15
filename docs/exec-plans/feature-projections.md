# Feature-Based Player Projection System

## Status: Phase 1-2 Complete (Foundation + Framework)

## Overview

Iterative, ML-like framework for building PPG projections from composable features. Each feature computes a PPG-scale value, and a combiner aggregates them into a final projection. Models are versioned and tracked in the database so accuracy can be compared across model versions.

## Architecture

```
scripts/feature_projections/
  features/
    base.py              # ProjectionFeature ABC
    weighted_ppg.py      # Port of existing WeightedAveragePPG + RookieTrajectoryPPG
    age_curve.py         # Positional age curve from birth_date
    stat_efficiency.py   # Per-stat projection from nfl_stats → PPG
    games_played.py      # Availability/durability adjustment
    team_context.py      # Team offense quality adjustment
    usage_share.py       # Target/touch/attempt share projection
  combiner.py            # Weighted addition of feature outputs → final PPG
  model_config.py        # Model definitions (v1-v6)
  runner.py              # Generate projections, upsert to model_projections
  backtest.py            # Compare to actuals, store in backtest_results
  promote.py             # Copy model_projections → player_projections
  cli.py                 # CLI: run, backtest, compare, promote, list
```

## Database Tables

- `projection_models` — Model registry (name, version, features, config)
- `model_projections` — Per-model projections (model_id × player_id × season)
- `backtest_results` — Cached accuracy metrics (model_id × season × position)

## Models (v1-v6)

| Model | Features | Description |
|-------|----------|-------------|
| v1_baseline_weighted_ppg | weighted_ppg | Exact port of existing system (control baseline) |
| v2_age_adjusted | + age_curve | Positional aging adjustment |
| v3_stat_weighted | + stat_efficiency | Per-stat projection from nfl_stats |
| v4_availability_adjusted | + games_played | Injury/availability discount |
| v5_team_context | + team_context | Team offensive quality boost/penalty |
| v6_usage_share | + usage_share | Target/touch share trend |

## Frontend

The `/projection-accuracy` page has a model selector dropdown. When a model is selected, backtest data comes from `model_projections` instead of `player_projections`.

## Adding a New Feature

1. Create `scripts/feature_projections/features/your_feature.py` (implement `ProjectionFeature`)
2. Register in `features/__init__.py` FEATURE_REGISTRY
3. Write tests in `scripts/tests/test_feature_projections.py`
4. Define new model in `model_config.py`
5. Run: `python scripts/feature_projections/cli.py run --model vX --seasons 2024,2025`
6. Backtest: `python scripts/feature_projections/cli.py backtest --model vX --test-seasons 2024`
7. Compare: `python scripts/feature_projections/cli.py compare --models v1_baseline_weighted_ppg,vX --season 2024`
8. Promote if better: `python scripts/feature_projections/cli.py promote --model vX`

## Next Steps

- **Phase 3**: Run models v1-v6, backtest, compare accuracy by position
- **Phase 4**: Model comparison UI (side-by-side metrics, feature value breakdown)
- **Phase 5**: Production integration (promote command, update downstream pipeline)
