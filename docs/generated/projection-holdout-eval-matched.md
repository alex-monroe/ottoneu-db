# Projection Held-Out Evaluation (GH #572) — matched-sample (common players only)

_Generated: 2026-06-10 09:15_

**Matched-sample mode (Finding 4):** every model is scored on the *same* players — the intersection of players all evaluated models projected, per season. This makes the FantasyPros comparison apples-to-apples (FP projects a smaller, more-available set), at the cost of a smaller N. Run without `--matched` for the full-coverage report.

**Every model is evaluated out-of-sample on a shared held-out window.** Learned/residual models were retrained on **2021,2022,2023** and never saw the eval seasons **2024,2025**; additive and external models are parameter-free w.r.t. training seasons, so their existing projections are already held-out. All models are scored through the identical `backtest_model` filter (target-season games ≥ 4, true rookies excluded). Unlike [projection-accuracy.md](projection-accuracy.md), **no model here is scored on data it trained on** — this is the honest ranking. See [docs/exec-plans/projection-methodology-audit.md](../exec-plans/projection-methodology-audit.md) (Finding 1b).

## Ranking — combined held-out ALL (lower MAE = better)

| Rank | Model | MAE | Bias | R² | RMSE | N |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `v14_qb_starter` | **2.494** | +0.161 | 0.650 | 3.283 | 416 |
| 2 | `v19_usage_level_full` | 2.501 | -0.040 | 0.652 | 3.275 | 416 |
| 3 | `external_fantasypros_v1` | 2.502 | +1.022 | 0.625 | 3.400 | 416 |
| 4 | `v10_stat_efficiency_v2` | 2.521 | +0.071 | 0.627 | 3.389 | 416 |
| 5 | `v17_rookie_growth` | 2.522 | +0.119 | 0.647 | 3.299 | 416 |
| 6 | `v12_no_qb_trajectory` | 2.523 | +0.094 | 0.627 | 3.390 | 416 |
| 7 | `v16_snap_trend_full` | 2.523 | +0.098 | 0.641 | 3.326 | 416 |
| 8 | `v11_team_context_v2` | 2.525 | +0.033 | 0.621 | 3.419 | 416 |
| 9 | `v8_age_regression` | 2.526 | +0.069 | 0.625 | 3.398 | 416 |
| 10 | `v9_pos_specific` | 2.526 | +0.069 | 0.625 | 3.398 | 416 |
| 11 | `v13_qb_starter` | 2.527 | +0.070 | 0.624 | 3.403 | 416 |
| 12 | `v21_tiered_regression` | 2.551 | +0.233 | 0.628 | 3.387 | 416 |
| 13 | `v7_regression_to_mean` | 2.571 | +0.304 | 0.624 | 3.405 | 416 |
| 14 | `v3_stat_weighted` | 2.585 | -0.183 | 0.608 | 3.475 | 416 |
| 15 | `v2_age_adjusted` | 2.587 | -0.197 | 0.607 | 3.480 | 416 |
| 16 | `v5_team_context` | 2.623 | +0.238 | 0.600 | 3.511 | 416 |
| 17 | `v15_snap_trend` | 2.624 | -0.259 | 0.595 | 3.532 | 416 |
| 18 | `v4_availability_adjusted` | 2.628 | +0.272 | 0.604 | 3.494 | 416 |
| 19 | `v18_usage_level` | 2.633 | -0.397 | 0.598 | 3.519 | 416 |
| 20 | `v26_vegas_residual` | 2.642 | -0.905 | 0.635 | 3.354 | 416 |
| 21 | `v6_usage_share` | 2.646 | +0.038 | 0.595 | 3.531 | 416 |
| 22 | `v20_learned_usage` | 2.647 | -0.627 | 0.636 | 3.347 | 416 |
| 23 | `v22_advanced_receiving` | 2.650 | -0.661 | 0.634 | 3.357 | 416 |
| 24 | `v31_depth_chart` | 2.656 | -0.908 | 0.625 | 3.399 | 416 |
| 25 | `v25_draft_capital_residual` | 2.663 | -0.857 | 0.632 | 3.368 | 416 |
| 26 | `v28_reliability_weighting` | 2.663 | -0.786 | 0.633 | 3.362 | 416 |
| 27 | `v27_vegas_full_refit` | 2.674 | -0.872 | 0.624 | 3.403 | 416 |
| 28 | `v30_reliability_full_refit` | 2.675 | -0.877 | 0.623 | 3.409 | 416 |
| 29 | `v29_reliability_residual` | 2.693 | -0.964 | 0.626 | 3.396 | 416 |
| 30 | `v1_baseline_weighted_ppg` | 2.700 | -0.429 | 0.578 | 3.605 | 416 |
| 31 | `v23_draft_capital` | 2.720 | -0.845 | 0.615 | 3.444 | 416 |
| 32 | `naive_prior_season_ppg` | 2.890 | -0.281 | 0.494 | 3.949 | 416 |
| 33 | `position_mean_baseline` | 4.080 | +1.757 | 0.131 | 5.173 | 416 |

## Combined across eval seasons — by position

### ALL

| Model | MAE | Bias | R² | RMSE | N |
| --- | --- | --- | --- | --- | --- |
| `v14_qb_starter` | 2.494 | +0.161 | 0.650 | 3.283 | 416 |
| `v19_usage_level_full` | 2.501 | -0.040 | 0.652 | 3.275 | 416 |
| `external_fantasypros_v1` | 2.502 | +1.022 | 0.625 | 3.400 | 416 |
| `v10_stat_efficiency_v2` | 2.521 | +0.071 | 0.627 | 3.389 | 416 |
| `v17_rookie_growth` | 2.522 | +0.119 | 0.647 | 3.299 | 416 |
| `v12_no_qb_trajectory` | 2.523 | +0.094 | 0.627 | 3.390 | 416 |
| `v16_snap_trend_full` | 2.523 | +0.098 | 0.641 | 3.326 | 416 |
| `v11_team_context_v2` | 2.525 | +0.033 | 0.621 | 3.419 | 416 |
| `v8_age_regression` | 2.526 | +0.069 | 0.625 | 3.398 | 416 |
| `v9_pos_specific` | 2.526 | +0.069 | 0.625 | 3.398 | 416 |
| `v13_qb_starter` | 2.527 | +0.070 | 0.624 | 3.403 | 416 |
| `v21_tiered_regression` | 2.551 | +0.233 | 0.628 | 3.387 | 416 |
| `v7_regression_to_mean` | 2.571 | +0.304 | 0.624 | 3.405 | 416 |
| `v3_stat_weighted` | 2.585 | -0.183 | 0.608 | 3.475 | 416 |
| `v2_age_adjusted` | 2.587 | -0.197 | 0.607 | 3.480 | 416 |
| `v5_team_context` | 2.623 | +0.238 | 0.600 | 3.511 | 416 |
| `v15_snap_trend` | 2.624 | -0.259 | 0.595 | 3.532 | 416 |
| `v4_availability_adjusted` | 2.628 | +0.272 | 0.604 | 3.494 | 416 |
| `v18_usage_level` | 2.633 | -0.397 | 0.598 | 3.519 | 416 |
| `v26_vegas_residual` | 2.642 | -0.905 | 0.635 | 3.354 | 416 |
| `v6_usage_share` | 2.646 | +0.038 | 0.595 | 3.531 | 416 |
| `v20_learned_usage` | 2.647 | -0.627 | 0.636 | 3.347 | 416 |
| `v22_advanced_receiving` | 2.650 | -0.661 | 0.634 | 3.357 | 416 |
| `v31_depth_chart` | 2.656 | -0.908 | 0.625 | 3.399 | 416 |
| `v25_draft_capital_residual` | 2.663 | -0.857 | 0.632 | 3.368 | 416 |
| `v28_reliability_weighting` | 2.663 | -0.786 | 0.633 | 3.362 | 416 |
| `v27_vegas_full_refit` | 2.674 | -0.872 | 0.624 | 3.403 | 416 |
| `v30_reliability_full_refit` | 2.675 | -0.877 | 0.623 | 3.409 | 416 |
| `v29_reliability_residual` | 2.693 | -0.964 | 0.626 | 3.396 | 416 |
| `v1_baseline_weighted_ppg` | 2.700 | -0.429 | 0.578 | 3.605 | 416 |
| `v23_draft_capital` | 2.720 | -0.845 | 0.615 | 3.444 | 416 |
| `naive_prior_season_ppg` | 2.890 | -0.281 | 0.494 | 3.949 | 416 |
| `position_mean_baseline` | 4.080 | +1.757 | 0.131 | 5.173 | 416 |

### QB

| Model | MAE | Bias | R² | RMSE | N |
| --- | --- | --- | --- | --- | --- |
| `v31_depth_chart` | 3.455 | -1.347 | 0.484 | 4.460 | 84 |
| `v22_advanced_receiving` | 3.462 | -1.114 | 0.481 | 4.471 | 84 |
| `v20_learned_usage` | 3.486 | -1.200 | 0.477 | 4.491 | 84 |
| `v28_reliability_weighting` | 3.492 | -1.252 | 0.472 | 4.511 | 84 |
| `v26_vegas_residual` | 3.520 | -1.402 | 0.461 | 4.558 | 84 |
| `v27_vegas_full_refit` | 3.539 | -1.240 | 0.444 | 4.631 | 84 |
| `v30_reliability_full_refit` | 3.549 | -1.274 | 0.437 | 4.658 | 84 |
| `v14_qb_starter` | 3.558 | -0.397 | 0.446 | 4.622 | 84 |
| `v17_rookie_growth` | 3.558 | -0.397 | 0.446 | 4.622 | 84 |
| `v19_usage_level_full` | 3.558 | -0.397 | 0.446 | 4.622 | 84 |
| `v25_draft_capital_residual` | 3.566 | -1.377 | 0.452 | 4.594 | 84 |
| `v29_reliability_residual` | 3.592 | -1.513 | 0.442 | 4.639 | 84 |
| `v23_draft_capital` | 3.623 | -1.195 | 0.433 | 4.674 | 84 |
| `v16_snap_trend_full` | 3.637 | -0.420 | 0.433 | 4.676 | 84 |
| `v21_tiered_regression` | 3.670 | -0.023 | 0.412 | 4.759 | 84 |
| `v7_regression_to_mean` | 3.703 | +0.480 | 0.388 | 4.857 | 84 |
| `v12_no_qb_trajectory` | 3.706 | -0.726 | 0.354 | 4.990 | 84 |
| `v8_age_regression` | 3.715 | -0.850 | 0.347 | 5.018 | 84 |
| `v9_pos_specific` | 3.715 | -0.850 | 0.347 | 5.018 | 84 |
| `v13_qb_starter` | 3.721 | -0.845 | 0.342 | 5.035 | 84 |
| `v10_stat_efficiency_v2` | 3.724 | -0.853 | 0.348 | 5.012 | 84 |
| `v11_team_context_v2` | 3.739 | -0.917 | 0.332 | 5.075 | 84 |
| `v4_availability_adjusted` | 3.810 | +0.352 | 0.347 | 5.018 | 84 |
| `external_fantasypros_v1` | 3.835 | +2.254 | 0.301 | 5.189 | 84 |
| `v3_stat_weighted` | 3.848 | -1.038 | 0.308 | 5.164 | 84 |
| `v2_age_adjusted` | 3.851 | -1.038 | 0.307 | 5.168 | 84 |
| `v18_usage_level` | 3.851 | -1.038 | 0.307 | 5.168 | 84 |
| `v5_team_context` | 3.862 | +0.292 | 0.333 | 5.070 | 84 |
| `v6_usage_share` | 3.862 | +0.292 | 0.333 | 5.070 | 84 |
| `v15_snap_trend` | 3.928 | -1.060 | 0.291 | 5.229 | 84 |
| `v1_baseline_weighted_ppg` | 3.949 | -1.288 | 0.287 | 5.242 | 84 |
| `naive_prior_season_ppg` | 4.478 | -0.552 | 0.101 | 5.886 | 84 |
| `position_mean_baseline` | 5.022 | +0.133 | 0.000 | 6.208 | 84 |

### RB

| Model | MAE | Bias | R² | RMSE | N |
| --- | --- | --- | --- | --- | --- |
| `v11_team_context_v2` | 2.615 | +0.725 | 0.609 | 3.368 | 97 |
| `v10_stat_efficiency_v2` | 2.637 | +0.790 | 0.610 | 3.365 | 97 |
| `v19_usage_level_full` | 2.656 | +0.438 | 0.613 | 3.349 | 97 |
| `v8_age_regression` | 2.664 | +0.770 | 0.603 | 3.392 | 97 |
| `v9_pos_specific` | 2.664 | +0.770 | 0.603 | 3.392 | 97 |
| `v12_no_qb_trajectory` | 2.664 | +0.770 | 0.603 | 3.392 | 97 |
| `v13_qb_starter` | 2.664 | +0.770 | 0.603 | 3.392 | 97 |
| `v14_qb_starter` | 2.664 | +0.770 | 0.603 | 3.392 | 97 |
| `v3_stat_weighted` | 2.683 | +0.483 | 0.607 | 3.378 | 97 |
| `v2_age_adjusted` | 2.685 | +0.429 | 0.604 | 3.387 | 97 |
| `v17_rookie_growth` | 2.727 | +0.659 | 0.595 | 3.429 | 97 |
| `v18_usage_level` | 2.732 | +0.098 | 0.594 | 3.430 | 97 |
| `v7_regression_to_mean` | 2.746 | +0.786 | 0.579 | 3.494 | 97 |
| `v16_snap_trend_full` | 2.753 | +0.579 | 0.579 | 3.493 | 97 |
| `external_fantasypros_v1` | 2.760 | +1.107 | 0.606 | 3.382 | 97 |
| `v6_usage_share` | 2.761 | +0.446 | 0.575 | 3.510 | 97 |
| `v1_baseline_weighted_ppg` | 2.774 | +0.086 | 0.553 | 3.601 | 97 |
| `v5_team_context` | 2.780 | +0.777 | 0.569 | 3.535 | 97 |
| `v15_snap_trend` | 2.788 | +0.238 | 0.573 | 3.521 | 97 |
| `v21_tiered_regression` | 2.797 | +0.862 | 0.563 | 3.558 | 97 |
| `v26_vegas_residual` | 2.816 | -0.316 | 0.583 | 3.479 | 97 |
| `v4_availability_adjusted` | 2.839 | +0.807 | 0.565 | 3.553 | 97 |
| `v20_learned_usage` | 2.848 | -0.133 | 0.569 | 3.537 | 97 |
| `v29_reliability_residual` | 2.873 | -0.485 | 0.579 | 3.496 | 97 |
| `v25_draft_capital_residual` | 2.874 | -0.289 | 0.575 | 3.509 | 97 |
| `v28_reliability_weighting` | 2.881 | -0.330 | 0.573 | 3.519 | 97 |
| `v22_advanced_receiving` | 2.903 | -0.058 | 0.562 | 3.565 | 97 |
| `v30_reliability_full_refit` | 2.906 | -0.543 | 0.553 | 3.602 | 97 |
| `v27_vegas_full_refit` | 2.909 | -0.543 | 0.552 | 3.603 | 97 |
| `v31_depth_chart` | 2.915 | -0.609 | 0.541 | 3.649 | 97 |
| `v23_draft_capital` | 2.963 | -0.481 | 0.540 | 3.651 | 97 |
| `naive_prior_season_ppg` | 2.999 | -0.058 | 0.426 | 4.080 | 97 |
| `position_mean_baseline` | 4.790 | +2.922 | -0.228 | 5.967 | 97 |

### WR

| Model | MAE | Bias | R² | RMSE | N |
| --- | --- | --- | --- | --- | --- |
| `external_fantasypros_v1` | 2.217 | +0.448 | 0.585 | 2.791 | 127 |
| `v16_snap_trend_full` | 2.315 | +0.114 | 0.542 | 2.934 | 127 |
| `v8_age_regression` | 2.345 | +0.161 | 0.545 | 2.922 | 127 |
| `v9_pos_specific` | 2.345 | +0.161 | 0.545 | 2.922 | 127 |
| `v12_no_qb_trajectory` | 2.345 | +0.161 | 0.545 | 2.922 | 127 |
| `v13_qb_starter` | 2.345 | +0.161 | 0.545 | 2.922 | 127 |
| `v14_qb_starter` | 2.345 | +0.161 | 0.545 | 2.922 | 127 |
| `v10_stat_efficiency_v2` | 2.350 | +0.159 | 0.545 | 2.922 | 127 |
| `v11_team_context_v2` | 2.359 | +0.138 | 0.536 | 2.951 | 127 |
| `v19_usage_level_full` | 2.359 | -0.160 | 0.544 | 2.927 | 127 |
| `v21_tiered_regression` | 2.362 | -0.048 | 0.523 | 2.993 | 127 |
| `v17_rookie_growth` | 2.387 | +0.109 | 0.537 | 2.949 | 127 |
| `v15_snap_trend` | 2.409 | -0.263 | 0.499 | 3.068 | 127 |
| `v7_regression_to_mean` | 2.416 | -0.001 | 0.518 | 3.007 | 127 |
| `v2_age_adjusted` | 2.427 | -0.216 | 0.503 | 3.054 | 127 |
| `v3_stat_weighted` | 2.428 | -0.204 | 0.504 | 3.052 | 127 |
| `v4_availability_adjusted` | 2.446 | -0.031 | 0.488 | 3.101 | 127 |
| `v5_team_context` | 2.453 | -0.057 | 0.481 | 3.122 | 127 |
| `v20_learned_usage` | 2.462 | -0.316 | 0.528 | 2.978 | 127 |
| `v6_usage_share` | 2.503 | -0.378 | 0.459 | 3.187 | 127 |
| `v18_usage_level` | 2.514 | -0.536 | 0.476 | 3.136 | 127 |
| `v30_reliability_full_refit` | 2.532 | -1.042 | 0.507 | 3.044 | 127 |
| `v27_vegas_full_refit` | 2.536 | -1.048 | 0.505 | 3.048 | 127 |
| `v22_advanced_receiving` | 2.543 | -0.831 | 0.497 | 3.074 | 127 |
| `v26_vegas_residual` | 2.547 | -1.230 | 0.496 | 3.076 | 127 |
| `v25_draft_capital_residual` | 2.559 | -1.134 | 0.499 | 3.067 | 127 |
| `v28_reliability_weighting` | 2.567 | -0.950 | 0.488 | 3.100 | 127 |
| `v31_depth_chart` | 2.578 | -1.106 | 0.458 | 3.189 | 127 |
| `v23_draft_capital` | 2.584 | -1.032 | 0.488 | 3.100 | 127 |
| `v29_reliability_residual` | 2.602 | -1.194 | 0.484 | 3.114 | 127 |
| `v1_baseline_weighted_ppg` | 2.615 | -0.355 | 0.451 | 3.211 | 127 |
| `naive_prior_season_ppg` | 2.647 | -0.357 | 0.410 | 3.329 | 127 |
| `position_mean_baseline` | 4.085 | +2.780 | -0.336 | 5.009 | 127 |

### TE

| Model | MAE | Bias | R² | RMSE | N |
| --- | --- | --- | --- | --- | --- |
| `external_fantasypros_v1` | 1.569 | +0.661 | 0.620 | 2.041 | 108 |
| `v21_tiered_regression` | 1.681 | +0.195 | 0.573 | 2.162 | 108 |
| `v10_stat_efficiency_v2` | 1.683 | +0.041 | 0.591 | 2.117 | 108 |
| `v8_age_regression` | 1.688 | +0.048 | 0.588 | 2.126 | 108 |
| `v9_pos_specific` | 1.688 | +0.048 | 0.588 | 2.126 | 108 |
| `v12_no_qb_trajectory` | 1.688 | +0.048 | 0.588 | 2.126 | 108 |
| `v13_qb_starter` | 1.688 | +0.048 | 0.588 | 2.126 | 108 |
| `v14_qb_starter` | 1.688 | +0.048 | 0.588 | 2.126 | 108 |
| `v17_rookie_growth` | 1.689 | +0.047 | 0.588 | 2.124 | 108 |
| `v11_team_context_v2` | 1.694 | +0.028 | 0.584 | 2.134 | 108 |
| `v16_snap_trend_full` | 1.697 | +0.050 | 0.586 | 2.129 | 108 |
| `v3_stat_weighted` | 1.700 | -0.091 | 0.581 | 2.141 | 108 |
| `v2_age_adjusted` | 1.703 | -0.082 | 0.580 | 2.145 | 108 |
| `v19_usage_level_full` | 1.705 | -0.049 | 0.584 | 2.134 | 108 |
| `v7_regression_to_mean` | 1.713 | +0.094 | 0.568 | 2.175 | 108 |
| `v15_snap_trend` | 1.718 | -0.080 | 0.581 | 2.141 | 108 |
| `v5_team_context` | 1.719 | +0.061 | 0.560 | 2.194 | 108 |
| `v4_availability_adjusted` | 1.733 | +0.085 | 0.562 | 2.191 | 108 |
| `v18_usage_level` | 1.738 | -0.178 | 0.562 | 2.190 | 108 |
| `v1_baseline_weighted_ppg` | 1.761 | -0.310 | 0.553 | 2.213 | 108 |
| `v6_usage_share` | 1.763 | -0.036 | 0.542 | 2.239 | 108 |
| `naive_prior_season_ppg` | 1.843 | -0.181 | 0.530 | 2.269 | 108 |
| `v25_draft_capital_residual` | 1.892 | -0.637 | 0.528 | 2.273 | 108 |
| `v31_depth_chart` | 1.895 | -0.601 | 0.533 | 2.262 | 108 |
| `v26_vegas_residual` | 1.914 | -0.666 | 0.526 | 2.278 | 108 |
| `v22_advanced_receiving` | 1.918 | -0.651 | 0.514 | 2.306 | 108 |
| `v28_reliability_weighting` | 1.935 | -0.641 | 0.517 | 2.300 | 108 |
| `v29_reliability_residual` | 1.940 | -0.698 | 0.517 | 2.301 | 108 |
| `v27_vegas_full_refit` | 1.951 | -0.674 | 0.513 | 2.310 | 108 |
| `v30_reliability_full_refit` | 1.954 | -0.675 | 0.512 | 2.312 | 108 |
| `v23_draft_capital` | 1.958 | -0.680 | 0.503 | 2.332 | 108 |
| `v20_learned_usage` | 2.033 | -0.992 | 0.469 | 2.411 | 108 |
| `position_mean_baseline` | 2.704 | +0.770 | -0.063 | 3.412 | 108 |

### K

| Model | MAE | Bias | R² | RMSE | N |
| --- | --- | --- | --- | --- | --- |

## Season 2024 — ALL (held-out)

| Model | MAE | Bias | R² | RMSE | N |
| --- | --- | --- | --- | --- | --- |
| `v19_usage_level_full` | 2.594 | +0.282 | 0.621 | 3.311 | 185 |
| `v12_no_qb_trajectory` | 2.598 | +0.453 | 0.612 | 3.352 | 185 |
| `v14_qb_starter` | 2.599 | +0.507 | 0.616 | 3.334 | 185 |
| `v13_qb_starter` | 2.601 | +0.445 | 0.610 | 3.361 | 185 |
| `v17_rookie_growth` | 2.603 | +0.480 | 0.615 | 3.339 | 185 |
| `v11_team_context_v2` | 2.604 | +0.425 | 0.606 | 3.379 | 185 |
| `v31_depth_chart` | 2.608 | -0.808 | 0.616 | 3.333 | 185 |
| `v8_age_regression` | 2.614 | +0.458 | 0.609 | 3.366 | 185 |
| `v9_pos_specific` | 2.614 | +0.458 | 0.609 | 3.366 | 185 |
| `v10_stat_efficiency_v2` | 2.616 | +0.453 | 0.611 | 3.357 | 185 |
| `v22_advanced_receiving` | 2.643 | -0.407 | 0.608 | 3.370 | 185 |
| `v16_snap_trend_full` | 2.647 | +0.444 | 0.595 | 3.422 | 185 |
| `v20_learned_usage` | 2.648 | -0.350 | 0.607 | 3.372 | 185 |
| `v26_vegas_residual` | 2.650 | -0.667 | 0.606 | 3.376 | 185 |
| `v25_draft_capital_residual` | 2.654 | -0.621 | 0.603 | 3.390 | 185 |
| `v3_stat_weighted` | 2.660 | +0.282 | 0.601 | 3.398 | 185 |
| `v28_reliability_weighting` | 2.661 | -0.635 | 0.602 | 3.393 | 185 |
| `v2_age_adjusted` | 2.663 | +0.272 | 0.599 | 3.405 | 185 |
| `v27_vegas_full_refit` | 2.675 | -0.678 | 0.591 | 3.443 | 185 |
| `external_fantasypros_v1` | 2.679 | +1.456 | 0.572 | 3.520 | 185 |
| `v21_tiered_regression` | 2.681 | +0.711 | 0.584 | 3.471 | 185 |
| `v30_reliability_full_refit` | 2.687 | -0.682 | 0.586 | 3.463 | 185 |
| `v1_baseline_weighted_ppg` | 2.695 | +0.091 | 0.577 | 3.499 | 185 |
| `v23_draft_capital` | 2.696 | -0.633 | 0.582 | 3.477 | 185 |
| `v18_usage_level` | 2.696 | +0.047 | 0.595 | 3.425 | 185 |
| `v29_reliability_residual` | 2.712 | -0.826 | 0.588 | 3.455 | 185 |
| `v7_regression_to_mean` | 2.722 | +0.721 | 0.585 | 3.467 | 185 |
| `v15_snap_trend` | 2.738 | +0.209 | 0.576 | 3.502 | 185 |
| `v4_availability_adjusted` | 2.769 | +0.792 | 0.569 | 3.533 | 185 |
| `v5_team_context` | 2.777 | +0.759 | 0.562 | 3.560 | 185 |
| `v6_usage_share` | 2.784 | +0.534 | 0.563 | 3.555 | 185 |
| `naive_prior_season_ppg` | 2.881 | +0.310 | 0.468 | 3.924 | 185 |
| `position_mean_baseline` | 3.868 | +1.645 | 0.168 | 4.909 | 185 |

## Season 2025 — ALL (held-out)

| Model | MAE | Bias | R² | RMSE | N |
| --- | --- | --- | --- | --- | --- |
| `external_fantasypros_v1` | 2.361 | +0.673 | 0.652 | 3.301 | 231 |
| `v14_qb_starter` | 2.410 | -0.117 | 0.664 | 3.241 | 231 |
| `v16_snap_trend_full` | 2.425 | -0.179 | 0.663 | 3.248 | 231 |
| `v19_usage_level_full` | 2.426 | -0.297 | 0.663 | 3.246 | 231 |
| `v10_stat_efficiency_v2` | 2.445 | -0.234 | 0.627 | 3.414 | 231 |
| `v21_tiered_regression` | 2.447 | -0.151 | 0.648 | 3.319 | 231 |
| `v7_regression_to_mean` | 2.449 | -0.029 | 0.640 | 3.356 | 231 |
| `v8_age_regression` | 2.455 | -0.242 | 0.625 | 3.423 | 231 |
| `v9_pos_specific` | 2.455 | -0.242 | 0.625 | 3.423 | 231 |
| `v17_rookie_growth` | 2.456 | -0.170 | 0.659 | 3.267 | 231 |
| `v11_team_context_v2` | 2.461 | -0.281 | 0.619 | 3.450 | 231 |
| `v12_no_qb_trajectory` | 2.464 | -0.193 | 0.626 | 3.420 | 231 |
| `v13_qb_starter` | 2.467 | -0.230 | 0.622 | 3.437 | 231 |
| `v5_team_context` | 2.500 | -0.178 | 0.615 | 3.472 | 231 |
| `v4_availability_adjusted` | 2.515 | -0.144 | 0.617 | 3.463 | 231 |
| `v3_stat_weighted` | 2.525 | -0.555 | 0.600 | 3.537 | 231 |
| `v2_age_adjusted` | 2.526 | -0.572 | 0.600 | 3.538 | 231 |
| `v15_snap_trend` | 2.534 | -0.634 | 0.596 | 3.555 | 231 |
| `v6_usage_share` | 2.535 | -0.359 | 0.606 | 3.511 | 231 |
| `v18_usage_level` | 2.583 | -0.752 | 0.587 | 3.593 | 231 |
| `v26_vegas_residual` | 2.636 | -1.096 | 0.644 | 3.337 | 231 |
| `v20_learned_usage` | 2.647 | -0.850 | 0.646 | 3.328 | 231 |
| `v22_advanced_receiving` | 2.656 | -0.865 | 0.642 | 3.346 | 231 |
| `v28_reliability_weighting` | 2.664 | -0.907 | 0.644 | 3.338 | 231 |
| `v30_reliability_full_refit` | 2.665 | -1.034 | 0.638 | 3.365 | 231 |
| `v25_draft_capital_residual` | 2.670 | -1.046 | 0.641 | 3.351 | 231 |
| `v27_vegas_full_refit` | 2.673 | -1.027 | 0.637 | 3.370 | 231 |
| `v29_reliability_residual` | 2.679 | -1.075 | 0.642 | 3.347 | 231 |
| `v31_depth_chart` | 2.695 | -0.987 | 0.619 | 3.451 | 231 |
| `v1_baseline_weighted_ppg` | 2.703 | -0.845 | 0.565 | 3.687 | 231 |
| `v23_draft_capital` | 2.739 | -1.015 | 0.626 | 3.418 | 231 |
| `naive_prior_season_ppg` | 2.897 | -0.754 | 0.496 | 3.970 | 231 |
| `position_mean_baseline` | 4.250 | +1.846 | 0.076 | 5.376 | 231 |
