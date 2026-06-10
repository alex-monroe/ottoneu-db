# Projection Held-Out Evaluation (GH #572) — rolling-origin

_Generated: 2026-06-10 14:17_

**Rolling-origin protocol (GH #594).** Each eval season is scored by models that trained on an *expanding window of only the seasons before it* — train 2021,2022 → eval 2023; train 2021,2022,2023 → eval 2024; train 2021,2022,2023,2024 → eval 2025. This guards the single fixed holdout against decay (no one window drives every accept/reject decision) and removes the fixed protocol's 3-vs-5 training-season handicap on learned models. The combined rows below pool every fold's player-seasons; the per-season tables are the individual folds. See [docs/exec-plans/projection-methodology-audit.md](../exec-plans/projection-methodology-audit.md) (rolling-origin protocol).

## Ranking — combined held-out ALL (lower MAE = better)

_**MAE** is the pooled-over-players ALL error. **Bal MAE** is the position-balanced MAE — the unweighted mean of the per-position MAEs over a fixed set (QB/RB/WR/TE; K excluded as essentially random and not projected by every model) — which neutralises the drifting position mix of the qualifier pool (GH #577). They can disagree: a model can win the pooled MAE while losing the balanced one if it's strong only where players are easy/plentiful._

| Rank | Model | MAE | Bal MAE | Bias | R² | RMSE | N |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `v31_depth_chart` | **2.232** | 2.450 | -0.161 | 0.668 | 2.983 | 1216 |
| 2 | `v27_vegas_full_refit` | 2.298 | 2.527 | -0.159 | 0.649 | 3.065 | 1216 |
| 3 | `v30_reliability_full_refit` | 2.300 | 2.531 | -0.175 | 0.649 | 3.067 | 1216 |
| 4 | `v29_reliability_residual` | 2.306 | 2.538 | -0.271 | 0.648 | 3.070 | 1216 |
| 5 | `v28_reliability_weighting` | 2.307 | 2.535 | -0.088 | 0.643 | 3.090 | 1216 |
| 6 | `v23_draft_capital` | 2.315 | 2.541 | -0.182 | 0.646 | 3.078 | 1216 |
| 7 | `v22_advanced_receiving` | 2.316 | 2.534 | -0.088 | 0.642 | 3.096 | 1216 |
| 8 | `v26_vegas_residual` | 2.317 | 2.540 | -0.301 | 0.646 | 3.078 | 1216 |
| 9 | `v25_draft_capital_residual` | 2.319 | 2.542 | -0.281 | 0.646 | 3.078 | 1216 |
| 10 | `v20_learned_usage` | 2.321 | 2.535 | -0.069 | 0.641 | 3.101 | 1216 |
| 11 | `v14_qb_starter` | 2.322 | 2.554 | -0.339 | 0.636 | 3.156 | 1261 |
| 12 | `v16_snap_trend_full` | 2.325 | 2.567 | -0.366 | 0.632 | 3.175 | 1261 |
| 13 | `external_fantasypros_v1` | 2.330 | **2.410** | +1.054 | 0.679 | 3.227 | 599 |
| 14 | `v19_usage_level_full` | 2.332 | 2.563 | -0.453 | 0.633 | 3.170 | 1261 |
| 15 | `v12_no_qb_trajectory` | 2.335 | 2.581 | -0.385 | 0.624 | 3.207 | 1261 |
| 16 | `v4_availability_adjusted` | 2.337 | 2.592 | -0.134 | 0.611 | 3.265 | 1261 |
| 17 | `v10_stat_efficiency_v2` | 2.338 | 2.582 | -0.397 | 0.623 | 3.213 | 1261 |
| 18 | `v8_age_regression` | 2.338 | 2.581 | -0.404 | 0.622 | 3.217 | 1261 |
| 19 | `v9_pos_specific` | 2.338 | 2.581 | -0.404 | 0.622 | 3.217 | 1261 |
| 20 | `v13_qb_starter` | 2.340 | 2.584 | -0.401 | 0.622 | 3.220 | 1261 |
| 21 | `v17_rookie_growth` | 2.341 | 2.572 | -0.380 | 0.633 | 3.168 | 1261 |
| 22 | `v7_regression_to_mean` | 2.341 | 2.594 | -0.085 | 0.619 | 3.228 | 1261 |
| 23 | `v5_team_context` | 2.357 | 2.616 | -0.151 | 0.603 | 3.298 | 1261 |
| 24 | `v11_team_context_v2` | 2.357 | 2.602 | -0.414 | 0.616 | 3.243 | 1261 |
| 25 | `v3_stat_weighted` | 2.376 | 2.625 | -0.585 | 0.601 | 3.307 | 1261 |
| 26 | `v2_age_adjusted` | 2.377 | 2.625 | -0.587 | 0.600 | 3.309 | 1261 |
| 27 | `v6_usage_share` | 2.383 | 2.635 | -0.259 | 0.597 | 3.323 | 1261 |
| 28 | `v21_tiered_regression` | 2.395 | 2.638 | -0.316 | 0.599 | 3.314 | 1261 |
| 29 | `v15_snap_trend` | 2.396 | 2.658 | -0.614 | 0.594 | 3.336 | 1261 |
| 30 | `v18_usage_level` | 2.417 | 2.659 | -0.700 | 0.589 | 3.353 | 1261 |
| 31 | `v1_baseline_weighted_ppg` | 2.430 | 2.681 | -0.751 | 0.585 | 3.373 | 1261 |
| 32 | `naive_prior_season_ppg` | 2.498 | 2.816 | -0.448 | 0.539 | 3.559 | 1276 |
| 33 | `position_mean_baseline` | 3.692 | 4.045 | +0.710 | 0.179 | 4.747 | 1276 |

## Combined across eval seasons — by position

### ALL

| Model | MAE | Bias | R² | RMSE | N |
| --- | --- | --- | --- | --- | --- |
| `v31_depth_chart` | 2.232 | -0.161 | 0.668 | 2.983 | 1216 |
| `v27_vegas_full_refit` | 2.298 | -0.159 | 0.649 | 3.065 | 1216 |
| `v30_reliability_full_refit` | 2.300 | -0.175 | 0.649 | 3.067 | 1216 |
| `v29_reliability_residual` | 2.306 | -0.271 | 0.648 | 3.070 | 1216 |
| `v28_reliability_weighting` | 2.307 | -0.088 | 0.643 | 3.090 | 1216 |
| `v23_draft_capital` | 2.315 | -0.182 | 0.646 | 3.078 | 1216 |
| `v22_advanced_receiving` | 2.316 | -0.088 | 0.642 | 3.096 | 1216 |
| `v26_vegas_residual` | 2.317 | -0.301 | 0.646 | 3.078 | 1216 |
| `v25_draft_capital_residual` | 2.319 | -0.281 | 0.646 | 3.078 | 1216 |
| `v20_learned_usage` | 2.321 | -0.069 | 0.641 | 3.101 | 1216 |
| `v14_qb_starter` | 2.322 | -0.339 | 0.636 | 3.156 | 1261 |
| `v16_snap_trend_full` | 2.325 | -0.366 | 0.632 | 3.175 | 1261 |
| `external_fantasypros_v1` | 2.330 | +1.054 | 0.679 | 3.227 | 599 |
| `v19_usage_level_full` | 2.332 | -0.453 | 0.633 | 3.170 | 1261 |
| `v12_no_qb_trajectory` | 2.335 | -0.385 | 0.624 | 3.207 | 1261 |
| `v4_availability_adjusted` | 2.337 | -0.134 | 0.611 | 3.265 | 1261 |
| `v10_stat_efficiency_v2` | 2.338 | -0.397 | 0.623 | 3.213 | 1261 |
| `v8_age_regression` | 2.338 | -0.404 | 0.622 | 3.217 | 1261 |
| `v9_pos_specific` | 2.338 | -0.404 | 0.622 | 3.217 | 1261 |
| `v13_qb_starter` | 2.340 | -0.401 | 0.622 | 3.220 | 1261 |
| `v17_rookie_growth` | 2.341 | -0.380 | 0.633 | 3.168 | 1261 |
| `v7_regression_to_mean` | 2.341 | -0.085 | 0.619 | 3.228 | 1261 |
| `v5_team_context` | 2.357 | -0.151 | 0.603 | 3.298 | 1261 |
| `v11_team_context_v2` | 2.357 | -0.414 | 0.616 | 3.243 | 1261 |
| `v3_stat_weighted` | 2.376 | -0.585 | 0.601 | 3.307 | 1261 |
| `v2_age_adjusted` | 2.377 | -0.587 | 0.600 | 3.309 | 1261 |
| `v6_usage_share` | 2.383 | -0.259 | 0.597 | 3.323 | 1261 |
| `v21_tiered_regression` | 2.395 | -0.316 | 0.599 | 3.314 | 1261 |
| `v15_snap_trend` | 2.396 | -0.614 | 0.594 | 3.336 | 1261 |
| `v18_usage_level` | 2.417 | -0.700 | 0.589 | 3.353 | 1261 |
| `v1_baseline_weighted_ppg` | 2.430 | -0.751 | 0.585 | 3.373 | 1261 |
| `naive_prior_season_ppg` | 2.498 | -0.448 | 0.539 | 3.559 | 1276 |
| `position_mean_baseline` | 3.692 | +0.710 | 0.179 | 4.747 | 1276 |

### QB

| Model | MAE | Bias | R² | RMSE | N |
| --- | --- | --- | --- | --- | --- |
| `external_fantasypros_v1` | 3.517 | +2.001 | 0.438 | 4.849 | 122 |
| `v22_advanced_receiving` | 3.665 | -0.283 | 0.424 | 4.699 | 152 |
| `v31_depth_chart` | 3.666 | -0.575 | 0.441 | 4.630 | 152 |
| `v20_learned_usage` | 3.682 | -0.365 | 0.417 | 4.726 | 152 |
| `v26_vegas_residual` | 3.700 | -0.538 | 0.407 | 4.767 | 152 |
| `v28_reliability_weighting` | 3.704 | -0.455 | 0.414 | 4.738 | 152 |
| `v25_draft_capital_residual` | 3.713 | -0.500 | 0.410 | 4.755 | 152 |
| `v27_vegas_full_refit` | 3.728 | -0.501 | 0.407 | 4.769 | 152 |
| `v30_reliability_full_refit` | 3.742 | -0.552 | 0.402 | 4.788 | 152 |
| `v29_reliability_residual` | 3.746 | -0.641 | 0.400 | 4.797 | 152 |
| `v23_draft_capital` | 3.747 | -0.393 | 0.411 | 4.751 | 152 |
| `v14_qb_starter` | 3.879 | -0.514 | 0.383 | 5.083 | 157 |
| `v17_rookie_growth` | 3.879 | -0.514 | 0.383 | 5.083 | 157 |
| `v19_usage_level_full` | 3.879 | -0.514 | 0.383 | 5.083 | 157 |
| `v16_snap_trend_full` | 3.947 | -0.557 | 0.365 | 5.153 | 157 |
| `v8_age_regression` | 3.984 | -1.006 | 0.313 | 5.360 | 157 |
| `v9_pos_specific` | 3.984 | -1.006 | 0.313 | 5.360 | 157 |
| `v12_no_qb_trajectory` | 3.987 | -0.883 | 0.321 | 5.330 | 157 |
| `v10_stat_efficiency_v2` | 3.998 | -0.996 | 0.315 | 5.355 | 157 |
| `v13_qb_starter` | 3.999 | -0.981 | 0.310 | 5.372 | 157 |
| `v11_team_context_v2` | 4.012 | -1.045 | 0.306 | 5.390 | 157 |
| `v21_tiered_regression` | 4.026 | -0.367 | 0.332 | 5.289 | 157 |
| `v7_regression_to_mean` | 4.090 | +0.443 | 0.326 | 5.311 | 157 |
| `v2_age_adjusted` | 4.093 | -1.305 | 0.268 | 5.534 | 157 |
| `v18_usage_level` | 4.093 | -1.305 | 0.268 | 5.534 | 157 |
| `v3_stat_weighted` | 4.103 | -1.296 | 0.268 | 5.537 | 157 |
| `v4_availability_adjusted` | 4.128 | +0.192 | 0.293 | 5.438 | 157 |
| `v6_usage_share` | 4.162 | +0.148 | 0.284 | 5.475 | 157 |
| `v1_baseline_weighted_ppg` | 4.168 | -1.648 | 0.250 | 5.601 | 157 |
| `v5_team_context` | 4.186 | +0.150 | 0.283 | 5.479 | 157 |
| `v15_snap_trend` | 4.207 | -1.347 | 0.244 | 5.623 | 157 |
| `naive_prior_season_ppg` | 4.716 | -0.817 | 0.076 | 6.219 | 157 |
| `position_mean_baseline` | 5.482 | +0.774 | -0.015 | 6.519 | 157 |

### RB

| Model | MAE | Bias | R² | RMSE | N |
| --- | --- | --- | --- | --- | --- |
| `v4_availability_adjusted` | 2.384 | -0.039 | 0.611 | 3.374 | 302 |
| `v5_team_context` | 2.388 | -0.041 | 0.601 | 3.417 | 302 |
| `v10_stat_efficiency_v2` | 2.405 | -0.196 | 0.624 | 3.314 | 302 |
| `v8_age_regression` | 2.407 | -0.213 | 0.623 | 3.323 | 302 |
| `v9_pos_specific` | 2.407 | -0.213 | 0.623 | 3.323 | 302 |
| `v12_no_qb_trajectory` | 2.407 | -0.213 | 0.623 | 3.323 | 302 |
| `v13_qb_starter` | 2.407 | -0.213 | 0.623 | 3.323 | 302 |
| `v14_qb_starter` | 2.407 | -0.213 | 0.623 | 3.323 | 302 |
| `v31_depth_chart` | 2.411 | +0.136 | 0.638 | 3.218 | 287 |
| `v3_stat_weighted` | 2.412 | -0.402 | 0.609 | 3.381 | 302 |
| `v16_snap_trend_full` | 2.414 | -0.269 | 0.619 | 3.339 | 302 |
| `v6_usage_share` | 2.417 | -0.222 | 0.594 | 3.446 | 302 |
| `v2_age_adjusted` | 2.418 | -0.407 | 0.607 | 3.392 | 302 |
| `v19_usage_level_full` | 2.420 | -0.393 | 0.619 | 3.337 | 302 |
| `v7_regression_to_mean` | 2.427 | -0.024 | 0.606 | 3.394 | 302 |
| `v11_team_context_v2` | 2.431 | -0.215 | 0.616 | 3.352 | 302 |
| `v15_snap_trend` | 2.442 | -0.463 | 0.599 | 3.423 | 302 |
| `v17_rookie_growth` | 2.454 | -0.300 | 0.612 | 3.368 | 302 |
| `v1_baseline_weighted_ppg` | 2.465 | -0.590 | 0.588 | 3.470 | 302 |
| `v18_usage_level` | 2.465 | -0.587 | 0.591 | 3.460 | 302 |
| `naive_prior_season_ppg` | 2.479 | -0.247 | 0.563 | 3.574 | 305 |
| `v21_tiered_regression` | 2.506 | -0.137 | 0.574 | 3.531 | 302 |
| `v20_learned_usage` | 2.565 | +0.106 | 0.594 | 3.405 | 287 |
| `v27_vegas_full_refit` | 2.590 | +0.094 | 0.598 | 3.389 | 287 |
| `v26_vegas_residual` | 2.593 | -0.030 | 0.604 | 3.365 | 287 |
| `external_fantasypros_v1` | 2.597 | +1.313 | 0.645 | 3.305 | 139 |
| `v23_draft_capital` | 2.597 | +0.033 | 0.597 | 3.392 | 287 |
| `v25_draft_capital_residual` | 2.598 | -0.021 | 0.602 | 3.374 | 287 |
| `v29_reliability_residual` | 2.603 | +0.071 | 0.598 | 3.391 | 287 |
| `v30_reliability_full_refit` | 2.604 | +0.088 | 0.595 | 3.401 | 287 |
| `v22_advanced_receiving` | 2.627 | +0.143 | 0.586 | 3.440 | 287 |
| `v28_reliability_weighting` | 2.638 | +0.254 | 0.580 | 3.465 | 287 |
| `position_mean_baseline` | 4.384 | +0.976 | -0.033 | 5.495 | 305 |

### WR

| Model | MAE | Bias | R² | RMSE | N |
| --- | --- | --- | --- | --- | --- |
| `external_fantasypros_v1` | 2.037 | +0.498 | 0.694 | 2.626 | 187 |
| `v31_depth_chart` | 2.192 | -0.382 | 0.618 | 2.772 | 431 |
| `v30_reliability_full_refit` | 2.203 | -0.336 | 0.620 | 2.767 | 431 |
| `v27_vegas_full_refit` | 2.213 | -0.337 | 0.616 | 2.780 | 431 |
| `v28_reliability_weighting` | 2.224 | -0.192 | 0.607 | 2.812 | 431 |
| `v29_reliability_residual` | 2.227 | -0.467 | 0.616 | 2.779 | 431 |
| `v23_draft_capital` | 2.251 | -0.358 | 0.603 | 2.826 | 431 |
| `v4_availability_adjusted` | 2.261 | -0.448 | 0.596 | 2.896 | 450 |
| `v22_advanced_receiving` | 2.264 | -0.177 | 0.591 | 2.869 | 431 |
| `v26_vegas_residual` | 2.265 | -0.515 | 0.601 | 2.834 | 431 |
| `v25_draft_capital_residual` | 2.271 | -0.478 | 0.600 | 2.837 | 431 |
| `v7_regression_to_mean` | 2.277 | -0.426 | 0.602 | 2.872 | 450 |
| `v5_team_context` | 2.292 | -0.476 | 0.584 | 2.939 | 450 |
| `v16_snap_trend_full` | 2.297 | -0.570 | 0.599 | 2.885 | 450 |
| `v20_learned_usage` | 2.308 | -0.111 | 0.587 | 2.882 | 431 |
| `v10_stat_efficiency_v2` | 2.311 | -0.529 | 0.601 | 2.877 | 450 |
| `v8_age_regression` | 2.313 | -0.533 | 0.601 | 2.879 | 450 |
| `v9_pos_specific` | 2.313 | -0.533 | 0.601 | 2.879 | 450 |
| `v12_no_qb_trajectory` | 2.313 | -0.533 | 0.601 | 2.879 | 450 |
| `v13_qb_starter` | 2.313 | -0.533 | 0.601 | 2.879 | 450 |
| `v14_qb_starter` | 2.313 | -0.533 | 0.601 | 2.879 | 450 |
| `v19_usage_level_full` | 2.332 | -0.688 | 0.593 | 2.907 | 450 |
| `v17_rookie_growth` | 2.333 | -0.579 | 0.600 | 2.882 | 450 |
| `v11_team_context_v2` | 2.333 | -0.547 | 0.591 | 2.912 | 450 |
| `v6_usage_share` | 2.341 | -0.618 | 0.571 | 2.984 | 450 |
| `v15_snap_trend` | 2.358 | -0.779 | 0.571 | 2.985 | 450 |
| `v2_age_adjusted` | 2.358 | -0.742 | 0.573 | 2.975 | 450 |
| `v3_stat_weighted` | 2.361 | -0.743 | 0.573 | 2.978 | 450 |
| `v21_tiered_regression` | 2.376 | -0.655 | 0.554 | 3.041 | 450 |
| `naive_prior_season_ppg` | 2.381 | -0.670 | 0.541 | 3.091 | 457 |
| `v18_usage_level` | 2.423 | -0.897 | 0.552 | 3.048 | 450 |
| `v1_baseline_weighted_ppg` | 2.424 | -0.862 | 0.553 | 3.045 | 450 |
| `position_mean_baseline` | 3.739 | +0.796 | -0.032 | 4.637 | 457 |

### TE

| Model | MAE | Bias | R² | RMSE | N |
| --- | --- | --- | --- | --- | --- |
| `external_fantasypros_v1` | 1.488 | +0.741 | 0.654 | 1.927 | 151 |
| `v31_depth_chart` | 1.530 | -0.060 | 0.631 | 1.944 | 249 |
| `v23_draft_capital` | 1.567 | -0.117 | 0.609 | 2.003 | 249 |
| `v28_reliability_weighting` | 1.573 | -0.056 | 0.603 | 2.018 | 249 |
| `v30_reliability_full_refit` | 1.574 | -0.079 | 0.609 | 2.003 | 249 |
| `v27_vegas_full_refit` | 1.575 | -0.035 | 0.609 | 2.003 | 249 |
| `v29_reliability_residual` | 1.578 | -0.140 | 0.607 | 2.008 | 249 |
| `v22_advanced_receiving` | 1.579 | -0.066 | 0.600 | 2.027 | 249 |
| `v7_regression_to_mean` | 1.582 | +0.042 | 0.591 | 2.062 | 255 |
| `v20_learned_usage` | 1.584 | -0.025 | 0.588 | 2.057 | 249 |
| `v25_draft_capital_residual` | 1.586 | -0.156 | 0.604 | 2.015 | 249 |
| `v4_availability_adjusted` | 1.593 | +0.028 | 0.578 | 2.093 | 255 |
| `v5_team_context` | 1.599 | +0.021 | 0.578 | 2.092 | 255 |
| `v26_vegas_residual` | 1.604 | -0.155 | 0.600 | 2.026 | 249 |
| `v16_snap_trend_full` | 1.608 | -0.147 | 0.592 | 2.059 | 255 |
| `v10_stat_efficiency_v2` | 1.614 | -0.157 | 0.588 | 2.070 | 255 |
| `v8_age_regression` | 1.618 | -0.159 | 0.587 | 2.072 | 255 |
| `v9_pos_specific` | 1.618 | -0.159 | 0.587 | 2.072 | 255 |
| `v12_no_qb_trajectory` | 1.618 | -0.159 | 0.587 | 2.072 | 255 |
| `v13_qb_starter` | 1.618 | -0.159 | 0.587 | 2.072 | 255 |
| `v14_qb_starter` | 1.618 | -0.159 | 0.587 | 2.072 | 255 |
| `v17_rookie_growth` | 1.621 | -0.176 | 0.588 | 2.069 | 255 |
| `v6_usage_share` | 1.621 | -0.049 | 0.565 | 2.125 | 255 |
| `v19_usage_level_full` | 1.621 | -0.231 | 0.585 | 2.077 | 255 |
| `v3_stat_weighted` | 1.623 | -0.265 | 0.577 | 2.097 | 255 |
| `v15_snap_trend` | 1.623 | -0.256 | 0.581 | 2.085 | 255 |
| `v2_age_adjusted` | 1.630 | -0.267 | 0.574 | 2.103 | 255 |
| `v11_team_context_v2` | 1.631 | -0.158 | 0.582 | 2.084 | 255 |
| `v21_tiered_regression` | 1.643 | -0.048 | 0.565 | 2.126 | 255 |
| `v18_usage_level` | 1.654 | -0.340 | 0.561 | 2.136 | 255 |
| `v1_baseline_weighted_ppg` | 1.669 | -0.468 | 0.550 | 2.163 | 255 |
| `naive_prior_season_ppg` | 1.689 | -0.273 | 0.537 | 2.197 | 260 |
| `position_mean_baseline` | 2.577 | +0.369 | -0.011 | 3.248 | 260 |

### K

| Model | MAE | Bias | R² | RMSE | N |
| --- | --- | --- | --- | --- | --- |
| `position_mean_baseline` | 1.390 | +0.282 | -0.050 | 1.793 | 97 |
| `v28_reliability_weighting` | 1.394 | -0.152 | -0.117 | 1.849 | 97 |
| `v29_reliability_residual` | 1.396 | -0.170 | -0.114 | 1.847 | 97 |
| `v22_advanced_receiving` | 1.400 | -0.134 | -0.119 | 1.851 | 97 |
| `v25_draft_capital_residual` | 1.403 | -0.152 | -0.116 | 1.849 | 97 |
| `v26_vegas_residual` | 1.403 | -0.152 | -0.116 | 1.849 | 97 |
| `v20_learned_usage` | 1.413 | -0.046 | -0.144 | 1.872 | 97 |
| `v12_no_qb_trajectory` | 1.423 | -0.024 | -0.174 | 1.896 | 97 |
| `v14_qb_starter` | 1.423 | -0.024 | -0.174 | 1.896 | 97 |
| `v17_rookie_growth` | 1.423 | -0.024 | -0.174 | 1.896 | 97 |
| `v19_usage_level_full` | 1.423 | -0.024 | -0.174 | 1.896 | 97 |
| `v27_vegas_full_refit` | 1.431 | +0.095 | -0.141 | 1.869 | 97 |
| `v16_snap_trend_full` | 1.432 | +0.013 | -0.190 | 1.909 | 97 |
| `v30_reliability_full_refit` | 1.432 | +0.097 | -0.140 | 1.868 | 97 |
| `v31_depth_chart` | 1.435 | +0.337 | -0.143 | 1.871 | 97 |
| `v23_draft_capital` | 1.439 | +0.132 | -0.152 | 1.878 | 97 |
| `v8_age_regression` | 1.471 | -0.070 | -0.283 | 1.982 | 97 |
| `v9_pos_specific` | 1.471 | -0.070 | -0.283 | 1.982 | 97 |
| `v10_stat_efficiency_v2` | 1.471 | -0.070 | -0.283 | 1.982 | 97 |
| `v11_team_context_v2` | 1.471 | -0.070 | -0.283 | 1.982 | 97 |
| `v13_qb_starter` | 1.471 | -0.070 | -0.283 | 1.982 | 97 |
| `v21_tiered_regression` | 1.471 | +0.077 | -0.281 | 1.980 | 97 |
| `v2_age_adjusted` | 1.525 | -0.108 | -0.390 | 2.063 | 97 |
| `v3_stat_weighted` | 1.525 | -0.108 | -0.390 | 2.063 | 97 |
| `v18_usage_level` | 1.525 | -0.108 | -0.390 | 2.063 | 97 |
| `v15_snap_trend` | 1.533 | -0.071 | -0.405 | 2.074 | 97 |
| `v1_baseline_weighted_ppg` | 1.534 | -0.036 | -0.408 | 2.077 | 97 |
| `v7_regression_to_mean` | 1.538 | +0.113 | -0.478 | 2.127 | 97 |
| `v4_availability_adjusted` | 1.591 | +0.074 | -0.586 | 2.203 | 97 |
| `v5_team_context` | 1.591 | +0.074 | -0.586 | 2.203 | 97 |
| `v6_usage_share` | 1.591 | +0.074 | -0.586 | 2.203 | 97 |
| `naive_prior_season_ppg` | 1.685 | +0.104 | -0.920 | 2.425 | 97 |

## Ranking quality — per-position ordering (GH #598)

_The projections feed VORP, surplus value, auction pricing and keeper calls, which depend on within-position **ordering** and getting the top tier right — not absolute PPG level. **Spearman ρ** is the rank correlation between projected and actual PPG (1.0 = perfect order). **Top-N hit** is the share of each model's predicted top-N (≈ the starter pool: 12 for QB/TE, 24 for RB/WR) that actually finished top-N. A model can win MAE while losing here (#579) — these are the metrics the downstream decisions actually care about._

### QB (top-12)

| Model | Spearman ρ | Top-N hit | N |
| --- | --- | --- | --- |
| `external_fantasypros_v1` | **0.812** | 0.583 | 122 |
| `v26_vegas_residual` | 0.677 | 0.417 | 152 |
| `v25_draft_capital_residual` | 0.674 | 0.417 | 152 |
| `v31_depth_chart` | 0.674 | 0.417 | 152 |
| `v22_advanced_receiving` | 0.672 | 0.417 | 152 |
| `v28_reliability_weighting` | 0.671 | 0.417 | 152 |
| `v29_reliability_residual` | 0.669 | 0.417 | 152 |
| `v20_learned_usage` | 0.668 | 0.417 | 152 |
| `v23_draft_capital` | 0.665 | 0.417 | 152 |
| `v30_reliability_full_refit` | 0.665 | 0.417 | 152 |
| `v27_vegas_full_refit` | 0.664 | 0.417 | 152 |
| `v14_qb_starter` | 0.659 | 0.417 | 157 |
| `v17_rookie_growth` | 0.659 | 0.417 | 157 |
| `v19_usage_level_full` | 0.659 | 0.417 | 157 |
| `v16_snap_trend_full` | 0.658 | 0.500 | 157 |
| `v21_tiered_regression` | 0.657 | 0.417 | 157 |
| `v1_baseline_weighted_ppg` | 0.651 | 0.333 | 157 |
| `v2_age_adjusted` | 0.648 | 0.417 | 157 |
| `v18_usage_level` | 0.648 | 0.417 | 157 |
| `v3_stat_weighted` | 0.646 | 0.417 | 157 |
| `v8_age_regression` | 0.646 | 0.417 | 157 |
| `v9_pos_specific` | 0.646 | 0.417 | 157 |
| `v5_team_context` | 0.646 | 0.417 | 157 |
| `v4_availability_adjusted` | 0.646 | 0.417 | 157 |
| `v10_stat_efficiency_v2` | 0.645 | 0.417 | 157 |
| `v6_usage_share` | 0.645 | 0.417 | 157 |
| `v7_regression_to_mean` | 0.641 | 0.417 | 157 |
| `v15_snap_trend` | 0.641 | 0.417 | 157 |
| `v13_qb_starter` | 0.641 | 0.417 | 157 |
| `v11_team_context_v2` | 0.639 | 0.417 | 157 |
| `v12_no_qb_trajectory` | 0.637 | 0.417 | 157 |
| `naive_prior_season_ppg` | 0.578 | 0.500 | 157 |
| `position_mean_baseline` | -0.022 | 0.000 | 157 |

### RB (top-24)

| Model | Spearman ρ | Top-N hit | N |
| --- | --- | --- | --- |
| `external_fantasypros_v1` | **0.833** | 0.583 | 139 |
| `v4_availability_adjusted` | 0.807 | 0.333 | 302 |
| `v3_stat_weighted` | 0.806 | 0.458 | 302 |
| `v15_snap_trend` | 0.806 | 0.375 | 302 |
| `v18_usage_level` | 0.805 | 0.417 | 302 |
| `v16_snap_trend_full` | 0.805 | 0.417 | 302 |
| `v19_usage_level_full` | 0.805 | 0.417 | 302 |
| `v2_age_adjusted` | 0.804 | 0.458 | 302 |
| `v10_stat_efficiency_v2` | 0.804 | 0.417 | 302 |
| `v8_age_regression` | 0.804 | 0.458 | 302 |
| `v9_pos_specific` | 0.804 | 0.458 | 302 |
| `v12_no_qb_trajectory` | 0.804 | 0.458 | 302 |
| `v13_qb_starter` | 0.804 | 0.458 | 302 |
| `v14_qb_starter` | 0.804 | 0.458 | 302 |
| `v1_baseline_weighted_ppg` | 0.803 | 0.458 | 302 |
| `naive_prior_season_ppg` | 0.802 | 0.458 | 305 |
| `v6_usage_share` | 0.801 | 0.417 | 302 |
| `v5_team_context` | 0.801 | 0.375 | 302 |
| `v7_regression_to_mean` | 0.798 | 0.333 | 302 |
| `v11_team_context_v2` | 0.797 | 0.458 | 302 |
| `v21_tiered_regression` | 0.796 | 0.458 | 302 |
| `v17_rookie_growth` | 0.795 | 0.458 | 302 |
| `v26_vegas_residual` | 0.790 | 0.500 | 287 |
| `v25_draft_capital_residual` | 0.789 | 0.500 | 287 |
| `v31_depth_chart` | 0.787 | 0.417 | 287 |
| `v29_reliability_residual` | 0.787 | 0.542 | 287 |
| `v27_vegas_full_refit` | 0.786 | 0.458 | 287 |
| `v23_draft_capital` | 0.785 | 0.458 | 287 |
| `v22_advanced_receiving` | 0.784 | 0.500 | 287 |
| `v30_reliability_full_refit` | 0.783 | 0.500 | 287 |
| `v20_learned_usage` | 0.783 | 0.500 | 287 |
| `v28_reliability_weighting` | 0.782 | 0.500 | 287 |
| `position_mean_baseline` | 0.014 | 0.167 | 305 |

### WR (top-24)

| Model | Spearman ρ | Top-N hit | N |
| --- | --- | --- | --- |
| `external_fantasypros_v1` | **0.813** | 0.542 | 187 |
| `v4_availability_adjusted` | 0.794 | 0.458 | 450 |
| `v15_snap_trend` | 0.792 | 0.458 | 450 |
| `v6_usage_share` | 0.791 | 0.458 | 450 |
| `v5_team_context` | 0.790 | 0.417 | 450 |
| `v18_usage_level` | 0.790 | 0.458 | 450 |
| `v2_age_adjusted` | 0.790 | 0.458 | 450 |
| `v7_regression_to_mean` | 0.790 | 0.417 | 450 |
| `v16_snap_trend_full` | 0.789 | 0.458 | 450 |
| `v3_stat_weighted` | 0.789 | 0.458 | 450 |
| `v19_usage_level_full` | 0.789 | 0.458 | 450 |
| `v8_age_regression` | 0.788 | 0.458 | 450 |
| `v9_pos_specific` | 0.788 | 0.458 | 450 |
| `v12_no_qb_trajectory` | 0.788 | 0.458 | 450 |
| `v13_qb_starter` | 0.788 | 0.458 | 450 |
| `v14_qb_starter` | 0.788 | 0.458 | 450 |
| `v10_stat_efficiency_v2` | 0.788 | 0.458 | 450 |
| `v1_baseline_weighted_ppg` | 0.787 | 0.375 | 450 |
| `v17_rookie_growth` | 0.787 | 0.458 | 450 |
| `v21_tiered_regression` | 0.786 | 0.458 | 450 |
| `v11_team_context_v2` | 0.783 | 0.458 | 450 |
| `v29_reliability_residual` | 0.783 | 0.417 | 431 |
| `naive_prior_season_ppg` | 0.781 | 0.500 | 457 |
| `v31_depth_chart` | 0.779 | 0.333 | 431 |
| `v25_draft_capital_residual` | 0.778 | 0.375 | 431 |
| `v23_draft_capital` | 0.778 | 0.250 | 431 |
| `v26_vegas_residual` | 0.775 | 0.417 | 431 |
| `v30_reliability_full_refit` | 0.775 | 0.375 | 431 |
| `v27_vegas_full_refit` | 0.775 | 0.375 | 431 |
| `v28_reliability_weighting` | 0.770 | 0.333 | 431 |
| `v22_advanced_receiving` | 0.765 | 0.333 | 431 |
| `v20_learned_usage` | 0.763 | 0.333 | 431 |
| `position_mean_baseline` | -0.006 | 0.042 | 457 |

### TE (top-12)

| Model | Spearman ρ | Top-N hit | N |
| --- | --- | --- | --- |
| `external_fantasypros_v1` | **0.822** | 0.583 | 151 |
| `v31_depth_chart` | 0.760 | 0.583 | 249 |
| `v23_draft_capital` | 0.757 | 0.583 | 249 |
| `v27_vegas_full_refit` | 0.753 | 0.583 | 249 |
| `v30_reliability_full_refit` | 0.753 | 0.583 | 249 |
| `v25_draft_capital_residual` | 0.750 | 0.583 | 249 |
| `v29_reliability_residual` | 0.750 | 0.583 | 249 |
| `v1_baseline_weighted_ppg` | 0.746 | 0.500 | 255 |
| `v28_reliability_weighting` | 0.746 | 0.583 | 249 |
| `v20_learned_usage` | 0.745 | 0.500 | 249 |
| `v26_vegas_residual` | 0.744 | 0.583 | 249 |
| `v22_advanced_receiving` | 0.744 | 0.583 | 249 |
| `v7_regression_to_mean` | 0.743 | 0.583 | 255 |
| `v6_usage_share` | 0.742 | 0.583 | 255 |
| `v5_team_context` | 0.741 | 0.583 | 255 |
| `v3_stat_weighted` | 0.739 | 0.583 | 255 |
| `v4_availability_adjusted` | 0.738 | 0.583 | 255 |
| `naive_prior_season_ppg` | 0.738 | 0.500 | 260 |
| `v18_usage_level` | 0.738 | 0.667 | 255 |
| `v2_age_adjusted` | 0.737 | 0.500 | 255 |
| `v10_stat_efficiency_v2` | 0.737 | 0.583 | 255 |
| `v19_usage_level_full` | 0.736 | 0.667 | 255 |
| `v17_rookie_growth` | 0.736 | 0.583 | 255 |
| `v8_age_regression` | 0.735 | 0.583 | 255 |
| `v9_pos_specific` | 0.735 | 0.583 | 255 |
| `v12_no_qb_trajectory` | 0.735 | 0.583 | 255 |
| `v13_qb_starter` | 0.735 | 0.583 | 255 |
| `v14_qb_starter` | 0.735 | 0.583 | 255 |
| `v11_team_context_v2` | 0.734 | 0.583 | 255 |
| `v15_snap_trend` | 0.732 | 0.667 | 255 |
| `v16_snap_trend_full` | 0.731 | 0.583 | 255 |
| `v21_tiered_regression` | 0.730 | 0.583 | 255 |
| `position_mean_baseline` | 0.098 | 0.000 | 260 |

## Season 2023 — ALL (held-out) — fold (train 2021,2022)

| Model | MAE | Bias | R² | RMSE | N |
| --- | --- | --- | --- | --- | --- |
| `external_fantasypros_v1` | 2.057 | +1.320 | 0.731 | 2.919 | 154 |
| `v31_depth_chart` | 2.210 | -0.288 | 0.650 | 3.026 | 406 |
| `v28_reliability_weighting` | 2.287 | -0.177 | 0.618 | 3.165 | 406 |
| `v30_reliability_full_refit` | 2.294 | -0.261 | 0.622 | 3.146 | 406 |
| `v27_vegas_full_refit` | 2.297 | -0.214 | 0.622 | 3.150 | 406 |
| `v29_reliability_residual` | 2.308 | -0.363 | 0.616 | 3.174 | 406 |
| `v22_advanced_receiving` | 2.320 | -0.178 | 0.611 | 3.192 | 406 |
| `v23_draft_capital` | 2.336 | -0.253 | 0.619 | 3.162 | 406 |
| `v4_availability_adjusted` | 2.339 | -0.204 | 0.569 | 3.394 | 419 |
| `v26_vegas_residual` | 2.350 | -0.431 | 0.605 | 3.217 | 406 |
| `v20_learned_usage` | 2.352 | -0.177 | 0.604 | 3.220 | 406 |
| `v25_draft_capital_residual` | 2.353 | -0.397 | 0.608 | 3.205 | 406 |
| `v7_regression_to_mean` | 2.360 | -0.169 | 0.578 | 3.359 | 419 |
| `v10_stat_efficiency_v2` | 2.362 | -0.519 | 0.587 | 3.323 | 419 |
| `v16_snap_trend_full` | 2.364 | -0.493 | 0.581 | 3.348 | 419 |
| `v8_age_regression` | 2.366 | -0.521 | 0.585 | 3.330 | 419 |
| `v9_pos_specific` | 2.366 | -0.521 | 0.585 | 3.330 | 419 |
| `v13_qb_starter` | 2.367 | -0.515 | 0.586 | 3.326 | 419 |
| `v14_qb_starter` | 2.371 | -0.463 | 0.585 | 3.333 | 419 |
| `v5_team_context` | 2.371 | -0.214 | 0.558 | 3.437 | 419 |
| `v12_no_qb_trajectory` | 2.377 | -0.508 | 0.582 | 3.345 | 419 |
| `v17_rookie_growth` | 2.382 | -0.512 | 0.580 | 3.349 | 419 |
| `v11_team_context_v2` | 2.396 | -0.522 | 0.573 | 3.378 | 419 |
| `v19_usage_level_full` | 2.397 | -0.592 | 0.576 | 3.369 | 419 |
| `v2_age_adjusted` | 2.416 | -0.696 | 0.555 | 3.448 | 419 |
| `v1_baseline_weighted_ppg` | 2.418 | -0.783 | 0.561 | 3.425 | 419 |
| `v3_stat_weighted` | 2.420 | -0.695 | 0.554 | 3.451 | 419 |
| `v6_usage_share` | 2.431 | -0.341 | 0.543 | 3.494 | 419 |
| `v15_snap_trend` | 2.433 | -0.726 | 0.548 | 3.475 | 419 |
| `naive_prior_season_ppg` | 2.447 | -0.466 | 0.538 | 3.516 | 421 |
| `v18_usage_level` | 2.476 | -0.825 | 0.538 | 3.513 | 419 |
| `v21_tiered_regression` | 2.493 | -0.459 | 0.523 | 3.569 | 419 |
| `position_mean_baseline` | 3.623 | +0.646 | 0.196 | 4.640 | 421 |

## Season 2024 — ALL (held-out) — fold (train 2021,2022,2023)

| Model | MAE | Bias | R² | RMSE | N |
| --- | --- | --- | --- | --- | --- |
| `v31_depth_chart` | 2.265 | +0.064 | 0.668 | 2.975 | 427 |
| `v19_usage_level_full` | 2.299 | -0.228 | 0.661 | 3.043 | 443 |
| `v14_qb_starter` | 2.301 | -0.122 | 0.661 | 3.042 | 443 |
| `v12_no_qb_trajectory` | 2.303 | -0.161 | 0.654 | 3.072 | 443 |
| `v16_snap_trend_full` | 2.309 | -0.140 | 0.655 | 3.068 | 443 |
| `v17_rookie_growth` | 2.314 | -0.157 | 0.659 | 3.049 | 443 |
| `v13_qb_starter` | 2.314 | -0.175 | 0.647 | 3.102 | 443 |
| `v8_age_regression` | 2.316 | -0.171 | 0.646 | 3.106 | 443 |
| `v9_pos_specific` | 2.316 | -0.171 | 0.646 | 3.106 | 443 |
| `v10_stat_efficiency_v2` | 2.320 | -0.162 | 0.647 | 3.103 | 443 |
| `v11_team_context_v2` | 2.333 | -0.189 | 0.642 | 3.123 | 443 |
| `v2_age_adjusted` | 2.342 | -0.333 | 0.634 | 3.161 | 443 |
| `v4_availability_adjusted` | 2.343 | +0.086 | 0.632 | 3.170 | 443 |
| `v3_stat_weighted` | 2.345 | -0.333 | 0.634 | 3.160 | 443 |
| `v20_learned_usage` | 2.350 | +0.162 | 0.645 | 3.075 | 427 |
| `v25_draft_capital_residual` | 2.350 | -0.046 | 0.648 | 3.062 | 427 |
| `v23_draft_capital` | 2.354 | +0.048 | 0.643 | 3.082 | 427 |
| `v1_baseline_weighted_ppg` | 2.356 | -0.486 | 0.620 | 3.221 | 443 |
| `v27_vegas_full_refit` | 2.361 | +0.066 | 0.645 | 3.076 | 427 |
| `v26_vegas_residual` | 2.362 | -0.059 | 0.648 | 3.062 | 427 |
| `v7_regression_to_mean` | 2.364 | +0.102 | 0.629 | 3.180 | 443 |
| `v29_reliability_residual` | 2.364 | -0.044 | 0.644 | 3.078 | 427 |
| `v22_advanced_receiving` | 2.366 | +0.128 | 0.640 | 3.098 | 427 |
| `v18_usage_level` | 2.366 | -0.439 | 0.626 | 3.193 | 443 |
| `v5_team_context` | 2.367 | +0.058 | 0.622 | 3.213 | 443 |
| `v6_usage_share` | 2.368 | -0.033 | 0.622 | 3.210 | 443 |
| `v15_snap_trend` | 2.371 | -0.352 | 0.626 | 3.193 | 443 |
| `v30_reliability_full_refit` | 2.372 | +0.068 | 0.641 | 3.092 | 427 |
| `v28_reliability_weighting` | 2.379 | +0.131 | 0.636 | 3.113 | 427 |
| `v21_tiered_regression` | 2.387 | -0.064 | 0.626 | 3.196 | 443 |
| `naive_prior_season_ppg` | 2.441 | -0.127 | 0.556 | 3.490 | 450 |
| `external_fantasypros_v1` | 2.597 | +1.367 | 0.620 | 3.443 | 200 |
| `position_mean_baseline` | 3.698 | +0.787 | 0.173 | 4.760 | 450 |

## Season 2025 — ALL (held-out) — fold (train 2021,2022,2023,2024)

| Model | MAE | Bias | R² | RMSE | N |
| --- | --- | --- | --- | --- | --- |
| `v31_depth_chart` | 2.218 | -0.276 | 0.685 | 2.946 | 383 |
| `v30_reliability_full_refit` | 2.224 | -0.356 | 0.683 | 2.954 | 383 |
| `v27_vegas_full_refit` | 2.231 | -0.353 | 0.682 | 2.960 | 383 |
| `v26_vegas_residual` | 2.234 | -0.432 | 0.685 | 2.942 | 383 |
| `v29_reliability_residual` | 2.240 | -0.426 | 0.684 | 2.947 | 383 |
| `v25_draft_capital_residual` | 2.248 | -0.420 | 0.683 | 2.954 | 383 |
| `v28_reliability_weighting` | 2.249 | -0.239 | 0.677 | 2.982 | 383 |
| `v23_draft_capital` | 2.249 | -0.362 | 0.677 | 2.980 | 383 |
| `v20_learned_usage` | 2.255 | -0.212 | 0.673 | 3.001 | 383 |
| `v22_advanced_receiving` | 2.255 | -0.235 | 0.675 | 2.989 | 383 |
| `external_fantasypros_v1` | 2.283 | +0.632 | 0.680 | 3.228 | 245 |
| `v14_qb_starter` | 2.293 | -0.451 | 0.661 | 3.090 | 399 |
| `v7_regression_to_mean` | 2.297 | -0.206 | 0.650 | 3.140 | 399 |
| `v21_tiered_regression` | 2.300 | -0.446 | 0.645 | 3.162 | 399 |
| `v16_snap_trend_full` | 2.301 | -0.484 | 0.657 | 3.107 | 399 |
| `v19_usage_level_full` | 2.302 | -0.556 | 0.660 | 3.092 | 399 |
| `v17_rookie_growth` | 2.326 | -0.490 | 0.658 | 3.103 | 399 |
| `v4_availability_adjusted` | 2.326 | -0.304 | 0.629 | 3.231 | 399 |
| `v12_no_qb_trajectory` | 2.327 | -0.505 | 0.635 | 3.205 | 399 |
| `v5_team_context` | 2.330 | -0.318 | 0.627 | 3.241 | 399 |
| `v10_stat_efficiency_v2` | 2.332 | -0.528 | 0.633 | 3.215 | 399 |
| `v8_age_regression` | 2.334 | -0.539 | 0.632 | 3.218 | 399 |
| `v9_pos_specific` | 2.334 | -0.539 | 0.632 | 3.218 | 399 |
| `v13_qb_starter` | 2.341 | -0.532 | 0.629 | 3.233 | 399 |
| `v11_team_context_v2` | 2.342 | -0.550 | 0.630 | 3.228 | 399 |
| `v6_usage_share` | 2.348 | -0.425 | 0.622 | 3.262 | 399 |
| `v3_stat_weighted` | 2.366 | -0.748 | 0.611 | 3.311 | 399 |
| `v2_age_adjusted` | 2.376 | -0.754 | 0.609 | 3.320 | 399 |
| `v15_snap_trend` | 2.385 | -0.787 | 0.603 | 3.343 | 399 |
| `v18_usage_level` | 2.410 | -0.860 | 0.600 | 3.356 | 399 |
| `v1_baseline_weighted_ppg` | 2.524 | -1.012 | 0.570 | 3.480 | 399 |
| `naive_prior_season_ppg` | 2.615 | -0.785 | 0.521 | 3.677 | 405 |
| `position_mean_baseline` | 3.757 | +0.691 | 0.169 | 4.842 | 405 |
