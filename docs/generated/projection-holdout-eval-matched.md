# Projection Held-Out Evaluation (GH #572) — matched-sample (common players only)

_Generated: 2026-06-10 14:19_

**Matched-sample mode (Finding 4):** every model is scored on the *same* players — the intersection of players all evaluated models projected, per season. This makes the FantasyPros comparison apples-to-apples (FP projects a smaller, more-available set), at the cost of a smaller N. Run without `--matched` for the full-coverage report.

**Every model is evaluated out-of-sample on a shared held-out window.** Learned/residual models were retrained on **2021,2022,2023** and never saw the eval seasons **2024,2025**; additive and external models are parameter-free w.r.t. training seasons, so their existing projections are already held-out. All models are scored through the identical `backtest_model` filter (target-season games ≥ 4, true rookies excluded). Unlike [projection-accuracy.md](projection-accuracy.md), **no model here is scored on data it trained on** — this is the honest ranking. See [docs/exec-plans/projection-methodology-audit.md](../exec-plans/projection-methodology-audit.md) (Finding 1b).

## Ranking — combined held-out ALL (lower MAE = better)

_**MAE** is the pooled-over-players ALL error. **Bal MAE** is the position-balanced MAE — the unweighted mean of the per-position MAEs over a fixed set (QB/RB/WR/TE; K excluded as essentially random and not projected by every model) — which neutralises the drifting position mix of the qualifier pool (GH #577). They can disagree: a model can win the pooled MAE while losing the balanced one if it's strong only where players are easy/plentiful._

| Rank | Model | MAE | Bal MAE | Bias | R² | RMSE | N |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `external_fantasypros_v1` | **2.466** | 2.563 | +1.004 | 0.641 | 3.364 | 434 |
| 2 | `v19_usage_level_full` | 2.474 | **2.549** | +0.079 | 0.663 | 3.258 | 434 |
| 3 | `v14_qb_starter` | 2.480 | 2.555 | +0.270 | 0.659 | 3.277 | 434 |
| 4 | `v21_tiered_regression` | 2.494 | 2.579 | +0.121 | 0.650 | 3.323 | 434 |
| 5 | `v17_rookie_growth` | 2.499 | 2.574 | +0.238 | 0.658 | 3.284 | 434 |
| 6 | `v16_snap_trend_full` | 2.502 | 2.584 | +0.210 | 0.651 | 3.315 | 434 |
| 7 | `v11_team_context_v2` | 2.508 | 2.591 | +0.147 | 0.634 | 3.395 | 434 |
| 8 | `v12_no_qb_trajectory` | 2.509 | 2.592 | +0.205 | 0.638 | 3.379 | 434 |
| 9 | `v8_age_regression` | 2.511 | 2.595 | +0.181 | 0.636 | 3.385 | 434 |
| 10 | `v9_pos_specific` | 2.511 | 2.595 | +0.181 | 0.636 | 3.385 | 434 |
| 11 | `v10_stat_efficiency_v2` | 2.514 | 2.598 | +0.194 | 0.637 | 3.384 | 434 |
| 12 | `v13_qb_starter` | 2.515 | 2.600 | +0.182 | 0.635 | 3.390 | 434 |
| 13 | `v26_vegas_residual` | 2.516 | 2.594 | +0.245 | 0.661 | 3.268 | 434 |
| 14 | `v31_depth_chart` | 2.525 | 2.591 | +0.251 | 0.661 | 3.269 | 434 |
| 15 | `v3_stat_weighted` | 2.548 | 2.635 | -0.214 | 0.626 | 3.433 | 434 |
| 16 | `v2_age_adjusted` | 2.557 | 2.645 | -0.215 | 0.624 | 3.442 | 434 |
| 17 | `v25_draft_capital_residual` | 2.561 | 2.633 | +0.271 | 0.656 | 3.293 | 434 |
| 18 | `v7_regression_to_mean` | 2.562 | 2.647 | +0.431 | 0.630 | 3.414 | 434 |
| 19 | `v5_team_context` | 2.575 | 2.664 | +0.237 | 0.619 | 3.466 | 434 |
| 20 | `v29_reliability_residual` | 2.577 | 2.645 | +0.267 | 0.649 | 3.327 | 434 |
| 21 | `v4_availability_adjusted` | 2.577 | 2.664 | +0.261 | 0.623 | 3.445 | 434 |
| 22 | `v15_snap_trend` | 2.592 | 2.687 | -0.276 | 0.613 | 3.493 | 434 |
| 23 | `v6_usage_share` | 2.594 | 2.680 | +0.041 | 0.616 | 3.480 | 434 |
| 24 | `v18_usage_level` | 2.600 | 2.684 | -0.406 | 0.616 | 3.480 | 434 |
| 25 | `v30_reliability_full_refit` | 2.606 | 2.674 | +0.323 | 0.638 | 3.376 | 434 |
| 26 | `v20_learned_usage` | 2.610 | 2.669 | +0.654 | 0.635 | 3.391 | 434 |
| 27 | `v22_advanced_receiving` | 2.621 | 2.681 | +0.603 | 0.639 | 3.373 | 434 |
| 28 | `v28_reliability_weighting` | 2.625 | 2.685 | +0.568 | 0.633 | 3.402 | 434 |
| 29 | `v27_vegas_full_refit` | 2.626 | 2.699 | +0.336 | 0.635 | 3.392 | 434 |
| 30 | `v23_draft_capital` | 2.634 | 2.704 | +0.344 | 0.633 | 3.401 | 434 |
| 31 | `v1_baseline_weighted_ppg` | 2.665 | 2.748 | -0.438 | 0.597 | 3.563 | 434 |
| 32 | `naive_prior_season_ppg` | 2.820 | 2.933 | -0.240 | 0.522 | 3.882 | 434 |
| 33 | `position_mean_baseline` | 4.616 | 4.663 | +2.841 | -0.072 | 5.813 | 434 |

## Combined across eval seasons — by position

### ALL

| Model | MAE | Bias | R² | RMSE | N |
| --- | --- | --- | --- | --- | --- |
| `external_fantasypros_v1` | 2.466 | +1.004 | 0.641 | 3.364 | 434 |
| `v19_usage_level_full` | 2.474 | +0.079 | 0.663 | 3.258 | 434 |
| `v14_qb_starter` | 2.480 | +0.270 | 0.659 | 3.277 | 434 |
| `v21_tiered_regression` | 2.494 | +0.121 | 0.650 | 3.323 | 434 |
| `v17_rookie_growth` | 2.499 | +0.238 | 0.658 | 3.284 | 434 |
| `v16_snap_trend_full` | 2.502 | +0.210 | 0.651 | 3.315 | 434 |
| `v11_team_context_v2` | 2.508 | +0.147 | 0.634 | 3.395 | 434 |
| `v12_no_qb_trajectory` | 2.509 | +0.205 | 0.638 | 3.379 | 434 |
| `v8_age_regression` | 2.511 | +0.181 | 0.636 | 3.385 | 434 |
| `v9_pos_specific` | 2.511 | +0.181 | 0.636 | 3.385 | 434 |
| `v10_stat_efficiency_v2` | 2.514 | +0.194 | 0.637 | 3.384 | 434 |
| `v13_qb_starter` | 2.515 | +0.182 | 0.635 | 3.390 | 434 |
| `v26_vegas_residual` | 2.516 | +0.245 | 0.661 | 3.268 | 434 |
| `v31_depth_chart` | 2.525 | +0.251 | 0.661 | 3.269 | 434 |
| `v3_stat_weighted` | 2.548 | -0.214 | 0.626 | 3.433 | 434 |
| `v2_age_adjusted` | 2.557 | -0.215 | 0.624 | 3.442 | 434 |
| `v25_draft_capital_residual` | 2.561 | +0.271 | 0.656 | 3.293 | 434 |
| `v7_regression_to_mean` | 2.562 | +0.431 | 0.630 | 3.414 | 434 |
| `v5_team_context` | 2.575 | +0.237 | 0.619 | 3.466 | 434 |
| `v29_reliability_residual` | 2.577 | +0.267 | 0.649 | 3.327 | 434 |
| `v4_availability_adjusted` | 2.577 | +0.261 | 0.623 | 3.445 | 434 |
| `v15_snap_trend` | 2.592 | -0.276 | 0.613 | 3.493 | 434 |
| `v6_usage_share` | 2.594 | +0.041 | 0.616 | 3.480 | 434 |
| `v18_usage_level` | 2.600 | -0.406 | 0.616 | 3.480 | 434 |
| `v30_reliability_full_refit` | 2.606 | +0.323 | 0.638 | 3.376 | 434 |
| `v20_learned_usage` | 2.610 | +0.654 | 0.635 | 3.391 | 434 |
| `v22_advanced_receiving` | 2.621 | +0.603 | 0.639 | 3.373 | 434 |
| `v28_reliability_weighting` | 2.625 | +0.568 | 0.633 | 3.402 | 434 |
| `v27_vegas_full_refit` | 2.626 | +0.336 | 0.635 | 3.392 | 434 |
| `v23_draft_capital` | 2.634 | +0.344 | 0.633 | 3.401 | 434 |
| `v1_baseline_weighted_ppg` | 2.665 | -0.438 | 0.597 | 3.563 | 434 |
| `naive_prior_season_ppg` | 2.820 | -0.240 | 0.522 | 3.882 | 434 |
| `position_mean_baseline` | 4.616 | +2.841 | -0.072 | 5.813 | 434 |

### QB

| Model | MAE | Bias | R² | RMSE | N |
| --- | --- | --- | --- | --- | --- |
| `v28_reliability_weighting` | 3.379 | -0.296 | 0.554 | 4.211 | 85 |
| `v31_depth_chart` | 3.402 | -0.456 | 0.556 | 4.202 | 85 |
| `v22_advanced_receiving` | 3.433 | -0.001 | 0.542 | 4.271 | 85 |
| `v29_reliability_residual` | 3.447 | -0.556 | 0.537 | 4.294 | 85 |
| `v20_learned_usage` | 3.453 | -0.049 | 0.535 | 4.302 | 85 |
| `v30_reliability_full_refit` | 3.468 | -0.409 | 0.527 | 4.340 | 85 |
| `v26_vegas_residual` | 3.470 | -0.351 | 0.528 | 4.332 | 85 |
| `v25_draft_capital_residual` | 3.508 | -0.326 | 0.523 | 4.356 | 85 |
| `v14_qb_starter` | 3.554 | -0.253 | 0.467 | 4.607 | 85 |
| `v17_rookie_growth` | 3.554 | -0.253 | 0.467 | 4.607 | 85 |
| `v19_usage_level_full` | 3.554 | -0.253 | 0.467 | 4.607 | 85 |
| `v23_draft_capital` | 3.557 | -0.333 | 0.518 | 4.381 | 85 |
| `v27_vegas_full_refit` | 3.588 | -0.146 | 0.504 | 4.442 | 85 |
| `v16_snap_trend_full` | 3.628 | -0.270 | 0.456 | 4.655 | 85 |
| `v21_tiered_regression` | 3.629 | -0.154 | 0.445 | 4.702 | 85 |
| `v12_no_qb_trajectory` | 3.700 | -0.587 | 0.380 | 4.969 | 85 |
| `v8_age_regression` | 3.711 | -0.709 | 0.374 | 4.992 | 85 |
| `v9_pos_specific` | 3.711 | -0.709 | 0.374 | 4.992 | 85 |
| `v11_team_context_v2` | 3.724 | -0.777 | 0.365 | 5.027 | 85 |
| `v10_stat_efficiency_v2` | 3.726 | -0.710 | 0.376 | 4.985 | 85 |
| `v13_qb_starter` | 3.733 | -0.705 | 0.370 | 5.009 | 85 |
| `v7_regression_to_mean` | 3.756 | +0.615 | 0.396 | 4.902 | 85 |
| `external_fantasypros_v1` | 3.794 | +2.231 | 0.332 | 5.158 | 85 |
| `v4_availability_adjusted` | 3.795 | +0.334 | 0.373 | 4.997 | 85 |
| `v6_usage_share` | 3.851 | +0.254 | 0.359 | 5.050 | 85 |
| `v3_stat_weighted` | 3.853 | -1.082 | 0.332 | 5.156 | 85 |
| `v2_age_adjusted` | 3.858 | -1.078 | 0.331 | 5.161 | 85 |
| `v18_usage_level` | 3.858 | -1.078 | 0.331 | 5.161 | 85 |
| `v5_team_context` | 3.889 | +0.251 | 0.355 | 5.068 | 85 |
| `v15_snap_trend` | 3.929 | -1.095 | 0.317 | 5.216 | 85 |
| `v1_baseline_weighted_ppg` | 3.955 | -1.326 | 0.312 | 5.234 | 85 |
| `naive_prior_season_ppg` | 4.433 | -0.537 | 0.140 | 5.852 | 85 |
| `position_mean_baseline` | 5.425 | +1.620 | -0.068 | 6.521 | 85 |

### RB

| Model | MAE | Bias | R² | RMSE | N |
| --- | --- | --- | --- | --- | --- |
| `v3_stat_weighted` | 2.568 | +0.387 | 0.644 | 3.292 | 102 |
| `v11_team_context_v2` | 2.593 | +0.840 | 0.624 | 3.383 | 102 |
| `v19_usage_level_full` | 2.594 | +0.557 | 0.633 | 3.342 | 102 |
| `v2_age_adjusted` | 2.598 | +0.368 | 0.637 | 3.323 | 102 |
| `v5_team_context` | 2.623 | +0.764 | 0.608 | 3.456 | 102 |
| `v8_age_regression` | 2.624 | +0.871 | 0.619 | 3.404 | 102 |
| `v9_pos_specific` | 2.624 | +0.871 | 0.619 | 3.404 | 102 |
| `v12_no_qb_trajectory` | 2.624 | +0.871 | 0.619 | 3.404 | 102 |
| `v13_qb_starter` | 2.624 | +0.871 | 0.619 | 3.404 | 102 |
| `v14_qb_starter` | 2.624 | +0.871 | 0.619 | 3.404 | 102 |
| `v10_stat_efficiency_v2` | 2.626 | +0.922 | 0.618 | 3.409 | 102 |
| `v18_usage_level` | 2.643 | +0.053 | 0.628 | 3.364 | 102 |
| `v6_usage_share` | 2.651 | +0.409 | 0.612 | 3.437 | 102 |
| `external_fantasypros_v1` | 2.672 | +1.093 | 0.639 | 3.313 | 102 |
| `v17_rookie_growth` | 2.676 | +0.811 | 0.613 | 3.434 | 102 |
| `v1_baseline_weighted_ppg` | 2.682 | +0.042 | 0.590 | 3.531 | 102 |
| `v16_snap_trend_full` | 2.685 | +0.689 | 0.600 | 3.487 | 102 |
| `v21_tiered_regression` | 2.688 | +0.760 | 0.609 | 3.449 | 102 |
| `v15_snap_trend` | 2.693 | +0.185 | 0.609 | 3.450 | 102 |
| `v7_regression_to_mean` | 2.720 | +0.939 | 0.586 | 3.547 | 102 |
| `v4_availability_adjusted` | 2.723 | +0.731 | 0.602 | 3.478 | 102 |
| `v31_depth_chart` | 2.885 | +1.036 | 0.544 | 3.723 | 102 |
| `naive_prior_season_ppg` | 2.885 | -0.057 | 0.479 | 3.983 | 102 |
| `v25_draft_capital_residual` | 2.919 | +1.109 | 0.551 | 3.696 | 102 |
| `v26_vegas_residual` | 2.920 | +1.105 | 0.550 | 3.700 | 102 |
| `v20_learned_usage` | 2.960 | +1.258 | 0.523 | 3.809 | 102 |
| `v29_reliability_residual` | 2.989 | +1.331 | 0.531 | 3.777 | 102 |
| `v22_advanced_receiving` | 3.005 | +1.337 | 0.519 | 3.827 | 102 |
| `v27_vegas_full_refit` | 3.010 | +1.141 | 0.504 | 3.883 | 102 |
| `v30_reliability_full_refit` | 3.030 | +1.277 | 0.501 | 3.894 | 102 |
| `v23_draft_capital` | 3.045 | +1.204 | 0.493 | 3.928 | 102 |
| `v28_reliability_weighting` | 3.106 | +1.622 | 0.486 | 3.956 | 102 |
| `position_mean_baseline` | 5.540 | +4.237 | -0.580 | 6.933 | 102 |

### WR

| Model | MAE | Bias | R² | RMSE | N |
| --- | --- | --- | --- | --- | --- |
| `external_fantasypros_v1` | 2.201 | +0.417 | 0.627 | 2.787 | 136 |
| `v21_tiered_regression` | 2.244 | -0.197 | 0.599 | 2.890 | 136 |
| `v26_vegas_residual` | 2.264 | +0.142 | 0.609 | 2.852 | 136 |
| `v16_snap_trend_full` | 2.289 | +0.209 | 0.591 | 2.919 | 136 |
| `v19_usage_level_full` | 2.308 | -0.039 | 0.600 | 2.887 | 136 |
| `v8_age_regression` | 2.319 | +0.259 | 0.595 | 2.903 | 136 |
| `v9_pos_specific` | 2.319 | +0.259 | 0.595 | 2.903 | 136 |
| `v12_no_qb_trajectory` | 2.319 | +0.259 | 0.595 | 2.903 | 136 |
| `v13_qb_starter` | 2.319 | +0.259 | 0.595 | 2.903 | 136 |
| `v14_qb_starter` | 2.319 | +0.259 | 0.595 | 2.903 | 136 |
| `v10_stat_efficiency_v2` | 2.321 | +0.269 | 0.594 | 2.906 | 136 |
| `v11_team_context_v2` | 2.322 | +0.236 | 0.591 | 2.917 | 136 |
| `v17_rookie_growth` | 2.341 | +0.201 | 0.595 | 2.904 | 136 |
| `v15_snap_trend` | 2.349 | -0.285 | 0.566 | 3.004 | 136 |
| `v4_availability_adjusted` | 2.349 | -0.008 | 0.566 | 3.007 | 136 |
| `v2_age_adjusted` | 2.361 | -0.235 | 0.572 | 2.983 | 136 |
| `v3_stat_weighted` | 2.363 | -0.237 | 0.572 | 2.984 | 136 |
| `v7_regression_to_mean` | 2.364 | +0.161 | 0.581 | 2.954 | 136 |
| `v5_team_context` | 2.375 | -0.037 | 0.555 | 3.043 | 136 |
| `v25_draft_capital_residual` | 2.381 | +0.217 | 0.583 | 2.944 | 136 |
| `v31_depth_chart` | 2.397 | +0.175 | 0.566 | 3.006 | 136 |
| `v6_usage_share` | 2.403 | -0.326 | 0.541 | 3.091 | 136 |
| `v29_reliability_residual` | 2.417 | +0.095 | 0.555 | 3.042 | 136 |
| `v18_usage_level` | 2.440 | -0.533 | 0.549 | 3.062 | 136 |
| `v30_reliability_full_refit` | 2.443 | +0.219 | 0.552 | 3.054 | 136 |
| `v27_vegas_full_refit` | 2.463 | +0.270 | 0.558 | 3.033 | 136 |
| `v23_draft_capital` | 2.499 | +0.298 | 0.545 | 3.077 | 136 |
| `naive_prior_season_ppg` | 2.513 | -0.259 | 0.503 | 3.216 | 136 |
| `v28_reliability_weighting` | 2.525 | +0.563 | 0.512 | 3.185 | 136 |
| `v1_baseline_weighted_ppg` | 2.536 | -0.366 | 0.528 | 3.134 | 136 |
| `v22_advanced_receiving` | 2.549 | +0.758 | 0.523 | 3.150 | 136 |
| `v20_learned_usage` | 2.565 | +0.898 | 0.512 | 3.186 | 136 |
| `position_mean_baseline` | 4.953 | +3.754 | -0.672 | 5.899 | 136 |

### TE

| Model | MAE | Bias | R² | RMSE | N |
| --- | --- | --- | --- | --- | --- |
| `external_fantasypros_v1` | 1.585 | +0.701 | 0.608 | 2.064 | 111 |
| `v31_depth_chart` | 1.681 | +0.165 | 0.590 | 2.110 | 111 |
| `v20_learned_usage` | 1.699 | +0.340 | 0.538 | 2.241 | 111 |
| `v23_draft_capital` | 1.714 | +0.130 | 0.561 | 2.183 | 111 |
| `v10_stat_efficiency_v2` | 1.720 | +0.124 | 0.565 | 2.174 | 111 |
| `v26_vegas_residual` | 1.723 | +0.038 | 0.556 | 2.196 | 111 |
| `v17_rookie_growth` | 1.724 | +0.133 | 0.562 | 2.180 | 111 |
| `v8_age_regression` | 1.724 | +0.133 | 0.562 | 2.180 | 111 |
| `v9_pos_specific` | 1.724 | +0.133 | 0.562 | 2.180 | 111 |
| `v12_no_qb_trajectory` | 1.724 | +0.133 | 0.562 | 2.180 | 111 |
| `v13_qb_starter` | 1.724 | +0.133 | 0.562 | 2.180 | 111 |
| `v14_qb_starter` | 1.724 | +0.133 | 0.562 | 2.180 | 111 |
| `v11_team_context_v2` | 1.726 | +0.109 | 0.561 | 2.184 | 111 |
| `v25_draft_capital_residual` | 1.726 | +0.026 | 0.568 | 2.165 | 111 |
| `v29_reliability_residual` | 1.726 | +0.130 | 0.565 | 2.173 | 111 |
| `v28_reliability_weighting` | 1.728 | +0.268 | 0.553 | 2.203 | 111 |
| `v16_snap_trend_full` | 1.733 | +0.136 | 0.561 | 2.183 | 111 |
| `v22_advanced_receiving` | 1.736 | +0.200 | 0.549 | 2.214 | 111 |
| `v27_vegas_full_refit` | 1.737 | +0.049 | 0.562 | 2.180 | 111 |
| `v19_usage_level_full` | 1.741 | +0.040 | 0.561 | 2.184 | 111 |
| `v7_regression_to_mean` | 1.747 | +0.153 | 0.548 | 2.214 | 111 |
| `v21_tiered_regression` | 1.754 | +0.133 | 0.533 | 2.253 | 111 |
| `v3_stat_weighted` | 1.757 | -0.072 | 0.553 | 2.202 | 111 |
| `v30_reliability_full_refit` | 1.757 | +0.134 | 0.561 | 2.183 | 111 |
| `v2_age_adjusted` | 1.762 | -0.066 | 0.550 | 2.209 | 111 |
| `v5_team_context` | 1.770 | +0.077 | 0.542 | 2.231 | 111 |
| `v15_snap_trend` | 1.775 | -0.063 | 0.552 | 2.206 | 111 |
| `v4_availability_adjusted` | 1.791 | +0.102 | 0.531 | 2.257 | 111 |
| `v18_usage_level` | 1.796 | -0.160 | 0.533 | 2.251 | 111 |
| `v6_usage_share` | 1.813 | -0.012 | 0.516 | 2.291 | 111 |
| `v1_baseline_weighted_ppg` | 1.818 | -0.288 | 0.524 | 2.274 | 111 |
| `naive_prior_season_ppg` | 1.901 | -0.158 | 0.499 | 2.333 | 111 |
| `position_mean_baseline` | 2.736 | +1.373 | -0.172 | 3.568 | 111 |

### K

| Model | MAE | Bias | R² | RMSE | N |
| --- | --- | --- | --- | --- | --- |

## Ranking quality — per-position ordering (GH #598)

_The projections feed VORP, surplus value, auction pricing and keeper calls, which depend on within-position **ordering** and getting the top tier right — not absolute PPG level. **Spearman ρ** is the rank correlation between projected and actual PPG (1.0 = perfect order). **Top-N hit** is the share of each model's predicted top-N (≈ the starter pool: 12 for QB/TE, 24 for RB/WR) that actually finished top-N. A model can win MAE while losing here (#579) — these are the metrics the downstream decisions actually care about._

### QB (top-12)

| Model | Spearman ρ | Top-N hit | N |
| --- | --- | --- | --- |
| `external_fantasypros_v1` | **0.796** | 0.417 | 85 |
| `v31_depth_chart` | 0.759 | 0.333 | 85 |
| `v28_reliability_weighting` | 0.753 | 0.417 | 85 |
| `v22_advanced_receiving` | 0.751 | 0.417 | 85 |
| `v26_vegas_residual` | 0.749 | 0.333 | 85 |
| `v20_learned_usage` | 0.746 | 0.417 | 85 |
| `v30_reliability_full_refit` | 0.742 | 0.333 | 85 |
| `v29_reliability_residual` | 0.741 | 0.333 | 85 |
| `v25_draft_capital_residual` | 0.740 | 0.333 | 85 |
| `v23_draft_capital` | 0.735 | 0.250 | 85 |
| `v27_vegas_full_refit` | 0.731 | 0.250 | 85 |
| `v16_snap_trend_full` | 0.705 | 0.417 | 85 |
| `v14_qb_starter` | 0.703 | 0.333 | 85 |
| `v17_rookie_growth` | 0.703 | 0.333 | 85 |
| `v19_usage_level_full` | 0.703 | 0.333 | 85 |
| `v4_availability_adjusted` | 0.702 | 0.417 | 85 |
| `v21_tiered_regression` | 0.701 | 0.333 | 85 |
| `v6_usage_share` | 0.700 | 0.417 | 85 |
| `v7_regression_to_mean` | 0.699 | 0.417 | 85 |
| `v5_team_context` | 0.696 | 0.417 | 85 |
| `v15_snap_trend` | 0.677 | 0.417 | 85 |
| `v3_stat_weighted` | 0.672 | 0.417 | 85 |
| `v8_age_regression` | 0.671 | 0.417 | 85 |
| `v9_pos_specific` | 0.671 | 0.417 | 85 |
| `v11_team_context_v2` | 0.671 | 0.417 | 85 |
| `v2_age_adjusted` | 0.670 | 0.417 | 85 |
| `v18_usage_level` | 0.670 | 0.417 | 85 |
| `v10_stat_efficiency_v2` | 0.670 | 0.417 | 85 |
| `v1_baseline_weighted_ppg` | 0.666 | 0.417 | 85 |
| `v13_qb_starter` | 0.664 | 0.417 | 85 |
| `v12_no_qb_trajectory` | 0.661 | 0.333 | 85 |
| `naive_prior_season_ppg` | 0.610 | 0.333 | 85 |
| `position_mean_baseline` | -0.007 | 0.167 | 85 |

### RB (top-24)

| Model | Spearman ρ | Top-N hit | N |
| --- | --- | --- | --- |
| `external_fantasypros_v1` | **0.836** | 0.667 | 102 |
| `v3_stat_weighted` | 0.822 | 0.625 | 102 |
| `v11_team_context_v2` | 0.821 | 0.667 | 102 |
| `v8_age_regression` | 0.819 | 0.625 | 102 |
| `v9_pos_specific` | 0.819 | 0.625 | 102 |
| `v12_no_qb_trajectory` | 0.819 | 0.625 | 102 |
| `v13_qb_starter` | 0.819 | 0.625 | 102 |
| `v14_qb_starter` | 0.819 | 0.625 | 102 |
| `v10_stat_efficiency_v2` | 0.818 | 0.625 | 102 |
| `v19_usage_level_full` | 0.817 | 0.583 | 102 |
| `v2_age_adjusted` | 0.816 | 0.625 | 102 |
| `v21_tiered_regression` | 0.816 | 0.583 | 102 |
| `v6_usage_share` | 0.815 | 0.625 | 102 |
| `v17_rookie_growth` | 0.815 | 0.625 | 102 |
| `v18_usage_level` | 0.815 | 0.583 | 102 |
| `v5_team_context` | 0.813 | 0.625 | 102 |
| `v7_regression_to_mean` | 0.806 | 0.583 | 102 |
| `v4_availability_adjusted` | 0.805 | 0.625 | 102 |
| `v15_snap_trend` | 0.804 | 0.625 | 102 |
| `v16_snap_trend_full` | 0.801 | 0.583 | 102 |
| `v1_baseline_weighted_ppg` | 0.790 | 0.667 | 102 |
| `v29_reliability_residual` | 0.790 | 0.667 | 102 |
| `v25_draft_capital_residual` | 0.783 | 0.667 | 102 |
| `v26_vegas_residual` | 0.783 | 0.667 | 102 |
| `v28_reliability_weighting` | 0.782 | 0.667 | 102 |
| `v22_advanced_receiving` | 0.780 | 0.667 | 102 |
| `v20_learned_usage` | 0.770 | 0.667 | 102 |
| `v31_depth_chart` | 0.755 | 0.542 | 102 |
| `v30_reliability_full_refit` | 0.753 | 0.583 | 102 |
| `v27_vegas_full_refit` | 0.751 | 0.625 | 102 |
| `naive_prior_season_ppg` | 0.750 | 0.583 | 102 |
| `v23_draft_capital` | 0.744 | 0.583 | 102 |
| `position_mean_baseline` | 0.208 | 0.375 | 102 |

### WR (top-24)

| Model | Spearman ρ | Top-N hit | N |
| --- | --- | --- | --- |
| `external_fantasypros_v1` | **0.767** | 0.500 | 136 |
| `v26_vegas_residual` | 0.759 | 0.583 | 136 |
| `v29_reliability_residual` | 0.747 | 0.542 | 136 |
| `v19_usage_level_full` | 0.747 | 0.417 | 136 |
| `v18_usage_level` | 0.747 | 0.417 | 136 |
| `v3_stat_weighted` | 0.745 | 0.417 | 136 |
| `v17_rookie_growth` | 0.744 | 0.417 | 136 |
| `v15_snap_trend` | 0.744 | 0.458 | 136 |
| `v7_regression_to_mean` | 0.744 | 0.458 | 136 |
| `v2_age_adjusted` | 0.743 | 0.417 | 136 |
| `v10_stat_efficiency_v2` | 0.743 | 0.417 | 136 |
| `v11_team_context_v2` | 0.743 | 0.458 | 136 |
| `v21_tiered_regression` | 0.743 | 0.542 | 136 |
| `v6_usage_share` | 0.743 | 0.458 | 136 |
| `v25_draft_capital_residual` | 0.743 | 0.500 | 136 |
| `v30_reliability_full_refit` | 0.743 | 0.500 | 136 |
| `v8_age_regression` | 0.742 | 0.417 | 136 |
| `v9_pos_specific` | 0.742 | 0.417 | 136 |
| `v12_no_qb_trajectory` | 0.742 | 0.417 | 136 |
| `v13_qb_starter` | 0.742 | 0.417 | 136 |
| `v14_qb_starter` | 0.742 | 0.417 | 136 |
| `v31_depth_chart` | 0.742 | 0.500 | 136 |
| `v16_snap_trend_full` | 0.741 | 0.458 | 136 |
| `v4_availability_adjusted` | 0.739 | 0.500 | 136 |
| `v5_team_context` | 0.734 | 0.542 | 136 |
| `v28_reliability_weighting` | 0.733 | 0.583 | 136 |
| `v27_vegas_full_refit` | 0.730 | 0.500 | 136 |
| `v22_advanced_receiving` | 0.724 | 0.500 | 136 |
| `v23_draft_capital` | 0.721 | 0.417 | 136 |
| `naive_prior_season_ppg` | 0.720 | 0.500 | 136 |
| `v1_baseline_weighted_ppg` | 0.717 | 0.542 | 136 |
| `v20_learned_usage` | 0.706 | 0.542 | 136 |
| `position_mean_baseline` | 0.185 | 0.250 | 136 |

### TE (top-12)

| Model | Spearman ρ | Top-N hit | N |
| --- | --- | --- | --- |
| `external_fantasypros_v1` | **0.780** | 0.750 | 111 |
| `v31_depth_chart` | 0.759 | 0.667 | 111 |
| `v26_vegas_residual` | 0.738 | 0.667 | 111 |
| `v29_reliability_residual` | 0.738 | 0.667 | 111 |
| `v28_reliability_weighting` | 0.737 | 0.667 | 111 |
| `v5_team_context` | 0.733 | 0.667 | 111 |
| `v25_draft_capital_residual` | 0.733 | 0.667 | 111 |
| `v23_draft_capital` | 0.733 | 0.583 | 111 |
| `v22_advanced_receiving` | 0.733 | 0.583 | 111 |
| `v6_usage_share` | 0.732 | 0.667 | 111 |
| `v30_reliability_full_refit` | 0.732 | 0.667 | 111 |
| `v3_stat_weighted` | 0.731 | 0.667 | 111 |
| `v27_vegas_full_refit` | 0.731 | 0.667 | 111 |
| `v1_baseline_weighted_ppg` | 0.730 | 0.667 | 111 |
| `v10_stat_efficiency_v2` | 0.729 | 0.667 | 111 |
| `v11_team_context_v2` | 0.729 | 0.667 | 111 |
| `v4_availability_adjusted` | 0.729 | 0.667 | 111 |
| `v19_usage_level_full` | 0.729 | 0.667 | 111 |
| `v18_usage_level` | 0.728 | 0.667 | 111 |
| `v7_regression_to_mean` | 0.728 | 0.667 | 111 |
| `v20_learned_usage` | 0.727 | 0.667 | 111 |
| `v2_age_adjusted` | 0.727 | 0.667 | 111 |
| `v17_rookie_growth` | 0.724 | 0.667 | 111 |
| `v8_age_regression` | 0.724 | 0.667 | 111 |
| `v9_pos_specific` | 0.724 | 0.667 | 111 |
| `v12_no_qb_trajectory` | 0.724 | 0.667 | 111 |
| `v13_qb_starter` | 0.724 | 0.667 | 111 |
| `v14_qb_starter` | 0.724 | 0.667 | 111 |
| `v15_snap_trend` | 0.714 | 0.667 | 111 |
| `v16_snap_trend_full` | 0.712 | 0.667 | 111 |
| `v21_tiered_regression` | 0.707 | 0.667 | 111 |
| `naive_prior_season_ppg` | 0.682 | 0.667 | 111 |
| `position_mean_baseline` | 0.091 | 0.083 | 111 |

## Season 2024 — ALL (held-out)

| Model | MAE | Bias | R² | RMSE | N |
| --- | --- | --- | --- | --- | --- |
| `v19_usage_level_full` | 2.506 | +0.489 | 0.652 | 3.268 | 198 |
| `v17_rookie_growth` | 2.527 | +0.686 | 0.645 | 3.298 | 198 |
| `v12_no_qb_trajectory` | 2.533 | +0.648 | 0.640 | 3.323 | 198 |
| `v14_qb_starter` | 2.536 | +0.698 | 0.643 | 3.311 | 198 |
| `v13_qb_starter` | 2.544 | +0.640 | 0.638 | 3.331 | 198 |
| `v8_age_regression` | 2.550 | +0.653 | 0.637 | 3.337 | 198 |
| `v9_pos_specific` | 2.550 | +0.653 | 0.637 | 3.337 | 198 |
| `v11_team_context_v2` | 2.551 | +0.622 | 0.634 | 3.350 | 198 |
| `v10_stat_efficiency_v2` | 2.555 | +0.662 | 0.638 | 3.334 | 198 |
| `v21_tiered_regression` | 2.557 | +0.556 | 0.637 | 3.336 | 198 |
| `v3_stat_weighted` | 2.563 | +0.251 | 0.644 | 3.305 | 198 |
| `v2_age_adjusted` | 2.567 | +0.257 | 0.642 | 3.314 | 198 |
| `v16_snap_trend_full` | 2.576 | +0.631 | 0.625 | 3.393 | 198 |
| `v18_usage_level` | 2.596 | +0.048 | 0.638 | 3.332 | 198 |
| `v1_baseline_weighted_ppg` | 2.597 | +0.088 | 0.622 | 3.404 | 198 |
| `external_fantasypros_v1` | 2.614 | +1.390 | 0.610 | 3.459 | 198 |
| `v4_availability_adjusted` | 2.638 | +0.762 | 0.619 | 3.416 | 198 |
| `v15_snap_trend` | 2.644 | +0.190 | 0.620 | 3.413 | 198 |
| `v6_usage_share` | 2.652 | +0.538 | 0.613 | 3.444 | 198 |
| `v31_depth_chart` | 2.654 | +0.635 | 0.619 | 3.418 | 198 |
| `v26_vegas_residual` | 2.659 | +0.694 | 0.612 | 3.449 | 198 |
| `v5_team_context` | 2.665 | +0.734 | 0.606 | 3.478 | 198 |
| `v7_regression_to_mean` | 2.679 | +0.920 | 0.605 | 3.481 | 198 |
| `v25_draft_capital_residual` | 2.708 | +0.733 | 0.606 | 3.476 | 198 |
| `naive_prior_season_ppg` | 2.745 | +0.342 | 0.529 | 3.799 | 198 |
| `v29_reliability_residual` | 2.747 | +0.713 | 0.595 | 3.525 | 198 |
| `v20_learned_usage` | 2.749 | +1.143 | 0.587 | 3.558 | 198 |
| `v22_advanced_receiving` | 2.778 | +1.085 | 0.587 | 3.561 | 198 |
| `v30_reliability_full_refit` | 2.797 | +0.802 | 0.580 | 3.590 | 198 |
| `v27_vegas_full_refit` | 2.804 | +0.834 | 0.580 | 3.588 | 198 |
| `v23_draft_capital` | 2.809 | +0.821 | 0.575 | 3.611 | 198 |
| `v28_reliability_weighting` | 2.813 | +1.034 | 0.575 | 3.611 | 198 |
| `position_mean_baseline` | 4.812 | +3.388 | -0.188 | 6.037 | 198 |

## Season 2025 — ALL (held-out)

| Model | MAE | Bias | R² | RMSE | N |
| --- | --- | --- | --- | --- | --- |
| `external_fantasypros_v1` | 2.342 | +0.680 | 0.659 | 3.281 | 236 |
| `v26_vegas_residual` | 2.396 | -0.131 | 0.694 | 3.107 | 236 |
| `v31_depth_chart` | 2.417 | -0.071 | 0.688 | 3.139 | 236 |
| `v29_reliability_residual` | 2.434 | -0.107 | 0.686 | 3.152 | 236 |
| `v14_qb_starter` | 2.434 | -0.088 | 0.666 | 3.248 | 236 |
| `v25_draft_capital_residual` | 2.437 | -0.116 | 0.690 | 3.131 | 236 |
| `v16_snap_trend_full` | 2.440 | -0.144 | 0.666 | 3.248 | 236 |
| `v21_tiered_regression` | 2.442 | -0.245 | 0.653 | 3.312 | 236 |
| `v30_reliability_full_refit` | 2.446 | -0.079 | 0.679 | 3.184 | 236 |
| `v19_usage_level_full` | 2.447 | -0.265 | 0.666 | 3.249 | 236 |
| `v7_regression_to_mean` | 2.465 | +0.020 | 0.643 | 3.356 | 236 |
| `v28_reliability_weighting` | 2.467 | +0.177 | 0.673 | 3.216 | 236 |
| `v11_team_context_v2` | 2.471 | -0.251 | 0.627 | 3.433 | 236 |
| `v17_rookie_growth` | 2.476 | -0.138 | 0.661 | 3.272 | 236 |
| `v27_vegas_full_refit` | 2.477 | -0.081 | 0.672 | 3.219 | 236 |
| `v8_age_regression` | 2.478 | -0.215 | 0.629 | 3.425 | 236 |
| `v9_pos_specific` | 2.478 | -0.215 | 0.629 | 3.425 | 236 |
| `v10_stat_efficiency_v2` | 2.480 | -0.199 | 0.628 | 3.426 | 236 |
| `v23_draft_capital` | 2.487 | -0.056 | 0.673 | 3.215 | 236 |
| `v12_no_qb_trajectory` | 2.489 | -0.167 | 0.629 | 3.425 | 236 |
| `v22_advanced_receiving` | 2.490 | +0.198 | 0.675 | 3.206 | 236 |
| `v13_qb_starter` | 2.491 | -0.203 | 0.626 | 3.439 | 236 |
| `v20_learned_usage` | 2.494 | +0.244 | 0.667 | 3.244 | 236 |
| `v5_team_context` | 2.500 | -0.180 | 0.622 | 3.456 | 236 |
| `v4_availability_adjusted` | 2.526 | -0.160 | 0.619 | 3.470 | 236 |
| `v3_stat_weighted` | 2.535 | -0.604 | 0.604 | 3.537 | 236 |
| `v6_usage_share` | 2.545 | -0.377 | 0.610 | 3.509 | 236 |
| `v2_age_adjusted` | 2.548 | -0.612 | 0.602 | 3.546 | 236 |
| `v15_snap_trend` | 2.549 | -0.667 | 0.600 | 3.558 | 236 |
| `v18_usage_level` | 2.604 | -0.788 | 0.590 | 3.599 | 236 |
| `v1_baseline_weighted_ppg` | 2.721 | -0.880 | 0.569 | 3.692 | 236 |
| `naive_prior_season_ppg` | 2.883 | -0.728 | 0.506 | 3.950 | 236 |
| `position_mean_baseline` | 4.452 | +2.382 | 0.001 | 5.618 | 236 |
