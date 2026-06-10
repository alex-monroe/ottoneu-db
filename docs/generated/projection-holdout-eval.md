# Projection Held-Out Evaluation (GH #572)

_Generated: 2026-06-10 14:10_

**Every model is evaluated out-of-sample on a shared held-out window.** Learned/residual models were retrained on **2021,2022,2023** and never saw the eval seasons **2024,2025**; additive and external models are parameter-free w.r.t. training seasons, so their existing projections are already held-out. All models are scored through the identical `backtest_model` filter (target-season games ≥ 4, true rookies excluded). Unlike [projection-accuracy.md](projection-accuracy.md), **no model here is scored on data it trained on** — this is the honest ranking. See [docs/exec-plans/projection-methodology-audit.md](../exec-plans/projection-methodology-audit.md) (Finding 1b).

## Ranking — combined held-out ALL (lower MAE = better)

_**MAE** is the pooled-over-players ALL error. **Bal MAE** is the position-balanced MAE — the unweighted mean of the per-position MAEs over a fixed set (QB/RB/WR/TE; K excluded as essentially random and not projected by every model) — which neutralises the drifting position mix of the qualifier pool (GH #577). They can disagree: a model can win the pooled MAE while losing the balanced one if it's strong only where players are easy/plentiful._

| Rank | Model | MAE | Bal MAE | Bias | R² | RMSE | N |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | `v31_depth_chart` | **2.269** | **2.472** | -0.107 | 0.667 | 3.002 | 810 |
| 2 | `v26_vegas_residual` | 2.295 | 2.511 | -0.255 | 0.665 | 3.009 | 810 |
| 3 | `v14_qb_starter` | 2.297 | 2.515 | -0.278 | 0.661 | 3.065 | 842 |
| 4 | `v19_usage_level_full` | 2.300 | 2.518 | -0.383 | 0.661 | 3.067 | 842 |
| 5 | `v16_snap_trend_full` | 2.305 | 2.533 | -0.303 | 0.656 | 3.086 | 842 |
| 6 | `v25_draft_capital_residual` | 2.311 | 2.526 | -0.242 | 0.665 | 3.011 | 810 |
| 7 | `v12_no_qb_trajectory` | 2.314 | 2.549 | -0.324 | 0.645 | 3.136 | 842 |
| 8 | `v17_rookie_growth` | 2.320 | 2.537 | -0.315 | 0.659 | 3.075 | 842 |
| 9 | `v29_reliability_residual` | 2.324 | 2.532 | -0.234 | 0.658 | 3.043 | 810 |
| 10 | `v8_age_regression` | 2.325 | 2.559 | -0.345 | 0.640 | 3.159 | 842 |
| 11 | `v9_pos_specific` | 2.325 | 2.559 | -0.345 | 0.640 | 3.159 | 842 |
| 12 | `v20_learned_usage` | 2.325 | 2.525 | -0.032 | 0.653 | 3.066 | 810 |
| 13 | `v10_stat_efficiency_v2` | 2.326 | 2.563 | -0.336 | 0.640 | 3.157 | 842 |
| 14 | `v13_qb_starter` | 2.327 | 2.563 | -0.344 | 0.638 | 3.165 | 842 |
| 15 | `v23_draft_capital` | 2.328 | 2.546 | -0.154 | 0.652 | 3.070 | 810 |
| 16 | `v22_advanced_receiving` | 2.330 | 2.532 | -0.035 | 0.656 | 3.051 | 810 |
| 17 | `v30_reliability_full_refit` | 2.331 | 2.543 | -0.151 | 0.653 | 3.066 | 810 |
| 18 | `v7_regression_to_mean` | 2.332 | 2.571 | -0.044 | 0.639 | 3.161 | 842 |
| 19 | `v4_availability_adjusted` | 2.335 | 2.571 | -0.099 | 0.631 | 3.199 | 842 |
| 20 | `v28_reliability_weighting` | 2.337 | 2.536 | -0.047 | 0.649 | 3.081 | 810 |
| 21 | `v11_team_context_v2` | 2.338 | 2.572 | -0.360 | 0.637 | 3.173 | 842 |
| 22 | `v27_vegas_full_refit` | 2.345 | 2.563 | -0.154 | 0.650 | 3.075 | 810 |
| 23 | `v21_tiered_regression` | 2.346 | 2.571 | -0.245 | 0.635 | 3.180 | 842 |
| 24 | `v5_team_context` | 2.349 | 2.592 | -0.120 | 0.624 | 3.226 | 842 |
| 25 | `v3_stat_weighted` | 2.355 | 2.592 | -0.529 | 0.623 | 3.232 | 842 |
| 26 | `v2_age_adjusted` | 2.358 | 2.595 | -0.533 | 0.622 | 3.237 | 842 |
| 27 | `v6_usage_share` | 2.358 | 2.595 | -0.219 | 0.622 | 3.235 | 842 |
| 28 | `v15_snap_trend` | 2.378 | 2.627 | -0.558 | 0.615 | 3.265 | 842 |
| 29 | `v18_usage_level` | 2.387 | 2.621 | -0.638 | 0.614 | 3.271 | 842 |
| 30 | `external_fantasypros_v1` | 2.424 | 2.514 | +0.963 | 0.659 | 3.326 | 445 |
| 31 | `v1_baseline_weighted_ppg` | 2.436 | 2.681 | -0.735 | 0.596 | 3.347 | 842 |
| 32 | `naive_prior_season_ppg` | 2.523 | 2.829 | -0.439 | 0.539 | 3.580 | 855 |
| 33 | `position_mean_baseline` | 3.726 | 4.095 | +0.742 | 0.171 | 4.799 | 855 |

## Combined across eval seasons — by position

### ALL

| Model | MAE | Bias | R² | RMSE | N |
| --- | --- | --- | --- | --- | --- |
| `v31_depth_chart` | 2.269 | -0.107 | 0.667 | 3.002 | 810 |
| `v26_vegas_residual` | 2.295 | -0.255 | 0.665 | 3.009 | 810 |
| `v14_qb_starter` | 2.297 | -0.278 | 0.661 | 3.065 | 842 |
| `v19_usage_level_full` | 2.300 | -0.383 | 0.661 | 3.067 | 842 |
| `v16_snap_trend_full` | 2.305 | -0.303 | 0.656 | 3.086 | 842 |
| `v25_draft_capital_residual` | 2.311 | -0.242 | 0.665 | 3.011 | 810 |
| `v12_no_qb_trajectory` | 2.314 | -0.324 | 0.645 | 3.136 | 842 |
| `v17_rookie_growth` | 2.320 | -0.315 | 0.659 | 3.075 | 842 |
| `v29_reliability_residual` | 2.324 | -0.234 | 0.658 | 3.043 | 810 |
| `v8_age_regression` | 2.325 | -0.345 | 0.640 | 3.159 | 842 |
| `v9_pos_specific` | 2.325 | -0.345 | 0.640 | 3.159 | 842 |
| `v20_learned_usage` | 2.325 | -0.032 | 0.653 | 3.066 | 810 |
| `v10_stat_efficiency_v2` | 2.326 | -0.336 | 0.640 | 3.157 | 842 |
| `v13_qb_starter` | 2.327 | -0.344 | 0.638 | 3.165 | 842 |
| `v23_draft_capital` | 2.328 | -0.154 | 0.652 | 3.070 | 810 |
| `v22_advanced_receiving` | 2.330 | -0.035 | 0.656 | 3.051 | 810 |
| `v30_reliability_full_refit` | 2.331 | -0.151 | 0.653 | 3.066 | 810 |
| `v7_regression_to_mean` | 2.332 | -0.044 | 0.639 | 3.161 | 842 |
| `v4_availability_adjusted` | 2.335 | -0.099 | 0.631 | 3.199 | 842 |
| `v28_reliability_weighting` | 2.337 | -0.047 | 0.649 | 3.081 | 810 |
| `v11_team_context_v2` | 2.338 | -0.360 | 0.637 | 3.173 | 842 |
| `v27_vegas_full_refit` | 2.345 | -0.154 | 0.650 | 3.075 | 810 |
| `v21_tiered_regression` | 2.346 | -0.245 | 0.635 | 3.180 | 842 |
| `v5_team_context` | 2.349 | -0.120 | 0.624 | 3.226 | 842 |
| `v3_stat_weighted` | 2.355 | -0.529 | 0.623 | 3.232 | 842 |
| `v2_age_adjusted` | 2.358 | -0.533 | 0.622 | 3.237 | 842 |
| `v6_usage_share` | 2.358 | -0.219 | 0.622 | 3.235 | 842 |
| `v15_snap_trend` | 2.378 | -0.558 | 0.615 | 3.265 | 842 |
| `v18_usage_level` | 2.387 | -0.638 | 0.614 | 3.271 | 842 |
| `external_fantasypros_v1` | 2.424 | +0.963 | 0.659 | 3.326 | 445 |
| `v1_baseline_weighted_ppg` | 2.436 | -0.735 | 0.596 | 3.347 | 842 |
| `naive_prior_season_ppg` | 2.523 | -0.439 | 0.539 | 3.580 | 855 |
| `position_mean_baseline` | 3.726 | +0.742 | 0.171 | 4.799 | 855 |

### QB

| Model | MAE | Bias | R² | RMSE | N |
| --- | --- | --- | --- | --- | --- |
| `v28_reliability_weighting` | 3.537 | -0.670 | 0.511 | 4.398 | 102 |
| `v22_advanced_receiving` | 3.566 | -0.388 | 0.505 | 4.422 | 102 |
| `v31_depth_chart` | 3.582 | -0.801 | 0.507 | 4.416 | 102 |
| `v20_learned_usage` | 3.591 | -0.448 | 0.498 | 4.456 | 102 |
| `v29_reliability_residual` | 3.598 | -0.890 | 0.494 | 4.470 | 102 |
| `v26_vegas_residual` | 3.603 | -0.676 | 0.492 | 4.482 | 102 |
| `v30_reliability_full_refit` | 3.633 | -0.799 | 0.484 | 4.514 | 102 |
| `v25_draft_capital_residual` | 3.633 | -0.663 | 0.488 | 4.498 | 102 |
| `external_fantasypros_v1` | 3.690 | +2.129 | 0.413 | 5.072 | 88 |
| `v23_draft_capital` | 3.710 | -0.761 | 0.475 | 4.554 | 102 |
| `v27_vegas_full_refit` | 3.713 | -0.540 | 0.472 | 4.567 | 102 |
| `v14_qb_starter` | 3.774 | -0.666 | 0.461 | 4.839 | 106 |
| `v17_rookie_growth` | 3.774 | -0.666 | 0.461 | 4.839 | 106 |
| `v19_usage_level_full` | 3.774 | -0.666 | 0.461 | 4.839 | 106 |
| `v16_snap_trend_full` | 3.845 | -0.671 | 0.449 | 4.896 | 106 |
| `v21_tiered_regression` | 3.857 | -0.533 | 0.433 | 4.966 | 106 |
| `v12_no_qb_trajectory` | 3.910 | -1.034 | 0.381 | 5.188 | 106 |
| `v8_age_regression` | 3.950 | -1.163 | 0.360 | 5.272 | 106 |
| `v9_pos_specific` | 3.950 | -1.163 | 0.360 | 5.272 | 106 |
| `v11_team_context_v2` | 3.962 | -1.201 | 0.357 | 5.285 | 106 |
| `v13_qb_starter` | 3.967 | -1.153 | 0.354 | 5.298 | 106 |
| `v10_stat_efficiency_v2` | 3.967 | -1.145 | 0.363 | 5.262 | 106 |
| `v7_regression_to_mean` | 4.034 | +0.224 | 0.384 | 5.175 | 106 |
| `v4_availability_adjusted` | 4.049 | -0.026 | 0.357 | 5.285 | 106 |
| `v2_age_adjusted` | 4.056 | -1.473 | 0.323 | 5.425 | 106 |
| `v18_usage_level` | 4.056 | -1.473 | 0.323 | 5.425 | 106 |
| `v3_stat_weighted` | 4.060 | -1.461 | 0.324 | 5.421 | 106 |
| `v6_usage_share` | 4.089 | -0.065 | 0.353 | 5.302 | 106 |
| `v5_team_context` | 4.129 | -0.077 | 0.349 | 5.321 | 106 |
| `v15_snap_trend` | 4.147 | -1.478 | 0.307 | 5.490 | 106 |
| `v1_baseline_weighted_ppg` | 4.204 | -1.879 | 0.290 | 5.556 | 106 |
| `naive_prior_season_ppg` | 4.781 | -0.955 | 0.097 | 6.264 | 106 |
| `position_mean_baseline` | 5.490 | +0.605 | -0.011 | 6.628 | 106 |

### RB

| Model | MAE | Bias | R² | RMSE | N |
| --- | --- | --- | --- | --- | --- |
| `v5_team_context` | 2.279 | +0.024 | 0.675 | 3.150 | 194 |
| `v6_usage_share` | 2.287 | -0.162 | 0.676 | 3.144 | 194 |
| `v4_availability_adjusted` | 2.298 | +0.023 | 0.681 | 3.122 | 194 |
| `v3_stat_weighted` | 2.300 | -0.331 | 0.681 | 3.120 | 194 |
| `v2_age_adjusted` | 2.312 | -0.346 | 0.678 | 3.136 | 194 |
| `v19_usage_level_full` | 2.329 | -0.314 | 0.681 | 3.120 | 194 |
| `v8_age_regression` | 2.330 | -0.137 | 0.679 | 3.130 | 194 |
| `v9_pos_specific` | 2.330 | -0.137 | 0.679 | 3.130 | 194 |
| `v12_no_qb_trajectory` | 2.330 | -0.137 | 0.679 | 3.130 | 194 |
| `v13_qb_starter` | 2.330 | -0.137 | 0.679 | 3.130 | 194 |
| `v14_qb_starter` | 2.330 | -0.137 | 0.679 | 3.130 | 194 |
| `v10_stat_efficiency_v2` | 2.332 | -0.108 | 0.679 | 3.132 | 194 |
| `v7_regression_to_mean` | 2.333 | +0.053 | 0.669 | 3.177 | 194 |
| `v11_team_context_v2` | 2.342 | -0.151 | 0.678 | 3.136 | 194 |
| `v16_snap_trend_full` | 2.346 | -0.214 | 0.671 | 3.169 | 194 |
| `v15_snap_trend` | 2.349 | -0.423 | 0.665 | 3.197 | 194 |
| `v18_usage_level` | 2.352 | -0.523 | 0.667 | 3.186 | 194 |
| `v1_baseline_weighted_ppg` | 2.374 | -0.588 | 0.646 | 3.287 | 194 |
| `naive_prior_season_ppg` | 2.376 | -0.319 | 0.621 | 3.403 | 197 |
| `v17_rookie_growth` | 2.384 | -0.216 | 0.669 | 3.180 | 194 |
| `v21_tiered_regression` | 2.426 | -0.046 | 0.642 | 3.304 | 194 |
| `v31_depth_chart` | 2.472 | +0.239 | 0.638 | 3.282 | 184 |
| `v20_learned_usage` | 2.559 | +0.084 | 0.620 | 3.363 | 184 |
| `v25_draft_capital_residual` | 2.577 | -0.058 | 0.632 | 3.312 | 184 |
| `v26_vegas_residual` | 2.583 | -0.065 | 0.630 | 3.320 | 184 |
| `v29_reliability_residual` | 2.606 | +0.098 | 0.623 | 3.352 | 184 |
| `v23_draft_capital` | 2.609 | +0.057 | 0.606 | 3.426 | 184 |
| `v27_vegas_full_refit` | 2.610 | -0.007 | 0.610 | 3.407 | 184 |
| `v22_advanced_receiving` | 2.613 | +0.084 | 0.616 | 3.382 | 184 |
| `v30_reliability_full_refit` | 2.621 | +0.089 | 0.610 | 3.409 | 184 |
| `external_fantasypros_v1` | 2.649 | +1.044 | 0.656 | 3.292 | 104 |
| `v28_reliability_weighting` | 2.656 | +0.280 | 0.600 | 3.452 | 184 |
| `position_mean_baseline` | 4.468 | +1.071 | -0.038 | 5.630 | 197 |

### WR

| Model | MAE | Bias | R² | RMSE | N |
| --- | --- | --- | --- | --- | --- |
| `external_fantasypros_v1` | 2.160 | +0.391 | 0.653 | 2.752 | 140 |
| `v26_vegas_residual` | 2.196 | -0.337 | 0.614 | 2.765 | 286 |
| `v31_depth_chart` | 2.226 | -0.269 | 0.591 | 2.846 | 286 |
| `v25_draft_capital_residual` | 2.235 | -0.307 | 0.609 | 2.783 | 286 |
| `v4_availability_adjusted` | 2.246 | -0.349 | 0.590 | 2.895 | 299 |
| `v7_regression_to_mean` | 2.251 | -0.317 | 0.606 | 2.839 | 299 |
| `v16_snap_trend_full` | 2.252 | -0.433 | 0.606 | 2.839 | 299 |
| `v23_draft_capital` | 2.256 | -0.211 | 0.592 | 2.841 | 286 |
| `v30_reliability_full_refit` | 2.260 | -0.215 | 0.586 | 2.864 | 286 |
| `v10_stat_efficiency_v2` | 2.264 | -0.401 | 0.608 | 2.833 | 299 |
| `v29_reliability_residual` | 2.265 | -0.341 | 0.587 | 2.859 | 286 |
| `v8_age_regression` | 2.267 | -0.406 | 0.607 | 2.836 | 299 |
| `v9_pos_specific` | 2.267 | -0.406 | 0.607 | 2.836 | 299 |
| `v12_no_qb_trajectory` | 2.267 | -0.406 | 0.607 | 2.836 | 299 |
| `v13_qb_starter` | 2.267 | -0.406 | 0.607 | 2.836 | 299 |
| `v14_qb_starter` | 2.267 | -0.406 | 0.607 | 2.836 | 299 |
| `v19_usage_level_full` | 2.272 | -0.551 | 0.604 | 2.847 | 299 |
| `v5_team_context` | 2.274 | -0.383 | 0.577 | 2.944 | 299 |
| `v27_vegas_full_refit` | 2.276 | -0.241 | 0.589 | 2.853 | 286 |
| `v21_tiered_regression` | 2.284 | -0.514 | 0.577 | 2.942 | 299 |
| `v11_team_context_v2` | 2.287 | -0.421 | 0.600 | 2.862 | 299 |
| `v17_rookie_growth` | 2.288 | -0.451 | 0.610 | 2.827 | 299 |
| `v22_advanced_receiving` | 2.290 | +0.005 | 0.581 | 2.881 | 286 |
| `v6_usage_share` | 2.295 | -0.512 | 0.570 | 2.966 | 299 |
| `v28_reliability_weighting` | 2.295 | -0.071 | 0.566 | 2.930 | 286 |
| `v20_learned_usage` | 2.305 | -0.036 | 0.575 | 2.901 | 286 |
| `v15_snap_trend` | 2.310 | -0.647 | 0.574 | 2.952 | 299 |
| `v3_stat_weighted` | 2.314 | -0.620 | 0.575 | 2.950 | 299 |
| `v2_age_adjusted` | 2.314 | -0.619 | 0.575 | 2.949 | 299 |
| `v18_usage_level` | 2.360 | -0.765 | 0.559 | 3.006 | 299 |
| `naive_prior_season_ppg` | 2.427 | -0.607 | 0.512 | 3.167 | 304 |
| `v1_baseline_weighted_ppg` | 2.434 | -0.775 | 0.539 | 3.073 | 299 |
| `position_mean_baseline` | 3.739 | +0.918 | -0.041 | 4.626 | 304 |

### TE

| Model | MAE | Bias | R² | RMSE | N |
| --- | --- | --- | --- | --- | --- |
| `external_fantasypros_v1` | 1.558 | +0.688 | 0.622 | 2.046 | 113 |
| `v31_depth_chart` | 1.607 | -0.001 | 0.616 | 2.051 | 171 |
| `v23_draft_capital` | 1.610 | -0.065 | 0.595 | 2.105 | 171 |
| `v20_learned_usage` | 1.645 | +0.032 | 0.571 | 2.168 | 171 |
| `v27_vegas_full_refit` | 1.652 | -0.141 | 0.589 | 2.121 | 171 |
| `v28_reliability_weighting` | 1.655 | +0.036 | 0.582 | 2.140 | 171 |
| `v30_reliability_full_refit` | 1.657 | -0.045 | 0.592 | 2.112 | 171 |
| `v22_advanced_receiving` | 1.659 | -0.049 | 0.582 | 2.140 | 171 |
| `v29_reliability_residual` | 1.659 | -0.066 | 0.588 | 2.125 | 171 |
| `v25_draft_capital_residual` | 1.659 | -0.175 | 0.592 | 2.113 | 171 |
| `v26_vegas_residual` | 1.662 | -0.174 | 0.581 | 2.142 | 171 |
| `v7_regression_to_mean` | 1.666 | +0.065 | 0.580 | 2.157 | 176 |
| `v5_team_context` | 1.684 | +0.035 | 0.574 | 2.172 | 176 |
| `v10_stat_efficiency_v2` | 1.687 | -0.107 | 0.580 | 2.157 | 176 |
| `v8_age_regression` | 1.690 | -0.103 | 0.579 | 2.159 | 176 |
| `v9_pos_specific` | 1.690 | -0.103 | 0.579 | 2.159 | 176 |
| `v12_no_qb_trajectory` | 1.690 | -0.103 | 0.579 | 2.159 | 176 |
| `v13_qb_starter` | 1.690 | -0.103 | 0.579 | 2.159 | 176 |
| `v14_qb_starter` | 1.690 | -0.103 | 0.579 | 2.159 | 176 |
| `v16_snap_trend_full` | 1.691 | -0.093 | 0.579 | 2.159 | 176 |
| `v4_availability_adjusted` | 1.691 | +0.050 | 0.569 | 2.184 | 176 |
| `v3_stat_weighted` | 1.695 | -0.213 | 0.573 | 2.174 | 176 |
| `v19_usage_level_full` | 1.696 | -0.166 | 0.577 | 2.163 | 176 |
| `v11_team_context_v2` | 1.697 | -0.110 | 0.576 | 2.167 | 176 |
| `v2_age_adjusted` | 1.698 | -0.207 | 0.572 | 2.177 | 176 |
| `v15_snap_trend` | 1.701 | -0.198 | 0.573 | 2.174 | 176 |
| `v17_rookie_growth` | 1.702 | -0.117 | 0.577 | 2.165 | 176 |
| `v6_usage_share` | 1.708 | -0.018 | 0.557 | 2.215 | 176 |
| `v1_baseline_weighted_ppg` | 1.711 | -0.426 | 0.552 | 2.226 | 176 |
| `v18_usage_level` | 1.716 | -0.271 | 0.560 | 2.208 | 176 |
| `v21_tiered_regression` | 1.717 | +0.010 | 0.556 | 2.216 | 176 |
| `naive_prior_season_ppg` | 1.731 | -0.214 | 0.527 | 2.290 | 181 |
| `position_mean_baseline` | 2.684 | +0.341 | -0.010 | 3.348 | 181 |

### K

| Model | MAE | Bias | R² | RMSE | N |
| --- | --- | --- | --- | --- | --- |
| `position_mean_baseline` | 1.510 | +0.268 | -0.055 | 1.963 | 67 |
| `v25_draft_capital_residual` | 1.550 | +0.007 | -0.165 | 2.063 | 67 |
| `v26_vegas_residual` | 1.550 | +0.007 | -0.165 | 2.063 | 67 |
| `v29_reliability_residual` | 1.554 | -0.125 | -0.154 | 2.054 | 67 |
| `v28_reliability_weighting` | 1.555 | -0.102 | -0.159 | 2.058 | 67 |
| `v22_advanced_receiving` | 1.556 | +0.032 | -0.173 | 2.070 | 67 |
| `v30_reliability_full_refit` | 1.573 | +0.185 | -0.178 | 2.075 | 67 |
| `v20_learned_usage` | 1.575 | +0.134 | -0.202 | 2.096 | 67 |
| `v31_depth_chart` | 1.585 | +0.414 | -0.184 | 2.080 | 67 |
| `v23_draft_capital` | 1.591 | +0.203 | -0.201 | 2.095 | 67 |
| `v12_no_qb_trajectory` | 1.595 | +0.042 | -0.227 | 2.118 | 67 |
| `v14_qb_starter` | 1.595 | +0.042 | -0.227 | 2.118 | 67 |
| `v17_rookie_growth` | 1.595 | +0.042 | -0.227 | 2.118 | 67 |
| `v19_usage_level_full` | 1.595 | +0.042 | -0.227 | 2.118 | 67 |
| `v27_vegas_full_refit` | 1.602 | +0.367 | -0.222 | 2.113 | 67 |
| `v16_snap_trend_full` | 1.603 | +0.053 | -0.229 | 2.119 | 67 |
| `v21_tiered_regression` | 1.650 | +0.164 | -0.349 | 2.220 | 67 |
| `v8_age_regression` | 1.663 | -0.025 | -0.360 | 2.229 | 67 |
| `v9_pos_specific` | 1.663 | -0.025 | -0.360 | 2.229 | 67 |
| `v10_stat_efficiency_v2` | 1.663 | -0.025 | -0.360 | 2.229 | 67 |
| `v11_team_context_v2` | 1.663 | -0.025 | -0.360 | 2.229 | 67 |
| `v13_qb_starter` | 1.663 | -0.025 | -0.360 | 2.229 | 67 |
| `v1_baseline_weighted_ppg` | 1.727 | +0.015 | -0.499 | 2.341 | 67 |
| `v2_age_adjusted` | 1.731 | -0.055 | -0.476 | 2.323 | 67 |
| `v3_stat_weighted` | 1.731 | -0.055 | -0.476 | 2.323 | 67 |
| `v18_usage_level` | 1.731 | -0.055 | -0.476 | 2.323 | 67 |
| `v15_snap_trend` | 1.741 | -0.045 | -0.478 | 2.324 | 67 |
| `v7_regression_to_mean` | 1.750 | +0.188 | -0.589 | 2.410 | 67 |
| `v4_availability_adjusted` | 1.821 | +0.158 | -0.704 | 2.495 | 67 |
| `v5_team_context` | 1.821 | +0.158 | -0.704 | 2.495 | 67 |
| `v6_usage_share` | 1.821 | +0.158 | -0.704 | 2.495 | 67 |
| `naive_prior_season_ppg` | 1.960 | +0.184 | -1.116 | 2.781 | 67 |

## Ranking quality — per-position ordering (GH #598)

_The projections feed VORP, surplus value, auction pricing and keeper calls, which depend on within-position **ordering** and getting the top tier right — not absolute PPG level. **Spearman ρ** is the rank correlation between projected and actual PPG (1.0 = perfect order). **Top-N hit** is the share of each model's predicted top-N (≈ the starter pool: 12 for QB/TE, 24 for RB/WR) that actually finished top-N. A model can win MAE while losing here (#579) — these are the metrics the downstream decisions actually care about._

### QB (top-12)

| Model | Spearman ρ | Top-N hit | N |
| --- | --- | --- | --- |
| `external_fantasypros_v1` | **0.800** | 0.417 | 88 |
| `v26_vegas_residual` | 0.735 | 0.333 | 102 |
| `v28_reliability_weighting` | 0.735 | 0.417 | 102 |
| `v29_reliability_residual` | 0.733 | 0.333 | 102 |
| `v31_depth_chart` | 0.728 | 0.333 | 102 |
| `v22_advanced_receiving` | 0.728 | 0.417 | 102 |
| `v25_draft_capital_residual` | 0.726 | 0.333 | 102 |
| `v20_learned_usage` | 0.723 | 0.417 | 102 |
| `v16_snap_trend_full` | 0.720 | 0.417 | 106 |
| `v21_tiered_regression` | 0.718 | 0.333 | 106 |
| `v14_qb_starter` | 0.718 | 0.333 | 106 |
| `v17_rookie_growth` | 0.718 | 0.333 | 106 |
| `v19_usage_level_full` | 0.718 | 0.333 | 106 |
| `v30_reliability_full_refit` | 0.718 | 0.333 | 102 |
| `v27_vegas_full_refit` | 0.710 | 0.250 | 102 |
| `v23_draft_capital` | 0.705 | 0.250 | 102 |
| `v5_team_context` | 0.689 | 0.417 | 106 |
| `v4_availability_adjusted` | 0.689 | 0.417 | 106 |
| `v6_usage_share` | 0.688 | 0.417 | 106 |
| `v7_regression_to_mean` | 0.685 | 0.417 | 106 |
| `v3_stat_weighted` | 0.683 | 0.417 | 106 |
| `v15_snap_trend` | 0.683 | 0.417 | 106 |
| `v12_no_qb_trajectory` | 0.683 | 0.333 | 106 |
| `v2_age_adjusted` | 0.682 | 0.417 | 106 |
| `v18_usage_level` | 0.682 | 0.417 | 106 |
| `v8_age_regression` | 0.681 | 0.417 | 106 |
| `v9_pos_specific` | 0.681 | 0.417 | 106 |
| `v10_stat_efficiency_v2` | 0.680 | 0.417 | 106 |
| `v11_team_context_v2` | 0.679 | 0.417 | 106 |
| `v13_qb_starter` | 0.676 | 0.417 | 106 |
| `v1_baseline_weighted_ppg` | 0.672 | 0.417 | 106 |
| `naive_prior_season_ppg` | 0.606 | 0.333 | 106 |
| `position_mean_baseline` | -0.025 | 0.167 | 106 |

### RB (top-24)

| Model | Spearman ρ | Top-N hit | N |
| --- | --- | --- | --- |
| `external_fantasypros_v1` | **0.842** | 0.667 | 104 |
| `v4_availability_adjusted` | 0.834 | 0.583 | 194 |
| `v6_usage_share` | 0.833 | 0.625 | 194 |
| `v5_team_context` | 0.832 | 0.583 | 194 |
| `v3_stat_weighted` | 0.831 | 0.625 | 194 |
| `v15_snap_trend` | 0.831 | 0.625 | 194 |
| `v18_usage_level` | 0.830 | 0.625 | 194 |
| `v16_snap_trend_full` | 0.830 | 0.625 | 194 |
| `v19_usage_level_full` | 0.830 | 0.583 | 194 |
| `v7_regression_to_mean` | 0.830 | 0.583 | 194 |
| `v2_age_adjusted` | 0.829 | 0.625 | 194 |
| `v8_age_regression` | 0.829 | 0.625 | 194 |
| `v9_pos_specific` | 0.829 | 0.625 | 194 |
| `v12_no_qb_trajectory` | 0.829 | 0.625 | 194 |
| `v13_qb_starter` | 0.829 | 0.625 | 194 |
| `v14_qb_starter` | 0.829 | 0.625 | 194 |
| `v10_stat_efficiency_v2` | 0.829 | 0.583 | 194 |
| `v11_team_context_v2` | 0.827 | 0.625 | 194 |
| `naive_prior_season_ppg` | 0.825 | 0.583 | 197 |
| `v1_baseline_weighted_ppg` | 0.823 | 0.667 | 194 |
| `v21_tiered_regression` | 0.823 | 0.583 | 194 |
| `v17_rookie_growth` | 0.819 | 0.625 | 194 |
| `v25_draft_capital_residual` | 0.807 | 0.667 | 184 |
| `v29_reliability_residual` | 0.806 | 0.625 | 184 |
| `v26_vegas_residual` | 0.805 | 0.667 | 184 |
| `v22_advanced_receiving` | 0.803 | 0.667 | 184 |
| `v20_learned_usage` | 0.799 | 0.667 | 184 |
| `v28_reliability_weighting` | 0.798 | 0.667 | 184 |
| `v27_vegas_full_refit` | 0.797 | 0.542 | 184 |
| `v30_reliability_full_refit` | 0.796 | 0.583 | 184 |
| `v23_draft_capital` | 0.795 | 0.542 | 184 |
| `v31_depth_chart` | 0.782 | 0.542 | 184 |
| `position_mean_baseline` | 0.012 | 0.208 | 197 |

### WR (top-24)

| Model | Spearman ρ | Top-N hit | N |
| --- | --- | --- | --- |
| `v4_availability_adjusted` | **0.802** | 0.417 | 299 |
| `v6_usage_share` | **0.802** | 0.417 | 299 |
| `v7_regression_to_mean` | 0.801 | 0.417 | 299 |
| `v18_usage_level` | 0.801 | 0.417 | 299 |
| `v19_usage_level_full` | 0.801 | 0.417 | 299 |
| `v15_snap_trend` | 0.800 | 0.417 | 299 |
| `v5_team_context` | 0.800 | 0.417 | 299 |
| `v17_rookie_growth` | 0.800 | 0.417 | 299 |
| `v25_draft_capital_residual` | 0.800 | 0.417 | 286 |
| `v2_age_adjusted` | 0.799 | 0.417 | 299 |
| `v3_stat_weighted` | 0.799 | 0.417 | 299 |
| `v16_snap_trend_full` | 0.799 | 0.458 | 299 |
| `v10_stat_efficiency_v2` | 0.798 | 0.417 | 299 |
| `v8_age_regression` | 0.798 | 0.417 | 299 |
| `v9_pos_specific` | 0.798 | 0.417 | 299 |
| `v12_no_qb_trajectory` | 0.798 | 0.417 | 299 |
| `v13_qb_starter` | 0.798 | 0.417 | 299 |
| `v14_qb_starter` | 0.798 | 0.417 | 299 |
| `v21_tiered_regression` | 0.797 | 0.500 | 299 |
| `v29_reliability_residual` | 0.797 | 0.458 | 286 |
| `v11_team_context_v2` | 0.797 | 0.417 | 299 |
| `v23_draft_capital` | 0.796 | 0.333 | 286 |
| `v1_baseline_weighted_ppg` | 0.793 | 0.500 | 299 |
| `v26_vegas_residual` | 0.792 | 0.583 | 286 |
| `v31_depth_chart` | 0.792 | 0.458 | 286 |
| `naive_prior_season_ppg` | 0.788 | 0.458 | 304 |
| `v30_reliability_full_refit` | 0.785 | 0.458 | 286 |
| `v22_advanced_receiving` | 0.784 | 0.417 | 286 |
| `external_fantasypros_v1` | 0.784 | 0.500 | 140 |
| `v28_reliability_weighting` | 0.783 | 0.458 | 286 |
| `v27_vegas_full_refit` | 0.782 | 0.375 | 286 |
| `v20_learned_usage` | 0.777 | 0.500 | 286 |
| `position_mean_baseline` | 0.007 | 0.042 | 304 |

### TE (top-12)

| Model | Spearman ρ | Top-N hit | N |
| --- | --- | --- | --- |
| `external_fantasypros_v1` | **0.791** | 0.750 | 113 |
| `v31_depth_chart` | 0.748 | 0.417 | 171 |
| `v23_draft_capital` | 0.743 | 0.333 | 171 |
| `v25_draft_capital_residual` | 0.740 | 0.333 | 171 |
| `v27_vegas_full_refit` | 0.739 | 0.417 | 171 |
| `v26_vegas_residual` | 0.735 | 0.417 | 171 |
| `v7_regression_to_mean` | 0.734 | 0.417 | 176 |
| `v22_advanced_receiving` | 0.733 | 0.333 | 171 |
| `v1_baseline_weighted_ppg` | 0.733 | 0.333 | 176 |
| `v29_reliability_residual` | 0.733 | 0.417 | 171 |
| `v5_team_context` | 0.732 | 0.417 | 176 |
| `v30_reliability_full_refit` | 0.731 | 0.417 | 171 |
| `v6_usage_share` | 0.730 | 0.417 | 176 |
| `naive_prior_season_ppg` | 0.728 | 0.417 | 181 |
| `v20_learned_usage` | 0.727 | 0.333 | 171 |
| `v28_reliability_weighting` | 0.726 | 0.417 | 171 |
| `v4_availability_adjusted` | 0.725 | 0.417 | 176 |
| `v3_stat_weighted` | 0.721 | 0.417 | 176 |
| `v2_age_adjusted` | 0.720 | 0.417 | 176 |
| `v18_usage_level` | 0.719 | 0.417 | 176 |
| `v11_team_context_v2` | 0.719 | 0.417 | 176 |
| `v10_stat_efficiency_v2` | 0.719 | 0.417 | 176 |
| `v19_usage_level_full` | 0.718 | 0.417 | 176 |
| `v8_age_regression` | 0.717 | 0.417 | 176 |
| `v9_pos_specific` | 0.717 | 0.417 | 176 |
| `v12_no_qb_trajectory` | 0.717 | 0.417 | 176 |
| `v13_qb_starter` | 0.717 | 0.417 | 176 |
| `v14_qb_starter` | 0.717 | 0.417 | 176 |
| `v17_rookie_growth` | 0.714 | 0.417 | 176 |
| `v15_snap_trend` | 0.714 | 0.500 | 176 |
| `v16_snap_trend_full` | 0.712 | 0.500 | 176 |
| `v21_tiered_regression` | 0.709 | 0.417 | 176 |
| `position_mean_baseline` | 0.057 | 0.083 | 181 |

## Season 2024 — ALL (held-out)

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
| `v26_vegas_residual` | 2.328 | -0.078 | 0.654 | 3.038 | 427 |
| `v11_team_context_v2` | 2.333 | -0.189 | 0.642 | 3.123 | 443 |
| `v25_draft_capital_residual` | 2.336 | -0.049 | 0.656 | 3.028 | 427 |
| `v20_learned_usage` | 2.339 | +0.139 | 0.648 | 3.061 | 427 |
| `v2_age_adjusted` | 2.342 | -0.333 | 0.634 | 3.161 | 443 |
| `v23_draft_capital` | 2.343 | +0.072 | 0.647 | 3.066 | 427 |
| `v4_availability_adjusted` | 2.343 | +0.086 | 0.632 | 3.170 | 443 |
| `v3_stat_weighted` | 2.345 | -0.333 | 0.634 | 3.160 | 443 |
| `v22_advanced_receiving` | 2.350 | +0.143 | 0.649 | 3.059 | 427 |
| `v1_baseline_weighted_ppg` | 2.356 | -0.486 | 0.620 | 3.221 | 443 |
| `v7_regression_to_mean` | 2.364 | +0.102 | 0.629 | 3.180 | 443 |
| `v29_reliability_residual` | 2.364 | -0.044 | 0.644 | 3.078 | 427 |
| `v18_usage_level` | 2.366 | -0.439 | 0.626 | 3.193 | 443 |
| `v5_team_context` | 2.367 | +0.058 | 0.622 | 3.213 | 443 |
| `v6_usage_share` | 2.368 | -0.033 | 0.622 | 3.210 | 443 |
| `v15_snap_trend` | 2.371 | -0.352 | 0.626 | 3.193 | 443 |
| `v30_reliability_full_refit` | 2.372 | +0.068 | 0.641 | 3.092 | 427 |
| `v27_vegas_full_refit` | 2.374 | +0.068 | 0.644 | 3.080 | 427 |
| `v28_reliability_weighting` | 2.379 | +0.131 | 0.636 | 3.113 | 427 |
| `v21_tiered_regression` | 2.387 | -0.064 | 0.626 | 3.196 | 443 |
| `naive_prior_season_ppg` | 2.441 | -0.127 | 0.556 | 3.490 | 450 |
| `external_fantasypros_v1` | 2.597 | +1.367 | 0.620 | 3.443 | 200 |
| `position_mean_baseline` | 3.698 | +0.787 | 0.173 | 4.760 | 450 |

## Season 2025 — ALL (held-out)

| Model | MAE | Bias | R² | RMSE | N |
| --- | --- | --- | --- | --- | --- |
| `v26_vegas_residual` | 2.258 | -0.452 | 0.678 | 2.976 | 383 |
| `v31_depth_chart` | 2.273 | -0.298 | 0.666 | 3.031 | 383 |
| `v29_reliability_residual` | 2.278 | -0.446 | 0.672 | 3.003 | 383 |
| `v25_draft_capital_residual` | 2.283 | -0.456 | 0.674 | 2.993 | 383 |
| `external_fantasypros_v1` | 2.283 | +0.632 | 0.680 | 3.228 | 245 |
| `v30_reliability_full_refit` | 2.284 | -0.395 | 0.665 | 3.037 | 383 |
| `v28_reliability_weighting` | 2.291 | -0.245 | 0.663 | 3.044 | 383 |
| `v14_qb_starter` | 2.293 | -0.451 | 0.661 | 3.090 | 399 |
| `v7_regression_to_mean` | 2.297 | -0.206 | 0.650 | 3.140 | 399 |
| `v21_tiered_regression` | 2.300 | -0.446 | 0.645 | 3.162 | 399 |
| `v16_snap_trend_full` | 2.301 | -0.484 | 0.657 | 3.107 | 399 |
| `v19_usage_level_full` | 2.302 | -0.556 | 0.660 | 3.092 | 399 |
| `v22_advanced_receiving` | 2.307 | -0.234 | 0.663 | 3.043 | 383 |
| `v20_learned_usage` | 2.310 | -0.222 | 0.657 | 3.070 | 383 |
| `v23_draft_capital` | 2.311 | -0.407 | 0.656 | 3.075 | 383 |
| `v27_vegas_full_refit` | 2.313 | -0.402 | 0.657 | 3.070 | 383 |
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
