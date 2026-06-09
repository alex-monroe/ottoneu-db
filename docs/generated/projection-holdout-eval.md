# Projection Held-Out Evaluation (GH #572)

_Generated: 2026-06-08 22:04_

**Every model is evaluated out-of-sample on a shared held-out window.** Learned/residual models were retrained on **2021,2022,2023** and never saw the eval seasons **2024,2025**; additive and external models are parameter-free w.r.t. training seasons, so their existing projections are already held-out. All models are scored through the identical `backtest_model` filter (target-season games ≥ 4, true rookies excluded). Unlike [projection-accuracy.md](projection-accuracy.md), **no model here is scored on data it trained on** — this is the honest ranking. See [docs/exec-plans/projection-methodology-audit.md](../exec-plans/projection-methodology-audit.md) (Finding 1b).

## Ranking — combined held-out ALL (lower MAE = better)

| Rank | Model | MAE | Bias | R² | RMSE | N |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `v14_qb_starter` | **2.450** | -0.149 | 0.611 | 3.251 | 647 |
| 2 | `v19_usage_level_full` | 2.456 | -0.280 | 0.611 | 3.249 | 647 |
| 3 | `external_fantasypros_v1` | 2.462 | +0.990 | 0.634 | 3.360 | 430 |
| 4 | `v16_snap_trend_full` | 2.467 | -0.183 | 0.605 | 3.278 | 647 |
| 5 | `v12_no_qb_trajectory` | 2.471 | -0.207 | 0.590 | 3.339 | 647 |
| 6 | `v10_stat_efficiency_v2` | 2.484 | -0.230 | 0.584 | 3.364 | 647 |
| 7 | `v13_qb_starter` | 2.484 | -0.233 | 0.581 | 3.374 | 647 |
| 8 | `v8_age_regression` | 2.485 | -0.235 | 0.582 | 3.370 | 647 |
| 9 | `v9_pos_specific` | 2.485 | -0.235 | 0.582 | 3.370 | 647 |
| 10 | `v11_team_context_v2` | 2.490 | -0.258 | 0.578 | 3.386 | 647 |
| 11 | `v17_rookie_growth` | 2.495 | -0.208 | 0.604 | 3.283 | 647 |
| 12 | `v21_tiered_regression` | 2.498 | +0.021 | 0.584 | 3.361 | 647 |
| 13 | `v3_stat_weighted` | 2.528 | -0.375 | 0.563 | 3.448 | 647 |
| 14 | `v7_regression_to_mean` | 2.529 | +0.018 | 0.578 | 3.385 | 647 |
| 15 | `v2_age_adjusted` | 2.531 | -0.389 | 0.561 | 3.454 | 647 |
| 16 | `v15_snap_trend` | 2.560 | -0.423 | 0.553 | 3.488 | 647 |
| 17 | `v18_usage_level` | 2.563 | -0.520 | 0.554 | 3.484 | 647 |
| 18 | `v4_availability_adjusted` | 2.565 | +0.015 | 0.558 | 3.466 | 647 |
| 19 | `v5_team_context` | 2.566 | -0.006 | 0.554 | 3.479 | 647 |
| 20 | `v6_usage_share` | 2.583 | -0.137 | 0.550 | 3.495 | 647 |
| 21 | `v1_baseline_weighted_ppg` | 2.633 | -0.652 | 0.527 | 3.588 | 647 |
| 22 | `v31_depth_chart` | 2.660 | -1.051 | 0.564 | 3.413 | 635 |
| 23 | `v30_reliability_full_refit` | 2.679 | -1.152 | 0.563 | 3.414 | 635 |
| 24 | `v20_learned_usage` | 2.683 | -1.060 | 0.572 | 3.377 | 635 |
| 25 | `v22_advanced_receiving` | 2.707 | -1.095 | 0.566 | 3.401 | 635 |
| 26 | `v26_vegas_residual` | 2.723 | -1.267 | 0.557 | 3.435 | 635 |
| 27 | `v25_draft_capital_residual` | 2.723 | -1.242 | 0.562 | 3.416 | 635 |
| 28 | `v27_vegas_full_refit` | 2.724 | -1.201 | 0.553 | 3.455 | 635 |
| 29 | `v28_reliability_weighting` | 2.728 | -1.161 | 0.562 | 3.418 | 635 |
| 30 | `v29_reliability_residual` | 2.752 | -1.296 | 0.556 | 3.440 | 635 |
| 31 | `v23_draft_capital` | 2.764 | -1.105 | 0.545 | 3.486 | 635 |

## Combined across eval seasons — by position

### ALL

| Model | MAE | Bias | R² | RMSE | N |
| --- | --- | --- | --- | --- | --- |
| `v14_qb_starter` | 2.450 | -0.149 | 0.611 | 3.251 | 647 |
| `v19_usage_level_full` | 2.456 | -0.280 | 0.611 | 3.249 | 647 |
| `external_fantasypros_v1` | 2.462 | +0.990 | 0.634 | 3.360 | 430 |
| `v16_snap_trend_full` | 2.467 | -0.183 | 0.605 | 3.278 | 647 |
| `v12_no_qb_trajectory` | 2.471 | -0.207 | 0.590 | 3.339 | 647 |
| `v10_stat_efficiency_v2` | 2.484 | -0.230 | 0.584 | 3.364 | 647 |
| `v13_qb_starter` | 2.484 | -0.233 | 0.581 | 3.374 | 647 |
| `v8_age_regression` | 2.485 | -0.235 | 0.582 | 3.370 | 647 |
| `v9_pos_specific` | 2.485 | -0.235 | 0.582 | 3.370 | 647 |
| `v11_team_context_v2` | 2.490 | -0.258 | 0.578 | 3.386 | 647 |
| `v17_rookie_growth` | 2.495 | -0.208 | 0.604 | 3.283 | 647 |
| `v21_tiered_regression` | 2.498 | +0.021 | 0.584 | 3.361 | 647 |
| `v3_stat_weighted` | 2.528 | -0.375 | 0.563 | 3.448 | 647 |
| `v7_regression_to_mean` | 2.529 | +0.018 | 0.578 | 3.385 | 647 |
| `v2_age_adjusted` | 2.531 | -0.389 | 0.561 | 3.454 | 647 |
| `v15_snap_trend` | 2.560 | -0.423 | 0.553 | 3.488 | 647 |
| `v18_usage_level` | 2.563 | -0.520 | 0.554 | 3.484 | 647 |
| `v4_availability_adjusted` | 2.565 | +0.015 | 0.558 | 3.466 | 647 |
| `v5_team_context` | 2.566 | -0.006 | 0.554 | 3.479 | 647 |
| `v6_usage_share` | 2.583 | -0.137 | 0.550 | 3.495 | 647 |
| `v1_baseline_weighted_ppg` | 2.633 | -0.652 | 0.527 | 3.588 | 647 |
| `v31_depth_chart` | 2.660 | -1.051 | 0.564 | 3.413 | 635 |
| `v30_reliability_full_refit` | 2.679 | -1.152 | 0.563 | 3.414 | 635 |
| `v20_learned_usage` | 2.683 | -1.060 | 0.572 | 3.377 | 635 |
| `v22_advanced_receiving` | 2.707 | -1.095 | 0.566 | 3.401 | 635 |
| `v26_vegas_residual` | 2.723 | -1.267 | 0.557 | 3.435 | 635 |
| `v25_draft_capital_residual` | 2.723 | -1.242 | 0.562 | 3.416 | 635 |
| `v27_vegas_full_refit` | 2.724 | -1.201 | 0.553 | 3.455 | 635 |
| `v28_reliability_weighting` | 2.728 | -1.161 | 0.562 | 3.418 | 635 |
| `v29_reliability_residual` | 2.752 | -1.296 | 0.556 | 3.440 | 635 |
| `v23_draft_capital` | 2.764 | -1.105 | 0.545 | 3.486 | 635 |

### QB

| Model | MAE | Bias | R² | RMSE | N |
| --- | --- | --- | --- | --- | --- |
| `v22_advanced_receiving` | 3.589 | -1.406 | 0.433 | 4.599 | 98 |
| `v28_reliability_weighting` | 3.596 | -1.465 | 0.428 | 4.618 | 98 |
| `v20_learned_usage` | 3.626 | -1.493 | 0.425 | 4.629 | 98 |
| `v31_depth_chart` | 3.631 | -1.590 | 0.426 | 4.628 | 98 |
| `v26_vegas_residual` | 3.657 | -1.645 | 0.407 | 4.703 | 98 |
| `v27_vegas_full_refit` | 3.672 | -1.461 | 0.390 | 4.773 | 98 |
| `v30_reliability_full_refit` | 3.681 | -1.510 | 0.388 | 4.779 | 98 |
| `v25_draft_capital_residual` | 3.681 | -1.635 | 0.406 | 4.708 | 98 |
| `v29_reliability_residual` | 3.686 | -1.694 | 0.401 | 4.728 | 98 |
| `external_fantasypros_v1` | 3.690 | +2.129 | 0.410 | 5.072 | 88 |
| `v23_draft_capital` | 3.744 | -1.077 | 0.388 | 4.777 | 98 |
| `v14_qb_starter` | 3.783 | -0.742 | 0.441 | 4.826 | 102 |
| `v17_rookie_growth` | 3.783 | -0.742 | 0.441 | 4.826 | 102 |
| `v19_usage_level_full` | 3.783 | -0.742 | 0.441 | 4.826 | 102 |
| `v21_tiered_regression` | 3.852 | -0.322 | 0.413 | 4.947 | 102 |
| `v16_snap_trend_full` | 3.857 | -0.755 | 0.427 | 4.886 | 102 |
| `v12_no_qb_trajectory` | 3.919 | -1.111 | 0.352 | 5.195 | 102 |
| `v13_qb_starter` | 3.957 | -1.234 | 0.325 | 5.304 | 102 |
| `v8_age_regression` | 3.959 | -1.245 | 0.329 | 5.286 | 102 |
| `v9_pos_specific` | 3.959 | -1.245 | 0.329 | 5.286 | 102 |
| `v10_stat_efficiency_v2` | 3.976 | -1.232 | 0.330 | 5.282 | 102 |
| `v11_team_context_v2` | 3.986 | -1.283 | 0.319 | 5.324 | 102 |
| `v7_regression_to_mean` | 4.017 | +0.185 | 0.362 | 5.155 | 102 |
| `v2_age_adjusted` | 4.064 | -1.387 | 0.297 | 5.412 | 102 |
| `v18_usage_level` | 4.064 | -1.387 | 0.297 | 5.412 | 102 |
| `v3_stat_weighted` | 4.068 | -1.367 | 0.300 | 5.401 | 102 |
| `v4_availability_adjusted` | 4.085 | +0.078 | 0.327 | 5.297 | 102 |
| `v5_team_context` | 4.134 | +0.044 | 0.318 | 5.329 | 102 |
| `v6_usage_share` | 4.134 | +0.044 | 0.318 | 5.329 | 102 |
| `v15_snap_trend` | 4.158 | -1.400 | 0.279 | 5.481 | 102 |
| `v1_baseline_weighted_ppg` | 4.218 | -1.808 | 0.261 | 5.548 | 102 |

### RB

| Model | MAE | Bias | R² | RMSE | N |
| --- | --- | --- | --- | --- | --- |
| `v11_team_context_v2` | 2.686 | -0.005 | 0.575 | 3.479 | 137 |
| `v10_stat_efficiency_v2` | 2.702 | +0.057 | 0.575 | 3.480 | 137 |
| `v6_usage_share` | 2.712 | -0.088 | 0.555 | 3.556 | 137 |
| `v3_stat_weighted` | 2.713 | -0.132 | 0.565 | 3.520 | 137 |
| `v5_team_context` | 2.715 | +0.150 | 0.553 | 3.561 | 137 |
| `v8_age_regression` | 2.717 | +0.039 | 0.572 | 3.495 | 137 |
| `v9_pos_specific` | 2.717 | +0.039 | 0.572 | 3.495 | 137 |
| `v12_no_qb_trajectory` | 2.717 | +0.039 | 0.572 | 3.495 | 137 |
| `v13_qb_starter` | 2.717 | +0.039 | 0.572 | 3.495 | 137 |
| `v14_qb_starter` | 2.717 | +0.039 | 0.572 | 3.495 | 137 |
| `external_fantasypros_v1` | 2.718 | +1.056 | 0.548 | 3.345 | 100 |
| `v2_age_adjusted` | 2.719 | -0.175 | 0.563 | 3.527 | 137 |
| `v19_usage_level_full` | 2.721 | -0.200 | 0.576 | 3.479 | 137 |
| `v7_regression_to_mean` | 2.725 | +0.126 | 0.563 | 3.523 | 137 |
| `v4_availability_adjusted` | 2.758 | +0.176 | 0.550 | 3.574 | 137 |
| `v18_usage_level` | 2.762 | -0.413 | 0.553 | 3.569 | 137 |
| `v16_snap_trend_full` | 2.769 | -0.068 | 0.560 | 3.543 | 137 |
| `v15_snap_trend` | 2.778 | -0.281 | 0.546 | 3.596 | 137 |
| `v21_tiered_regression` | 2.782 | +0.220 | 0.534 | 3.647 | 137 |
| `v17_rookie_growth` | 2.785 | -0.067 | 0.559 | 3.547 | 137 |
| `v1_baseline_weighted_ppg` | 2.806 | -0.518 | 0.517 | 3.716 | 137 |
| `v31_depth_chart` | 3.006 | -0.854 | 0.512 | 3.742 | 135 |
| `v20_learned_usage` | 3.101 | -1.005 | 0.494 | 3.802 | 135 |
| `v26_vegas_residual` | 3.127 | -1.172 | 0.496 | 3.798 | 135 |
| `v25_draft_capital_residual` | 3.146 | -1.174 | 0.494 | 3.807 | 135 |
| `v22_advanced_receiving` | 3.162 | -0.998 | 0.486 | 3.835 | 135 |
| `v28_reliability_weighting` | 3.167 | -1.109 | 0.483 | 3.851 | 135 |
| `v29_reliability_residual` | 3.170 | -1.246 | 0.485 | 3.843 | 135 |
| `v30_reliability_full_refit` | 3.200 | -1.227 | 0.474 | 3.887 | 135 |
| `v27_vegas_full_refit` | 3.201 | -1.257 | 0.469 | 3.909 | 135 |
| `v23_draft_capital` | 3.234 | -1.135 | 0.457 | 3.953 | 135 |

### WR

| Model | MAE | Bias | R² | RMSE | N |
| --- | --- | --- | --- | --- | --- |
| `external_fantasypros_v1` | 2.199 | +0.436 | 0.571 | 2.767 | 131 |
| `v16_snap_trend_full` | 2.348 | -0.215 | 0.511 | 2.997 | 200 |
| `v8_age_regression` | 2.373 | -0.175 | 0.511 | 2.993 | 200 |
| `v9_pos_specific` | 2.373 | -0.175 | 0.511 | 2.993 | 200 |
| `v12_no_qb_trajectory` | 2.373 | -0.175 | 0.511 | 2.993 | 200 |
| `v13_qb_starter` | 2.373 | -0.175 | 0.511 | 2.993 | 200 |
| `v14_qb_starter` | 2.373 | -0.175 | 0.511 | 2.993 | 200 |
| `v10_stat_efficiency_v2` | 2.376 | -0.175 | 0.511 | 2.992 | 200 |
| `v19_usage_level_full` | 2.380 | -0.379 | 0.511 | 2.996 | 200 |
| `v11_team_context_v2` | 2.390 | -0.193 | 0.500 | 3.028 | 200 |
| `v21_tiered_regression` | 2.408 | -0.166 | 0.473 | 3.108 | 200 |
| `v7_regression_to_mean` | 2.421 | -0.279 | 0.489 | 3.056 | 200 |
| `v15_snap_trend` | 2.425 | -0.431 | 0.467 | 3.132 | 200 |
| `v3_stat_weighted` | 2.430 | -0.382 | 0.470 | 3.119 | 200 |
| `v2_age_adjusted` | 2.435 | -0.391 | 0.467 | 3.127 | 200 |
| `v4_availability_adjusted` | 2.444 | -0.270 | 0.456 | 3.155 | 200 |
| `v17_rookie_growth` | 2.450 | -0.267 | 0.493 | 3.050 | 200 |
| `v5_team_context` | 2.459 | -0.293 | 0.447 | 3.181 | 200 |
| `v18_usage_level` | 2.488 | -0.596 | 0.450 | 3.180 | 200 |
| `v6_usage_share` | 2.488 | -0.498 | 0.434 | 3.222 | 200 |
| `v1_baseline_weighted_ppg` | 2.614 | -0.624 | 0.408 | 3.301 | 200 |
| `v30_reliability_full_refit` | 2.636 | -1.409 | 0.434 | 3.212 | 196 |
| `v20_learned_usage` | 2.637 | -0.923 | 0.443 | 3.186 | 196 |
| `v22_advanced_receiving` | 2.750 | -1.289 | 0.399 | 3.309 | 196 |
| `v27_vegas_full_refit` | 2.757 | -1.534 | 0.397 | 3.320 | 196 |
| `v23_draft_capital` | 2.783 | -1.395 | 0.392 | 3.338 | 196 |
| `v25_draft_capital_residual` | 2.785 | -1.583 | 0.397 | 3.314 | 196 |
| `v28_reliability_weighting` | 2.787 | -1.413 | 0.390 | 3.332 | 196 |
| `v26_vegas_residual` | 2.806 | -1.665 | 0.371 | 3.388 | 196 |
| `v29_reliability_residual` | 2.812 | -1.595 | 0.390 | 3.334 | 196 |
| `v31_depth_chart` | 2.836 | -1.528 | 0.340 | 3.490 | 196 |

### TE

| Model | MAE | Bias | R² | RMSE | N |
| --- | --- | --- | --- | --- | --- |
| `external_fantasypros_v1` | 1.568 | +0.683 | 0.596 | 2.057 | 111 |
| `v10_stat_efficiency_v2` | 1.737 | +0.017 | 0.564 | 2.216 | 144 |
| `v8_age_regression` | 1.740 | +0.024 | 0.562 | 2.221 | 144 |
| `v9_pos_specific` | 1.740 | +0.024 | 0.562 | 2.221 | 144 |
| `v12_no_qb_trajectory` | 1.740 | +0.024 | 0.562 | 2.221 | 144 |
| `v13_qb_starter` | 1.740 | +0.024 | 0.562 | 2.221 | 144 |
| `v14_qb_starter` | 1.740 | +0.024 | 0.562 | 2.221 | 144 |
| `v16_snap_trend_full` | 1.749 | +0.031 | 0.561 | 2.225 | 144 |
| `v11_team_context_v2` | 1.750 | +0.016 | 0.559 | 2.229 | 144 |
| `v3_stat_weighted` | 1.753 | -0.063 | 0.552 | 2.245 | 144 |
| `v19_usage_level_full` | 1.754 | -0.055 | 0.558 | 2.231 | 144 |
| `v2_age_adjusted` | 1.756 | -0.058 | 0.552 | 2.246 | 144 |
| `v21_tiered_regression` | 1.765 | +0.242 | 0.543 | 2.269 | 144 |
| `v15_snap_trend` | 1.770 | -0.050 | 0.552 | 2.246 | 144 |
| `v1_baseline_weighted_ppg` | 1.773 | -0.326 | 0.533 | 2.304 | 144 |
| `v17_rookie_growth` | 1.774 | -0.014 | 0.553 | 2.246 | 144 |
| `v18_usage_level` | 1.784 | -0.136 | 0.537 | 2.283 | 144 |
| `v7_regression_to_mean` | 1.784 | +0.109 | 0.531 | 2.295 | 144 |
| `v5_team_context` | 1.793 | +0.104 | 0.525 | 2.312 | 144 |
| `v4_availability_adjusted` | 1.800 | +0.117 | 0.526 | 2.309 | 144 |
| `v6_usage_share` | 1.828 | +0.025 | 0.509 | 2.346 | 144 |
| `v31_depth_chart` | 1.941 | -0.689 | 0.510 | 2.327 | 142 |
| `v25_draft_capital_residual` | 1.986 | -0.811 | 0.496 | 2.385 | 142 |
| `v26_vegas_residual` | 1.989 | -0.806 | 0.496 | 2.382 | 142 |
| `v22_advanced_receiving` | 2.018 | -0.807 | 0.483 | 2.414 | 142 |
| `v30_reliability_full_refit` | 2.019 | -0.771 | 0.488 | 2.400 | 142 |
| `v27_vegas_full_refit` | 2.054 | -0.816 | 0.476 | 2.431 | 142 |
| `v28_reliability_weighting` | 2.055 | -0.791 | 0.476 | 2.433 | 142 |
| `v29_reliability_residual` | 2.062 | -0.846 | 0.475 | 2.434 | 142 |
| `v20_learned_usage` | 2.099 | -1.108 | 0.444 | 2.504 | 142 |
| `v23_draft_capital` | 2.117 | -0.982 | 0.436 | 2.527 | 142 |

### K

| Model | MAE | Bias | R² | RMSE | N |
| --- | --- | --- | --- | --- | --- |
| `v31_depth_chart` | 1.501 | +0.018 | -0.128 | 1.978 | 64 |
| `v12_no_qb_trajectory` | 1.589 | +0.090 | -0.278 | 2.115 | 64 |
| `v14_qb_starter` | 1.589 | +0.090 | -0.278 | 2.115 | 64 |
| `v17_rookie_growth` | 1.589 | +0.090 | -0.278 | 2.115 | 64 |
| `v19_usage_level_full` | 1.589 | +0.090 | -0.278 | 2.115 | 64 |
| `v16_snap_trend_full` | 1.598 | +0.101 | -0.280 | 2.117 | 64 |
| `v23_draft_capital` | 1.644 | -0.467 | -0.255 | 2.097 | 64 |
| `v30_reliability_full_refit` | 1.647 | -0.506 | -0.251 | 2.097 | 64 |
| `v27_vegas_full_refit` | 1.653 | -0.516 | -0.259 | 2.102 | 64 |
| `v21_tiered_regression` | 1.658 | +0.230 | -0.432 | 2.235 | 64 |
| `v8_age_regression` | 1.662 | +0.020 | -0.403 | 2.233 | 64 |
| `v9_pos_specific` | 1.662 | +0.020 | -0.403 | 2.233 | 64 |
| `v10_stat_efficiency_v2` | 1.662 | +0.020 | -0.403 | 2.233 | 64 |
| `v11_team_context_v2` | 1.662 | +0.020 | -0.403 | 2.233 | 64 |
| `v13_qb_starter` | 1.662 | +0.020 | -0.403 | 2.233 | 64 |
| `v1_baseline_weighted_ppg` | 1.727 | +0.079 | -0.563 | 2.348 | 64 |
| `v2_age_adjusted` | 1.731 | +0.006 | -0.523 | 2.329 | 64 |
| `v3_stat_weighted` | 1.731 | +0.006 | -0.523 | 2.329 | 64 |
| `v18_usage_level` | 1.731 | +0.006 | -0.523 | 2.329 | 64 |
| `v15_snap_trend` | 1.742 | +0.017 | -0.525 | 2.331 | 64 |
| `v7_regression_to_mean` | 1.753 | +0.243 | -0.722 | 2.419 | 64 |
| `v28_reliability_weighting` | 1.781 | -0.858 | -0.356 | 2.195 | 64 |
| `v29_reliability_residual` | 1.788 | -0.873 | -0.359 | 2.198 | 64 |
| `v20_learned_usage` | 1.789 | -0.824 | -0.377 | 2.208 | 64 |
| `v22_advanced_receiving` | 1.794 | -0.868 | -0.373 | 2.206 | 64 |
| `v25_draft_capital_residual` | 1.810 | -0.693 | -0.435 | 2.243 | 64 |
| `v26_vegas_residual` | 1.810 | -0.693 | -0.435 | 2.243 | 64 |
| `v4_availability_adjusted` | 1.826 | +0.229 | -0.845 | 2.509 | 64 |
| `v5_team_context` | 1.826 | +0.229 | -0.845 | 2.509 | 64 |
| `v6_usage_share` | 1.826 | +0.229 | -0.845 | 2.509 | 64 |

## Season 2024 — ALL (held-out)

| Model | MAE | Bias | R² | RMSE | N |
| --- | --- | --- | --- | --- | --- |
| `v19_usage_level_full` | 2.660 | +0.011 | 0.552 | 3.440 | 274 |
| `v14_qb_starter` | 2.660 | +0.168 | 0.549 | 3.449 | 274 |
| `v12_no_qb_trajectory` | 2.663 | +0.106 | 0.537 | 3.495 | 274 |
| `v16_snap_trend_full` | 2.669 | +0.152 | 0.543 | 3.471 | 274 |
| `external_fantasypros_v1` | 2.671 | +1.449 | 0.579 | 3.509 | 187 |
| `v31_depth_chart` | 2.675 | -0.939 | 0.547 | 3.420 | 271 |
| `v13_qb_starter` | 2.675 | +0.082 | 0.525 | 3.540 | 274 |
| `v11_team_context_v2` | 2.676 | +0.063 | 0.523 | 3.546 | 274 |
| `v17_rookie_growth` | 2.676 | +0.135 | 0.544 | 3.468 | 274 |
| `v8_age_regression` | 2.682 | +0.089 | 0.524 | 3.544 | 274 |
| `v9_pos_specific` | 2.682 | +0.089 | 0.524 | 3.544 | 274 |
| `v10_stat_efficiency_v2` | 2.690 | +0.090 | 0.524 | 3.542 | 274 |
| `v20_learned_usage` | 2.712 | -0.796 | 0.531 | 3.477 | 271 |
| `v22_advanced_receiving` | 2.724 | -0.840 | 0.525 | 3.500 | 271 |
| `v23_draft_capital` | 2.725 | -0.697 | 0.516 | 3.533 | 271 |
| `v2_age_adjusted` | 2.731 | -0.043 | 0.505 | 3.612 | 274 |
| `v3_stat_weighted` | 2.732 | -0.026 | 0.507 | 3.606 | 274 |
| `v27_vegas_full_refit` | 2.732 | -0.914 | 0.516 | 3.532 | 271 |
| `v21_tiered_regression` | 2.739 | +0.406 | 0.510 | 3.597 | 274 |
| `v28_reliability_weighting` | 2.740 | -0.909 | 0.523 | 3.507 | 271 |
| `v30_reliability_full_refit` | 2.740 | -0.915 | 0.513 | 3.544 | 271 |
| `v25_draft_capital_residual` | 2.748 | -1.008 | 0.518 | 3.526 | 271 |
| `v1_baseline_weighted_ppg` | 2.755 | -0.289 | 0.482 | 3.698 | 274 |
| `v18_usage_level` | 2.757 | -0.199 | 0.500 | 3.631 | 274 |
| `v26_vegas_residual` | 2.759 | -1.045 | 0.513 | 3.545 | 271 |
| `v15_snap_trend` | 2.764 | -0.059 | 0.497 | 3.642 | 274 |
| `v29_reliability_residual` | 2.779 | -1.054 | 0.512 | 3.547 | 271 |
| `v7_regression_to_mean` | 2.796 | +0.362 | 0.497 | 3.643 | 274 |
| `v4_availability_adjusted` | 2.838 | +0.413 | 0.475 | 3.722 | 274 |
| `v5_team_context` | 2.843 | +0.387 | 0.471 | 3.735 | 274 |
| `v6_usage_share` | 2.850 | +0.231 | 0.471 | 3.737 | 274 |

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
| `v30_reliability_full_refit` | 2.635 | -1.329 | 0.600 | 3.313 | 364 |
| `v31_depth_chart` | 2.649 | -1.135 | 0.577 | 3.408 | 364 |
| `v20_learned_usage` | 2.661 | -1.256 | 0.603 | 3.301 | 364 |
| `v22_advanced_receiving` | 2.694 | -1.285 | 0.597 | 3.325 | 364 |
| `v26_vegas_residual` | 2.696 | -1.432 | 0.591 | 3.351 | 364 |
| `v25_draft_capital_residual` | 2.705 | -1.415 | 0.595 | 3.333 | 364 |
| `v27_vegas_full_refit` | 2.718 | -1.414 | 0.580 | 3.396 | 364 |
| `v28_reliability_weighting` | 2.719 | -1.349 | 0.591 | 3.350 | 364 |
| `v29_reliability_residual` | 2.732 | -1.476 | 0.589 | 3.358 | 364 |
| `v23_draft_capital` | 2.793 | -1.408 | 0.566 | 3.451 | 364 |
