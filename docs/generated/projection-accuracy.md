# Projection Model Accuracy Report

_Generated: 2026-03-17 20:22_

Metrics: **MAE** = Mean Absolute Error (lower is better), **Bias** = Mean signed error (positive = under-projection), **R²** = Goodness of fit (higher is better), **RMSE** = Root mean square error, **N** = player sample size.

## Season 2022

### ALL

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 2.224 | -0.001 | 0.626 | 2.992 | 154 |
| `v2_age_adjusted` | **2.185** | +0.129 | **0.640** | **2.936** | 154 |
| `v3_stat_weighted` | 2.660 | +0.133 | 0.379 | 3.858 | 154 |
| `v4_availability_adjusted` | 2.729 | +0.564 | 0.354 | 3.933 | 154 |
| `v5_team_context` | 3.290 | -0.325 | 0.188 | 4.412 | 154 |
| `v6_usage_share` | 4.323 | -1.554 | -1.614 | 7.915 | 154 |
| `external_fantasypros_v1` | 2.768 | +1.662 | 0.540 | 3.668 | 133 |

### QB

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 3.635 | -0.249 | 0.191 | 4.625 | 36 |
| `v2_age_adjusted` | **3.595** | +0.057 | **0.224** | **4.527** | 36 |
| `v3_stat_weighted` | 4.702 | +0.265 | -0.485 | 6.264 | 36 |
| `v4_availability_adjusted` | 4.977 | +1.027 | -0.580 | 6.461 | 36 |
| `v5_team_context` | 5.266 | +0.259 | -0.789 | 6.876 | 36 |
| `v6_usage_share` | 5.266 | +0.259 | -0.789 | 6.876 | 36 |
| `external_fantasypros_v1` | 4.669 | +3.096 | -0.055 | 5.825 | 32 |

### RB

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 2.689 | -0.876 | 0.502 | 3.246 | 25 |
| `v2_age_adjusted` | 2.755 | -0.762 | 0.491 | 3.281 | 25 |
| `v3_stat_weighted` | 3.099 | -0.657 | 0.258 | 3.961 | 25 |
| `v4_availability_adjusted` | 2.965 | +0.246 | 0.329 | 3.766 | 25 |
| `v5_team_context` | 3.583 | -0.437 | 0.151 | 4.237 | 25 |
| `v6_usage_share` | 6.484 | -3.861 | -4.626 | 10.908 | 25 |
| `external_fantasypros_v1` | **2.643** | +1.210 | **0.579** | **3.179** | 30 |

### WR

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 1.869 | +0.554 | 0.626 | 2.200 | 33 |
| `v2_age_adjusted` | **1.621** | +0.598 | **0.699** | **1.975** | 33 |
| `v3_stat_weighted` | **1.797** | +0.551 | 0.604 | 2.264 | 33 |
| `v4_availability_adjusted` | **1.746** | +0.716 | 0.613 | 2.239 | 33 |
| `v5_team_context` | 2.480 | -0.046 | 0.311 | 2.987 | 33 |
| `v6_usage_share` | 3.072 | -0.846 | -0.166 | 3.886 | 33 |
| `external_fantasypros_v1` | 1.927 | +1.295 | 0.623 | 2.401 | 36 |

### TE

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 1.538 | +0.260 | 0.581 | 1.845 | 36 |
| `v2_age_adjusted` | 1.596 | +0.478 | 0.557 | 1.896 | 36 |
| `v3_stat_weighted` | 2.119 | +0.261 | 0.123 | 2.670 | 36 |
| `v4_availability_adjusted` | 2.225 | +0.508 | 0.044 | 2.788 | 36 |
| `v5_team_context` | 2.478 | -0.591 | -0.274 | 3.218 | 36 |
| `v6_usage_share` | 4.339 | -2.735 | -13.680 | 10.922 | 36 |
| `external_fantasypros_v1` | 2.001 | +1.117 | 0.368 | 2.346 | 35 |

### K

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 1.141 | +0.129 | -1.296 | 1.618 | 24 |
| `v2_age_adjusted` | **1.137** | -0.006 | **-1.272** | **1.609** | 24 |
| `v3_stat_weighted` | **1.137** | -0.006 | **-1.272** | **1.609** | 24 |
| `v4_availability_adjusted` | 1.221 | +0.078 | -1.911 | 1.822 | 24 |
| `v5_team_context` | 2.354 | -1.070 | -5.536 | 2.730 | 24 |
| `v6_usage_share` | 2.354 | -1.070 | -5.536 | 2.730 | 24 |
| `external_fantasypros_v1` | — | — | — | — | — |

## Season 2023

### ALL

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 2.643 | -0.089 | 0.446 | 3.720 | 188 |
| `v2_age_adjusted` | **2.638** | +0.106 | 0.431 | 3.768 | 188 |
| `v3_stat_weighted` | 2.942 | -0.092 | 0.360 | 3.996 | 188 |
| `v4_availability_adjusted` | 2.954 | +0.396 | 0.312 | 4.144 | 188 |
| `v5_team_context` | 3.493 | -0.534 | 0.132 | 4.656 | 188 |
| `v6_usage_share` | 3.840 | -0.816 | -0.036 | 5.087 | 188 |
| `external_fantasypros_v1` | **2.267** | +1.633 | **0.630** | **3.196** | 176 |

### QB

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 3.847 | -0.835 | 0.181 | 5.258 | 39 |
| `v2_age_adjusted` | 3.947 | -0.559 | 0.155 | 5.341 | 39 |
| `v3_stat_weighted` | 4.350 | -0.920 | 0.075 | 5.588 | 39 |
| `v4_availability_adjusted` | 4.300 | +0.491 | 0.006 | 5.791 | 39 |
| `v5_team_context` | 4.883 | -0.213 | -0.183 | 6.317 | 39 |
| `v6_usage_share` | 4.883 | -0.213 | -0.183 | 6.317 | 39 |
| `external_fantasypros_v1` | **3.640** | +2.361 | 0.166 | **4.770** | 40 |

### RB

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 3.531 | +0.672 | -0.253 | 4.758 | 37 |
| `v2_age_adjusted` | **3.471** | +0.890 | -0.291 | 4.829 | 37 |
| `v3_stat_weighted` | 3.803 | +0.606 | -0.334 | 4.908 | 37 |
| `v4_availability_adjusted` | 3.926 | +0.918 | -0.447 | 5.113 | 37 |
| `v5_team_context` | 4.618 | -0.048 | -0.863 | 5.801 | 37 |
| `v6_usage_share` | 5.088 | -0.039 | -1.400 | 6.584 | 37 |
| `external_fantasypros_v1` | **2.548** | +2.210 | **0.466** | **3.472** | 40 |

### WR

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 2.558 | +0.107 | 0.422 | 3.139 | 44 |
| `v2_age_adjusted` | 2.699 | +0.275 | 0.376 | 3.261 | 44 |
| `v3_stat_weighted` | 2.946 | +0.082 | 0.258 | 3.557 | 44 |
| `v4_availability_adjusted` | 2.981 | +0.331 | 0.189 | 3.717 | 44 |
| `v5_team_context` | 3.102 | -0.465 | 0.142 | 3.824 | 44 |
| `v6_usage_share` | 3.708 | -0.983 | -0.172 | 4.470 | 44 |
| `external_fantasypros_v1` | **1.903** | +1.239 | **0.602** | **2.450** | 49 |

### TE

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 1.778 | -0.307 | 0.415 | 2.208 | 44 |
| `v2_age_adjusted` | **1.604** | -0.023 | **0.490** | **2.062** | 44 |
| `v3_stat_weighted` | 2.017 | -0.116 | 0.186 | 2.605 | 44 |
| `v4_availability_adjusted` | 1.981 | +0.185 | 0.161 | 2.645 | 44 |
| `v5_team_context` | 2.670 | -0.879 | -0.423 | 3.444 | 44 |
| `v6_usage_share` | 3.148 | -1.574 | -0.956 | 4.038 | 44 |
| `external_fantasypros_v1` | **1.237** | +0.931 | **0.743** | **1.535** | 47 |

### K

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 1.062 | -0.007 | -0.504 | 1.262 | 24 |
| `v2_age_adjusted` | **1.012** | -0.099 | -0.514 | 1.266 | 24 |
| `v3_stat_weighted` | **1.012** | -0.099 | -0.514 | 1.266 | 24 |
| `v4_availability_adjusted` | **0.999** | -0.061 | **-0.503** | **1.262** | 24 |
| `v5_team_context` | 1.728 | -1.298 | -3.245 | 2.120 | 24 |
| `v6_usage_share` | 1.728 | -1.298 | -3.245 | 2.120 | 24 |
| `external_fantasypros_v1` | — | — | — | — | — |

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
| `external_fantasypros_v1` | — | — | — | — | — |

## All Seasons Combined

_Weighted averages across all seasons (weighted by player count N). RMSE is approximated as √(weighted average of RMSE²). R² is a weighted average and should be interpreted as indicative only._

### ALL

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 2.666 | -0.389 | 0.472 | 3.630 | 844 |
| `v2_age_adjusted` | **2.584** | -0.120 | **0.499** | **3.534** | 844 |
| `v3_stat_weighted` | 2.953 | -0.196 | 0.347 | 4.039 | 844 |
| `v4_availability_adjusted` | 2.957 | +0.289 | 0.334 | 4.076 | 844 |
| `v5_team_context` | 3.424 | -0.618 | 0.190 | 4.493 | 844 |
| `v6_usage_share` | 4.012 | -1.315 | -0.392 | 5.864 | 844 |
| `external_fantasypros_v1` | **2.607** | +1.317 | **0.561** | **3.536** | 766 |

### QB

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 4.008 | -1.278 | 0.229 | 5.312 | 177 |
| `v2_age_adjusted` | **3.950** | -0.912 | **0.249** | **5.238** | 177 |
| `v3_stat_weighted` | 4.541 | -1.057 | 0.024 | 5.871 | 177 |
| `v4_availability_adjusted` | 4.433 | +0.235 | 0.023 | 5.841 | 177 |
| `v5_team_context` | 4.863 | -0.544 | -0.114 | 6.231 | 177 |
| `v6_usage_share` | 4.863 | -0.544 | -0.114 | 6.231 | 177 |
| `external_fantasypros_v1` | 4.083 | +2.628 | 0.176 | 5.365 | 171 |

### RB

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 3.065 | -0.170 | 0.252 | 3.968 | 165 |
| `v2_age_adjusted` | **2.989** | +0.181 | **0.287** | **3.846** | 165 |
| `v3_stat_weighted` | 3.565 | +0.365 | 0.036 | 4.599 | 165 |
| `v4_availability_adjusted` | 3.608 | +0.827 | 0.004 | 4.662 | 165 |
| `v5_team_context` | 3.898 | -0.054 | -0.138 | 4.952 | 165 |
| `v6_usage_share` | 4.823 | -1.036 | -1.212 | 6.942 | 165 |
| `external_fantasypros_v1` | **2.778** | +1.246 | **0.525** | **3.478** | 185 |

### WR

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 2.666 | -0.211 | 0.104 | 3.270 | 194 |
| `v2_age_adjusted` | **2.471** | +0.074 | **0.207** | **3.090** | 194 |
| `v3_stat_weighted` | 2.725 | -0.076 | 0.025 | 3.440 | 194 |
| `v4_availability_adjusted` | 2.738 | +0.124 | -0.011 | 3.505 | 194 |
| `v5_team_context` | 3.102 | -0.710 | -0.258 | 3.893 | 194 |
| `v6_usage_share` | 4.115 | -1.875 | -1.887 | 5.693 | 194 |
| `external_fantasypros_v1` | **2.189** | +0.737 | **0.405** | **2.734** | 209 |

### TE

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 1.817 | -0.225 | 0.467 | 2.280 | 198 |
| `v2_age_adjusted` | **1.777** | +0.073 | **0.492** | **2.214** | 198 |
| `v3_stat_weighted` | 2.092 | -0.126 | 0.228 | 2.720 | 198 |
| `v4_availability_adjusted` | 2.120 | +0.115 | 0.195 | 2.774 | 198 |
| `v5_team_context` | 2.664 | -0.856 | -0.231 | 3.422 | 198 |
| `v6_usage_share` | 3.410 | -1.870 | -3.092 | 5.966 | 198 |
| `external_fantasypros_v1` | **1.630** | +0.871 | **0.563** | **2.062** | 201 |

### K

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 1.438 | +0.105 | -0.778 | 1.966 | 110 |
| `v2_age_adjusted` | **1.430** | +0.013 | **-0.755** | **1.951** | 110 |
| `v3_stat_weighted` | **1.430** | +0.013 | **-0.755** | **1.951** | 110 |
| `v4_availability_adjusted` | 1.500 | +0.169 | -1.069 | 2.114 | 110 |
| `v5_team_context` | 2.330 | -0.990 | -3.034 | 2.794 | 110 |
| `v6_usage_share` | 2.330 | -0.990 | -3.034 | 2.794 | 110 |
| `external_fantasypros_v1` | — | — | — | — | — |
