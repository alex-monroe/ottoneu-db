# Segmented Projection Accuracy Analysis

_Generated: 2026-03-29 14:02_

**Models:** `v1_baseline_weighted_ppg`, `v8_age_regression`, `v21_tiered_regression`, `v22_elite_consistency`, `v23_tiered_elite`, `external_fantasypros_v1`  
**Seasons:** 2022, 2023, 2024, 2025  
**Min games:** 4

## Rank By Actual Ppg Within Position

| Segment | Model | MAE | Bias | R² | N |
| --- | --- | ---: | ---: | ---: | ---: |
| bench | `external_fantasypros_v1` | 2.385 | +0.693 | 0.138 | 437 |
| bench | `v1_baseline_weighted_ppg` | 2.985 | -1.673 | -0.221 | 420 |
| bench | `v21_tiered_regression` | 2.717 | -0.866 | 0.020 | 420 |
| bench | `v22_elite_consistency` | 2.693 | -1.467 | -0.035 | 420 |
| bench | `v23_tiered_elite` | 2.770 | -0.919 | -0.016 | 420 |
| bench | `v8_age_regression` | 2.640 | -1.415 | 0.001 | 420 |
| elite | `external_fantasypros_v1` | 3.061 | +2.795 | 0.171 | 168 |
| elite | `v1_baseline_weighted_ppg` | 2.650 | +1.856 | 0.341 | 217 |
| elite | `v21_tiered_regression` | 3.015 | +2.705 | 0.159 | 217 |
| elite | `v22_elite_consistency` | 2.901 | +2.112 | 0.246 | 217 |
| elite | `v23_tiered_elite` | 2.958 | +2.186 | 0.189 | 217 |
| elite | `v8_age_regression` | 2.958 | +2.632 | 0.216 | 217 |
| starter | `external_fantasypros_v1` | 2.735 | +1.469 | -0.274 | 161 |
| starter | `v1_baseline_weighted_ppg` | 2.037 | -0.137 | 0.333 | 207 |
| starter | `v21_tiered_regression` | 1.872 | +0.455 | 0.440 | 207 |
| starter | `v22_elite_consistency` | 2.079 | +0.143 | 0.331 | 207 |
| starter | `v23_tiered_elite` | 2.093 | +0.183 | 0.291 | 207 |
| starter | `v8_age_regression` | 1.858 | +0.415 | 0.480 | 207 |
