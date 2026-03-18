# Projection Model Accuracy Report

_Generated: 2026-03-17 20:52_

Metrics: **MAE** = Mean Absolute Error (lower is better), **Bias** = Mean signed error (positive = under-projection), **R²** = Goodness of fit (higher is better), **RMSE** = Root mean square error, **N** = player sample size.

## Season 2024

### ALL

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 2.707 | -0.036 | 0.442 | 3.654 | 241 |
| `v2_age_adjusted` | **2.680** | +0.244 | **0.471** | **3.555** | 241 |
| `v3_stat_weighted` | 2.793 | +0.000 | 0.394 | 3.808 | 241 |
| `v4_availability_adjusted` | 2.852 | +0.495 | 0.365 | 3.897 | 241 |
| `v5_team_context` | 3.297 | -0.417 | 0.246 | 4.246 | 241 |
| `v6_usage_share` | 3.872 | -1.148 | -0.202 | 5.361 | 241 |
| `v7_regression_to_mean` | 3.703 | -0.681 | -0.095 | 5.115 | 241 |
| `v8_best_combo` | **2.625** | +0.431 | **0.489** | **3.494** | 241 |
| `external_fantasypros_v1` | 2.782 | +1.531 | **0.543** | **3.602** | 211 |

### QB

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 4.011 | -1.375 | 0.370 | 5.177 | 49 |
| `v2_age_adjusted` | **3.861** | -0.989 | **0.401** | **5.048** | 49 |
| `v3_stat_weighted` | 4.038 | -1.289 | 0.352 | 5.253 | 49 |
| `v4_availability_adjusted` | **3.952** | +0.113 | 0.357 | 5.230 | 49 |
| `v5_team_context` | 4.362 | -0.600 | 0.285 | 5.515 | 49 |
| `v6_usage_share` | 4.362 | -0.600 | 0.285 | 5.515 | 49 |
| `v7_regression_to_mean` | 4.223 | -0.015 | 0.300 | 5.457 | 49 |
| `v8_best_combo` | **3.825** | -0.883 | **0.416** | **4.983** | 49 |
| `external_fantasypros_v1` | 4.015 | +2.650 | 0.313 | **5.163** | 47 |

### RB

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 3.006 | +0.436 | 0.166 | 4.056 | 49 |
| `v2_age_adjusted` | 3.075 | +0.832 | **0.224** | **3.913** | 49 |
| `v3_stat_weighted` | 3.311 | +0.770 | 0.025 | 4.386 | 49 |
| `v4_availability_adjusted` | 3.440 | +1.230 | -0.036 | 4.520 | 49 |
| `v5_team_context` | 3.607 | +0.416 | -0.065 | 4.582 | 49 |
| `v6_usage_share` | 3.879 | +0.292 | -0.255 | 4.975 | 49 |
| `v7_regression_to_mean` | 3.736 | +0.589 | -0.185 | 4.835 | 49 |
| `v8_best_combo` | 3.063 | +1.098 | **0.244** | **3.861** | 49 |
| `external_fantasypros_v1` | 3.281 | +1.622 | **0.409** | **3.898** | 51 |

### WR

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 2.876 | +0.409 | -0.278 | 3.466 | 55 |
| `v2_age_adjusted` | **2.752** | +0.714 | **-0.164** | **3.308** | 55 |
| `v3_stat_weighted` | **2.708** | +0.363 | -0.295 | 3.490 | 55 |
| `v4_availability_adjusted` | **2.760** | +0.539 | -0.358 | 3.573 | 55 |
| `v5_team_context` | 3.100 | -0.401 | -0.691 | 3.988 | 55 |
| `v6_usage_share` | 4.780 | -2.481 | -4.623 | 7.272 | 55 |
| `v7_regression_to_mean` | 4.485 | -1.676 | -3.836 | 6.743 | 55 |
| `v8_best_combo` | **2.643** | +1.082 | **-0.105** | **3.223** | 55 |
| `external_fantasypros_v1` | **2.353** | +1.365 | **0.187** | **2.832** | 58 |

### TE

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 1.818 | +0.019 | 0.425 | 2.285 | 56 |
| `v2_age_adjusted` | 1.925 | +0.294 | 0.385 | 2.363 | 56 |
| `v3_stat_weighted` | 2.094 | -0.095 | 0.220 | 2.661 | 56 |
| `v4_availability_adjusted` | 2.142 | +0.118 | 0.195 | 2.703 | 56 |
| `v5_team_context` | 2.774 | -0.786 | -0.317 | 3.458 | 56 |
| `v6_usage_share` | 3.358 | -1.783 | -1.035 | 4.298 | 56 |
| `v7_regression_to_mean` | 3.215 | -1.358 | -0.845 | 4.092 | 56 |
| `v8_best_combo` | 1.859 | +0.383 | 0.411 | 2.311 | 56 |
| `external_fantasypros_v1` | **1.719** | +0.666 | **0.486** | **2.106** | 55 |

### K

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 1.523 | +0.433 | -0.545 | 2.133 | 32 |
| `v2_age_adjusted` | **1.466** | +0.340 | **-0.415** | **2.041** | 32 |
| `v3_stat_weighted` | **1.466** | +0.340 | **-0.415** | **2.041** | 32 |
| `v4_availability_adjusted` | 1.667 | +0.540 | -1.191 | 2.540 | 32 |
| `v5_team_context` | 2.447 | -0.793 | -1.986 | 2.965 | 32 |
| `v6_usage_share` | 2.447 | -0.793 | -1.986 | 2.965 | 32 |
| `v7_regression_to_mean` | 2.369 | -0.747 | -1.792 | 2.868 | 32 |
| `v8_best_combo` | **1.424** | +0.385 | **-0.328** | **1.978** | 32 |
| `external_fantasypros_v1` | — | — | — | — | — |

## Season 2025

### ALL

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 2.905 | -1.160 | 0.429 | 3.876 | 261 |
| `v2_age_adjusted` | **2.691** | -0.766 | **0.491** | **3.660** | 261 |
| `v3_stat_weighted` | 3.281 | -0.645 | 0.275 | 4.368 | 261 |
| `v4_availability_adjusted` | 3.192 | -0.142 | 0.308 | 4.268 | 261 |
| `v5_team_context` | 3.568 | -1.036 | 0.181 | 4.640 | 261 |
| `v6_usage_share` | 4.083 | -1.688 | -0.104 | 5.388 | 261 |
| `v7_regression_to_mean` | 3.902 | -1.299 | -0.029 | 5.202 | 261 |
| `v8_best_combo` | **2.637** | -0.710 | **0.512** | **3.583** | 261 |
| `external_fantasypros_v1` | **2.613** | +0.721 | **0.538** | **3.637** | 246 |

### QB

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 4.377 | -2.213 | 0.161 | 5.880 | 53 |
| `v2_age_adjusted` | **4.277** | -1.758 | **0.196** | **5.758** | 53 |
| `v3_stat_weighted` | 5.038 | -1.840 | 0.030 | 6.322 | 53 |
| `v4_availability_adjusted` | 4.605 | -0.378 | 0.135 | 5.969 | 53 |
| `v5_team_context` | 5.037 | -1.281 | 0.028 | 6.330 | 53 |
| `v6_usage_share` | 5.037 | -1.281 | 0.028 | 6.330 | 53 |
| `v7_regression_to_mean` | 4.857 | -0.624 | 0.075 | 6.175 | 53 |
| `v8_best_combo` | **4.116** | -1.596 | **0.242** | **5.590** | 53 |
| `external_fantasypros_v1` | **4.124** | +2.526 | **0.202** | **5.673** | 52 |

### RB

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 2.973 | -0.969 | 0.561 | 3.578 | 54 |
| `v2_age_adjusted` | **2.690** | -0.458 | **0.645** | **3.218** | 54 |
| `v3_stat_weighted` | 3.849 | +0.305 | 0.197 | 4.838 | 54 |
| `v4_availability_adjusted` | 3.840 | +0.669 | 0.198 | 4.835 | 54 |
| `v5_team_context` | 3.815 | -0.306 | 0.159 | 4.951 | 54 |
| `v6_usage_share` | 4.730 | -1.617 | -0.373 | 6.324 | 54 |
| `v7_regression_to_mean` | 4.663 | -1.401 | -0.312 | 6.184 | 54 |
| `v8_best_combo` | **2.705** | -0.431 | **0.635** | **3.262** | 54 |
| `external_fantasypros_v1` | **2.584** | +0.361 | **0.628** | **3.252** | 64 |

### WR

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 2.981 | -1.394 | -0.062 | 3.636 | 62 |
| `v2_age_adjusted` | **2.513** | -0.915 | **0.152** | **3.248** | 62 |
| `v3_stat_weighted` | 3.079 | -0.912 | -0.166 | 3.809 | 62 |
| `v4_availability_adjusted` | 3.075 | -0.706 | -0.177 | 3.827 | 62 |
| `v5_team_context` | 3.435 | -1.511 | -0.462 | 4.266 | 62 |
| `v6_usage_share` | 4.369 | -2.518 | -1.595 | 5.682 | 62 |
| `v7_regression_to_mean` | 4.062 | -2.016 | -1.318 | 5.371 | 62 |
| `v8_best_combo` | **2.415** | -0.878 | **0.207** | **3.142** | 62 |
| `external_fantasypros_v1` | **2.398** | -0.494 | **0.333** | **3.004** | 66 |

### TE

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 2.005 | -0.668 | 0.475 | 2.539 | 62 |
| `v2_age_adjusted` | **1.870** | -0.294 | **0.551** | **2.347** | 62 |
| `v3_stat_weighted` | 2.127 | -0.386 | 0.326 | 2.876 | 62 |
| `v4_availability_adjusted` | 2.139 | -0.166 | 0.307 | 2.916 | 62 |
| `v5_team_context` | 2.668 | -1.058 | 0.009 | 3.487 | 62 |
| `v6_usage_share` | 3.103 | -1.655 | -0.317 | 4.020 | 62 |
| `v7_regression_to_mean` | 2.911 | -1.270 | -0.206 | 3.848 | 62 |
| `v8_best_combo` | **1.912** | -0.257 | **0.553** | **2.342** | 62 |
| `external_fantasypros_v1` | **1.637** | +0.867 | **0.604** | **2.192** | 64 |

### K

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 1.886 | -0.174 | -0.832 | 2.438 | 30 |
| `v2_age_adjusted` | 1.959 | -0.233 | -0.896 | 2.481 | 30 |
| `v3_stat_weighted` | 1.959 | -0.233 | -0.896 | 2.481 | 30 |
| `v4_availability_adjusted` | 1.947 | +0.030 | **-0.718** | **2.361** | 30 |
| `v5_team_context` | 2.667 | -0.890 | -1.983 | 3.111 | 30 |
| `v6_usage_share` | 2.667 | -0.890 | -1.983 | 3.111 | 30 |
| `v7_regression_to_mean` | 2.561 | -0.889 | -1.784 | 3.005 | 30 |
| `v8_best_combo` | **1.856** | -0.232 | **-0.721** | **2.363** | 30 |
| `external_fantasypros_v1` | — | — | — | — | — |

## All Seasons Combined

_Weighted averages across all seasons (weighted by player count N). RMSE is approximated as √(weighted average of RMSE²). R² is a weighted average and should be interpreted as indicative only._

### ALL

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 2.810 | -0.620 | 0.435 | 3.771 | 502 |
| `v2_age_adjusted` | **2.686** | -0.281 | **0.481** | **3.610** | 502 |
| `v3_stat_weighted` | 3.047 | -0.335 | 0.332 | 4.108 | 502 |
| `v4_availability_adjusted` | 3.029 | +0.164 | 0.335 | 4.094 | 502 |
| `v5_team_context` | 3.438 | -0.739 | 0.212 | 4.455 | 502 |
| `v6_usage_share` | 3.982 | -1.429 | -0.151 | 5.375 | 502 |
| `v7_regression_to_mean` | 3.807 | -1.002 | -0.060 | 5.161 | 502 |
| `v8_best_combo` | **2.631** | -0.162 | **0.501** | **3.541** | 502 |
| `external_fantasypros_v1` | **2.691** | +1.095 | **0.541** | **3.621** | 457 |

### QB

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 4.201 | -1.810 | 0.261 | 5.554 | 102 |
| `v2_age_adjusted` | **4.077** | -1.389 | **0.294** | **5.428** | 102 |
| `v3_stat_weighted` | 4.558 | -1.575 | 0.185 | 5.833 | 102 |
| `v4_availability_adjusted` | 4.291 | -0.142 | 0.242 | 5.626 | 102 |
| `v5_team_context` | 4.713 | -0.954 | 0.151 | 5.953 | 102 |
| `v6_usage_share` | 4.713 | -0.954 | 0.151 | 5.953 | 102 |
| `v7_regression_to_mean` | 4.553 | -0.331 | 0.183 | 5.841 | 102 |
| `v8_best_combo` | **3.976** | -1.253 | **0.326** | **5.307** | 102 |
| `external_fantasypros_v1` | **4.072** | +2.585 | 0.254 | **5.437** | 99 |

### RB

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 2.989 | -0.301 | 0.373 | 3.813 | 103 |
| `v2_age_adjusted` | **2.873** | +0.156 | **0.445** | **3.565** | 103 |
| `v3_stat_weighted` | 3.593 | +0.526 | 0.115 | 4.628 | 103 |
| `v4_availability_adjusted` | 3.650 | +0.936 | 0.087 | 4.688 | 103 |
| `v5_team_context` | 3.716 | +0.037 | 0.053 | 4.779 | 103 |
| `v6_usage_share` | 4.325 | -0.709 | -0.317 | 5.722 | 103 |
| `v7_regression_to_mean` | 4.222 | -0.454 | -0.252 | 5.583 | 103 |
| `v8_best_combo` | **2.876** | +0.296 | **0.449** | **3.559** | 103 |
| `external_fantasypros_v1` | **2.893** | +0.920 | **0.531** | **3.553** | 115 |

### WR

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 2.931 | -0.546 | -0.164 | 3.557 | 117 |
| `v2_age_adjusted` | **2.625** | -0.149 | **0.004** | **3.276** | 117 |
| `v3_stat_weighted` | **2.904** | -0.313 | -0.227 | 3.662 | 117 |
| `v4_availability_adjusted` | **2.927** | -0.121 | -0.262 | 3.710 | 117 |
| `v5_team_context` | 3.278 | -0.989 | -0.570 | 4.137 | 117 |
| `v6_usage_share` | 4.562 | -2.501 | -3.018 | 6.478 | 117 |
| `v7_regression_to_mean` | 4.261 | -1.856 | -2.502 | 6.055 | 117 |
| `v8_best_combo` | **2.522** | +0.043 | **0.060** | **3.180** | 117 |
| `external_fantasypros_v1` | **2.377** | +0.376 | **0.265** | **2.924** | 124 |

### TE

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 1.916 | -0.342 | 0.451 | 2.421 | 118 |
| `v2_age_adjusted` | **1.896** | -0.015 | **0.472** | **2.354** | 118 |
| `v3_stat_weighted` | 2.111 | -0.248 | 0.275 | 2.776 | 118 |
| `v4_availability_adjusted` | 2.140 | -0.031 | 0.254 | 2.817 | 118 |
| `v5_team_context` | 2.718 | -0.929 | -0.146 | 3.473 | 118 |
| `v6_usage_share` | 3.224 | -1.716 | -0.658 | 4.154 | 118 |
| `v7_regression_to_mean` | 3.055 | -1.312 | -0.509 | 3.965 | 118 |
| `v8_best_combo` | **1.887** | +0.047 | **0.486** | **2.327** | 118 |
| `external_fantasypros_v1` | **1.675** | +0.774 | **0.549** | **2.153** | 119 |

### K

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 1.698 | +0.139 | -0.684 | 2.286 | 62 |
| `v2_age_adjusted` | 1.705 | +0.063 | **-0.648** | **2.265** | 62 |
| `v3_stat_weighted` | 1.705 | +0.063 | **-0.648** | **2.265** | 62 |
| `v4_availability_adjusted` | 1.802 | +0.293 | -0.962 | 2.455 | 62 |
| `v5_team_context` | 2.554 | -0.840 | -1.984 | 3.037 | 62 |
| `v6_usage_share` | 2.554 | -0.840 | -1.984 | 3.037 | 62 |
| `v7_regression_to_mean` | 2.462 | -0.816 | -1.788 | 2.935 | 62 |
| `v8_best_combo` | **1.633** | +0.087 | **-0.518** | **2.173** | 62 |
| `external_fantasypros_v1` | — | — | — | — | — |
