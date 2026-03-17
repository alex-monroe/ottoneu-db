# Projection Model Accuracy Report

_Generated: 2026-03-16 20:52_

Metrics: **MAE** = Mean Absolute Error (lower is better), **Bias** = Mean signed error (positive = under-projection), **R²** = Goodness of fit (higher is better), **RMSE** = Root mean square error, **N** = player sample size.

## Season 2022

### ALL

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 2.237 | -0.004 | 0.621 | 3.014 | 154 |
| `v2_age_adjusted` | **2.145** | -0.122 | **0.638** | **2.944** | 154 |
| `v3_stat_weighted` | 2.481 | +0.005 | 0.493 | 3.484 | 154 |
| `v4_availability_adjusted` | 2.489 | +0.508 | 0.492 | 3.488 | 154 |
| `v5_team_context` | 3.019 | -0.246 | 0.331 | 4.005 | 154 |
| `v6_usage_share` | 3.897 | -1.113 | -0.648 | 6.284 | 154 |

### QB

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 3.689 | -0.246 | 0.169 | 4.688 | 36 |
| `v2_age_adjusted` | **3.647** | -0.381 | **0.183** | **4.646** | 36 |
| `v3_stat_weighted` | 3.951 | -0.601 | -0.049 | 5.264 | 36 |
| `v4_availability_adjusted` | 4.041 | +0.463 | -0.077 | 5.336 | 36 |
| `v5_team_context` | 4.456 | -0.134 | -0.315 | 5.894 | 36 |
| `v6_usage_share` | 4.456 | -0.134 | -0.315 | 5.894 | 36 |

### RB

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 2.695 | -0.896 | 0.498 | 3.257 | 25 |
| `v2_age_adjusted` | **2.678** | -0.708 | **0.512** | **3.211** | 25 |
| `v3_stat_weighted` | **2.670** | -0.531 | 0.420 | 3.502 | 25 |
| `v4_availability_adjusted` | **2.484** | +0.380 | **0.544** | **3.107** | 25 |
| `v5_team_context` | 2.981 | -0.225 | 0.406 | 3.546 | 25 |
| `v6_usage_share` | 5.404 | -2.487 | -3.951 | 10.232 | 25 |

### WR

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 1.859 | +0.557 | 0.636 | 2.172 | 33 |
| `v2_age_adjusted` | **1.487** | +0.224 | **0.733** | **1.860** | 33 |
| `v3_stat_weighted` | 1.910 | +0.474 | 0.487 | 2.577 | 33 |
| `v4_availability_adjusted` | **1.859** | +0.640 | 0.491 | 2.567 | 33 |
| `v5_team_context` | 2.720 | -0.108 | 0.121 | 3.376 | 33 |
| `v6_usage_share` | 4.519 | -2.026 | -2.605 | 6.835 | 33 |

### TE

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 1.557 | +0.266 | 0.571 | 1.867 | 36 |
| `v2_age_adjusted` | **1.546** | +0.158 | **0.577** | **1.854** | 36 |
| `v3_stat_weighted` | 2.296 | +0.571 | 0.028 | 2.811 | 36 |
| `v4_availability_adjusted` | 2.360 | +0.817 | -0.060 | 2.936 | 36 |
| `v5_team_context` | 2.470 | -0.042 | -0.315 | 3.269 | 36 |
| `v6_usage_share` | 2.893 | -0.420 | -0.803 | 3.828 | 36 |

### K

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 1.124 | +0.113 | -1.262 | 1.606 | 24 |
| `v2_age_adjusted` | 1.141 | -0.022 | **-1.256** | **1.604** | 24 |
| `v3_stat_weighted` | 1.141 | -0.022 | **-1.256** | **1.604** | 24 |
| `v4_availability_adjusted` | 1.226 | +0.062 | -1.895 | 1.817 | 24 |
| `v5_team_context` | 2.138 | -0.933 | -4.283 | 2.454 | 24 |
| `v6_usage_share` | 2.138 | -0.933 | -4.283 | 2.454 | 24 |

## Season 2023

### ALL

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 2.680 | -0.094 | 0.438 | 3.745 | 188 |
| `v2_age_adjusted` | **2.668** | -0.165 | 0.436 | 3.752 | 188 |
| `v3_stat_weighted` | 3.208 | +0.189 | 0.263 | 4.289 | 188 |
| `v4_availability_adjusted` | 3.286 | +0.658 | 0.188 | 4.502 | 188 |
| `v5_team_context` | 3.593 | -0.127 | 0.093 | 4.760 | 188 |
| `v6_usage_share` | 4.129 | -0.680 | -0.251 | 5.590 | 188 |

### QB

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 3.918 | -0.856 | 0.169 | 5.296 | 39 |
| `v2_age_adjusted` | 3.950 | -1.002 | 0.144 | 5.374 | 39 |
| `v3_stat_weighted` | 5.299 | +0.143 | -0.232 | 6.449 | 39 |
| `v4_availability_adjusted` | 5.548 | +1.465 | -0.389 | 6.846 | 39 |
| `v5_team_context` | 5.572 | +0.816 | -0.379 | 6.821 | 39 |
| `v6_usage_share` | 5.572 | +0.816 | -0.379 | 6.821 | 39 |

### RB

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 3.567 | +0.644 | -0.256 | 4.764 | 37 |
| `v2_age_adjusted` | **3.523** | +0.842 | **-0.244** | **4.740** | 37 |
| `v3_stat_weighted` | 3.976 | +0.802 | -0.400 | 5.028 | 37 |
| `v4_availability_adjusted` | 4.155 | +1.115 | -0.542 | 5.278 | 37 |
| `v5_team_context` | 4.505 | +0.443 | -0.738 | 5.603 | 37 |
| `v6_usage_share` | 5.260 | +0.067 | -2.045 | 7.416 | 37 |

### WR

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 2.580 | +0.119 | 0.406 | 3.183 | 44 |
| `v2_age_adjusted` | 2.710 | -0.117 | 0.396 | 3.210 | 44 |
| `v3_stat_weighted` | 2.982 | +0.175 | 0.267 | 3.536 | 44 |
| `v4_availability_adjusted` | 3.012 | +0.423 | 0.212 | 3.664 | 44 |
| `v5_team_context` | 3.078 | -0.269 | 0.111 | 3.893 | 44 |
| `v6_usage_share` | 3.797 | -1.202 | -0.315 | 4.736 | 44 |

### TE

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 1.809 | -0.299 | 0.406 | 2.226 | 44 |
| `v2_age_adjusted` | **1.664** | -0.350 | **0.466** | **2.110** | 44 |
| `v3_stat_weighted` | 2.124 | -0.110 | 0.148 | 2.665 | 44 |
| `v4_availability_adjusted` | 2.066 | +0.187 | 0.123 | 2.705 | 44 |
| `v5_team_context` | 2.619 | -0.765 | -0.402 | 3.419 | 44 |
| `v6_usage_share` | 3.555 | -1.879 | -1.548 | 4.609 | 44 |

### K

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 1.081 | -0.013 | -0.538 | 1.276 | 24 |
| `v2_age_adjusted` | **1.028** | -0.104 | -0.544 | 1.279 | 24 |
| `v3_stat_weighted` | **1.028** | -0.104 | -0.544 | 1.279 | 24 |
| `v4_availability_adjusted` | **1.009** | -0.067 | **-0.528** | **1.272** | 24 |
| `v5_team_context` | 1.700 | -1.106 | -3.057 | 2.073 | 24 |
| `v6_usage_share` | 1.700 | -1.106 | -3.057 | 2.073 | 24 |

## Season 2024

### ALL

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 2.709 | -0.031 | 0.445 | 3.642 | 241 |
| `v2_age_adjusted` | **2.683** | -0.050 | **0.465** | **3.575** | 241 |
| `v3_stat_weighted` | 2.911 | +0.044 | 0.361 | 3.908 | 241 |
| `v4_availability_adjusted` | 2.953 | +0.545 | 0.348 | 3.949 | 241 |
| `v5_team_context` | 3.371 | -0.397 | 0.231 | 4.288 | 241 |
| `v6_usage_share` | 3.869 | -1.004 | -0.119 | 5.172 | 241 |

### QB

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 3.996 | -1.412 | 0.376 | 5.153 | 49 |
| `v2_age_adjusted` | **3.977** | -1.505 | **0.376** | **5.152** | 49 |
| `v3_stat_weighted` | 4.520 | -1.686 | 0.248 | 5.657 | 49 |
| `v4_availability_adjusted` | 4.325 | -0.246 | 0.298 | 5.464 | 49 |
| `v5_team_context` | 4.605 | -1.058 | 0.241 | 5.681 | 49 |
| `v6_usage_share` | 4.605 | -1.058 | 0.241 | 5.681 | 49 |

### RB

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 3.064 | +0.495 | 0.166 | 4.055 | 49 |
| `v2_age_adjusted` | 3.114 | +0.773 | **0.199** | **3.975** | 49 |
| `v3_stat_weighted` | 3.414 | +1.064 | -0.000 | 4.442 | 49 |
| `v4_availability_adjusted` | 3.537 | +1.521 | -0.065 | 4.582 | 49 |
| `v5_team_context` | 3.694 | +0.643 | -0.098 | 4.654 | 49 |
| `v6_usage_share` | 4.000 | +0.479 | -0.256 | 4.977 | 49 |

### WR

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 2.873 | +0.419 | -0.264 | 3.447 | 55 |
| `v2_age_adjusted` | **2.693** | +0.287 | **-0.106** | **3.225** | 55 |
| `v3_stat_weighted` | **2.648** | +0.520 | **-0.175** | **3.325** | 55 |
| `v4_availability_adjusted` | **2.721** | +0.697 | **-0.240** | **3.415** | 55 |
| `v5_team_context` | 3.155 | -0.197 | -0.589 | 3.866 | 55 |
| `v6_usage_share` | 4.626 | -1.984 | -3.543 | 6.536 | 55 |

### TE

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 1.804 | +0.017 | 0.422 | 2.292 | 56 |
| `v2_age_adjusted` | 1.870 | -0.044 | 0.402 | 2.330 | 56 |
| `v3_stat_weighted` | 2.155 | +0.038 | 0.198 | 2.698 | 56 |
| `v4_availability_adjusted` | 2.214 | +0.242 | 0.170 | 2.745 | 56 |
| `v5_team_context` | 2.753 | -0.639 | -0.309 | 3.447 | 56 |
| `v6_usage_share` | 3.184 | -1.351 | -0.966 | 4.225 | 56 |

### K

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 1.500 | +0.420 | -0.504 | 2.105 | 32 |
| `v2_age_adjusted` | **1.449** | +0.327 | **-0.376** | **2.013** | 32 |
| `v3_stat_weighted` | **1.449** | +0.327 | **-0.376** | **2.013** | 32 |
| `v4_availability_adjusted` | 1.654 | +0.532 | -1.152 | 2.517 | 32 |
| `v5_team_context` | 2.438 | -0.898 | -2.206 | 3.073 | 32 |
| `v6_usage_share` | 2.438 | -0.898 | -2.206 | 3.073 | 32 |

## Season 2025

### ALL

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 2.904 | -1.145 | 0.428 | 3.880 | 261 |
| `v2_age_adjusted` | **2.791** | -1.083 | **0.461** | **3.765** | 261 |
| `v3_stat_weighted` | 3.215 | -0.678 | 0.285 | 4.335 | 261 |
| `v4_availability_adjusted` | 3.155 | -0.170 | 0.315 | 4.246 | 261 |
| `v5_team_context` | 3.528 | -1.074 | 0.178 | 4.649 | 261 |
| `v6_usage_share` | 4.071 | -1.762 | -0.189 | 5.594 | 261 |

### QB

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 4.359 | -2.245 | 0.164 | 5.869 | 53 |
| `v2_age_adjusted` | 4.394 | -2.287 | 0.158 | 5.890 | 53 |
| `v3_stat_weighted` | 4.908 | -1.880 | 0.061 | 6.220 | 53 |
| `v4_availability_adjusted` | 4.568 | -0.403 | 0.153 | 5.907 | 53 |
| `v5_team_context` | 4.928 | -1.361 | 0.031 | 6.319 | 53 |
| `v6_usage_share` | 4.928 | -1.361 | 0.031 | 6.319 | 53 |

### RB

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 2.995 | -0.940 | 0.553 | 3.608 | 54 |
| `v2_age_adjusted` | **2.830** | -0.610 | **0.608** | **3.380** | 54 |
| `v3_stat_weighted` | 3.812 | +0.373 | 0.160 | 4.947 | 54 |
| `v4_availability_adjusted` | 3.822 | +0.738 | 0.164 | 4.935 | 54 |
| `v5_team_context` | 3.796 | -0.241 | 0.145 | 4.990 | 54 |
| `v6_usage_share` | 4.719 | -1.370 | -0.518 | 6.652 | 54 |

### WR

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 3.000 | -1.353 | -0.073 | 3.654 | 62 |
| `v2_age_adjusted` | **2.638** | -1.339 | **0.090** | **3.365** | 62 |
| `v3_stat_weighted` | 3.126 | -0.980 | -0.183 | 3.837 | 62 |
| `v4_availability_adjusted` | 3.152 | -0.776 | -0.205 | 3.872 | 62 |
| `v5_team_context` | 3.455 | -1.541 | -0.492 | 4.310 | 62 |
| `v6_usage_share` | 3.984 | -2.330 | -1.282 | 5.329 | 62 |

### TE

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 1.994 | -0.658 | 0.476 | 2.536 | 62 |
| `v2_age_adjusted` | **1.961** | -0.632 | **0.523** | **2.418** | 62 |
| `v3_stat_weighted` | **1.961** | -0.492 | 0.420 | 2.667 | 62 |
| `v4_availability_adjusted` | **1.970** | -0.264 | 0.413 | 2.685 | 62 |
| `v5_team_context` | 2.560 | -1.203 | 0.060 | 3.396 | 62 |
| `v6_usage_share` | 3.515 | -2.328 | -1.087 | 5.061 | 62 |

### K

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 1.846 | -0.151 | -0.792 | 2.411 | 30 |
| `v2_age_adjusted` | 1.925 | -0.209 | -0.853 | 2.452 | 30 |
| `v3_stat_weighted` | 1.925 | -0.209 | -0.853 | 2.452 | 30 |
| `v4_availability_adjusted` | 1.911 | +0.052 | **-0.688** | **2.340** | 30 |
| `v5_team_context` | 2.723 | -0.834 | -2.211 | 3.228 | 30 |
| `v6_usage_share` | 2.723 | -0.834 | -2.211 | 3.228 | 30 |

## All Seasons Combined

_Weighted averages across all seasons (weighted by player count N). RMSE is approximated as √(weighted average of RMSE²). R² is a weighted average and should be interpreted as indicative only._

### ALL

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 2.677 | -0.385 | 0.470 | 3.637 | 844 |
| `v2_age_adjusted` | **2.615** | -0.408 | **0.489** | **3.571** | 844 |
| `v3_stat_weighted` | 2.993 | -0.154 | 0.340 | 4.060 | 844 |
| `v4_availability_adjusted` | 3.005 | +0.342 | 0.328 | 4.094 | 844 |
| `v5_team_context` | 3.405 | -0.519 | 0.202 | 4.462 | 844 |
| `v6_usage_share` | 3.995 | -1.186 | -0.267 | 5.611 | 844 |

### QB

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 4.025 | -1.302 | 0.225 | 5.321 | 177 |
| `v2_age_adjusted` | 4.029 | -1.400 | 0.221 | 5.337 | 177 |
| `v3_stat_weighted` | 4.692 | -1.121 | 0.026 | 5.936 | 177 |
| `v4_availability_adjusted` | 4.609 | +0.228 | 0.027 | 5.902 | 177 |
| `v5_team_context` | 4.885 | -0.548 | -0.071 | 6.181 | 177 |
| `v6_usage_share` | 4.885 | -0.548 | -0.071 | 6.181 | 177 |

### RB

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 3.099 | -0.152 | 0.248 | 3.980 | 165 |
| `v2_age_adjusted` | **3.047** | +0.111 | **0.281** | **3.877** | 165 |
| `v3_stat_weighted` | 3.557 | +0.537 | 0.026 | 4.625 | 165 |
| `v4_availability_adjusted` | 3.609 | +1.001 | -0.005 | 4.681 | 165 |
| `v5_team_context` | 3.801 | +0.177 | -0.085 | 4.850 | 165 |
| `v6_usage_share` | 4.731 | -0.668 | -1.303 | 7.073 | 165 |

### WR

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 2.675 | -0.192 | 0.102 | 3.277 | 194 |
| `v2_age_adjusted` | **2.474** | -0.335 | **0.213** | **3.081** | 194 |
| `v3_stat_weighted` | 2.751 | -0.045 | 0.035 | 3.436 | 194 |
| `v4_availability_adjusted` | 2.778 | +0.155 | -0.002 | 3.502 | 194 |
| `v5_team_context` | 3.159 | -0.628 | -0.279 | 3.943 | 194 |
| `v6_usage_share` | 4.215 | -1.925 | -1.929 | 5.850 | 194 |

### TE

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 1.820 | -0.219 | 0.462 | 2.288 | 198 |
| `v2_age_adjusted` | **1.794** | -0.260 | **0.486** | **2.232** | 198 |
| `v3_stat_weighted` | 2.113 | -0.064 | 0.226 | 2.702 | 198 |
| `v4_availability_adjusted` | 2.131 | +0.176 | 0.193 | 2.753 | 198 |
| `v5_team_context` | 2.611 | -0.735 | -0.215 | 3.393 | 198 |
| `v6_usage_share` | 3.317 | -1.605 | -1.104 | 4.523 | 198 |

### K

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 1.421 | +0.103 | -0.755 | 1.947 | 110 |
| `v2_age_adjusted` | **1.420** | +0.010 | **-0.735** | **1.933** | 110 |
| `v3_stat_weighted` | **1.420** | +0.010 | **-0.735** | **1.933** | 110 |
| `v4_availability_adjusted` | 1.490 | +0.168 | -1.051 | 2.100 | 110 |
| `v5_team_context` | 2.289 | -0.934 | -2.846 | 2.800 | 110 |
| `v6_usage_share` | 2.289 | -0.934 | -2.846 | 2.800 | 110 |
