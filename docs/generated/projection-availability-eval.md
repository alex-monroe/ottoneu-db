# Projection Availability-Inclusive Evaluation (GH #574)

_Generated: 2026-06-10 08:23_

Standard backtests score only players with ≥4 games, hiding injured/benched/bust seasons. This evaluation keeps everyone with ≥1 game (non-rookie) and scores each PPG projection against two targets: **Rate** = actual PPG, and **Avail** = availability-inclusive production per scheduled game (`ppg × min(games,17) / 17`, missed games = 0). The gap **avail-MAE − rate-MAE** is the *availability error budget* — error from playing-time loss that no current rate feature addresses. Default models are parameter-free (additive + external), whose stored projections are leakage-free; learned models (if included) use in-sample projections (see #571). Seasons: 2022,2023,2024,2025. See [docs/exec-plans/projection-methodology-audit.md](../exec-plans/projection-methodology-audit.md) (Finding 3).

## Rate vs availability decomposition (combined ALL)

| Model | N | Mean games | Rate MAE | Avail MAE | Availability budget | Avail bias |
| --- | --- | --- | --- | --- | --- | --- |
| `external_fantasypros_v1` | 703 | 13.1 | 2.598 | 2.489 | -0.109 | -0.455 |
| `v7_regression_to_mean` | 1069 | 12.6 | 2.652 | 3.096 | +0.444 | -1.530 |
| `v4_availability_adjusted` | 1069 | 12.6 | 2.673 | 3.106 | +0.434 | -1.527 |
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
| `v13_qb_starter` | 1069 | 12.6 | 2.577 | 3.268 | +0.691 | -1.842 |
| `v11_team_context_v2` | 1069 | 12.6 | 2.585 | 3.270 | +0.685 | -1.869 |
| `v3_stat_weighted` | 1069 | 12.6 | 2.614 | 3.334 | +0.720 | -1.996 |
| `v2_age_adjusted` | 1069 | 12.6 | 2.617 | 3.343 | +0.726 | -2.010 |
| `v15_snap_trend` | 1069 | 12.6 | 2.649 | 3.375 | +0.725 | -2.044 |
| `v18_usage_level` | 1069 | 12.6 | 2.658 | 3.414 | +0.756 | -2.157 |
| `v1_baseline_weighted_ppg` | 1069 | 12.6 | 2.693 | 3.510 | +0.817 | -2.242 |

## Availability-inclusive metrics by position

### ALL

| Model | MAE | Bias | R² | RMSE | N |
| --- | --- | --- | --- | --- | --- |
| `external_fantasypros_v1` | 2.489 | -0.455 | 0.582 | 3.539 | 703 |
| `v7_regression_to_mean` | 3.096 | -1.530 | 0.304 | 4.234 | 1069 |
| `v4_availability_adjusted` | 3.106 | -1.527 | 0.274 | 4.323 | 1069 |
| `v5_team_context` | 3.117 | -1.550 | 0.267 | 4.344 | 1069 |
| `v21_tiered_regression` | 3.120 | -1.536 | 0.260 | 4.363 | 1069 |
| `v6_usage_share` | 3.179 | -1.697 | 0.243 | 4.417 | 1069 |
| `v14_qb_starter` | 3.188 | -1.747 | 0.263 | 4.355 | 1069 |
| `v16_snap_trend_full` | 3.216 | -1.781 | 0.247 | 4.404 | 1069 |
| `v19_usage_level_full` | 3.247 | -1.894 | 0.244 | 4.412 | 1069 |
| `v12_no_qb_trajectory` | 3.252 | -1.815 | 0.222 | 4.475 | 1069 |
| `v17_rookie_growth` | 3.252 | -1.817 | 0.250 | 4.392 | 1069 |
| `v10_stat_efficiency_v2` | 3.257 | -1.835 | 0.207 | 4.518 | 1069 |
| `v8_age_regression` | 3.265 | -1.843 | 0.204 | 4.527 | 1069 |
| `v9_pos_specific` | 3.265 | -1.843 | 0.204 | 4.527 | 1069 |
| `v13_qb_starter` | 3.268 | -1.842 | 0.202 | 4.531 | 1069 |
| `v11_team_context_v2` | 3.270 | -1.869 | 0.200 | 4.540 | 1069 |
| `v3_stat_weighted` | 3.334 | -1.996 | 0.155 | 4.665 | 1069 |
| `v2_age_adjusted` | 3.343 | -2.010 | 0.149 | 4.681 | 1069 |
| `v15_snap_trend` | 3.375 | -2.044 | 0.129 | 4.735 | 1069 |
| `v18_usage_level` | 3.414 | -2.157 | 0.120 | 4.759 | 1069 |
| `v1_baseline_weighted_ppg` | 3.510 | -2.242 | 0.073 | 4.885 | 1069 |

### QB

| Model | MAE | Bias | R² | RMSE | N |
| --- | --- | --- | --- | --- | --- |
| `external_fantasypros_v1` | 3.299 | -0.964 | 0.566 | 4.768 | 174 |
| `v4_availability_adjusted` | 5.054 | -3.282 | 0.132 | 6.563 | 211 |
| `v7_regression_to_mean` | 5.078 | -3.265 | 0.167 | 6.429 | 211 |
| `v5_team_context` | 5.115 | -3.330 | 0.119 | 6.613 | 211 |
| `v6_usage_share` | 5.115 | -3.330 | 0.119 | 6.613 | 211 |
| `v21_tiered_regression` | 5.411 | -3.736 | 0.057 | 6.842 | 211 |
| `v14_qb_starter` | 5.707 | -4.258 | 0.024 | 6.958 | 211 |
| `v17_rookie_growth` | 5.707 | -4.258 | 0.024 | 6.958 | 211 |
| `v19_usage_level_full` | 5.707 | -4.258 | 0.024 | 6.958 | 211 |
| `v16_snap_trend_full` | 5.787 | -4.329 | -0.002 | 7.052 | 211 |
| `v12_no_qb_trajectory` | 6.031 | -4.602 | -0.084 | 7.335 | 211 |
| `v3_stat_weighted` | 6.047 | -4.759 | -0.153 | 7.566 | 211 |
| `v10_stat_efficiency_v2` | 6.047 | -4.704 | -0.119 | 7.453 | 211 |
| `v8_age_regression` | 6.058 | -4.727 | -0.124 | 7.471 | 211 |
| `v9_pos_specific` | 6.058 | -4.727 | -0.124 | 7.471 | 211 |
| `v11_team_context_v2` | 6.064 | -4.779 | -0.129 | 7.488 | 211 |
| `v2_age_adjusted` | 6.069 | -4.791 | -0.164 | 7.602 | 211 |
| `v18_usage_level` | 6.069 | -4.791 | -0.164 | 7.602 | 211 |
| `v13_qb_starter` | 6.074 | -4.721 | -0.128 | 7.484 | 211 |
| `v15_snap_trend` | 6.162 | -4.862 | -0.195 | 7.703 | 211 |
| `v1_baseline_weighted_ppg` | 6.355 | -5.165 | -0.251 | 7.882 | 211 |

### RB

| Model | MAE | Bias | R² | RMSE | N |
| --- | --- | --- | --- | --- | --- |
| `external_fantasypros_v1` | 2.825 | -0.112 | 0.474 | 3.765 | 153 |
| `v10_stat_efficiency_v2` | 3.378 | -1.221 | 0.305 | 4.295 | 217 |
| `v11_team_context_v2` | 3.394 | -1.272 | 0.298 | 4.320 | 217 |
| `v21_tiered_regression` | 3.399 | -1.033 | 0.265 | 4.417 | 217 |
| `v8_age_regression` | 3.404 | -1.230 | 0.300 | 4.313 | 217 |
| `v9_pos_specific` | 3.404 | -1.230 | 0.300 | 4.313 | 217 |
| `v12_no_qb_trajectory` | 3.404 | -1.230 | 0.300 | 4.313 | 217 |
| `v13_qb_starter` | 3.404 | -1.230 | 0.300 | 4.313 | 217 |
| `v14_qb_starter` | 3.404 | -1.230 | 0.300 | 4.313 | 217 |
| `v5_team_context` | 3.451 | -1.148 | 0.237 | 4.459 | 217 |
| `v7_regression_to_mean` | 3.458 | -1.138 | 0.266 | 4.387 | 217 |
| `v16_snap_trend_full` | 3.461 | -1.305 | 0.278 | 4.382 | 217 |
| `v4_availability_adjusted` | 3.481 | -1.127 | 0.237 | 4.458 | 217 |
| `v19_usage_level_full` | 3.529 | -1.500 | 0.259 | 4.433 | 217 |
| `v3_stat_weighted` | 3.530 | -1.485 | 0.228 | 4.508 | 217 |
| `v17_rookie_growth` | 3.540 | -1.385 | 0.266 | 4.437 | 217 |
| `v2_age_adjusted` | 3.541 | -1.510 | 0.224 | 4.522 | 217 |
| `v6_usage_share` | 3.548 | -1.417 | 0.190 | 4.588 | 217 |
| `v15_snap_trend` | 3.585 | -1.584 | 0.197 | 4.602 | 217 |
| `v1_baseline_weighted_ppg` | 3.667 | -1.810 | 0.148 | 4.766 | 217 |
| `v18_usage_level` | 3.671 | -1.779 | 0.164 | 4.689 | 217 |

### WR

| Model | MAE | Bias | R² | RMSE | N |
| --- | --- | --- | --- | --- | --- |
| `external_fantasypros_v1` | 2.434 | -0.695 | 0.384 | 3.175 | 196 |
| `v21_tiered_regression` | 2.784 | -1.279 | 0.190 | 3.763 | 291 |
| `v8_age_regression` | 2.815 | -1.296 | 0.235 | 3.656 | 291 |
| `v9_pos_specific` | 2.815 | -1.296 | 0.235 | 3.656 | 291 |
| `v12_no_qb_trajectory` | 2.815 | -1.296 | 0.235 | 3.656 | 291 |
| `v13_qb_starter` | 2.815 | -1.296 | 0.235 | 3.656 | 291 |
| `v14_qb_starter` | 2.815 | -1.296 | 0.235 | 3.656 | 291 |
| `v11_team_context_v2` | 2.815 | -1.313 | 0.230 | 3.672 | 291 |
| `v10_stat_efficiency_v2` | 2.818 | -1.293 | 0.234 | 3.658 | 291 |
| `v16_snap_trend_full` | 2.827 | -1.345 | 0.222 | 3.686 | 291 |
| `v7_regression_to_mean` | 2.876 | -1.427 | 0.183 | 3.777 | 291 |
| `v4_availability_adjusted` | 2.881 | -1.422 | 0.140 | 3.878 | 291 |
| `v5_team_context` | 2.889 | -1.445 | 0.132 | 3.898 | 291 |
| `v19_usage_level_full` | 2.894 | -1.548 | 0.187 | 3.767 | 291 |
| `v3_stat_weighted` | 2.903 | -1.556 | 0.136 | 3.887 | 291 |
| `v17_rookie_growth` | 2.906 | -1.396 | 0.221 | 3.686 | 291 |
| `v2_age_adjusted` | 2.908 | -1.564 | 0.134 | 3.892 | 291 |
| `v15_snap_trend` | 2.934 | -1.612 | 0.118 | 3.926 | 291 |
| `v6_usage_share` | 2.998 | -1.696 | 0.066 | 4.040 | 291 |
| `v18_usage_level` | 3.019 | -1.816 | 0.064 | 4.043 | 291 |
| `v1_baseline_weighted_ppg` | 3.106 | -1.754 | 0.040 | 4.101 | 291 |

### TE

| Model | MAE | Bias | R² | RMSE | N |
| --- | --- | --- | --- | --- | --- |
| `external_fantasypros_v1` | 1.482 | +0.007 | 0.568 | 1.978 | 180 |
| `v10_stat_efficiency_v2` | 1.794 | -0.756 | 0.398 | 2.298 | 235 |
| `v16_snap_trend_full` | 1.799 | -0.767 | 0.397 | 2.300 | 235 |
| `v8_age_regression` | 1.799 | -0.760 | 0.395 | 2.304 | 235 |
| `v9_pos_specific` | 1.799 | -0.760 | 0.395 | 2.304 | 235 |
| `v12_no_qb_trajectory` | 1.799 | -0.760 | 0.395 | 2.304 | 235 |
| `v13_qb_starter` | 1.799 | -0.760 | 0.395 | 2.304 | 235 |
| `v14_qb_starter` | 1.799 | -0.760 | 0.395 | 2.304 | 235 |
| `v21_tiered_regression` | 1.799 | -0.532 | 0.388 | 2.318 | 235 |
| `v11_team_context_v2` | 1.824 | -0.770 | 0.386 | 2.322 | 235 |
| `v7_regression_to_mean` | 1.833 | -0.673 | 0.364 | 2.363 | 235 |
| `v19_usage_level_full` | 1.851 | -0.870 | 0.358 | 2.372 | 235 |
| `v17_rookie_growth` | 1.852 | -0.815 | 0.373 | 2.348 | 235 |
| `v4_availability_adjusted` | 1.853 | -0.648 | 0.335 | 2.416 | 235 |
| `v5_team_context` | 1.864 | -0.663 | 0.331 | 2.425 | 235 |
| `v3_stat_weighted` | 1.879 | -0.857 | 0.324 | 2.435 | 235 |
| `v2_age_adjusted` | 1.884 | -0.859 | 0.325 | 2.434 | 235 |
| `v15_snap_trend` | 1.887 | -0.866 | 0.327 | 2.430 | 235 |
| `v6_usage_share` | 1.923 | -0.773 | 0.280 | 2.514 | 235 |
| `v18_usage_level` | 1.948 | -0.969 | 0.271 | 2.529 | 235 |
| `v1_baseline_weighted_ppg` | 2.025 | -1.115 | 0.222 | 2.612 | 235 |

### K

| Model | MAE | Bias | R² | RMSE | N |
| --- | --- | --- | --- | --- | --- |
| `v7_regression_to_mean` | 1.912 | -1.097 | -0.067 | 2.638 | 115 |
| `v16_snap_trend_full` | 1.916 | -1.181 | -0.176 | 2.755 | 115 |
| `v21_tiered_regression` | 1.938 | -1.154 | -0.165 | 2.731 | 115 |
| `v12_no_qb_trajectory` | 1.945 | -1.269 | -0.192 | 2.768 | 115 |
| `v14_qb_starter` | 1.945 | -1.269 | -0.192 | 2.768 | 115 |
| `v17_rookie_growth` | 1.945 | -1.269 | -0.192 | 2.768 | 115 |
| `v19_usage_level_full` | 1.945 | -1.269 | -0.192 | 2.768 | 115 |
| `v4_availability_adjusted` | 1.954 | -1.119 | -0.109 | 2.688 | 115 |
| `v5_team_context` | 1.954 | -1.119 | -0.109 | 2.688 | 115 |
| `v6_usage_share` | 1.954 | -1.119 | -0.109 | 2.688 | 115 |
| `v8_age_regression` | 2.013 | -1.307 | -0.282 | 2.889 | 115 |
| `v9_pos_specific` | 2.013 | -1.307 | -0.282 | 2.889 | 115 |
| `v10_stat_efficiency_v2` | 2.013 | -1.307 | -0.282 | 2.889 | 115 |
| `v11_team_context_v2` | 2.013 | -1.307 | -0.282 | 2.889 | 115 |
| `v13_qb_starter` | 2.013 | -1.307 | -0.282 | 2.889 | 115 |
| `v15_snap_trend` | 2.020 | -1.242 | -0.304 | 2.921 | 115 |
| `v1_baseline_weighted_ppg` | 2.047 | -1.234 | -0.290 | 2.902 | 115 |
| `v2_age_adjusted` | 2.051 | -1.330 | -0.320 | 2.933 | 115 |
| `v3_stat_weighted` | 2.051 | -1.330 | -0.320 | 2.933 | 115 |
| `v18_usage_level` | 2.051 | -1.330 | -0.320 | 2.933 | 115 |
