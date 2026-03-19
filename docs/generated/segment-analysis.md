# Segmented Projection Accuracy Analysis

_Generated: 2026-03-18 20:01_

**Models:** `v1_baseline_weighted_ppg`, `v8_age_regression`, `external_fantasypros_v1`  
**Seasons:** 2022, 2023, 2024, 2025  
**Min games:** 4

## Player Nfl Experience Level

| Segment | Model | MAE | Bias | R² | N |
| --- | --- | ---: | ---: | ---: | ---: |
| rookie | `external_fantasypros_v1` | 2.558 | +1.328 | 0.505 | 288 |
| rookie | `v1_baseline_weighted_ppg` | 2.773 | -0.175 | 0.324 | 180 |
| rookie | `v8_age_regression` | 2.630 | -0.375 | 0.377 | 180 |
| veteran | `external_fantasypros_v1` | 2.480 | +1.382 | 0.618 | 139 |
| veteran | `v1_baseline_weighted_ppg` | 2.454 | -0.668 | 0.534 | 214 |
| veteran | `v8_age_regression` | 2.441 | +0.435 | 0.549 | 214 |
| young | `external_fantasypros_v1` | 2.701 | +1.281 | 0.548 | 339 |
| young | `v1_baseline_weighted_ppg` | 2.724 | -0.341 | 0.502 | 450 |
| young | `v8_age_regression` | 2.532 | +0.083 | 0.567 | 450 |

## Player Age At Season Start

| Segment | Model | MAE | Bias | R² | N |
| --- | --- | ---: | ---: | ---: | ---: |
| aging | `external_fantasypros_v1` | 3.353 | +1.627 | 0.269 | 66 |
| aging | `v1_baseline_weighted_ppg` | 2.884 | -1.388 | 0.259 | 161 |
| aging | `v8_age_regression` | 2.607 | +0.204 | 0.382 | 161 |
| prime | `external_fantasypros_v1` | 2.646 | +1.354 | 0.571 | 343 |
| prime | `v1_baseline_weighted_ppg` | 2.560 | -0.514 | 0.554 | 449 |
| prime | `v8_age_regression` | 2.462 | -0.042 | 0.585 | 449 |
| young | `external_fantasypros_v1` | 2.432 | +1.225 | 0.609 | 357 |
| young | `v1_baseline_weighted_ppg` | 2.719 | +0.539 | 0.465 | 234 |
| young | `v8_age_regression` | 2.606 | +0.209 | 0.508 | 234 |
