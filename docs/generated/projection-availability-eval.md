# Projection Availability-Inclusive Evaluation (GH #574)

_Generated: 2026-06-10 14:19_

Standard backtests score only players with ≥4 games, hiding injured/benched/bust seasons. This evaluation keeps everyone with ≥1 game (non-rookie) and scores each PPG projection against two targets: **Rate** = actual PPG, and **Avail** = availability-inclusive production per scheduled game (`ppg × min(games,17) / 17`, missed games = 0). The gap **avail-MAE − rate-MAE** is the *availability error budget* — error from playing-time loss that no current rate feature addresses. Default models are parameter-free (additive + external), whose stored projections are leakage-free; learned models (if included) use in-sample projections (see #571). Seasons: 2022,2023,2024,2025. See [docs/exec-plans/projection-methodology-audit.md](../exec-plans/projection-methodology-audit.md) (Finding 3).

## Rate vs availability decomposition (combined ALL)

_**Avail MAE** is pooled over players; **Bal Avail MAE** is the position-balanced availability MAE (unweighted mean of per-position avail MAE over QB/RB/WR/TE; K excluded), which removes the drifting position mix of the qualifier pool (GH #577)._

| Model | N | Mean games | Rate MAE | Avail MAE | Bal Avail MAE | Availability budget | Avail bias |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `external_fantasypros_v1` | 761 | 12.7 | 2.513 | 2.389 | 2.412 | -0.124 | -0.461 |
| `v4_availability_adjusted` | 1731 | 11.1 | 2.369 | 2.758 | 3.002 | +0.389 | -1.623 |
| `v5_team_context` | 1731 | 11.1 | 2.393 | 2.783 | 3.031 | +0.389 | -1.644 |
| `v7_regression_to_mean` | 1731 | 11.1 | 2.385 | 2.791 | 3.036 | +0.406 | -1.630 |
| `v6_usage_share` | 1731 | 11.1 | 2.416 | 2.829 | 3.073 | +0.413 | -1.746 |
| `v21_tiered_regression` | 1731 | 11.1 | 2.445 | 2.917 | 3.196 | +0.473 | -1.809 |
| `v14_qb_starter` | 1731 | 11.1 | 2.398 | 2.986 | 3.291 | +0.589 | -1.946 |
| `v16_snap_trend_full` | 1731 | 11.1 | 2.404 | 3.004 | 3.318 | +0.600 | -1.968 |
| `v17_rookie_growth` | 1731 | 11.1 | 2.421 | 3.022 | 3.325 | +0.601 | -1.994 |
| `v19_usage_level_full` | 1731 | 11.1 | 2.407 | 3.035 | 3.337 | +0.628 | -2.053 |
| `v12_no_qb_trajectory` | 1731 | 11.1 | 2.415 | 3.039 | 3.383 | +0.624 | -2.001 |
| `v10_stat_efficiency_v2` | 1731 | 11.1 | 2.419 | 3.041 | 3.380 | +0.621 | -2.010 |
| `v8_age_regression` | 1731 | 11.1 | 2.421 | 3.047 | 3.389 | +0.625 | -2.019 |
| `v9_pos_specific` | 1731 | 11.1 | 2.421 | 3.047 | 3.389 | +0.625 | -2.019 |
| `v13_qb_starter` | 1731 | 11.1 | 2.421 | 3.049 | 3.392 | +0.627 | -2.017 |
| `v11_team_context_v2` | 1731 | 11.1 | 2.439 | 3.057 | 3.400 | +0.618 | -2.031 |
| `v3_stat_weighted` | 1731 | 11.1 | 2.440 | 3.083 | 3.423 | +0.642 | -2.136 |
| `v2_age_adjusted` | 1731 | 11.1 | 2.441 | 3.085 | 3.426 | +0.644 | -2.141 |
| `v15_snap_trend` | 1731 | 11.1 | 2.460 | 3.107 | 3.457 | +0.646 | -2.163 |
| `naive_prior_season_ppg` | 1972 | 10.8 | 2.594 | 3.116 | 3.451 | +0.522 | -2.050 |
| `v18_usage_level` | 1731 | 11.1 | 2.478 | 3.145 | 3.481 | +0.666 | -2.248 |
| `v1_baseline_weighted_ppg` | 1731 | 11.1 | 2.487 | 3.188 | 3.551 | +0.701 | -2.284 |
| `position_mean_baseline` | 1972 | 10.8 | 3.816 | 4.102 | 4.571 | +0.286 | -1.423 |

## Availability-inclusive metrics by position

### ALL

| Model | MAE | Bias | R² | RMSE | N |
| --- | --- | --- | --- | --- | --- |
| `external_fantasypros_v1` | 2.389 | -0.461 | 0.622 | 3.441 | 761 |
| `v4_availability_adjusted` | 2.758 | -1.623 | 0.383 | 3.889 | 1731 |
| `v5_team_context` | 2.783 | -1.644 | 0.373 | 3.919 | 1731 |
| `v7_regression_to_mean` | 2.791 | -1.630 | 0.407 | 3.813 | 1731 |
| `v6_usage_share` | 2.829 | -1.746 | 0.353 | 3.981 | 1731 |
| `v21_tiered_regression` | 2.917 | -1.809 | 0.310 | 4.110 | 1731 |
| `v14_qb_starter` | 2.986 | -1.946 | 0.344 | 4.011 | 1731 |
| `v16_snap_trend_full` | 3.004 | -1.968 | 0.332 | 4.045 | 1731 |
| `v17_rookie_growth` | 3.022 | -1.994 | 0.337 | 4.031 | 1731 |
| `v19_usage_level_full` | 3.035 | -2.053 | 0.325 | 4.068 | 1731 |
| `v12_no_qb_trajectory` | 3.039 | -2.001 | 0.309 | 4.113 | 1731 |
| `v10_stat_efficiency_v2` | 3.041 | -2.010 | 0.301 | 4.138 | 1731 |
| `v8_age_regression` | 3.047 | -2.019 | 0.298 | 4.148 | 1731 |
| `v9_pos_specific` | 3.047 | -2.019 | 0.298 | 4.148 | 1731 |
| `v13_qb_starter` | 3.049 | -2.017 | 0.297 | 4.149 | 1731 |
| `v11_team_context_v2` | 3.057 | -2.031 | 0.293 | 4.163 | 1731 |
| `v3_stat_weighted` | 3.083 | -2.136 | 0.247 | 4.296 | 1731 |
| `v2_age_adjusted` | 3.085 | -2.141 | 0.245 | 4.302 | 1731 |
| `v15_snap_trend` | 3.107 | -2.163 | 0.231 | 4.342 | 1731 |
| `naive_prior_season_ppg` | 3.116 | -2.050 | 0.151 | 4.447 | 1972 |
| `v18_usage_level` | 3.145 | -2.248 | 0.218 | 4.377 | 1731 |
| `v1_baseline_weighted_ppg` | 3.188 | -2.284 | 0.196 | 4.440 | 1731 |
| `position_mean_baseline` | 4.102 | -1.423 | -0.078 | 5.011 | 1972 |

### QB

| Model | MAE | Bias | R² | RMSE | N |
| --- | --- | --- | --- | --- | --- |
| `external_fantasypros_v1` | 3.195 | -0.928 | 0.595 | 4.677 | 181 |
| `v4_availability_adjusted` | 4.919 | -3.367 | 0.166 | 6.440 | 249 |
| `v7_regression_to_mean` | 4.941 | -3.286 | 0.214 | 6.251 | 249 |
| `v6_usage_share` | 4.971 | -3.403 | 0.157 | 6.472 | 249 |
| `v5_team_context` | 4.987 | -3.403 | 0.157 | 6.473 | 249 |
| `v21_tiered_regression` | 5.339 | -3.868 | 0.063 | 6.824 | 249 |
| `v14_qb_starter` | 5.579 | -4.272 | 0.065 | 6.819 | 249 |
| `v17_rookie_growth` | 5.579 | -4.272 | 0.065 | 6.819 | 249 |
| `v19_usage_level_full` | 5.579 | -4.272 | 0.065 | 6.819 | 249 |
| `v16_snap_trend_full` | 5.640 | -4.324 | 0.043 | 6.897 | 249 |
| `v12_no_qb_trajectory` | 5.947 | -4.657 | -0.052 | 7.231 | 249 |
| `v10_stat_efficiency_v2` | 5.947 | -4.739 | -0.077 | 7.317 | 249 |
| `v8_age_regression` | 5.968 | -4.763 | -0.085 | 7.346 | 249 |
| `v9_pos_specific` | 5.968 | -4.763 | -0.085 | 7.346 | 249 |
| `v11_team_context_v2` | 5.980 | -4.796 | -0.086 | 7.348 | 249 |
| `v13_qb_starter` | 5.981 | -4.753 | -0.087 | 7.352 | 249 |
| `naive_prior_season_ppg` | 5.983 | -4.529 | -0.201 | 7.660 | 272 |
| `v3_stat_weighted` | 5.996 | -4.859 | -0.136 | 7.516 | 249 |
| `v2_age_adjusted` | 5.998 | -4.880 | -0.141 | 7.530 | 249 |
| `v18_usage_level` | 5.998 | -4.880 | -0.141 | 7.530 | 249 |
| `v15_snap_trend` | 6.069 | -4.931 | -0.167 | 7.617 | 249 |
| `v1_baseline_weighted_ppg` | 6.240 | -5.196 | -0.214 | 7.770 | 249 |
| `position_mean_baseline` | 7.466 | -4.450 | -0.408 | 8.294 | 272 |

### RB

| Model | MAE | Bias | R² | RMSE | N |
| --- | --- | --- | --- | --- | --- |
| `external_fantasypros_v1` | 2.703 | -0.140 | 0.570 | 3.663 | 166 |
| `v4_availability_adjusted` | 2.865 | -1.446 | 0.443 | 3.919 | 413 |
| `v5_team_context` | 2.870 | -1.458 | 0.433 | 3.954 | 413 |
| `v7_regression_to_mean` | 2.928 | -1.464 | 0.451 | 3.890 | 413 |
| `v6_usage_share` | 2.945 | -1.630 | 0.403 | 4.056 | 413 |
| `v21_tiered_regression` | 2.999 | -1.602 | 0.373 | 4.155 | 413 |
| `v10_stat_efficiency_v2` | 3.061 | -1.737 | 0.430 | 3.961 | 413 |
| `v8_age_regression` | 3.071 | -1.751 | 0.428 | 3.971 | 413 |
| `v9_pos_specific` | 3.071 | -1.751 | 0.428 | 3.971 | 413 |
| `v12_no_qb_trajectory` | 3.071 | -1.751 | 0.428 | 3.971 | 413 |
| `v13_qb_starter` | 3.071 | -1.751 | 0.428 | 3.971 | 413 |
| `v14_qb_starter` | 3.071 | -1.751 | 0.428 | 3.971 | 413 |
| `v11_team_context_v2` | 3.071 | -1.756 | 0.420 | 3.996 | 413 |
| `v3_stat_weighted` | 3.101 | -1.903 | 0.376 | 4.148 | 413 |
| `v2_age_adjusted` | 3.107 | -1.909 | 0.373 | 4.155 | 413 |
| `v16_snap_trend_full` | 3.114 | -1.799 | 0.411 | 4.028 | 413 |
| `v17_rookie_growth` | 3.134 | -1.842 | 0.408 | 4.038 | 413 |
| `v15_snap_trend` | 3.147 | -1.957 | 0.354 | 4.220 | 413 |
| `v19_usage_level_full` | 3.159 | -1.925 | 0.396 | 4.081 | 413 |
| `naive_prior_season_ppg` | 3.165 | -1.907 | 0.239 | 4.427 | 481 |
| `v1_baseline_weighted_ppg` | 3.173 | -2.067 | 0.330 | 4.296 | 413 |
| `v18_usage_level` | 3.204 | -2.083 | 0.329 | 4.300 | 413 |
| `position_mean_baseline` | 4.481 | -0.973 | -0.040 | 5.177 | 481 |

### WR

| Model | MAE | Bias | R² | RMSE | N |
| --- | --- | --- | --- | --- | --- |
| `external_fantasypros_v1` | 2.329 | -0.717 | 0.549 | 3.078 | 223 |
| `v4_availability_adjusted` | 2.518 | -1.528 | 0.413 | 3.346 | 591 |
| `v5_team_context` | 2.556 | -1.561 | 0.397 | 3.394 | 591 |
| `v7_regression_to_mean` | 2.572 | -1.561 | 0.431 | 3.295 | 591 |
| `v6_usage_share` | 2.619 | -1.694 | 0.362 | 3.491 | 591 |
| `v21_tiered_regression` | 2.678 | -1.703 | 0.335 | 3.564 | 591 |
| `v10_stat_efficiency_v2` | 2.688 | -1.696 | 0.408 | 3.363 | 591 |
| `v8_age_regression` | 2.690 | -1.702 | 0.407 | 3.365 | 591 |
| `v9_pos_specific` | 2.690 | -1.702 | 0.407 | 3.365 | 591 |
| `v12_no_qb_trajectory` | 2.690 | -1.702 | 0.407 | 3.365 | 591 |
| `v13_qb_starter` | 2.690 | -1.702 | 0.407 | 3.365 | 591 |
| `v14_qb_starter` | 2.690 | -1.702 | 0.407 | 3.365 | 591 |
| `v16_snap_trend_full` | 2.695 | -1.730 | 0.402 | 3.379 | 591 |
| `v11_team_context_v2` | 2.704 | -1.715 | 0.398 | 3.390 | 591 |
| `v17_rookie_growth` | 2.733 | -1.761 | 0.404 | 3.373 | 591 |
| `v2_age_adjusted` | 2.733 | -1.850 | 0.339 | 3.552 | 591 |
| `v3_stat_weighted` | 2.734 | -1.850 | 0.340 | 3.551 | 591 |
| `v15_snap_trend` | 2.746 | -1.879 | 0.333 | 3.568 | 591 |
| `v19_usage_level_full` | 2.750 | -1.849 | 0.375 | 3.455 | 591 |
| `naive_prior_season_ppg` | 2.804 | -1.795 | 0.208 | 3.756 | 698 |
| `v18_usage_level` | 2.814 | -1.998 | 0.294 | 3.672 | 591 |
| `v1_baseline_weighted_ppg` | 2.831 | -1.944 | 0.296 | 3.666 | 591 |
| `position_mean_baseline` | 3.698 | -0.901 | -0.048 | 4.319 | 698 |

### TE

| Model | MAE | Bias | R² | RMSE | N |
| --- | --- | --- | --- | --- | --- |
| `external_fantasypros_v1` | 1.422 | +0.001 | 0.612 | 1.926 | 191 |
| `v7_regression_to_mean` | 1.700 | -0.842 | 0.467 | 2.184 | 348 |
| `v4_availability_adjusted` | 1.706 | -0.818 | 0.441 | 2.237 | 348 |
| `v5_team_context` | 1.710 | -0.826 | 0.441 | 2.237 | 348 |
| `v6_usage_share` | 1.756 | -0.901 | 0.403 | 2.311 | 348 |
| `v21_tiered_regression` | 1.770 | -0.881 | 0.413 | 2.292 | 348 |
| `v16_snap_trend_full` | 1.823 | -1.059 | 0.413 | 2.291 | 348 |
| `v10_stat_efficiency_v2` | 1.825 | -1.055 | 0.413 | 2.292 | 348 |
| `v8_age_regression` | 1.827 | -1.057 | 0.413 | 2.292 | 348 |
| `v9_pos_specific` | 1.827 | -1.057 | 0.413 | 2.292 | 348 |
| `v12_no_qb_trajectory` | 1.827 | -1.057 | 0.413 | 2.292 | 348 |
| `v13_qb_starter` | 1.827 | -1.057 | 0.413 | 2.292 | 348 |
| `v14_qb_starter` | 1.827 | -1.057 | 0.413 | 2.292 | 348 |
| `v11_team_context_v2` | 1.845 | -1.064 | 0.403 | 2.311 | 348 |
| `v17_rookie_growth` | 1.854 | -1.086 | 0.405 | 2.308 | 348 |
| `naive_prior_season_ppg` | 1.854 | -1.131 | 0.302 | 2.446 | 385 |
| `v19_usage_level_full` | 1.859 | -1.132 | 0.389 | 2.338 | 348 |
| `v3_stat_weighted` | 1.861 | -1.126 | 0.363 | 2.387 | 348 |
| `v15_snap_trend` | 1.865 | -1.129 | 0.362 | 2.389 | 348 |
| `v2_age_adjusted` | 1.866 | -1.128 | 0.362 | 2.390 | 348 |
| `v18_usage_level` | 1.909 | -1.203 | 0.325 | 2.458 | 348 |
| `v1_baseline_weighted_ppg` | 1.961 | -1.300 | 0.294 | 2.514 | 348 |
| `position_mean_baseline` | 2.640 | -0.832 | -0.082 | 3.047 | 385 |

### K

| Model | MAE | Bias | R² | RMSE | N |
| --- | --- | --- | --- | --- | --- |
| `v7_regression_to_mean` | 2.150 | -1.401 | -0.078 | 2.925 | 130 |
| `v16_snap_trend_full` | 2.177 | -1.502 | -0.171 | 3.048 | 130 |
| `v21_tiered_regression` | 2.178 | -1.485 | -0.152 | 3.023 | 130 |
| `v4_availability_adjusted` | 2.186 | -1.433 | -0.111 | 2.968 | 130 |
| `v5_team_context` | 2.186 | -1.433 | -0.111 | 2.968 | 130 |
| `v6_usage_share` | 2.186 | -1.433 | -0.111 | 2.968 | 130 |
| `v12_no_qb_trajectory` | 2.207 | -1.595 | -0.196 | 3.080 | 130 |
| `v14_qb_starter` | 2.207 | -1.595 | -0.196 | 3.080 | 130 |
| `v17_rookie_growth` | 2.207 | -1.595 | -0.196 | 3.080 | 130 |
| `v19_usage_level_full` | 2.207 | -1.595 | -0.196 | 3.080 | 130 |
| `position_mean_baseline` | 2.244 | -1.319 | -0.224 | 3.118 | 136 |
| `v8_age_regression` | 2.267 | -1.629 | -0.273 | 3.178 | 130 |
| `v9_pos_specific` | 2.267 | -1.629 | -0.273 | 3.178 | 130 |
| `v10_stat_efficiency_v2` | 2.267 | -1.629 | -0.273 | 3.178 | 130 |
| `v11_team_context_v2` | 2.267 | -1.629 | -0.273 | 3.178 | 130 |
| `v13_qb_starter` | 2.267 | -1.629 | -0.273 | 3.178 | 130 |
| `v15_snap_trend` | 2.268 | -1.568 | -0.277 | 3.183 | 130 |
| `v1_baseline_weighted_ppg` | 2.298 | -1.577 | -0.283 | 3.190 | 130 |
| `v2_age_adjusted` | 2.301 | -1.661 | -0.303 | 3.215 | 130 |
| `v3_stat_weighted` | 2.301 | -1.661 | -0.303 | 3.215 | 130 |
| `v18_usage_level` | 2.301 | -1.661 | -0.303 | 3.215 | 130 |
| `naive_prior_season_ppg` | 2.381 | -1.506 | -0.355 | 3.281 | 136 |

## Ranking quality — per-position ordering (GH #598)

_Spearman ρ and top-N hit rate against the **availability-inclusive** actuals (total fantasy production per player-season, injuries included) — the ordering that VORP/auction decisions actually consume. **Top-N**: 12 for QB/TE, 24 for RB/WR (≈ the starter pool)._

### QB (top-12)

| Model | Spearman ρ | Top-N hit | N |
| --- | --- | --- | --- |
| `external_fantasypros_v1` | 0.796 | 0.500 | 181 |
| `v14_qb_starter` | 0.674 | 0.417 | 249 |
| `v17_rookie_growth` | 0.674 | 0.417 | 249 |
| `v19_usage_level_full` | 0.674 | 0.417 | 249 |
| `v4_availability_adjusted` | 0.668 | 0.333 | 249 |
| `v16_snap_trend_full` | 0.666 | 0.500 | 249 |
| `v6_usage_share` | 0.666 | 0.417 | 249 |
| `v5_team_context` | 0.666 | 0.417 | 249 |
| `v7_regression_to_mean` | 0.666 | 0.417 | 249 |
| `v21_tiered_regression` | 0.665 | 0.417 | 249 |
| `v10_stat_efficiency_v2` | 0.643 | 0.417 | 249 |
| `v12_no_qb_trajectory` | 0.642 | 0.417 | 249 |
| `v3_stat_weighted` | 0.641 | 0.333 | 249 |
| `v2_age_adjusted` | 0.638 | 0.417 | 249 |
| `v18_usage_level` | 0.638 | 0.417 | 249 |
| `v1_baseline_weighted_ppg` | 0.637 | 0.417 | 249 |
| `v8_age_regression` | 0.637 | 0.417 | 249 |
| `v9_pos_specific` | 0.637 | 0.417 | 249 |
| `v11_team_context_v2` | 0.634 | 0.417 | 249 |
| `v13_qb_starter` | 0.633 | 0.417 | 249 |
| `v15_snap_trend` | 0.624 | 0.500 | 249 |
| `naive_prior_season_ppg` | 0.608 | 0.417 | 272 |
| `position_mean_baseline` | 0.001 | 0.000 | 272 |

### RB (top-24)

| Model | Spearman ρ | Top-N hit | N |
| --- | --- | --- | --- |
| `external_fantasypros_v1` | 0.765 | 0.500 | 166 |
| `v4_availability_adjusted` | 0.749 | 0.375 | 413 |
| `v5_team_context` | 0.742 | 0.375 | 413 |
| `v15_snap_trend` | 0.742 | 0.417 | 413 |
| `v6_usage_share` | 0.741 | 0.375 | 413 |
| `v16_snap_trend_full` | 0.741 | 0.417 | 413 |
| `v7_regression_to_mean` | 0.739 | 0.375 | 413 |
| `v3_stat_weighted` | 0.739 | 0.417 | 413 |
| `v2_age_adjusted` | 0.739 | 0.458 | 413 |
| `v18_usage_level` | 0.739 | 0.458 | 413 |
| `v19_usage_level_full` | 0.737 | 0.417 | 413 |
| `v1_baseline_weighted_ppg` | 0.737 | 0.500 | 413 |
| `v8_age_regression` | 0.737 | 0.458 | 413 |
| `v9_pos_specific` | 0.737 | 0.458 | 413 |
| `v12_no_qb_trajectory` | 0.737 | 0.458 | 413 |
| `v13_qb_starter` | 0.737 | 0.458 | 413 |
| `v14_qb_starter` | 0.737 | 0.458 | 413 |
| `v10_stat_efficiency_v2` | 0.737 | 0.458 | 413 |
| `v21_tiered_regression` | 0.733 | 0.458 | 413 |
| `v11_team_context_v2` | 0.729 | 0.458 | 413 |
| `v17_rookie_growth` | 0.728 | 0.458 | 413 |
| `naive_prior_season_ppg` | 0.702 | 0.375 | 481 |
| `position_mean_baseline` | -0.009 | 0.042 | 481 |

### WR (top-24)

| Model | Spearman ρ | Top-N hit | N |
| --- | --- | --- | --- |
| `v4_availability_adjusted` | 0.785 | 0.333 | 591 |
| `v7_regression_to_mean` | 0.782 | 0.292 | 591 |
| `v6_usage_share` | 0.782 | 0.333 | 591 |
| `v5_team_context` | 0.780 | 0.292 | 591 |
| `v15_snap_trend` | 0.776 | 0.292 | 591 |
| `v16_snap_trend_full` | 0.776 | 0.292 | 591 |
| `v19_usage_level_full` | 0.775 | 0.333 | 591 |
| `v18_usage_level` | 0.775 | 0.333 | 591 |
| `v3_stat_weighted` | 0.774 | 0.333 | 591 |
| `v2_age_adjusted` | 0.774 | 0.292 | 591 |
| `v10_stat_efficiency_v2` | 0.774 | 0.333 | 591 |
| `v8_age_regression` | 0.774 | 0.333 | 591 |
| `v9_pos_specific` | 0.774 | 0.333 | 591 |
| `v12_no_qb_trajectory` | 0.774 | 0.333 | 591 |
| `v13_qb_starter` | 0.774 | 0.333 | 591 |
| `v14_qb_starter` | 0.774 | 0.333 | 591 |
| `v1_baseline_weighted_ppg` | 0.769 | 0.292 | 591 |
| `v11_team_context_v2` | 0.769 | 0.333 | 591 |
| `v21_tiered_regression` | 0.769 | 0.333 | 591 |
| `v17_rookie_growth` | 0.768 | 0.333 | 591 |
| `external_fantasypros_v1` | 0.751 | 0.458 | 223 |
| `naive_prior_season_ppg` | 0.730 | 0.375 | 698 |
| `position_mean_baseline` | 0.008 | 0.042 | 698 |

### TE (top-12)

| Model | Spearman ρ | Top-N hit | N |
| --- | --- | --- | --- |
| `external_fantasypros_v1` | 0.805 | 0.500 | 191 |
| `v7_regression_to_mean` | 0.730 | 0.333 | 348 |
| `v5_team_context` | 0.725 | 0.250 | 348 |
| `naive_prior_season_ppg` | 0.725 | 0.417 | 385 |
| `v6_usage_share` | 0.724 | 0.333 | 348 |
| `v4_availability_adjusted` | 0.724 | 0.250 | 348 |
| `v1_baseline_weighted_ppg` | 0.715 | 0.333 | 348 |
| `v19_usage_level_full` | 0.706 | 0.333 | 348 |
| `v18_usage_level` | 0.706 | 0.333 | 348 |
| `v3_stat_weighted` | 0.705 | 0.333 | 348 |
| `v2_age_adjusted` | 0.705 | 0.333 | 348 |
| `v10_stat_efficiency_v2` | 0.705 | 0.333 | 348 |
| `v8_age_regression` | 0.704 | 0.333 | 348 |
| `v9_pos_specific` | 0.704 | 0.333 | 348 |
| `v12_no_qb_trajectory` | 0.704 | 0.333 | 348 |
| `v13_qb_starter` | 0.704 | 0.333 | 348 |
| `v14_qb_starter` | 0.704 | 0.333 | 348 |
| `v15_snap_trend` | 0.703 | 0.333 | 348 |
| `v21_tiered_regression` | 0.702 | 0.333 | 348 |
| `v11_team_context_v2` | 0.701 | 0.333 | 348 |
| `v16_snap_trend_full` | 0.701 | 0.333 | 348 |
| `v17_rookie_growth` | 0.700 | 0.333 | 348 |
| `position_mean_baseline` | 0.034 | 0.000 | 385 |
