# Projection Model Accuracy Report

_Generated: 2026-03-17 19:13_

Metrics: **MAE** = Mean Absolute Error (lower is better), **Bias** = Mean signed error (positive = under-projection), **R²** = Goodness of fit (higher is better), **RMSE** = Root mean square error, **N** = player sample size.

## Season 2022

### ALL

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 2.237 | -0.004 | 0.621 | 3.014 | 154 |
| `v2_age_adjusted` | **2.145** | -0.122 | **0.638** | **2.944** | 154 |
| `v3_stat_weighted` | 2.659 | +0.133 | 0.380 | 3.854 | 154 |
| `v4_availability_adjusted` | 2.726 | +0.567 | 0.356 | 3.928 | 154 |
| `v5_team_context` | 3.288 | -0.322 | 0.189 | 4.408 | 154 |
| `v6_usage_share` | 4.646 | -1.778 | -1.829 | 8.235 | 154 |
| `external_fantasypros_v1` | 2.768 | +1.662 | 0.540 | 3.668 | 133 |

### QB

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 3.689 | -0.246 | 0.169 | 4.688 | 36 |
| `v2_age_adjusted` | **3.647** | -0.381 | **0.183** | **4.646** | 36 |
| `v3_stat_weighted` | 4.702 | +0.265 | -0.485 | 6.264 | 36 |
| `v4_availability_adjusted` | 4.972 | +1.035 | -0.579 | 6.459 | 36 |
| `v5_team_context` | 5.261 | +0.268 | -0.787 | 6.871 | 36 |
| `v6_usage_share` | 6.662 | -0.709 | -1.719 | 8.476 | 36 |
| `external_fantasypros_v1` | 4.669 | +3.096 | -0.055 | 5.825 | 32 |

### RB

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 2.695 | -0.896 | 0.498 | 3.257 | 25 |
| `v2_age_adjusted` | **2.678** | -0.708 | **0.512** | **3.211** | 25 |
| `v3_stat_weighted` | 3.087 | -0.644 | 0.266 | 3.939 | 25 |
| `v4_availability_adjusted` | 2.950 | +0.268 | 0.338 | 3.741 | 25 |
| `v5_team_context` | 3.568 | -0.416 | 0.160 | 4.216 | 25 |
| `v6_usage_share` | 6.491 | -3.872 | -4.703 | 10.982 | 25 |
| `external_fantasypros_v1` | **2.643** | +1.210 | **0.579** | **3.179** | 30 |

### WR

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 1.859 | +0.557 | 0.636 | 2.172 | 33 |
| `v2_age_adjusted` | **1.487** | +0.224 | **0.733** | **1.860** | 33 |
| `v3_stat_weighted` | **1.797** | +0.551 | 0.604 | 2.264 | 33 |
| `v4_availability_adjusted` | **1.746** | +0.718 | 0.613 | 2.239 | 33 |
| `v5_team_context` | 2.480 | -0.045 | 0.311 | 2.987 | 33 |
| `v6_usage_share` | 3.077 | -0.852 | -0.170 | 3.893 | 33 |
| `external_fantasypros_v1` | 1.927 | +1.295 | 0.623 | 2.401 | 36 |

### TE

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 1.557 | +0.266 | 0.571 | 1.867 | 36 |
| `v2_age_adjusted` | **1.546** | +0.158 | **0.577** | **1.854** | 36 |
| `v3_stat_weighted` | 2.119 | +0.261 | 0.123 | 2.670 | 36 |
| `v4_availability_adjusted` | 2.224 | +0.507 | 0.045 | 2.785 | 36 |
| `v5_team_context` | 2.477 | -0.592 | -0.273 | 3.217 | 36 |
| `v6_usage_share` | 4.306 | -2.704 | -13.218 | 10.749 | 36 |
| `external_fantasypros_v1` | 2.001 | +1.117 | 0.368 | 2.346 | 35 |

### K

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 1.124 | +0.113 | -1.262 | 1.606 | 24 |
| `v2_age_adjusted` | 1.141 | -0.022 | **-1.256** | **1.604** | 24 |
| `v3_stat_weighted` | 1.141 | -0.022 | **-1.256** | **1.604** | 24 |
| `v4_availability_adjusted` | 1.226 | +0.062 | -1.895 | 1.817 | 24 |
| `v5_team_context` | 2.365 | -1.085 | -5.602 | 2.743 | 24 |
| `v6_usage_share` | 2.365 | -1.085 | -5.602 | 2.743 | 24 |
| `external_fantasypros_v1` | — | — | — | — | — |

## Season 2023

### ALL

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 2.680 | -0.094 | 0.438 | 3.745 | 188 |
| `v2_age_adjusted` | **2.668** | -0.165 | 0.436 | 3.752 | 188 |
| `v3_stat_weighted` | 2.949 | -0.087 | 0.360 | 3.997 | 188 |
| `v4_availability_adjusted` | 2.959 | +0.402 | 0.312 | 4.145 | 188 |
| `v5_team_context` | 3.497 | -0.527 | 0.131 | 4.658 | 188 |
| `v6_usage_share` | 4.103 | -0.958 | -0.314 | 5.728 | 188 |
| `external_fantasypros_v1` | **2.267** | +1.633 | **0.630** | **3.196** | 176 |

### QB

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 3.918 | -0.856 | 0.169 | 5.296 | 39 |
| `v2_age_adjusted` | 3.950 | -1.002 | 0.144 | 5.374 | 39 |
| `v3_stat_weighted` | 4.372 | -0.898 | 0.074 | 5.590 | 39 |
| `v4_availability_adjusted` | 4.324 | +0.522 | 0.005 | 5.793 | 39 |
| `v5_team_context` | 4.905 | -0.182 | -0.188 | 6.331 | 39 |
| `v6_usage_share` | 6.159 | -0.891 | -1.174 | 8.566 | 39 |
| `external_fantasypros_v1` | **3.640** | +2.361 | 0.166 | **4.770** | 40 |

### RB

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 3.567 | +0.644 | -0.256 | 4.764 | 37 |
| `v2_age_adjusted` | **3.523** | +0.842 | **-0.244** | **4.740** | 37 |
| `v3_stat_weighted` | 3.804 | +0.605 | -0.335 | 4.910 | 37 |
| `v4_availability_adjusted` | 3.926 | +0.919 | -0.448 | 5.113 | 37 |
| `v5_team_context` | 4.617 | -0.048 | -0.864 | 5.802 | 37 |
| `v6_usage_share` | 5.087 | -0.046 | -1.398 | 6.581 | 37 |
| `external_fantasypros_v1` | **2.548** | +2.210 | **0.466** | **3.472** | 40 |

### WR

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 2.580 | +0.119 | 0.406 | 3.183 | 44 |
| `v2_age_adjusted` | 2.710 | -0.117 | 0.396 | 3.210 | 44 |
| `v3_stat_weighted` | 2.941 | +0.087 | 0.260 | 3.551 | 44 |
| `v4_availability_adjusted` | 2.976 | +0.336 | 0.191 | 3.713 | 44 |
| `v5_team_context` | 3.096 | -0.460 | 0.145 | 3.817 | 44 |
| `v6_usage_share` | 3.701 | -0.979 | -0.169 | 4.464 | 44 |
| `external_fantasypros_v1` | **1.903** | +1.239 | **0.602** | **2.450** | 49 |

### TE

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 1.809 | -0.299 | 0.406 | 2.226 | 44 |
| `v2_age_adjusted` | **1.664** | -0.350 | **0.466** | **2.110** | 44 |
| `v3_stat_weighted` | 2.025 | -0.114 | 0.185 | 2.607 | 44 |
| `v4_availability_adjusted` | 1.986 | +0.184 | 0.161 | 2.645 | 44 |
| `v5_team_context` | 2.668 | -0.880 | -0.421 | 3.442 | 44 |
| `v6_usage_share` | 3.147 | -1.575 | -0.956 | 4.038 | 44 |
| `external_fantasypros_v1` | **1.237** | +0.931 | **0.743** | **1.535** | 47 |

### K

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 1.081 | -0.013 | -0.538 | 1.276 | 24 |
| `v2_age_adjusted` | **1.028** | -0.104 | -0.544 | 1.279 | 24 |
| `v3_stat_weighted` | **1.028** | -0.104 | -0.544 | 1.279 | 24 |
| `v4_availability_adjusted` | **1.009** | -0.067 | **-0.528** | **1.272** | 24 |
| `v5_team_context` | 1.732 | -1.303 | -3.279 | 2.128 | 24 |
| `v6_usage_share` | 1.732 | -1.303 | -3.279 | 2.128 | 24 |
| `external_fantasypros_v1` | — | — | — | — | — |

## Season 2024

### ALL

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 2.709 | -0.031 | 0.445 | 3.642 | 241 |
| `v2_age_adjusted` | **2.683** | -0.050 | **0.465** | **3.575** | 241 |
| `v3_stat_weighted` | 2.800 | +0.012 | 0.393 | 3.808 | 241 |
| `v4_availability_adjusted` | 2.857 | +0.509 | 0.365 | 3.895 | 241 |
| `v5_team_context` | 3.300 | -0.403 | 0.247 | 4.242 | 241 |
| `v6_usage_share` | 4.066 | -1.347 | -0.343 | 5.666 | 241 |
| `external_fantasypros_v1` | 2.782 | +1.531 | **0.543** | **3.602** | 211 |

### QB

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 3.996 | -1.412 | 0.376 | 5.153 | 49 |
| `v2_age_adjusted` | **3.977** | -1.505 | **0.376** | **5.152** | 49 |
| `v3_stat_weighted` | 4.039 | -1.292 | 0.352 | 5.253 | 49 |
| `v4_availability_adjusted` | **3.948** | +0.120 | 0.360 | 5.218 | 49 |
| `v5_team_context` | 4.357 | -0.590 | 0.289 | 5.501 | 49 |
| `v6_usage_share` | 5.292 | -1.630 | -0.101 | 6.845 | 49 |
| `external_fantasypros_v1` | 4.015 | +2.650 | 0.313 | 5.163 | 47 |

### RB

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 3.064 | +0.495 | 0.166 | 4.055 | 49 |
| `v2_age_adjusted` | 3.114 | +0.773 | **0.199** | **3.975** | 49 |
| `v3_stat_weighted` | 3.353 | +0.818 | 0.023 | 4.391 | 49 |
| `v4_availability_adjusted` | 3.476 | +1.274 | -0.041 | 4.531 | 49 |
| `v5_team_context` | 3.634 | +0.460 | -0.068 | 4.589 | 49 |
| `v6_usage_share` | 3.912 | +0.332 | -0.264 | 4.992 | 49 |
| `external_fantasypros_v1` | 3.281 | +1.622 | **0.409** | **3.898** | 51 |

### WR

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 2.873 | +0.419 | -0.264 | 3.447 | 55 |
| `v2_age_adjusted` | **2.693** | +0.287 | **-0.106** | **3.225** | 55 |
| `v3_stat_weighted` | **2.712** | +0.366 | -0.299 | 3.495 | 55 |
| `v4_availability_adjusted` | **2.762** | +0.543 | -0.360 | 3.577 | 55 |
| `v5_team_context` | 3.104 | -0.397 | -0.693 | 3.990 | 55 |
| `v6_usage_share` | 4.785 | -2.481 | -4.630 | 7.276 | 55 |
| `external_fantasypros_v1` | **2.353** | +1.365 | **0.187** | **2.832** | 58 |

### TE

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 1.804 | +0.017 | 0.422 | 2.292 | 56 |
| `v2_age_adjusted` | 1.870 | -0.044 | 0.402 | 2.330 | 56 |
| `v3_stat_weighted` | 2.090 | -0.080 | 0.219 | 2.662 | 56 |
| `v4_availability_adjusted` | 2.142 | +0.132 | 0.193 | 2.706 | 56 |
| `v5_team_context` | 2.771 | -0.771 | -0.318 | 3.459 | 56 |
| `v6_usage_share` | 3.357 | -1.768 | -1.029 | 4.291 | 56 |
| `external_fantasypros_v1` | **1.719** | +0.666 | **0.486** | **2.106** | 55 |

### K

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 1.500 | +0.420 | -0.504 | 2.105 | 32 |
| `v2_age_adjusted` | **1.449** | +0.327 | **-0.376** | **2.013** | 32 |
| `v3_stat_weighted` | **1.449** | +0.327 | **-0.376** | **2.013** | 32 |
| `v4_availability_adjusted` | 1.654 | +0.532 | -1.152 | 2.517 | 32 |
| `v5_team_context` | 2.433 | -0.801 | -1.944 | 2.945 | 32 |
| `v6_usage_share` | 2.433 | -0.801 | -1.944 | 2.945 | 32 |
| `external_fantasypros_v1` | — | — | — | — | — |

## Season 2025

### ALL

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 2.904 | -1.145 | 0.428 | 3.880 | 261 |
| `v2_age_adjusted` | **2.791** | -1.083 | **0.461** | **3.765** | 261 |
| `v3_stat_weighted` | 3.282 | -0.644 | 0.275 | 4.369 | 261 |
| `v4_availability_adjusted` | 3.182 | -0.137 | 0.310 | 4.262 | 261 |
| `v5_team_context` | 3.561 | -1.031 | 0.183 | 4.635 | 261 |
| `v6_usage_share` | 4.729 | -2.518 | -1.198 | 7.604 | 261 |
| `external_fantasypros_v1` | **2.613** | +0.721 | **0.538** | **3.637** | 246 |

### QB

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 4.359 | -2.245 | 0.164 | 5.869 | 53 |
| `v2_age_adjusted` | 4.394 | -2.287 | 0.158 | 5.890 | 53 |
| `v3_stat_weighted` | 5.054 | -1.856 | 0.030 | 6.324 | 53 |
| `v4_availability_adjusted` | 4.579 | -0.379 | 0.141 | 5.950 | 53 |
| `v5_team_context` | 5.006 | -1.282 | 0.033 | 6.314 | 53 |
| `v6_usage_share` | 8.208 | -5.381 | -3.398 | 13.463 | 53 |
| `external_fantasypros_v1` | **4.124** | +2.526 | **0.202** | **5.673** | 52 |

### RB

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 2.995 | -0.940 | 0.553 | 3.608 | 54 |
| `v2_age_adjusted` | **2.830** | -0.610 | **0.608** | **3.380** | 54 |
| `v3_stat_weighted` | 3.850 | +0.305 | 0.197 | 4.838 | 54 |
| `v4_availability_adjusted` | 3.836 | +0.669 | 0.199 | 4.832 | 54 |
| `v5_team_context` | 3.812 | -0.306 | 0.160 | 4.947 | 54 |
| `v6_usage_share` | 4.735 | -1.625 | -0.382 | 6.347 | 54 |
| `external_fantasypros_v1` | **2.584** | +0.361 | **0.628** | **3.252** | 64 |

### WR

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 3.000 | -1.353 | -0.073 | 3.654 | 62 |
| `v2_age_adjusted` | **2.638** | -1.339 | **0.090** | **3.365** | 62 |
| `v3_stat_weighted` | 3.085 | -0.902 | -0.173 | 3.821 | 62 |
| `v4_availability_adjusted` | 3.079 | -0.698 | -0.182 | 3.836 | 62 |
| `v5_team_context` | 3.441 | -1.502 | -0.468 | 4.274 | 62 |
| `v6_usage_share` | 4.382 | -2.515 | -1.618 | 5.708 | 62 |
| `external_fantasypros_v1` | **2.398** | -0.494 | **0.333** | **3.004** | 66 |

### TE

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 1.994 | -0.658 | 0.476 | 2.536 | 62 |
| `v2_age_adjusted` | **1.961** | -0.632 | **0.523** | **2.418** | 62 |
| `v3_stat_weighted` | 2.126 | -0.385 | 0.326 | 2.875 | 62 |
| `v4_availability_adjusted` | 2.137 | -0.163 | 0.308 | 2.914 | 62 |
| `v5_team_context` | 2.664 | -1.054 | 0.010 | 3.485 | 62 |
| `v6_usage_share` | 3.100 | -1.652 | -0.318 | 4.021 | 62 |
| `external_fantasypros_v1` | **1.637** | +0.867 | **0.604** | **2.192** | 64 |

### K

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 1.846 | -0.151 | -0.792 | 2.411 | 30 |
| `v2_age_adjusted` | 1.925 | -0.209 | -0.853 | 2.452 | 30 |
| `v3_stat_weighted` | 1.925 | -0.209 | -0.853 | 2.452 | 30 |
| `v4_availability_adjusted` | 1.911 | +0.052 | **-0.688** | **2.340** | 30 |
| `v5_team_context` | 2.653 | -0.868 | -1.954 | 3.096 | 30 |
| `v6_usage_share` | 2.653 | -0.868 | -1.954 | 3.096 | 30 |
| `external_fantasypros_v1` | — | — | — | — | — |

## All Seasons Combined

_Weighted averages across all seasons (weighted by player count N). RMSE is approximated as √(weighted average of RMSE²). R² is a weighted average and should be interpreted as indicative only._

### ALL

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 2.677 | -0.385 | 0.470 | 3.637 | 844 |
| `v2_age_adjusted` | **2.615** | -0.408 | **0.489** | **3.571** | 844 |
| `v3_stat_weighted` | 2.956 | -0.191 | 0.347 | 4.039 | 844 |
| `v4_availability_adjusted` | 2.957 | +0.296 | 0.335 | 4.073 | 844 |
| `v5_team_context` | 3.422 | -0.610 | 0.191 | 4.490 | 844 |
| `v6_usage_share` | 4.385 | -1.701 | -0.872 | 6.836 | 844 |
| `external_fantasypros_v1` | **2.607** | +1.317 | **0.561** | **3.536** | 766 |

### QB

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 4.025 | -1.302 | 0.225 | 5.321 | 177 |
| `v2_age_adjusted` | 4.029 | -1.400 | 0.221 | 5.337 | 177 |
| `v3_stat_weighted` | 4.551 | -1.058 | 0.024 | 5.872 | 177 |
| `v4_availability_adjusted` | 4.428 | +0.245 | 0.025 | 5.833 | 177 |
| `v5_team_context` | 4.856 | -0.533 | -0.112 | 6.225 | 177 |
| `v6_usage_share` | 6.635 | -2.403 | -1.654 | 9.901 | 177 |
| `external_fantasypros_v1` | 4.083 | +2.628 | 0.176 | 5.365 | 171 |

### RB

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 3.099 | -0.152 | 0.248 | 3.980 | 165 |
| `v2_age_adjusted` | **3.047** | +0.111 | **0.281** | **3.877** | 165 |
| `v3_stat_weighted` | 3.576 | +0.381 | 0.036 | 4.598 | 165 |
| `v4_availability_adjusted` | 3.615 | +0.844 | 0.004 | 4.661 | 165 |
| `v5_team_context` | 3.903 | -0.037 | -0.137 | 4.950 | 165 |
| `v6_usage_share` | 4.835 | -1.030 | -1.229 | 6.969 | 165 |
| `external_fantasypros_v1` | **2.778** | +1.246 | **0.525** | **3.478** | 185 |

### WR

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 2.675 | -0.192 | 0.102 | 3.277 | 194 |
| `v2_age_adjusted` | **2.474** | -0.335 | **0.213** | **3.081** | 194 |
| `v3_stat_weighted` | 2.727 | -0.071 | 0.022 | 3.444 | 194 |
| `v4_availability_adjusted` | 2.739 | +0.129 | -0.013 | 3.508 | 194 |
| `v5_team_context` | 3.104 | -0.705 | -0.260 | 3.895 | 194 |
| `v6_usage_share` | 4.120 | -1.874 | -1.897 | 5.702 | 194 |
| `external_fantasypros_v1` | **2.189** | +0.737 | **0.405** | **2.734** | 209 |

### TE

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 1.820 | -0.219 | 0.462 | 2.288 | 198 |
| `v2_age_adjusted` | **1.794** | -0.260 | **0.486** | **2.232** | 198 |
| `v3_stat_weighted` | 2.092 | -0.121 | 0.228 | 2.720 | 198 |
| `v4_availability_adjusted` | 2.120 | +0.120 | 0.195 | 2.774 | 198 |
| `v5_team_context` | 2.661 | -0.852 | -0.230 | 3.421 | 198 |
| `v6_usage_share` | 3.402 | -1.859 | -3.006 | 5.908 | 198 |
| `external_fantasypros_v1` | **1.630** | +0.871 | **0.563** | **2.062** | 201 |

### K

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 1.421 | +0.103 | -0.755 | 1.947 | 110 |
| `v2_age_adjusted` | **1.420** | +0.010 | **-0.735** | **1.933** | 110 |
| `v3_stat_weighted` | **1.420** | +0.010 | **-0.735** | **1.933** | 110 |
| `v4_availability_adjusted` | 1.490 | +0.168 | -1.051 | 2.100 | 110 |
| `v5_team_context` | 2.325 | -0.991 | -3.036 | 2.787 | 110 |
| `v6_usage_share` | 2.325 | -0.991 | -3.036 | 2.787 | 110 |
| `external_fantasypros_v1` | — | — | — | — | — |
