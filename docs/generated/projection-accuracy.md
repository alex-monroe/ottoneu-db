# Projection Model Accuracy Report

_Generated: 2026-03-16 20:05_

Metrics: **MAE** = Mean Absolute Error (lower is better), **Bias** = Mean signed error (positive = under-projection), **R²** = Goodness of fit (higher is better), **RMSE** = Root mean square error, **N** = player sample size.

## Season 2022

### ALL

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 2.237 | -0.004 | 0.621 | 3.014 | 154 |
| `v2_age_adjusted` | **2.185** | -0.150 | **0.630** | **2.978** | 154 |
| `v3_stat_weighted` | 2.543 | -0.023 | 0.490 | 3.497 | 154 |
| `v4_availability_adjusted` | 2.539 | +0.480 | 0.480 | 3.530 | 154 |
| `v5_team_context` | 3.062 | -0.273 | 0.323 | 4.030 | 154 |
| `v6_usage_share` | 3.938 | -1.139 | -0.631 | 6.252 | 154 |

### QB

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 3.689 | -0.246 | 0.169 | 4.688 | 36 |
| `v2_age_adjusted` | **3.640** | -0.695 | **0.180** | **4.654** | 36 |
| `v3_stat_weighted` | 4.039 | -0.916 | -0.044 | 5.252 | 36 |
| `v4_availability_adjusted` | 4.045 | +0.148 | -0.060 | 5.292 | 36 |
| `v5_team_context` | 4.482 | -0.448 | -0.294 | 5.847 | 36 |
| `v6_usage_share` | 4.482 | -0.448 | -0.294 | 5.847 | 36 |

### RB

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 2.695 | -0.896 | 0.498 | 3.257 | 25 |
| `v2_age_adjusted` | 2.824 | -0.270 | 0.476 | 3.329 | 25 |
| `v3_stat_weighted` | 2.893 | -0.093 | 0.388 | 3.597 | 25 |
| `v4_availability_adjusted` | 2.759 | +0.818 | 0.424 | 3.490 | 25 |
| `v5_team_context` | 3.156 | +0.213 | 0.322 | 3.788 | 25 |
| `v6_usage_share` | 5.565 | -2.049 | -3.852 | 10.130 | 25 |

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
| `v2_age_adjusted` | 1.624 | +0.049 | 0.544 | 1.925 | 36 |
| `v3_stat_weighted` | 2.320 | +0.462 | 0.022 | 2.820 | 36 |
| `v4_availability_adjusted` | 2.377 | +0.709 | -0.057 | 2.931 | 36 |
| `v5_team_context` | 2.506 | -0.146 | -0.335 | 3.294 | 36 |
| `v6_usage_share` | 2.933 | -0.524 | -0.839 | 3.866 | 36 |

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
| `v2_age_adjusted` | 2.701 | -0.157 | 0.404 | 3.857 | 188 |
| `v3_stat_weighted` | 3.170 | +0.197 | 0.243 | 4.349 | 188 |
| `v4_availability_adjusted` | 3.265 | +0.665 | 0.166 | 4.563 | 188 |
| `v5_team_context` | 3.596 | -0.117 | 0.074 | 4.809 | 188 |
| `v6_usage_share` | 4.133 | -0.670 | -0.246 | 5.579 | 188 |

### QB

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 3.918 | -0.856 | 0.169 | 5.296 | 39 |
| `v2_age_adjusted` | 4.139 | -1.343 | 0.062 | 5.627 | 39 |
| `v3_stat_weighted` | 5.363 | -0.198 | -0.298 | 6.619 | 39 |
| `v4_availability_adjusted` | 5.609 | +1.121 | -0.433 | 6.955 | 39 |
| `v5_team_context` | 5.659 | +0.462 | -0.424 | 6.934 | 39 |
| `v6_usage_share` | 5.659 | +0.462 | -0.424 | 6.934 | 39 |

### RB

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 3.567 | +0.644 | -0.256 | 4.764 | 37 |
| `v2_age_adjusted` | 3.569 | +1.302 | -0.314 | 4.872 | 37 |
| `v3_stat_weighted` | 3.870 | +1.262 | -0.437 | 5.095 | 37 |
| `v4_availability_adjusted` | 4.082 | +1.576 | -0.627 | 5.421 | 37 |
| `v5_team_context` | 4.446 | +0.910 | -0.797 | 5.697 | 37 |
| `v6_usage_share` | 5.218 | +0.534 | -1.952 | 7.303 | 37 |

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
| `v2_age_adjusted` | **1.599** | -0.402 | **0.481** | **2.079** | 44 |
| `v3_stat_weighted` | 1.995 | -0.162 | 0.189 | 2.600 | 44 |
| `v4_availability_adjusted` | 1.984 | +0.136 | 0.151 | 2.661 | 44 |
| `v5_team_context` | 2.606 | -0.801 | -0.368 | 3.377 | 44 |
| `v6_usage_share` | 3.533 | -1.915 | -1.490 | 4.557 | 44 |

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
| `v2_age_adjusted` | 2.786 | +0.023 | 0.442 | 3.654 | 241 |
| `v3_stat_weighted` | 3.042 | +0.117 | 0.337 | 3.981 | 241 |
| `v4_availability_adjusted` | 3.072 | +0.617 | 0.316 | 4.044 | 241 |
| `v5_team_context` | 3.422 | -0.332 | 0.214 | 4.336 | 241 |
| `v6_usage_share` | 3.903 | -0.951 | -0.124 | 5.183 | 241 |

### QB

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 3.996 | -1.412 | 0.376 | 5.153 | 49 |
| `v2_age_adjusted` | 4.140 | -1.724 | 0.350 | 5.258 | 49 |
| `v3_stat_weighted` | 4.725 | -1.904 | 0.219 | 5.764 | 49 |
| `v4_availability_adjusted` | 4.428 | -0.464 | 0.271 | 5.570 | 49 |
| `v5_team_context` | 4.714 | -1.276 | 0.213 | 5.788 | 49 |
| `v6_usage_share` | 4.714 | -1.276 | 0.213 | 5.788 | 49 |

### RB

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 3.064 | +0.495 | 0.166 | 4.055 | 49 |
| `v2_age_adjusted` | 3.353 | +1.420 | 0.148 | 4.099 | 49 |
| `v3_stat_weighted` | 3.787 | +1.712 | -0.057 | 4.567 | 49 |
| `v4_availability_adjusted` | 3.942 | +2.168 | -0.169 | 4.801 | 49 |
| `v5_team_context` | 3.733 | +1.268 | -0.124 | 4.709 | 49 |
| `v6_usage_share` | 3.985 | +1.042 | -0.229 | 4.923 | 49 |

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
| `v2_age_adjusted` | 1.960 | -0.104 | 0.336 | 2.455 | 56 |
| `v3_stat_weighted` | 2.213 | -0.027 | 0.152 | 2.775 | 56 |
| `v4_availability_adjusted` | 2.281 | +0.176 | 0.120 | 2.826 | 56 |
| `v5_team_context` | 2.845 | -0.715 | -0.333 | 3.479 | 56 |
| `v6_usage_share` | 3.249 | -1.427 | -0.954 | 4.212 | 56 |

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
| `v2_age_adjusted` | **2.833** | -0.940 | **0.455** | **3.787** | 261 |
| `v3_stat_weighted` | 3.283 | -0.540 | 0.275 | 4.367 | 261 |
| `v4_availability_adjusted` | 3.226 | -0.032 | 0.293 | 4.312 | 261 |
| `v5_team_context` | 3.524 | -0.932 | 0.170 | 4.673 | 261 |
| `v6_usage_share` | 4.046 | -1.621 | -0.159 | 5.522 | 261 |

### QB

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 4.359 | -2.245 | 0.164 | 5.869 | 53 |
| `v2_age_adjusted` | 4.521 | -2.395 | 0.120 | 6.022 | 53 |
| `v3_stat_weighted` | 5.048 | -1.989 | 0.010 | 6.386 | 53 |
| `v4_availability_adjusted` | 4.742 | -0.512 | 0.090 | 6.123 | 53 |
| `v5_team_context` | 5.017 | -1.453 | -0.045 | 6.564 | 53 |
| `v6_usage_share` | 5.017 | -1.453 | -0.045 | 6.564 | 53 |

### RB

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 2.995 | -0.940 | 0.553 | 3.608 | 54 |
| `v2_age_adjusted` | **2.839** | +0.159 | **0.632** | **3.273** | 54 |
| `v3_stat_weighted` | 3.917 | +1.119 | 0.182 | 4.883 | 54 |
| `v4_availability_adjusted` | 3.919 | +1.484 | 0.157 | 4.955 | 54 |
| `v5_team_context` | 3.763 | +0.505 | 0.200 | 4.827 | 54 |
| `v6_usage_share` | 4.615 | -0.624 | -0.349 | 6.271 | 54 |

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
| `v2_age_adjusted` | 2.018 | -0.606 | **0.528** | **2.406** | 62 |
| `v3_stat_weighted` | 2.034 | -0.466 | 0.429 | 2.646 | 62 |
| `v4_availability_adjusted` | 2.038 | -0.238 | 0.415 | 2.679 | 62 |
| `v5_team_context` | 2.497 | -1.177 | 0.089 | 3.343 | 62 |
| `v6_usage_share` | 3.420 | -2.302 | -0.945 | 4.885 | 62 |

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
| `v2_age_adjusted` | **2.672** | -0.346 | **0.472** | **3.630** | 844 |
| `v3_stat_weighted` | 3.054 | -0.094 | 0.325 | 4.107 | 844 |
| `v4_availability_adjusted` | 3.065 | +0.402 | 0.306 | 4.163 | 844 |
| `v5_team_context` | 3.427 | -0.459 | 0.189 | 4.498 | 844 |
| `v6_usage_share` | 4.005 | -1.130 | -0.255 | 5.583 | 844 |

### QB

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 4.025 | -1.302 | 0.225 | 5.321 | 177 |
| `v2_age_adjusted` | 4.152 | -1.632 | 0.183 | 5.468 | 177 |
| `v3_stat_weighted` | 4.823 | -1.353 | -0.011 | 6.056 | 177 |
| `v4_availability_adjusted` | 4.704 | -0.005 | -0.006 | 6.014 | 177 |
| `v5_team_context` | 4.966 | -0.778 | -0.108 | 6.303 | 177 |
| `v6_usage_share` | 4.966 | -0.778 | -0.108 | 6.303 | 177 |

### RB

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 3.099 | -0.152 | 0.248 | 3.980 | 165 |
| `v2_age_adjusted` | 3.153 | +0.725 | **0.253** | **3.937** | 165 |
| `v3_stat_weighted` | 3.713 | +1.143 | 0.003 | 4.667 | 165 |
| `v4_availability_adjusted` | 3.787 | +1.607 | -0.075 | 4.829 | 165 |
| `v5_team_context` | 3.815 | +0.778 | -0.101 | 4.864 | 165 |
| `v6_usage_share` | 4.707 | -0.085 | -1.204 | 6.897 | 165 |

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
| `v2_age_adjusted` | 1.837 | -0.300 | **0.466** | **2.270** | 198 |
| `v3_stat_weighted` | 2.128 | -0.106 | 0.223 | 2.705 | 198 |
| `v4_availability_adjusted` | 2.157 | +0.134 | 0.187 | 2.764 | 198 |
| `v5_team_context` | 2.621 | -0.775 | -0.209 | 3.381 | 198 |
| `v6_usage_share` | 3.308 | -1.645 | -1.050 | 4.452 | 198 |

### K

| Model | mae | bias | r_squared | rmse | player_count |
| --- | --- | --- | --- | --- | --- |
| `v1_baseline_weighted_ppg` _(baseline)_ | 1.421 | +0.103 | -0.755 | 1.947 | 110 |
| `v2_age_adjusted` | **1.420** | +0.010 | **-0.735** | **1.933** | 110 |
| `v3_stat_weighted` | **1.420** | +0.010 | **-0.735** | **1.933** | 110 |
| `v4_availability_adjusted` | 1.490 | +0.168 | -1.051 | 2.100 | 110 |
| `v5_team_context` | 2.289 | -0.934 | -2.846 | 2.800 | 110 |
| `v6_usage_share` | 2.289 | -0.934 | -2.846 | 2.800 | 110 |
