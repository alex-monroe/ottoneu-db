# Projection Held-Out Evaluation (GH #572)

_Generated: 2026-06-10 09:32_

**Every model is evaluated out-of-sample on a shared held-out window.** Learned/residual models were retrained on **2021,2022,2023** and never saw the eval seasons **2024,2025**; additive and external models are parameter-free w.r.t. training seasons, so their existing projections are already held-out. All models are scored through the identical `backtest_model` filter (target-season games ≥ 4, true rookies excluded). Unlike [projection-accuracy.md](projection-accuracy.md), **no model here is scored on data it trained on** — this is the honest ranking. See [docs/exec-plans/projection-methodology-audit.md](../exec-plans/projection-methodology-audit.md) (Finding 1b).

## Ranking — combined held-out ALL (lower MAE = better)

_**MAE** is the pooled-over-players ALL error. **Bal MAE** is the position-balanced MAE — the unweighted mean of the per-position MAEs over a fixed set (QB/RB/WR/TE; K excluded as essentially random and not projected by every model) — which neutralises the drifting position mix of the qualifier pool (GH #577). They can disagree: a model can win the pooled MAE while losing the balanced one if it's strong only where players are easy/plentiful._

| Rank | Model | MAE | Bal MAE | Bias | R² | RMSE | N |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `v14_qb_starter` | **2.450** | 2.653 | -0.149 | 0.626 | 3.251 | 647 |
| 2 | `v19_usage_level_full` | 2.456 | 2.659 | -0.280 | 0.627 | 3.249 | 647 |
| 3 | `external_fantasypros_v1` | 2.462 | **2.544** | +0.990 | 0.645 | 3.360 | 430 |
| 4 | `v16_snap_trend_full` | 2.467 | 2.681 | -0.183 | 0.620 | 3.278 | 647 |
| 5 | `v12_no_qb_trajectory` | 2.471 | 2.687 | -0.207 | 0.606 | 3.339 | 647 |
| 6 | `v10_stat_efficiency_v2` | 2.484 | 2.697 | -0.231 | 0.600 | 3.364 | 647 |
| 7 | `v13_qb_starter` | 2.484 | 2.697 | -0.233 | 0.598 | 3.374 | 647 |
| 8 | `v8_age_regression` | 2.485 | 2.697 | -0.235 | 0.599 | 3.369 | 647 |
| 9 | `v9_pos_specific` | 2.485 | 2.697 | -0.235 | 0.599 | 3.369 | 647 |
| 10 | `v11_team_context_v2` | 2.490 | 2.703 | -0.258 | 0.595 | 3.386 | 647 |
| 11 | `v17_rookie_growth` | 2.495 | 2.698 | -0.208 | 0.619 | 3.283 | 647 |
| 12 | `v21_tiered_regression` | 2.498 | 2.702 | +0.021 | 0.601 | 3.361 | 647 |
| 13 | `v3_stat_weighted` | 2.528 | 2.741 | -0.375 | 0.580 | 3.448 | 647 |
| 14 | `v7_regression_to_mean` | 2.529 | 2.737 | +0.018 | 0.595 | 3.385 | 647 |
| 15 | `v2_age_adjusted` | 2.531 | 2.744 | -0.389 | 0.578 | 3.454 | 647 |
| 16 | `v15_snap_trend` | 2.560 | 2.783 | -0.423 | 0.570 | 3.488 | 647 |
| 17 | `v18_usage_level` | 2.563 | 2.774 | -0.520 | 0.571 | 3.484 | 647 |
| 18 | `v4_availability_adjusted` | 2.565 | 2.772 | +0.015 | 0.575 | 3.466 | 647 |
| 19 | `v5_team_context` | 2.566 | 2.775 | -0.006 | 0.572 | 3.479 | 647 |
| 20 | `v6_usage_share` | 2.583 | 2.791 | -0.137 | 0.568 | 3.495 | 647 |
| 21 | `v1_baseline_weighted_ppg` | 2.632 | 2.853 | -0.652 | 0.545 | 3.588 | 647 |
| 22 | `v31_depth_chart` | 2.646 | 2.839 | -1.067 | 0.586 | 3.385 | 635 |
| 23 | `v20_learned_usage` | 2.683 | 2.866 | -1.060 | 0.588 | 3.377 | 635 |
| 24 | `v27_vegas_full_refit` | 2.685 | 2.886 | -1.197 | 0.580 | 3.411 | 635 |
| 25 | `v30_reliability_full_refit` | 2.687 | 2.889 | -1.201 | 0.579 | 3.415 | 635 |
| 26 | `v28_reliability_weighting` | 2.706 | 2.885 | -1.178 | 0.582 | 3.400 | 635 |
| 27 | `v22_advanced_receiving` | 2.714 | 2.884 | -1.044 | 0.581 | 3.408 | 635 |
| 28 | `v26_vegas_residual` | 2.714 | 2.888 | -1.199 | 0.577 | 3.422 | 635 |
| 29 | `v29_reliability_residual` | 2.731 | 2.916 | -1.304 | 0.576 | 3.426 | 635 |
| 30 | `v25_draft_capital_residual` | 2.740 | 2.917 | -1.176 | 0.573 | 3.437 | 635 |
| 31 | `v23_draft_capital` | 2.748 | 2.951 | -1.077 | 0.565 | 3.470 | 635 |
| 32 | `naive_prior_season_ppg` | 2.754 | 3.020 | -0.428 | 0.482 | 3.861 | 667 |
| 33 | `position_mean_baseline` | 3.710 | 4.070 | +0.458 | 0.218 | 4.745 | 667 |

## Combined across eval seasons — by position

### ALL

| Model | MAE | Bias | R² | RMSE | N |
| --- | --- | --- | --- | --- | --- |
| `v14_qb_starter` | 2.450 | -0.149 | 0.626 | 3.251 | 647 |
| `v19_usage_level_full` | 2.456 | -0.280 | 0.627 | 3.249 | 647 |
| `external_fantasypros_v1` | 2.462 | +0.990 | 0.645 | 3.360 | 430 |
| `v16_snap_trend_full` | 2.467 | -0.183 | 0.620 | 3.278 | 647 |
| `v12_no_qb_trajectory` | 2.471 | -0.207 | 0.606 | 3.339 | 647 |
| `v10_stat_efficiency_v2` | 2.484 | -0.231 | 0.600 | 3.364 | 647 |
| `v13_qb_starter` | 2.484 | -0.233 | 0.598 | 3.374 | 647 |
| `v8_age_regression` | 2.485 | -0.235 | 0.599 | 3.369 | 647 |
| `v9_pos_specific` | 2.485 | -0.235 | 0.599 | 3.369 | 647 |
| `v11_team_context_v2` | 2.490 | -0.258 | 0.595 | 3.386 | 647 |
| `v17_rookie_growth` | 2.495 | -0.208 | 0.619 | 3.283 | 647 |
| `v21_tiered_regression` | 2.498 | +0.021 | 0.601 | 3.361 | 647 |
| `v3_stat_weighted` | 2.528 | -0.375 | 0.580 | 3.448 | 647 |
| `v7_regression_to_mean` | 2.529 | +0.018 | 0.595 | 3.385 | 647 |
| `v2_age_adjusted` | 2.531 | -0.389 | 0.578 | 3.454 | 647 |
| `v15_snap_trend` | 2.560 | -0.423 | 0.570 | 3.488 | 647 |
| `v18_usage_level` | 2.563 | -0.520 | 0.571 | 3.484 | 647 |
| `v4_availability_adjusted` | 2.565 | +0.015 | 0.575 | 3.466 | 647 |
| `v5_team_context` | 2.566 | -0.006 | 0.572 | 3.479 | 647 |
| `v6_usage_share` | 2.583 | -0.137 | 0.568 | 3.495 | 647 |
| `v1_baseline_weighted_ppg` | 2.632 | -0.652 | 0.545 | 3.588 | 647 |
| `v31_depth_chart` | 2.646 | -1.067 | 0.586 | 3.385 | 635 |
| `v20_learned_usage` | 2.683 | -1.060 | 0.588 | 3.377 | 635 |
| `v27_vegas_full_refit` | 2.685 | -1.197 | 0.580 | 3.411 | 635 |
| `v30_reliability_full_refit` | 2.687 | -1.201 | 0.579 | 3.415 | 635 |
| `v28_reliability_weighting` | 2.706 | -1.178 | 0.582 | 3.400 | 635 |
| `v22_advanced_receiving` | 2.714 | -1.044 | 0.581 | 3.408 | 635 |
| `v26_vegas_residual` | 2.714 | -1.199 | 0.577 | 3.422 | 635 |
| `v29_reliability_residual` | 2.731 | -1.304 | 0.576 | 3.426 | 635 |
| `v25_draft_capital_residual` | 2.740 | -1.176 | 0.573 | 3.437 | 635 |
| `v23_draft_capital` | 2.748 | -1.077 | 0.565 | 3.470 | 635 |
| `naive_prior_season_ppg` | 2.754 | -0.428 | 0.482 | 3.861 | 667 |
| `position_mean_baseline` | 3.710 | +0.458 | 0.218 | 4.745 | 667 |

### QB

| Model | MAE | Bias | R² | RMSE | N |
| --- | --- | --- | --- | --- | --- |
| `v22_advanced_receiving` | 3.551 | -0.988 | 0.442 | 4.566 | 98 |
| `v26_vegas_residual` | 3.611 | -1.321 | 0.416 | 4.667 | 98 |
| `v28_reliability_weighting` | 3.613 | -1.548 | 0.424 | 4.638 | 98 |
| `v31_depth_chart` | 3.624 | -1.582 | 0.430 | 4.613 | 98 |
| `v20_learned_usage` | 3.626 | -1.493 | 0.426 | 4.629 | 98 |
| `v25_draft_capital_residual` | 3.657 | -1.300 | 0.410 | 4.694 | 98 |
| `v27_vegas_full_refit` | 3.667 | -1.544 | 0.392 | 4.764 | 98 |
| `v30_reliability_full_refit` | 3.673 | -1.577 | 0.387 | 4.783 | 98 |
| `external_fantasypros_v1` | 3.690 | +2.129 | 0.413 | 5.072 | 88 |
| `v29_reliability_residual` | 3.702 | -1.776 | 0.395 | 4.752 | 98 |
| `v23_draft_capital` | 3.745 | -1.045 | 0.389 | 4.776 | 98 |
| `v14_qb_starter` | 3.783 | -0.742 | 0.443 | 4.826 | 102 |
| `v17_rookie_growth` | 3.783 | -0.742 | 0.443 | 4.826 | 102 |
| `v19_usage_level_full` | 3.783 | -0.742 | 0.443 | 4.826 | 102 |
| `v21_tiered_regression` | 3.852 | -0.322 | 0.414 | 4.947 | 102 |
| `v16_snap_trend_full` | 3.857 | -0.755 | 0.429 | 4.886 | 102 |
| `v12_no_qb_trajectory` | 3.919 | -1.111 | 0.354 | 5.194 | 102 |
| `v13_qb_starter` | 3.957 | -1.234 | 0.327 | 5.304 | 102 |
| `v8_age_regression` | 3.959 | -1.246 | 0.331 | 5.287 | 102 |
| `v9_pos_specific` | 3.959 | -1.246 | 0.331 | 5.287 | 102 |
| `v10_stat_efficiency_v2` | 3.976 | -1.232 | 0.332 | 5.282 | 102 |
| `v11_team_context_v2` | 3.986 | -1.284 | 0.322 | 5.324 | 102 |
| `v7_regression_to_mean` | 4.017 | +0.185 | 0.364 | 5.155 | 102 |
| `v2_age_adjusted` | 4.064 | -1.387 | 0.299 | 5.412 | 102 |
| `v18_usage_level` | 4.064 | -1.387 | 0.299 | 5.412 | 102 |
| `v3_stat_weighted` | 4.068 | -1.367 | 0.302 | 5.401 | 102 |
| `v4_availability_adjusted` | 4.085 | +0.079 | 0.329 | 5.297 | 102 |
| `v5_team_context` | 4.134 | +0.044 | 0.320 | 5.329 | 102 |
| `v6_usage_share` | 4.134 | +0.044 | 0.320 | 5.329 | 102 |
| `v15_snap_trend` | 4.158 | -1.400 | 0.281 | 5.481 | 102 |
| `v1_baseline_weighted_ppg` | 4.218 | -1.808 | 0.263 | 5.548 | 102 |
| `naive_prior_season_ppg` | 4.851 | -0.904 | 0.050 | 6.300 | 102 |
| `position_mean_baseline` | 5.184 | -0.755 | -0.013 | 6.506 | 102 |

### RB

| Model | MAE | Bias | R² | RMSE | N |
| --- | --- | --- | --- | --- | --- |
| `v11_team_context_v2` | 2.686 | -0.005 | 0.616 | 3.479 | 137 |
| `v10_stat_efficiency_v2` | 2.702 | +0.057 | 0.615 | 3.480 | 137 |
| `v6_usage_share` | 2.712 | -0.088 | 0.598 | 3.556 | 137 |
| `v3_stat_weighted` | 2.713 | -0.132 | 0.607 | 3.520 | 137 |
| `v5_team_context` | 2.716 | +0.150 | 0.597 | 3.562 | 137 |
| `v8_age_regression` | 2.717 | +0.039 | 0.612 | 3.495 | 137 |
| `v9_pos_specific` | 2.717 | +0.039 | 0.612 | 3.495 | 137 |
| `v12_no_qb_trajectory` | 2.717 | +0.039 | 0.612 | 3.495 | 137 |
| `v13_qb_starter` | 2.717 | +0.039 | 0.612 | 3.495 | 137 |
| `v14_qb_starter` | 2.717 | +0.039 | 0.612 | 3.495 | 137 |
| `external_fantasypros_v1` | 2.718 | +1.056 | 0.636 | 3.345 | 100 |
| `v2_age_adjusted` | 2.719 | -0.175 | 0.605 | 3.526 | 137 |
| `v19_usage_level_full` | 2.721 | -0.200 | 0.616 | 3.479 | 137 |
| `v7_regression_to_mean` | 2.725 | +0.126 | 0.606 | 3.523 | 137 |
| `v4_availability_adjusted` | 2.758 | +0.176 | 0.594 | 3.574 | 137 |
| `v18_usage_level` | 2.762 | -0.413 | 0.596 | 3.569 | 137 |
| `v16_snap_trend_full` | 2.769 | -0.068 | 0.601 | 3.543 | 137 |
| `naive_prior_season_ppg` | 2.777 | -0.454 | 0.543 | 3.857 | 144 |
| `v15_snap_trend` | 2.778 | -0.281 | 0.589 | 3.596 | 137 |
| `v21_tiered_regression` | 2.782 | +0.220 | 0.578 | 3.647 | 137 |
| `v17_rookie_growth` | 2.785 | -0.068 | 0.600 | 3.547 | 137 |
| `v1_baseline_weighted_ppg` | 2.806 | -0.518 | 0.561 | 3.716 | 137 |
| `v31_depth_chart` | 2.963 | -0.978 | 0.568 | 3.656 | 135 |
| `v20_learned_usage` | 3.101 | -1.005 | 0.533 | 3.802 | 135 |
| `v28_reliability_weighting` | 3.154 | -1.172 | 0.533 | 3.802 | 135 |
| `v29_reliability_residual` | 3.157 | -1.292 | 0.534 | 3.797 | 135 |
| `v26_vegas_residual` | 3.173 | -1.236 | 0.520 | 3.855 | 135 |
| `v27_vegas_full_refit` | 3.186 | -1.345 | 0.518 | 3.860 | 135 |
| `v30_reliability_full_refit` | 3.191 | -1.350 | 0.517 | 3.867 | 135 |
| `v25_draft_capital_residual` | 3.207 | -1.210 | 0.516 | 3.868 | 135 |
| `v22_advanced_receiving` | 3.208 | -1.094 | 0.514 | 3.877 | 135 |
| `v23_draft_capital` | 3.253 | -1.173 | 0.491 | 3.967 | 135 |
| `position_mean_baseline` | 4.557 | +0.934 | 0.049 | 5.566 | 144 |

### WR

| Model | MAE | Bias | R² | RMSE | N |
| --- | --- | --- | --- | --- | --- |
| `external_fantasypros_v1` | 2.200 | +0.436 | 0.610 | 2.767 | 131 |
| `v16_snap_trend_full` | 2.348 | -0.214 | 0.581 | 2.997 | 200 |
| `v8_age_regression` | 2.373 | -0.175 | 0.582 | 2.993 | 200 |
| `v9_pos_specific` | 2.373 | -0.175 | 0.582 | 2.993 | 200 |
| `v12_no_qb_trajectory` | 2.373 | -0.175 | 0.582 | 2.993 | 200 |
| `v13_qb_starter` | 2.373 | -0.175 | 0.582 | 2.993 | 200 |
| `v14_qb_starter` | 2.373 | -0.175 | 0.582 | 2.993 | 200 |
| `v10_stat_efficiency_v2` | 2.376 | -0.175 | 0.582 | 2.992 | 200 |
| `v19_usage_level_full` | 2.380 | -0.379 | 0.581 | 2.996 | 200 |
| `v11_team_context_v2` | 2.390 | -0.193 | 0.572 | 3.028 | 200 |
| `v21_tiered_regression` | 2.408 | -0.166 | 0.549 | 3.108 | 200 |
| `v7_regression_to_mean` | 2.421 | -0.279 | 0.564 | 3.056 | 200 |
| `v15_snap_trend` | 2.425 | -0.431 | 0.542 | 3.132 | 200 |
| `v3_stat_weighted` | 2.430 | -0.382 | 0.546 | 3.119 | 200 |
| `v2_age_adjusted` | 2.435 | -0.392 | 0.543 | 3.127 | 200 |
| `v4_availability_adjusted` | 2.444 | -0.270 | 0.535 | 3.155 | 200 |
| `v17_rookie_growth` | 2.450 | -0.267 | 0.566 | 3.050 | 200 |
| `v5_team_context` | 2.459 | -0.293 | 0.527 | 3.181 | 200 |
| `v18_usage_level` | 2.488 | -0.596 | 0.528 | 3.180 | 200 |
| `v6_usage_share` | 2.488 | -0.497 | 0.515 | 3.222 | 200 |
| `naive_prior_season_ppg` | 2.587 | -0.551 | 0.480 | 3.375 | 207 |
| `v1_baseline_weighted_ppg` | 2.614 | -0.624 | 0.491 | 3.301 | 200 |
| `v20_learned_usage` | 2.637 | -0.923 | 0.510 | 3.186 | 196 |
| `v30_reliability_full_refit` | 2.689 | -1.484 | 0.490 | 3.252 | 196 |
| `v27_vegas_full_refit` | 2.692 | -1.488 | 0.489 | 3.256 | 196 |
| `v26_vegas_residual` | 2.749 | -1.615 | 0.470 | 3.315 | 196 |
| `v22_advanced_receiving` | 2.769 | -1.347 | 0.468 | 3.321 | 196 |
| `v28_reliability_weighting` | 2.771 | -1.450 | 0.462 | 3.340 | 196 |
| `v23_draft_capital` | 2.780 | -1.432 | 0.468 | 3.320 | 196 |
| `v25_draft_capital_residual` | 2.791 | -1.567 | 0.466 | 3.329 | 196 |
| `v29_reliability_residual` | 2.800 | -1.627 | 0.459 | 3.349 | 196 |
| `v31_depth_chart` | 2.815 | -1.514 | 0.416 | 3.478 | 196 |
| `position_mean_baseline` | 3.770 | +0.975 | 0.056 | 4.549 | 207 |

### TE

| Model | MAE | Bias | R² | RMSE | N |
| --- | --- | --- | --- | --- | --- |
| `external_fantasypros_v1` | 1.568 | +0.683 | 0.618 | 2.057 | 111 |
| `v10_stat_efficiency_v2` | 1.736 | +0.017 | 0.576 | 2.216 | 144 |
| `v8_age_regression` | 1.740 | +0.024 | 0.574 | 2.221 | 144 |
| `v9_pos_specific` | 1.740 | +0.024 | 0.574 | 2.221 | 144 |
| `v12_no_qb_trajectory` | 1.740 | +0.024 | 0.574 | 2.221 | 144 |
| `v13_qb_starter` | 1.740 | +0.024 | 0.574 | 2.221 | 144 |
| `v14_qb_starter` | 1.740 | +0.024 | 0.574 | 2.221 | 144 |
| `v16_snap_trend_full` | 1.749 | +0.031 | 0.572 | 2.225 | 144 |
| `v11_team_context_v2` | 1.750 | +0.016 | 0.571 | 2.229 | 144 |
| `v3_stat_weighted` | 1.753 | -0.063 | 0.565 | 2.245 | 144 |
| `v19_usage_level_full` | 1.754 | -0.054 | 0.570 | 2.231 | 144 |
| `v2_age_adjusted` | 1.756 | -0.058 | 0.564 | 2.246 | 144 |
| `v21_tiered_regression` | 1.765 | +0.242 | 0.555 | 2.269 | 144 |
| `v15_snap_trend` | 1.770 | -0.050 | 0.564 | 2.246 | 144 |
| `v1_baseline_weighted_ppg` | 1.773 | -0.326 | 0.541 | 2.304 | 144 |
| `v17_rookie_growth` | 1.774 | -0.014 | 0.564 | 2.246 | 144 |
| `v18_usage_level` | 1.784 | -0.136 | 0.550 | 2.283 | 144 |
| `v7_regression_to_mean` | 1.784 | +0.109 | 0.545 | 2.295 | 144 |
| `v5_team_context` | 1.793 | +0.104 | 0.538 | 2.312 | 144 |
| `v4_availability_adjusted` | 1.800 | +0.117 | 0.539 | 2.309 | 144 |
| `v6_usage_share` | 1.828 | +0.025 | 0.524 | 2.346 | 144 |
| `naive_prior_season_ppg` | 1.864 | -0.197 | 0.490 | 2.435 | 150 |
| `v31_depth_chart` | 1.953 | -0.658 | 0.529 | 2.322 | 142 |
| `v27_vegas_full_refit` | 1.998 | -0.746 | 0.511 | 2.367 | 142 |
| `v30_reliability_full_refit` | 2.001 | -0.748 | 0.511 | 2.367 | 142 |
| `v28_reliability_weighting` | 2.003 | -0.737 | 0.509 | 2.372 | 142 |
| `v29_reliability_residual` | 2.007 | -0.782 | 0.509 | 2.373 | 142 |
| `v22_advanced_receiving` | 2.008 | -0.701 | 0.491 | 2.414 | 142 |
| `v25_draft_capital_residual` | 2.013 | -0.743 | 0.492 | 2.412 | 142 |
| `v26_vegas_residual` | 2.019 | -0.740 | 0.496 | 2.403 | 142 |
| `v23_draft_capital` | 2.028 | -0.772 | 0.482 | 2.437 | 142 |
| `v20_learned_usage` | 2.099 | -1.109 | 0.453 | 2.504 | 142 |
| `position_mean_baseline` | 2.769 | +0.223 | 0.017 | 3.381 | 150 |

### K

| Model | MAE | Bias | R² | RMSE | N |
| --- | --- | --- | --- | --- | --- |
| `position_mean_baseline` | 1.471 | +0.195 | -0.045 | 1.934 | 64 |
| `v31_depth_chart` | 1.502 | +0.002 | -0.094 | 1.978 | 64 |
| `v12_no_qb_trajectory` | 1.589 | +0.090 | -0.251 | 2.115 | 64 |
| `v14_qb_starter` | 1.589 | +0.090 | -0.251 | 2.115 | 64 |
| `v17_rookie_growth` | 1.589 | +0.090 | -0.251 | 2.115 | 64 |
| `v19_usage_level_full` | 1.589 | +0.090 | -0.251 | 2.115 | 64 |
| `v16_snap_trend_full` | 1.598 | +0.101 | -0.253 | 2.117 | 64 |
| `v30_reliability_full_refit` | 1.625 | -0.454 | -0.208 | 2.079 | 64 |
| `v27_vegas_full_refit` | 1.631 | -0.464 | -0.213 | 2.083 | 64 |
| `v21_tiered_regression` | 1.658 | +0.230 | -0.397 | 2.235 | 64 |
| `v23_draft_capital` | 1.659 | -0.517 | -0.241 | 2.107 | 64 |
| `v8_age_regression` | 1.662 | +0.019 | -0.393 | 2.232 | 64 |
| `v9_pos_specific` | 1.662 | +0.019 | -0.393 | 2.232 | 64 |
| `v10_stat_efficiency_v2` | 1.662 | +0.019 | -0.393 | 2.232 | 64 |
| `v11_team_context_v2` | 1.662 | +0.019 | -0.393 | 2.232 | 64 |
| `v13_qb_starter` | 1.662 | +0.019 | -0.393 | 2.232 | 64 |
| `v1_baseline_weighted_ppg` | 1.727 | +0.079 | -0.541 | 2.348 | 64 |
| `v2_age_adjusted` | 1.732 | +0.006 | -0.517 | 2.329 | 64 |
| `v3_stat_weighted` | 1.732 | +0.006 | -0.517 | 2.329 | 64 |
| `v18_usage_level` | 1.732 | +0.006 | -0.517 | 2.329 | 64 |
| `v28_reliability_weighting` | 1.736 | -0.768 | -0.298 | 2.155 | 64 |
| `v15_snap_trend` | 1.742 | +0.017 | -0.519 | 2.331 | 64 |
| `v29_reliability_residual` | 1.743 | -0.781 | -0.301 | 2.157 | 64 |
| `v7_regression_to_mean` | 1.753 | +0.243 | -0.636 | 2.419 | 64 |
| `v20_learned_usage` | 1.789 | -0.824 | -0.363 | 2.208 | 64 |
| `v22_advanced_receiving` | 1.790 | -0.856 | -0.357 | 2.203 | 64 |
| `v25_draft_capital_residual` | 1.812 | -0.677 | -0.409 | 2.245 | 64 |
| `v26_vegas_residual` | 1.812 | -0.677 | -0.409 | 2.245 | 64 |
| `v4_availability_adjusted` | 1.826 | +0.229 | -0.760 | 2.509 | 64 |
| `v5_team_context` | 1.826 | +0.229 | -0.760 | 2.509 | 64 |
| `v6_usage_share` | 1.826 | +0.229 | -0.760 | 2.509 | 64 |
| `naive_prior_season_ppg` | 1.980 | +0.247 | -1.198 | 2.804 | 64 |

## Season 2024 — ALL (held-out)

| Model | MAE | Bias | R² | RMSE | N |
| --- | --- | --- | --- | --- | --- |
| `v31_depth_chart` | 2.636 | -0.928 | 0.566 | 3.345 | 271 |
| `v19_usage_level_full` | 2.660 | +0.011 | 0.552 | 3.440 | 274 |
| `v14_qb_starter` | 2.660 | +0.168 | 0.549 | 3.449 | 274 |
| `v12_no_qb_trajectory` | 2.663 | +0.106 | 0.537 | 3.495 | 274 |
| `v16_snap_trend_full` | 2.669 | +0.152 | 0.543 | 3.471 | 274 |
| `external_fantasypros_v1` | 2.671 | +1.449 | 0.579 | 3.509 | 187 |
| `v13_qb_starter` | 2.675 | +0.082 | 0.525 | 3.540 | 274 |
| `v11_team_context_v2` | 2.676 | +0.063 | 0.523 | 3.546 | 274 |
| `v17_rookie_growth` | 2.676 | +0.135 | 0.544 | 3.468 | 274 |
| `v8_age_regression` | 2.682 | +0.089 | 0.524 | 3.544 | 274 |
| `v9_pos_specific` | 2.682 | +0.089 | 0.524 | 3.544 | 274 |
| `v10_stat_efficiency_v2` | 2.690 | +0.090 | 0.524 | 3.542 | 274 |
| `v22_advanced_receiving` | 2.691 | -0.675 | 0.535 | 3.462 | 271 |
| `v20_learned_usage` | 2.712 | -0.796 | 0.531 | 3.477 | 271 |
| `v23_draft_capital` | 2.719 | -0.659 | 0.519 | 3.522 | 271 |
| `v2_age_adjusted` | 2.731 | -0.043 | 0.505 | 3.612 | 274 |
| `v3_stat_weighted` | 2.732 | -0.026 | 0.507 | 3.606 | 274 |
| `v26_vegas_residual` | 2.735 | -0.845 | 0.524 | 3.503 | 271 |
| `v25_draft_capital_residual` | 2.739 | -0.815 | 0.521 | 3.514 | 271 |
| `v21_tiered_regression` | 2.739 | +0.406 | 0.510 | 3.597 | 274 |
| `v27_vegas_full_refit` | 2.745 | -0.993 | 0.513 | 3.544 | 271 |
| `v30_reliability_full_refit` | 2.754 | -0.994 | 0.510 | 3.556 | 271 |
| `v1_baseline_weighted_ppg` | 2.755 | -0.289 | 0.482 | 3.698 | 274 |
| `v18_usage_level` | 2.757 | -0.199 | 0.500 | 3.631 | 274 |
| `v15_snap_trend` | 2.764 | -0.059 | 0.497 | 3.642 | 274 |
| `v28_reliability_weighting` | 2.765 | -1.016 | 0.513 | 3.545 | 271 |
| `v7_regression_to_mean` | 2.796 | +0.362 | 0.497 | 3.643 | 274 |
| `v29_reliability_residual` | 2.803 | -1.153 | 0.500 | 3.591 | 271 |
| `v4_availability_adjusted` | 2.838 | +0.413 | 0.475 | 3.722 | 274 |
| `v5_team_context` | 2.843 | +0.387 | 0.471 | 3.735 | 274 |
| `v6_usage_share` | 2.850 | +0.231 | 0.471 | 3.737 | 274 |
| `naive_prior_season_ppg` | 2.963 | +0.039 | 0.369 | 4.112 | 278 |
| `position_mean_baseline` | 3.650 | +0.702 | 0.174 | 4.704 | 278 |

## Season 2025 — ALL (held-out)

| Model | MAE | Bias | R² | RMSE | N |
| --- | --- | --- | --- | --- | --- |
| `v14_qb_starter` | 2.296 | -0.381 | 0.656 | 3.097 | 373 |
| `external_fantasypros_v1` | 2.301 | +0.637 | 0.675 | 3.241 | 243 |
| `v19_usage_level_full` | 2.306 | -0.493 | 0.655 | 3.102 | 373 |
| `v16_snap_trend_full` | 2.320 | -0.428 | 0.650 | 3.128 | 373 |
| `v21_tiered_regression` | 2.320 | -0.262 | 0.638 | 3.178 | 373 |
| `v12_no_qb_trajectory` | 2.330 | -0.437 | 0.629 | 3.220 | 373 |
| `v10_stat_efficiency_v2` | 2.333 | -0.466 | 0.627 | 3.227 | 373 |
| `v7_regression_to_mean` | 2.333 | -0.235 | 0.637 | 3.182 | 373 |
| `v8_age_regression` | 2.340 | -0.473 | 0.625 | 3.236 | 373 |
| `v9_pos_specific` | 2.340 | -0.473 | 0.625 | 3.236 | 373 |
| `v13_qb_starter` | 2.344 | -0.465 | 0.623 | 3.247 | 373 |
| `v11_team_context_v2` | 2.353 | -0.493 | 0.619 | 3.263 | 373 |
| `v17_rookie_growth` | 2.362 | -0.460 | 0.647 | 3.139 | 373 |
| `v5_team_context` | 2.363 | -0.295 | 0.615 | 3.279 | 373 |
| `v4_availability_adjusted` | 2.364 | -0.278 | 0.618 | 3.266 | 373 |
| `v3_stat_weighted` | 2.379 | -0.631 | 0.604 | 3.328 | 373 |
| `v2_age_adjusted` | 2.385 | -0.643 | 0.602 | 3.334 | 373 |
| `v6_usage_share` | 2.386 | -0.407 | 0.609 | 3.305 | 373 |
| `v15_snap_trend` | 2.409 | -0.691 | 0.593 | 3.370 | 373 |
| `v18_usage_level` | 2.421 | -0.756 | 0.593 | 3.372 | 373 |
| `v1_baseline_weighted_ppg` | 2.543 | -0.919 | 0.560 | 3.505 | 373 |
| `naive_prior_season_ppg` | 2.603 | -0.761 | 0.522 | 3.671 | 389 |
| `v30_reliability_full_refit` | 2.636 | -1.356 | 0.602 | 3.305 | 364 |
| `v27_vegas_full_refit` | 2.641 | -1.349 | 0.601 | 3.308 | 364 |
| `v31_depth_chart` | 2.654 | -1.170 | 0.575 | 3.415 | 364 |
| `v20_learned_usage` | 2.661 | -1.256 | 0.603 | 3.301 | 364 |
| `v28_reliability_weighting` | 2.663 | -1.298 | 0.606 | 3.288 | 364 |
| `v29_reliability_residual` | 2.678 | -1.418 | 0.603 | 3.299 | 364 |
| `v26_vegas_residual` | 2.699 | -1.462 | 0.588 | 3.361 | 364 |
| `v22_advanced_receiving` | 2.731 | -1.318 | 0.587 | 3.366 | 364 |
| `v25_draft_capital_residual` | 2.741 | -1.445 | 0.584 | 3.377 | 364 |
| `v23_draft_capital` | 2.770 | -1.389 | 0.571 | 3.431 | 364 |
| `position_mean_baseline` | 3.753 | +0.283 | 0.192 | 4.774 | 389 |
