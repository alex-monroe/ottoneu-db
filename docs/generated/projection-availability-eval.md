# Projection Availability-Inclusive Evaluation (GH #574)

_Generated: 2026-06-10 09:06_

Standard backtests score only players with ≥4 games, hiding injured/benched/bust seasons. This evaluation keeps everyone with ≥1 game (non-rookie) and scores each PPG projection against two targets: **Rate** = actual PPG, and **Avail** = availability-inclusive production per scheduled game (`ppg × min(games,17) / 17`, missed games = 0). The gap **avail-MAE − rate-MAE** is the *availability error budget* — error from playing-time loss that no current rate feature addresses. Default models are parameter-free (additive + external), whose stored projections are leakage-free; learned models (if included) use in-sample projections (see #571). Seasons: 2022,2023,2024,2025. See [docs/exec-plans/projection-methodology-audit.md](../exec-plans/projection-methodology-audit.md) (Finding 3).

## Rate vs availability decomposition (combined ALL)

| Model | N | Mean games | Rate MAE | Avail MAE | Availability budget | Avail bias |
| --- | --- | --- | --- | --- | --- | --- |
| `external_fantasypros_v1` | 703 | 13.1 | 2.598 | 2.489 | -0.109 | -0.455 |
| `v7_regression_to_mean` | 1069 | 12.6 | 2.652 | 3.096 | +0.444 | -1.530 |
| `v4_availability_adjusted` | 1069 | 12.6 | 2.673 | 3.106 | +0.433 | -1.527 |
| `v5_team_context` | 1069 | 12.6 | 2.679 | 3.117 | +0.437 | -1.550 |
| `v21_tiered_regression` | 1069 | 12.6 | 2.599 | 3.120 | +0.521 | -1.536 |
| `v6_usage_share` | 1069 | 12.6 | 2.703 | 3.179 | +0.475 | -1.697 |
| `v14_qb_starter` | 1069 | 12.6 | 2.555 | 3.188 | +0.633 | -1.747 |
| `v16_snap_trend_full` | 1069 | 12.6 | 2.570 | 3.216 | +0.646 | -1.781 |
| `v19_usage_level_full` | 1069 | 12.6 | 2.560 | 3.247 | +0.687 | -1.894 |
| `v12_no_qb_trajectory` | 1069 | 12.6 | 2.568 | 3.252 | +0.684 | -1.815 |
| `v17_rookie_growth` | 1069 | 12.6 | 2.610 | 3.252 | +0.642 | -1.817 |
| `v10_stat_efficiency_v2` | 1069 | 12.6 | 2.577 | 3.257 | +0.681 | -1.835 |
| `v8_age_regression` | 1069 | 12.6 | 2.579 | 3.265 | +0.686 | -1.843 |
| `v9_pos_specific` | 1069 | 12.6 | 2.579 | 3.265 | +0.686 | -1.843 |
| `v13_qb_starter` | 1069 | 12.6 | 2.578 | 3.268 | +0.691 | -1.842 |
| `v11_team_context_v2` | 1069 | 12.6 | 2.585 | 3.270 | +0.685 | -1.869 |
| `v3_stat_weighted` | 1069 | 12.6 | 2.615 | 3.334 | +0.720 | -1.996 |
| `v2_age_adjusted` | 1069 | 12.6 | 2.617 | 3.343 | +0.726 | -2.010 |
| `v15_snap_trend` | 1069 | 12.6 | 2.649 | 3.375 | +0.725 | -2.044 |
| `v18_usage_level` | 1069 | 12.6 | 2.658 | 3.414 | +0.756 | -2.157 |
| `naive_prior_season_ppg` | 1098 | 12.4 | 2.819 | 3.476 | +0.657 | -1.979 |
| `v1_baseline_weighted_ppg` | 1069 | 12.6 | 2.693 | 3.510 | +0.817 | -2.242 |
| `position_mean_baseline` | 1098 | 12.4 | 4.078 | 4.312 | +0.234 | -0.700 |

## Availability-inclusive metrics by position

### ALL

| Model | MAE | Bias | R² | RMSE | N |
| --- | --- | --- | --- | --- | --- |
| `external_fantasypros_v1` | 2.489 | -0.455 | 0.594 | 3.539 | 703 |
| `v7_regression_to_mean` | 3.096 | -1.530 | 0.349 | 4.234 | 1069 |
| `v4_availability_adjusted` | 3.106 | -1.527 | 0.322 | 4.324 | 1069 |
| `v5_team_context` | 3.117 | -1.550 | 0.315 | 4.344 | 1069 |
| `v21_tiered_regression` | 3.120 | -1.536 | 0.309 | 4.363 | 1069 |
| `v6_usage_share` | 3.179 | -1.697 | 0.292 | 4.417 | 1069 |
| `v14_qb_starter` | 3.188 | -1.747 | 0.312 | 4.355 | 1069 |
| `v16_snap_trend_full` | 3.216 | -1.781 | 0.296 | 4.404 | 1069 |
| `v19_usage_level_full` | 3.247 | -1.894 | 0.293 | 4.412 | 1069 |
| `v12_no_qb_trajectory` | 3.252 | -1.815 | 0.273 | 4.475 | 1069 |
| `v17_rookie_growth` | 3.252 | -1.817 | 0.300 | 4.392 | 1069 |
| `v10_stat_efficiency_v2` | 3.257 | -1.835 | 0.259 | 4.518 | 1069 |
| `v8_age_regression` | 3.265 | -1.843 | 0.256 | 4.527 | 1069 |
| `v9_pos_specific` | 3.265 | -1.843 | 0.256 | 4.527 | 1069 |
| `v13_qb_starter` | 3.268 | -1.842 | 0.255 | 4.531 | 1069 |
| `v11_team_context_v2` | 3.270 | -1.869 | 0.252 | 4.540 | 1069 |
| `v3_stat_weighted` | 3.334 | -1.996 | 0.210 | 4.665 | 1069 |
| `v2_age_adjusted` | 3.343 | -2.010 | 0.205 | 4.681 | 1069 |
| `v15_snap_trend` | 3.375 | -2.044 | 0.186 | 4.735 | 1069 |
| `v18_usage_level` | 3.414 | -2.157 | 0.178 | 4.759 | 1069 |
| `naive_prior_season_ppg` | 3.476 | -1.979 | 0.130 | 4.919 | 1098 |
| `v1_baseline_weighted_ppg` | 3.510 | -2.242 | 0.134 | 4.885 | 1069 |
| `position_mean_baseline` | 4.312 | -0.700 | -0.064 | 5.439 | 1098 |

### QB

| Model | MAE | Bias | R² | RMSE | N |
| --- | --- | --- | --- | --- | --- |
| `external_fantasypros_v1` | 3.299 | -0.964 | 0.575 | 4.768 | 174 |
| `v4_availability_adjusted` | 5.054 | -3.283 | 0.148 | 6.563 | 211 |
| `v7_regression_to_mean` | 5.078 | -3.265 | 0.183 | 6.429 | 211 |
| `v5_team_context` | 5.115 | -3.330 | 0.135 | 6.613 | 211 |
| `v6_usage_share` | 5.115 | -3.330 | 0.135 | 6.613 | 211 |
| `v21_tiered_regression` | 5.411 | -3.736 | 0.074 | 6.842 | 211 |
| `v14_qb_starter` | 5.707 | -4.258 | 0.043 | 6.958 | 211 |
| `v17_rookie_growth` | 5.707 | -4.258 | 0.043 | 6.958 | 211 |
| `v19_usage_level_full` | 5.707 | -4.258 | 0.043 | 6.958 | 211 |
| `v16_snap_trend_full` | 5.787 | -4.329 | 0.017 | 7.053 | 211 |
| `v12_no_qb_trajectory` | 6.031 | -4.602 | -0.064 | 7.335 | 211 |
| `v3_stat_weighted` | 6.047 | -4.759 | -0.132 | 7.566 | 211 |
| `v10_stat_efficiency_v2` | 6.048 | -4.704 | -0.098 | 7.453 | 211 |
| `v8_age_regression` | 6.058 | -4.726 | -0.104 | 7.471 | 211 |
| `v9_pos_specific` | 6.058 | -4.726 | -0.104 | 7.471 | 211 |
| `v11_team_context_v2` | 6.064 | -4.779 | -0.109 | 7.489 | 211 |
| `v2_age_adjusted` | 6.069 | -4.791 | -0.143 | 7.602 | 211 |
| `v18_usage_level` | 6.069 | -4.791 | -0.143 | 7.602 | 211 |
| `v13_qb_starter` | 6.074 | -4.721 | -0.107 | 7.484 | 211 |
| `v15_snap_trend` | 6.162 | -4.862 | -0.173 | 7.704 | 211 |
| `naive_prior_season_ppg` | 6.338 | -4.546 | -0.268 | 8.007 | 211 |
| `v1_baseline_weighted_ppg` | 6.355 | -5.165 | -0.229 | 7.882 | 211 |
| `position_mean_baseline` | 7.314 | -4.264 | -0.373 | 8.333 | 211 |

### RB

| Model | MAE | Bias | R² | RMSE | N |
| --- | --- | --- | --- | --- | --- |
| `external_fantasypros_v1` | 2.825 | -0.112 | 0.524 | 3.765 | 153 |
| `v10_stat_efficiency_v2` | 3.378 | -1.221 | 0.427 | 4.295 | 217 |
| `v11_team_context_v2` | 3.393 | -1.272 | 0.420 | 4.320 | 217 |
| `v21_tiered_regression` | 3.399 | -1.033 | 0.394 | 4.417 | 217 |
| `v8_age_regression` | 3.404 | -1.230 | 0.422 | 4.313 | 217 |
| `v9_pos_specific` | 3.404 | -1.230 | 0.422 | 4.313 | 217 |
| `v12_no_qb_trajectory` | 3.404 | -1.230 | 0.422 | 4.313 | 217 |
| `v13_qb_starter` | 3.404 | -1.230 | 0.422 | 4.313 | 217 |
| `v14_qb_starter` | 3.404 | -1.230 | 0.422 | 4.313 | 217 |
| `v5_team_context` | 3.450 | -1.148 | 0.382 | 4.459 | 217 |
| `v7_regression_to_mean` | 3.458 | -1.138 | 0.402 | 4.388 | 217 |
| `v16_snap_trend_full` | 3.461 | -1.305 | 0.403 | 4.382 | 217 |
| `v4_availability_adjusted` | 3.481 | -1.127 | 0.382 | 4.458 | 217 |
| `v19_usage_level_full` | 3.529 | -1.500 | 0.389 | 4.433 | 217 |
| `v3_stat_weighted` | 3.530 | -1.485 | 0.368 | 4.508 | 217 |
| `v17_rookie_growth` | 3.540 | -1.385 | 0.388 | 4.437 | 217 |
| `v2_age_adjusted` | 3.541 | -1.510 | 0.364 | 4.522 | 217 |
| `v6_usage_share` | 3.548 | -1.417 | 0.346 | 4.588 | 217 |
| `v15_snap_trend` | 3.585 | -1.584 | 0.342 | 4.602 | 217 |
| `naive_prior_season_ppg` | 3.589 | -1.517 | 0.292 | 4.825 | 227 |
| `v1_baseline_weighted_ppg` | 3.667 | -1.810 | 0.294 | 4.766 | 217 |
| `v18_usage_level` | 3.671 | -1.779 | 0.317 | 4.689 | 217 |
| `position_mean_baseline` | 4.959 | +0.541 | -0.027 | 5.815 | 227 |

### WR

| Model | MAE | Bias | R² | RMSE | N |
| --- | --- | --- | --- | --- | --- |
| `external_fantasypros_v1` | 2.433 | -0.695 | 0.451 | 3.175 | 196 |
| `v21_tiered_regression` | 2.784 | -1.279 | 0.366 | 3.763 | 291 |
| `v8_age_regression` | 2.814 | -1.296 | 0.402 | 3.656 | 291 |
| `v9_pos_specific` | 2.814 | -1.296 | 0.402 | 3.656 | 291 |
| `v12_no_qb_trajectory` | 2.814 | -1.296 | 0.402 | 3.656 | 291 |
| `v13_qb_starter` | 2.814 | -1.296 | 0.402 | 3.656 | 291 |
| `v14_qb_starter` | 2.814 | -1.296 | 0.402 | 3.656 | 291 |
| `v11_team_context_v2` | 2.815 | -1.313 | 0.397 | 3.672 | 291 |
| `v10_stat_efficiency_v2` | 2.818 | -1.293 | 0.401 | 3.658 | 291 |
| `v16_snap_trend_full` | 2.827 | -1.345 | 0.392 | 3.686 | 291 |
| `v7_regression_to_mean` | 2.876 | -1.427 | 0.362 | 3.777 | 291 |
| `v4_availability_adjusted` | 2.881 | -1.422 | 0.327 | 3.878 | 291 |
| `v5_team_context` | 2.889 | -1.445 | 0.320 | 3.898 | 291 |
| `v19_usage_level_full` | 2.894 | -1.548 | 0.365 | 3.767 | 291 |
| `v3_stat_weighted` | 2.903 | -1.556 | 0.324 | 3.887 | 291 |
| `v17_rookie_growth` | 2.906 | -1.396 | 0.392 | 3.686 | 291 |
| `v2_age_adjusted` | 2.908 | -1.564 | 0.322 | 3.892 | 291 |
| `v15_snap_trend` | 2.934 | -1.612 | 0.310 | 3.926 | 291 |
| `v6_usage_share` | 2.998 | -1.696 | 0.270 | 4.040 | 291 |
| `v18_usage_level` | 3.019 | -1.816 | 0.268 | 4.043 | 291 |
| `naive_prior_season_ppg` | 3.064 | -1.655 | 0.270 | 4.091 | 302 |
| `v1_baseline_weighted_ppg` | 3.106 | -1.754 | 0.247 | 4.101 | 291 |
| `position_mean_baseline` | 4.034 | +0.552 | -0.007 | 4.804 | 302 |

### TE

| Model | MAE | Bias | R² | RMSE | N |
| --- | --- | --- | --- | --- | --- |
| `external_fantasypros_v1` | 1.482 | +0.007 | 0.582 | 1.978 | 180 |
| `v10_stat_efficiency_v2` | 1.794 | -0.756 | 0.439 | 2.298 | 235 |
| `v16_snap_trend_full` | 1.799 | -0.767 | 0.438 | 2.300 | 235 |
| `v8_age_regression` | 1.799 | -0.760 | 0.436 | 2.304 | 235 |
| `v9_pos_specific` | 1.799 | -0.760 | 0.436 | 2.304 | 235 |
| `v12_no_qb_trajectory` | 1.799 | -0.760 | 0.436 | 2.304 | 235 |
| `v13_qb_starter` | 1.799 | -0.760 | 0.436 | 2.304 | 235 |
| `v14_qb_starter` | 1.799 | -0.760 | 0.436 | 2.304 | 235 |
| `v21_tiered_regression` | 1.799 | -0.532 | 0.429 | 2.318 | 235 |
| `v11_team_context_v2` | 1.824 | -0.770 | 0.428 | 2.322 | 235 |
| `v7_regression_to_mean` | 1.833 | -0.673 | 0.407 | 2.364 | 235 |
| `v19_usage_level_full` | 1.851 | -0.870 | 0.402 | 2.372 | 235 |
| `v17_rookie_growth` | 1.852 | -0.815 | 0.415 | 2.348 | 235 |
| `v4_availability_adjusted` | 1.853 | -0.648 | 0.380 | 2.416 | 235 |
| `v5_team_context` | 1.865 | -0.663 | 0.376 | 2.425 | 235 |
| `v3_stat_weighted` | 1.879 | -0.857 | 0.370 | 2.435 | 235 |
| `v2_age_adjusted` | 1.884 | -0.859 | 0.371 | 2.434 | 235 |
| `v15_snap_trend` | 1.887 | -0.866 | 0.373 | 2.430 | 235 |
| `v6_usage_share` | 1.923 | -0.773 | 0.329 | 2.514 | 235 |
| `v18_usage_level` | 1.948 | -0.969 | 0.321 | 2.529 | 235 |
| `naive_prior_season_ppg` | 2.024 | -0.977 | 0.268 | 2.640 | 243 |
| `v1_baseline_weighted_ppg` | 2.025 | -1.115 | 0.275 | 2.612 | 235 |
| `position_mean_baseline` | 2.562 | -0.167 | 0.003 | 3.081 | 243 |

### K

| Model | MAE | Bias | R² | RMSE | N |
| --- | --- | --- | --- | --- | --- |
| `v7_regression_to_mean` | 1.913 | -1.097 | -0.078 | 2.638 | 115 |
| `v16_snap_trend_full` | 1.916 | -1.181 | -0.176 | 2.755 | 115 |
| `v21_tiered_regression` | 1.938 | -1.155 | -0.155 | 2.731 | 115 |
| `v12_no_qb_trajectory` | 1.945 | -1.269 | -0.187 | 2.768 | 115 |
| `v14_qb_starter` | 1.945 | -1.269 | -0.187 | 2.768 | 115 |
| `v17_rookie_growth` | 1.945 | -1.269 | -0.187 | 2.768 | 115 |
| `v19_usage_level_full` | 1.945 | -1.269 | -0.187 | 2.768 | 115 |
| `v4_availability_adjusted` | 1.954 | -1.119 | -0.119 | 2.688 | 115 |
| `v5_team_context` | 1.954 | -1.119 | -0.119 | 2.688 | 115 |
| `v6_usage_share` | 1.954 | -1.119 | -0.119 | 2.688 | 115 |
| `position_mean_baseline` | 1.955 | -1.026 | -0.187 | 2.769 | 115 |
| `v8_age_regression` | 2.013 | -1.307 | -0.293 | 2.889 | 115 |
| `v9_pos_specific` | 2.013 | -1.307 | -0.293 | 2.889 | 115 |
| `v10_stat_efficiency_v2` | 2.013 | -1.307 | -0.293 | 2.889 | 115 |
| `v11_team_context_v2` | 2.013 | -1.307 | -0.293 | 2.889 | 115 |
| `v13_qb_starter` | 2.013 | -1.307 | -0.293 | 2.889 | 115 |
| `v15_snap_trend` | 2.020 | -1.242 | -0.322 | 2.921 | 115 |
| `v1_baseline_weighted_ppg` | 2.047 | -1.234 | -0.304 | 2.902 | 115 |
| `v2_age_adjusted` | 2.051 | -1.330 | -0.333 | 2.933 | 115 |
| `v3_stat_weighted` | 2.051 | -1.330 | -0.333 | 2.933 | 115 |
| `v18_usage_level` | 2.051 | -1.330 | -0.333 | 2.933 | 115 |
| `naive_prior_season_ppg` | 2.153 | -1.148 | -0.359 | 2.962 | 115 |
