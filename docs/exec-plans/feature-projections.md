# Feature-Based Player Projection System

## Status: Complete (Phases 1–3) | Phase 4 Deferred

---

## Overview

Iterative, ML-like framework for building PPG projections from composable features. Each feature computes a PPG-scale value, and a combiner aggregates them into a final projection. Models are versioned and tracked in the database so accuracy can be compared across model versions.

---

## Architecture

```
scripts/feature_projections/
  features/
    base.py                  # ProjectionFeature ABC
    weighted_ppg.py          # Port of existing WeightedAveragePPG + RookieTrajectoryPPG; also WeightedPPGNoQBTrajectoryFeature
    age_curve.py             # Positional age curve from birth_date
    stat_efficiency.py       # Per-stat projection from nfl_stats → PPG
    games_played.py          # Availability/durability adjustment
    team_context.py          # Team offense quality adjustment
    usage_share.py           # Target/touch/attempt share projection
    qb_starter_usage.py      # Manual QB starter-vs-backup designation (v14+)
    regression_to_mean.py    # Tiered mean-reversion (v8, v21 negative-factor variant)
    snap_trend.py            # Snap-share trajectory adjustment
    advanced_receiving.py    # target_share, air_yards_share, wopr, racr from nflverse (v22)
    draft_capital.py         # NFL draft round/overall pick as a raw feature (v23/v25/v27)
    vegas_team_total.py      # Preseason Vegas implied team total as a raw feature (v26/v27)
  external_sources/
    fantasypros_fetcher.py   # Scrape FP consensus projections
    scoring.py               # Stat-line → Ottoneu PPG
    player_matcher.py        # Fuzzy name matching to players table
    ingest_external.py       # Register + upsert external model
  trained_models/            # JSON artifacts for learned (Ridge) models (v20+, v22, v23, v25, v26, v27)
  combiner.py                # Weighted addition of feature outputs → final PPG
  learned_combiner.py        # Ridge combiner used by learned (v20+) models
  model_config.py            # Model registry (v1–v27 internal + external)
  runner.py                  # Generate projections, upsert to model_projections
  backtest.py                # Compare to actuals, store in backtest_results
  accuracy_report.py         # Markdown comparison table across all models/seasons
  promote.py                 # Copy model_projections → player_projections (also deletes prior non-college rows per season to prevent ghost rows)
  train_model.py             # Fit Ridge coefficients via LOSO CV → trained_models/*.json
  diagnostics.py             # Per-player backtest diagnostics
  segment_analysis.py        # Segmented accuracy analysis
  hypothesis_test.py / feature_analysis.py / residual_analysis.py  # Model iteration tooling
  cli.py                     # CLI: run, backtest, compare, promote, list, diagnostics, segment-analysis
```

---

## Database Tables

- `projection_models` — Model registry (name, version, features, config, is_baseline, is_active)
- `model_projections` — Per-model projections (model_id × player_id × season), with `feature_values` jsonb for audit
- `backtest_results` — Cached accuracy metrics (model_id × season × position)

See `docs/generated/db-schema.md` for full column details.

---

## Models (v1–v6 + external)

| Model | Features | Description |
|-------|----------|-------------|
| `v1_baseline_weighted_ppg` _(baseline)_ | weighted_ppg | Exact port of existing system |
| `v2_age_adjusted` | + age_curve | Positional aging adjustment |
| `v3_stat_weighted` | + stat_efficiency | Per-stat projection from nfl_stats |
| `v4_availability_adjusted` | + games_played | Injury/availability discount |
| `v5_team_context` | + team_context | Team offensive quality boost/penalty |
| `v6_usage_share` | + usage_share | Target/touch share trend |
| `external_fantasypros_v1` | external | FantasyPros consensus (industry benchmark) |

---

## Backtest Findings (2022–2025, all seasons combined)

Run on 844 player-seasons per internal model, 766 for FantasyPros (player matching coverage).

### Overall (all positions)

| Model | MAE | Bias | R² |
|-------|-----|------|----|
| `v1_baseline_weighted_ppg` _(baseline)_ | 2.677 | −0.385 | 0.470 |
| **`v2_age_adjusted`** | **2.615** | −0.408 | **0.489** |
| `v3_stat_weighted` | 2.993 | −0.154 | 0.340 |
| `v4_availability_adjusted` | 3.005 | +0.342 | 0.328 |
| `v5_team_context` | 3.405 | −0.519 | 0.202 |
| `v6_usage_share` | 3.995 | −1.186 | −0.267 |
| `external_fantasypros_v1` | **2.607** | +1.317 | **0.561** |

### By position (combined seasons)

| Position | Best internal | MAE | FP MAE | FP R² |
|----------|--------------|-----|--------|-------|
| QB | v1/v2 (tie) | 4.025 | 4.083 | 0.176 |
| RB | v2 | 3.047 | **2.778** | 0.525 |
| WR | v2 | 2.474 | **2.189** | 0.405 |
| TE | v2 | 1.794 | **1.630** | 0.563 |
| K | v1/v2 (tie) | 1.421 | — | — |

### Key conclusions

1. **v2_age_adjusted is the best internal model.** Age curve is the only feature that reliably improves over the baseline. Every subsequent feature (v3–v6) adds noise, not signal, when evaluated on MAE.

2. **FantasyPros beats all internal models** on MAE and R² overall (2.607 vs 2.615 for v2), and by a meaningful margin on RB, WR, and TE. Use it as the industry-standard benchmark.

3. **v6_usage_share is the worst model** (MAE 3.995, R² −0.267). The usage share trend signal introduces too much variance, particularly on WRs (R² −1.929). Do not promote.

4. **QBs are the hardest position to project.** All models sit at MAE ~4.0. FantasyPros is no better (4.083). Underlying cause: large high-variance tail from injury, benching, and breakout seasons.

5. **Kicker projections are essentially random** (all models R² < 0). The weighted PPG baseline is as good as anything else for K. Don't invest in kicker-specific features.

6. **FP over-projects by +1.3 PPG on average** (positive bias = model projects higher than actual). Draft-time consensus projections are optimistic — factor this in when using FP projections for roster decisions.

### Root cause diagnosis: why v3-v6 features hurt

| Feature | Impact | Root Cause |
|---------|--------|------------|
| `stat_efficiency` (v3) | +0.34 MAE | Redundantly re-derives PPG from component stats with slightly different recency weights, capturing noise not signal |
| `games_played` (v4) | Negligible MAE change, R² drops | Double-counts injury discounting already embedded in base feature's `games_played/17` scaling |
| `team_context` (v5) | +0.47 MAE | Uses player's *current* team with *historical* ratings — wrong for team-changers. Also applies to kickers where team offense is irrelevant |
| `usage_share` (v6) | +0.96 MAE, R² → -0.87 | Extrapolates noisy share trends with oversized scaling (0.5×), amplifying small fluctuations into huge PPG swings |

The combiner stacks features additively — when a feature adds noise (even small), it compounds with other noisy features. This explains why v3 alone might be marginal but v3+v4+v5+v6 is catastrophic.

See [projection-accuracy-improvement.md](projection-accuracy-improvement.md) for the full improvement plan and GitHub issue tracking.

---

## Tuning Recommendations

### Short-term (low effort, high value)

- **Promote v2_age_adjusted** as the active production model. It consistently beats v1 on every position except K.
- **Use FantasyPros as the forward projection** for 2026 (once available) rather than relying on v2. Re-run `ingest_external.py --seasons 2026` in late July when FP publishes preseason consensus.
- **Discount FP projections by ~1.3 PPG** for top-projected players (or apply position-specific bias correction: QB −2.5, RB −1.2, WR −0.7, TE −0.9).

### Medium-term (new features worth exploring)

- **Snap share** — more predictive than target share for WRs, less volatile than usage_share trend. Snap data is already in `nfl_stats.offense_snaps`.
- **Contract year effect** — players in walk-year seasons show small positive PPG boost (~0.3 PPG). Could be implemented as a binary flag from `league_prices` salary data.
- **Breakout/regression detection** — flag players whose most recent season PPG is ±2σ from their 3-year trend. Weight prior seasons more heavily for likely-regression candidates.

### Do not pursue

- **QB usage share** — excluded from v6 (GH #232) because QB pass volume share is always ~1.0 per team, making the signal meaningless. No further work warranted.
- **Kicker-specific features** — R² is negative for all models. Kicker scoring is too random relative to sample sizes.
- **v3 stat_efficiency / v4 games_played / v5 team_context as additive features** — individually they may have value, but their interaction in the combiner adds noise. If re-exploring, test each in isolation against v1, not stacked.

---

## Runbook: Adding a New Internal Feature

### Step-by-step

1. **Create the feature file**
   ```
   scripts/feature_projections/features/your_feature.py
   ```
   Implement `ProjectionFeature` (see `base.py`). Key decisions:
   - `is_base = True` → returns absolute PPG (only `weighted_ppg` should do this)
   - `is_base = False` → returns a PPG delta (positive = boost, negative = penalty)
   - Return `None` to skip this feature for a player (combiner will treat it as 0 delta)

2. **Register in FEATURE_REGISTRY**
   ```python
   # features/__init__.py
   from scripts.feature_projections.features.your_feature import YourFeature
   FEATURE_REGISTRY["your_feature"] = YourFeature
   ```

3. **Write tests**
   ```
   scripts/tests/test_feature_projections.py
   ```
   At minimum: test `compute()` returns a float or None, test edge cases (empty history, missing context keys).

4. **Define a new model in `model_config.py`**
   ```python
   "v7_your_feature": ModelDefinition(
       name="v7_your_feature",
       version=1,
       description="...",
       features=["weighted_ppg", "age_curve", "your_feature"],
   )
   ```
   Build incrementally on v2 (the current best model), not v6.

5. **Generate projections**
   ```bash
   python scripts/feature_projections/cli.py run \
       --model v7_your_feature --seasons 2022,2023,2024,2025
   ```

6. **Backtest and compare**
   ```bash
   python scripts/feature_projections/cli.py backtest \
       --model v7_your_feature --test-seasons 2022,2023,2024,2025

   python scripts/feature_projections/accuracy_report.py --seasons 2022,2023,2024,2025
   ```
   The new model will appear in the report alongside all others.

7. **Promote if better than v2 overall**
   ```bash
   python scripts/feature_projections/cli.py promote --model v7_your_feature
   ```
   This copies projections to `player_projections`, which feeds the analysis pipeline.

### Common pitfalls

**Kicker handling**
- Kickers (`position = "K"`) have no rushing, receiving, or passing stats in `nfl_stats`. Most features will naturally return `None` for kickers, which is correct — the combiner falls back to the base PPG. Do not add kicker-specific branches to features; just ensure `None` is returned gracefully when the needed stats are missing.

**QB usage metrics**
- QBs account for essentially 100% of a team's pass volume, so any target/pass-attempt share calculation for QBs is always ~1.0 with high noise. The `usage_share` feature explicitly excludes QBs via `USAGE_STAT_BY_POSITION` (which has no `QB` entry). If you build a feature using team-level volume metrics, follow the same pattern: skip QBs or use a QB-specific signal (e.g., pass attempt volume vs. league average, not share).

**Adjustment feature scale**
- Adjustment features return PPG *deltas*, not absolute values. A delta of +2.0 for a player projecting 8 PPG is a 25% boost — probably too large. Keep deltas within ±20% of `base_ppg` to avoid one feature dominating the combiner. Check with `context.get("base_ppg")` before scaling.

**Sparse history**
- Always guard for `history_df.empty` and `len(history_df) < N`. Rookies and players with limited data will trigger these. Return `None` rather than imputing or using a default — the combiner handles `None` gracefully.

**Recency weights**
- The standard recency weight pattern is `[0.60, 0.25, 0.15]` for 3 seasons (most recent first). Use `weights[:n]` then re-normalize if fewer seasons are available: `weights = [w / sum(weights[:n]) for w in weights[:n]]`.

---

## Phase Status

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 1: Foundation (tables, base class, runner) | ✅ Complete | |
| Phase 2: Features v1–v6 + CLI | ✅ Complete | |
| Phase 3: Backtest + accuracy report + external benchmark | ✅ Complete | FantasyPros ingested 2022–2025 |
| Phase 4: Model comparison UI | Deferred | Low ROI given backtest results |
| Phase 5: Production integration | ✅ Live | `update_projections.py` reads `projection_models.is_active` dynamically; `<ActiveModelCard />` surfaces the live model name + feature list on `/projections`, `/arbitration`, `/projection-accuracy`. Subsequent model work (v7–v27, including learned/Ridge models, advanced receiving, draft capital, Vegas) is tracked in [projection-accuracy-improvement.md](projection-accuracy-improvement.md). |
