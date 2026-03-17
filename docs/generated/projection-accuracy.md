# Projection Model Accuracy Report

_Generated: 2026-03-16 18:06_

Metrics: **MAE** = Mean Absolute Error (lower is better), **Bias** = Mean signed error (positive = under-projection), **R²** = Goodness of fit (higher is better), **RMSE** = Root mean square error, **N** = player sample size.

## Season 2022

### ALL

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 2.237 | -0.004 | 0.621 | 3.014 | 154 |
| `v2_age_adjusted` | **2.185** | -0.150 | **0.630** | **2.978** | 154 |
| `v3_stat_weighted` | 2.543 | -0.023 | 0.490 | 3.497 | 154 |
| `v4_availability_adjusted` | 3.080 | +1.886 | 0.241 | 4.265 | 154 |
| `v5_team_context` | 3.300 | +1.107 | 0.191 | 4.402 | 154 |
| `v6_usage_share` | 4.336 | -0.235 | -0.920 | 6.783 | 154 |

### QB

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 3.689 | -0.246 | 0.169 | 4.688 | 36 |
| `v2_age_adjusted` | **3.640** | -0.695 | **0.180** | **4.654** | 36 |
| `v3_stat_weighted` | 4.039 | -0.916 | -0.044 | 5.252 | 36 |
| `v4_availability_adjusted` | 4.683 | +2.674 | -0.460 | 6.210 | 36 |
| `v5_team_context` | 4.899 | +2.022 | -0.540 | 6.379 | 36 |
| `v6_usage_share` | 6.154 | -0.010 | -1.960 | 8.844 | 36 |

### RB

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 2.695 | -0.896 | 0.498 | 3.257 | 25 |
| `v2_age_adjusted` | 2.824 | -0.270 | 0.476 | 3.329 | 25 |
| `v3_stat_weighted` | 2.893 | -0.093 | 0.388 | 3.597 | 25 |
| `v4_availability_adjusted` | 4.017 | +2.719 | -0.135 | 4.899 | 25 |
| `v5_team_context` | 3.935 | +2.058 | -0.042 | 4.694 | 25 |
| `v6_usage_share` | 5.745 | -0.204 | -3.134 | 9.350 | 25 |

### WR

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 1.859 | +0.557 | 0.636 | 2.172 | 33 |
| `v2_age_adjusted` | **1.487** | +0.224 | **0.733** | **1.860** | 33 |
| `v3_stat_weighted` | 1.910 | +0.474 | 0.487 | 2.577 | 33 |
| `v4_availability_adjusted` | 2.386 | +1.599 | 0.285 | 3.043 | 33 |
| `v5_team_context` | 2.713 | +0.850 | 0.040 | 3.527 | 33 |
| `v6_usage_share` | 4.369 | -1.068 | -2.258 | 6.497 | 33 |

### TE

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 1.557 | +0.266 | 0.571 | 1.867 | 36 |
| `v2_age_adjusted` | 1.624 | +0.049 | 0.544 | 1.925 | 36 |
| `v3_stat_weighted` | 2.320 | +0.462 | 0.022 | 2.820 | 36 |
| `v4_availability_adjusted` | 2.664 | +1.525 | -0.344 | 3.304 | 36 |
| `v5_team_context` | 2.624 | +0.652 | -0.403 | 3.377 | 36 |
| `v6_usage_share` | 3.026 | +0.274 | -0.861 | 3.889 | 36 |

### K

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 1.124 | +0.113 | -1.262 | 1.606 | 24 |
| `v2_age_adjusted` | 1.141 | -0.022 | **-1.256** | **1.604** | 24 |
| `v3_stat_weighted` | 1.141 | -0.022 | **-1.256** | **1.604** | 24 |
| `v4_availability_adjusted` | 1.277 | +0.773 | -3.165 | 2.179 | 24 |
| `v5_team_context` | 2.059 | -0.223 | -4.376 | 2.475 | 24 |
| `v6_usage_share` | 2.059 | -0.223 | -4.376 | 2.475 | 24 |

## Season 2023

### ALL

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 2.680 | -0.094 | 0.438 | 3.745 | 188 |
| `v2_age_adjusted` | 2.701 | -0.157 | 0.404 | 3.857 | 188 |
| `v3_stat_weighted` | 3.170 | +0.197 | 0.243 | 4.349 | 188 |
| `v4_availability_adjusted` | 3.461 | +1.997 | 0.009 | 4.975 | 188 |
| `v5_team_context` | 3.631 | +1.214 | -0.019 | 5.045 | 188 |
| `v6_usage_share` | 4.144 | +0.725 | -0.314 | 5.728 | 188 |

### QB

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 3.918 | -0.856 | 0.169 | 5.296 | 39 |
| `v2_age_adjusted` | 4.139 | -1.343 | 0.062 | 5.627 | 39 |
| `v3_stat_weighted` | 5.363 | -0.198 | -0.298 | 6.619 | 39 |
| `v4_availability_adjusted` | 5.853 | +3.525 | -0.675 | 7.518 | 39 |
| `v5_team_context` | 5.665 | +2.890 | -0.574 | 7.288 | 39 |
| `v6_usage_share` | 6.066 | +3.197 | -0.758 | 7.702 | 39 |

### RB

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 3.567 | +0.644 | -0.256 | 4.764 | 37 |
| `v2_age_adjusted` | 3.569 | +1.302 | -0.314 | 4.872 | 37 |
| `v3_stat_weighted` | 3.870 | +1.262 | -0.437 | 5.095 | 37 |
| `v4_availability_adjusted` | 4.387 | +3.105 | -1.002 | 6.013 | 37 |
| `v5_team_context` | 4.675 | +2.437 | -1.113 | 6.178 | 37 |
| `v6_usage_share` | 5.447 | +2.061 | -2.074 | 7.452 | 37 |

### WR

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 2.580 | +0.119 | 0.406 | 3.183 | 44 |
| `v2_age_adjusted` | 2.710 | -0.117 | 0.396 | 3.210 | 44 |
| `v3_stat_weighted` | 2.982 | +0.175 | 0.267 | 3.536 | 44 |
| `v4_availability_adjusted` | 3.030 | +1.614 | 0.069 | 3.983 | 44 |
| `v5_team_context` | 3.109 | +0.921 | 0.031 | 4.065 | 44 |
| `v6_usage_share` | 3.468 | -0.012 | -0.168 | 4.463 | 44 |

### TE

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 1.809 | -0.299 | 0.406 | 2.226 | 44 |
| `v2_age_adjusted` | **1.599** | -0.402 | **0.481** | **2.079** | 44 |
| `v3_stat_weighted` | 1.995 | -0.162 | 0.189 | 2.600 | 44 |
| `v4_availability_adjusted` | 2.100 | +0.869 | 0.099 | 2.741 | 44 |
| `v5_team_context` | 2.471 | -0.091 | -0.266 | 3.248 | 44 |
| `v6_usage_share` | 3.298 | -1.203 | -1.216 | 4.298 | 44 |

### K

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 1.081 | -0.013 | -0.538 | 1.276 | 24 |
| `v2_age_adjusted` | **1.028** | -0.104 | -0.544 | 1.279 | 24 |
| `v3_stat_weighted` | **1.028** | -0.104 | -0.544 | 1.279 | 24 |
| `v4_availability_adjusted` | 1.433 | +0.574 | -2.218 | 1.846 | 24 |
| `v5_team_context` | 1.802 | -0.466 | -3.321 | 2.139 | 24 |
| `v6_usage_share` | 1.802 | -0.466 | -3.321 | 2.139 | 24 |

## Season 2024

### ALL

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 2.725 | +0.046 | 0.427 | 3.706 | 240 |
| `v2_age_adjusted` | 2.835 | +0.094 | 0.410 | 3.760 | 240 |
| `v3_stat_weighted` | 3.801 | +0.995 | 0.022 | 4.841 | 240 |
| `v4_availability_adjusted` | 4.084 | +2.653 | -0.123 | 5.189 | 240 |
| `v5_team_context` | 4.085 | +1.740 | -0.070 | 5.064 | 240 |
| `v6_usage_share` | 6.084 | -0.531 | -23.388 | 24.174 | 240 |

### QB

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 3.950 | -1.133 | 0.351 | 5.254 | 49 |
| `v2_age_adjusted` | 4.182 | -1.481 | 0.308 | 5.424 | 49 |
| `v3_stat_weighted` | 4.725 | -1.904 | 0.219 | 5.764 | 49 |
| `v4_availability_adjusted` | 4.949 | +2.368 | 0.122 | 6.111 | 49 |
| `v5_team_context` | 5.221 | +1.587 | 0.104 | 6.175 | 49 |
| `v6_usage_share` | 13.077 | -6.499 | -63.444 | 52.366 | 49 |

### RB

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 3.130 | +0.610 | 0.152 | 4.090 | 49 |
| `v2_age_adjusted` | 3.433 | +1.535 | 0.110 | 4.189 | 49 |
| `v3_stat_weighted` | 3.787 | +1.712 | -0.057 | 4.567 | 49 |
| `v4_availability_adjusted` | 4.597 | +3.443 | -0.552 | 5.533 | 49 |
| `v5_team_context` | 4.094 | +2.515 | -0.345 | 5.151 | 49 |
| `v6_usage_share` | 4.153 | +2.292 | -0.399 | 5.252 | 49 |

### WR

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 2.918 | +0.367 | -0.344 | 3.555 | 55 |
| `v2_age_adjusted` | **2.790** | +0.235 | **-0.209** | **3.371** | 55 |
| `v3_stat_weighted` | **2.648** | +0.520 | **-0.175** | **3.325** | 55 |
| `v4_availability_adjusted` | **2.798** | +1.434 | -0.374 | 3.594 | 55 |
| `v5_team_context` | 3.103 | +0.540 | -0.550 | 3.818 | 55 |
| `v6_usage_share` | 4.425 | -1.232 | -2.981 | 6.118 | 55 |

### TE

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 1.809 | +0.053 | 0.423 | 2.289 | 56 |
| `v2_age_adjusted` | 1.962 | -0.069 | 0.328 | 2.471 | 56 |
| `v3_stat_weighted` | 2.213 | -0.027 | 0.152 | 2.775 | 56 |
| `v4_availability_adjusted` | 2.343 | +0.902 | 0.110 | 2.843 | 56 |
| `v5_team_context` | 2.654 | +0.013 | -0.169 | 3.257 | 56 |
| `v6_usage_share` | 3.000 | -0.705 | -0.735 | 3.969 | 56 |

### K

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 1.461 | +0.437 | -0.521 | 2.089 | 31 |
| `v2_age_adjusted` | **1.417** | +0.349 | **-0.390** | **1.997** | 31 |
| `v3_stat_weighted` | 7.277 | +7.130 | -20.773 | 7.904 | 31 |
| `v4_availability_adjusted` | 7.330 | +7.183 | -21.124 | 7.968 | 31 |
| `v5_team_context` | 6.597 | +6.001 | -16.882 | 7.163 | 31 |
| `v6_usage_share` | 6.597 | +6.001 | -16.882 | 7.163 | 31 |

## Season 2025

### ALL

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 2.904 | -1.145 | 0.428 | 3.880 | 261 |
| `v2_age_adjusted` | **2.833** | -0.940 | **0.455** | **3.787** | 261 |
| `v3_stat_weighted` | 3.836 | +0.191 | 0.069 | 4.948 | 261 |
| `v4_availability_adjusted` | 3.851 | +2.008 | -0.009 | 5.151 | 261 |
| `v5_team_context` | 3.892 | +1.136 | 0.025 | 5.066 | 261 |
| `v6_usage_share` | 4.678 | -0.062 | -0.690 | 6.668 | 261 |

### QB

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 4.359 | -2.245 | 0.164 | 5.869 | 53 |
| `v2_age_adjusted` | 4.521 | -2.395 | 0.120 | 6.022 | 53 |
| `v3_stat_weighted` | 5.048 | -1.989 | 0.010 | 6.386 | 53 |
| `v4_availability_adjusted` | 4.597 | +2.319 | 0.089 | 6.126 | 53 |
| `v5_team_context` | 4.856 | +1.424 | 0.076 | 6.169 | 53 |
| `v6_usage_share` | 6.456 | -1.084 | -1.350 | 9.841 | 53 |

### RB

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 2.995 | -0.940 | 0.553 | 3.608 | 54 |
| `v2_age_adjusted` | **2.839** | +0.159 | **0.632** | **3.273** | 54 |
| `v3_stat_weighted` | 3.917 | +1.119 | 0.182 | 4.883 | 54 |
| `v4_availability_adjusted` | 4.336 | +2.601 | -0.077 | 5.602 | 54 |
| `v5_team_context` | 4.021 | +1.622 | 0.047 | 5.269 | 54 |
| `v6_usage_share` | 4.827 | +0.493 | -0.414 | 6.418 | 54 |

### WR

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 3.000 | -1.353 | -0.073 | 3.654 | 62 |
| `v2_age_adjusted` | **2.638** | -1.339 | **0.090** | **3.365** | 62 |
| `v3_stat_weighted` | 3.126 | -0.980 | -0.183 | 3.837 | 62 |
| `v4_availability_adjusted` | 3.111 | +0.453 | -0.339 | 4.082 | 62 |
| `v5_team_context` | 3.223 | -0.312 | -0.404 | 4.179 | 62 |
| `v6_usage_share` | 3.654 | -1.102 | -0.973 | 4.955 | 62 |

### TE

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 1.994 | -0.658 | 0.476 | 2.536 | 62 |
| `v2_age_adjusted` | 2.018 | -0.606 | **0.528** | **2.406** | 62 |
| `v3_stat_weighted` | 2.034 | -0.466 | 0.429 | 2.646 | 62 |
| `v4_availability_adjusted` | **1.978** | +0.551 | 0.368 | 2.785 | 62 |
| `v5_team_context` | 2.413 | -0.389 | 0.164 | 3.202 | 62 |
| `v6_usage_share` | 3.223 | -1.514 | -0.661 | 4.515 | 62 |

### K

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 1.846 | -0.151 | -0.792 | 2.411 | 30 |
| `v2_age_adjusted` | 1.925 | -0.209 | -0.853 | 2.452 | 30 |
| `v3_stat_weighted` | 6.740 | +6.146 | -15.379 | 7.290 | 30 |
| `v4_availability_adjusted` | 7.058 | +6.619 | -16.752 | 7.589 | 30 |
| `v5_team_context` | 6.392 | +5.894 | -14.029 | 6.983 | 30 |
| `v6_usage_share` | 6.392 | +5.894 | -14.029 | 6.983 | 30 |
