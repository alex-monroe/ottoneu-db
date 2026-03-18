# QB Usage Share — Findings & Next Steps

_GH #250 · March 2026_

## Background

After #232 excluded QB from `usage_share` (because `passing_yards` share was always ~1.0), QBs had no usage-based projection adjustment. Issue #250 proposed using `passing_attempts` as a cleaner volume metric.

## What We Did

1. Added `passing_attempts` and `completions` columns to `nfl_stats` (migration 017), sourced from nflverse `attempts`/`completions` fields.
2. Updated `backfill_nfl_stats.py` to populate both columns.
3. Tested re-enabling QB in `usage_share` with `"QB": "passing_attempts"`.

## Results — QB MAE Got Worse

Backtested v6_usage_share with QB enabled (passing_attempts) vs v5_team_context (no QB usage):

| Season | v6 QB MAE (with passing_attempts) | v5 QB MAE (no QB usage) | v2 QB MAE (best model) |
|--------|-----------------------------------|-------------------------|------------------------|
| 2022   | 6.66                              | 5.26                    | 3.65                   |
| 2023   | 6.16                              | 4.91                    | 3.95                   |
| 2024   | 5.29                              | 4.36                    | 3.98                   |
| 2025   | **8.21**                          | 5.01                    | 4.39                   |

v6 QB bias was consistently large-negative (-0.7 to -5.4), meaning heavy over-projection.

The overall v6 model (ALL positions) was also the worst across every season — the QB degradation dragged down the entire model.

## Root Cause Analysis

**Starter QBs have near-constant passing attempt share (~0.95).** Unlike WR targets or RB carries, where a player's share of team volume varies meaningfully (0.10–0.30), a team's QB1 accounts for nearly all passing attempts every season. This means:

1. **Tiny fluctuations get amplified.** A share change from 0.94 → 0.96 is noise, but `TREND_SCALING * pct_change` treats it as a real trend signal and applies a PPG delta.
2. **Backup QBs distort team totals.** If a backup took 5% of attempts one season but not the next, the starter's "share" swings even though their actual usage didn't change.
3. **The feature's trend-detection design assumes meaningful variance.** For WR/RB, a share increase from 0.15 → 0.20 genuinely signals increased role. For QB, share is structurally near 1.0.

## What We Kept

- `passing_attempts` and `completions` columns remain in `nfl_stats` — they're useful raw stats for future features.
- The backfill script populates them correctly.
- QB remains **excluded** from `usage_share`.

## Alternative Approaches to Try

### 1. Completion percentage as efficiency signal
Use `completions / passing_attempts` in `stat_efficiency` feature instead of `usage_share`. Completion % is a well-established QB skill metric that varies meaningfully between players (58%–72%) and could capture regression/improvement.

### 2. Pass volume change (not share)
Instead of share-of-team, use raw passing attempts per game as an absolute volume metric. If a QB goes from 30 att/g → 35 att/g, that's a real workload change independent of team composition.

### 3. QB-specific feature class
Create a dedicated `QBUsageFeature` that uses multiple signals:
- Attempts per game (volume)
- Completion % (efficiency)
- Yards per attempt (separate from total yards)
- Rushing attempts (dual-threat signal)

This avoids forcing QB into the same share-based framework designed for skill positions.

### 4. Dampened trend scaling for QB
If revisiting share-based approach, use a much smaller `TREND_SCALING` for QB (e.g., 0.05 vs 0.5) to account for the structurally low variance. Would need backtesting to find the right coefficient.

### 5. Exclude backup QBs from team totals
Compute "starter attempt share" by only counting attempts from QBs with >50% of team attempts in each season. This would reduce the noise from backup QB fluctuations.
