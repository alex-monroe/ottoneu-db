# Keeper outlook backtest

Generated 2026-10-18 by `just keeper-backtest` (scripts/keeper_value/backtest.py). Method: docs/references/keeper-value.md.

Rolling origin: each season N is scored by a model fitted only on seasons ≤ N−1, seeing N only through the as-of week. Value is next season's availability-inclusive dollar value in that season's /value market. Keepability is scored at strikes $3, $5, $10, $20, $35, $50 (historical salaries are not stored). *Relevant* = pacing or last valued ≥ $3, or a Y1–2 day-1/day-2 pick — chosen on as-of information only.

## Dev folds — as of week 12

As of NFL week 12; seasons scored: 2016–2023.

### Relevant players

| Method | CRPS ($) | Option-value MAE ($) | Brier | p10 / p50 / p90 coverage | n |
|---|---|---|---|---|---|
| (a) prior only | 17.21 | 17.08 | 0.238 | 7% / 37% / 75% | 1193 |
| (b) prior + shrunk adjustment | 13.08 | 15.31 | 0.164 | 11% / 49% / 87% | 1193 |
| (c) point estimate (current) | 23.95 | 17.76 | 0.310 | 54% / 63% / 72% | 1193 |
| (b′) individual, unshrunk | 13.04 | 15.27 | 0.163 | 11% / 49% / 88% | 1193 |

### All players

| Method | CRPS ($) | Option-value MAE ($) | Brier | p10 / p50 / p90 coverage | n |
|---|---|---|---|---|---|
| (a) prior only | 4.70 | 5.88 | 0.071 | 10% / 50% / 90% | 5840 |
| (b) prior + shrunk adjustment | 3.50 | 4.00 | 0.050 | 10% / 50% / 90% | 5840 |
| (c) point estimate (current) | 5.84 | 4.19 | 0.082 | 19% / 51% / 84% | 5840 |
| (b′) individual, unshrunk | 3.49 | 3.94 | 0.050 | 10% / 50% / 90% | 5840 |

### CRPS by years in league (relevant)

| Years in league | n | mean w | (a) prior only | (b) prior + shrunk adjustment | (c) point estimate (current) | (b′) individual, unshrunk |
|---|---|---|---|---|---|---|
| Y1–2 | 538 | 0.84 | 12.66 | 10.26 | 15.46 | 10.16 |
| Y3–4 | 208 | 0.97 | 21.01 | 16.11 | 31.17 | 16.14 |
| Y5+ | 447 | 0.98 | 20.92 | 15.07 | 30.79 | 15.06 |

### Significance (relevant; player-clustered bootstrap)

| Comparison | Metric | Δ (first − second) | 95% CI | Verdict |
|---|---|---|---|---|
| (b) prior + shrunk adjustment vs (a) prior only | crps | -4.13 | [-5.49, -2.87] | (b) better |
| (b) prior + shrunk adjustment vs (a) prior only | ov_mae | -1.77 | [-2.76, -0.86] | (b) better |
| (b) prior + shrunk adjustment vs (a) prior only | brier | -0.074 | [-0.094, -0.055] | (b) better |
| (b) prior + shrunk adjustment vs (c) point estimate (current) | crps | -10.86 | [-12.04, -9.74] | (b) better |
| (b) prior + shrunk adjustment vs (c) point estimate (current) | ov_mae | -2.44 | [-3.31, -1.61] | (b) better |
| (b) prior + shrunk adjustment vs (c) point estimate (current) | brier | -0.146 | [-0.164, -0.130] | (b) better |
| (b) prior + shrunk adjustment vs (b′) individual, unshrunk | crps | 0.04 | [-0.02, 0.11] | not significant |
| (b) prior + shrunk adjustment vs (b′) individual, unshrunk | ov_mae | 0.04 | [-0.03, 0.12] | not significant |
| (b) prior + shrunk adjustment vs (b′) individual, unshrunk | brier | 0.001 | [-0.000, 0.001] | not significant |

### Calibration of P(keepable) (relevant, pooled over strikes)

**(b) prior + shrunk adjustment**

| Called keepable | n | Predicted | Observed |
|---|---|---|---|
| 0%–5% | 774 | 1% | 3% |
| 5%–15% | 1158 | 8% | 9% |
| 15%–30% | 1490 | 21% | 21% |
| 30%–50% | 1521 | 39% | 39% |
| 50%–70% | 1115 | 58% | 62% |
| 70%–85% | 562 | 77% | 71% |
| 85%–100% | 538 | 91% | 82% |

**(a) prior only**

| Called keepable | n | Predicted | Observed |
|---|---|---|---|
| 0%–5% | 914 | 1% | 17% |
| 5%–15% | 2032 | 9% | 26% |
| 15%–30% | 2226 | 20% | 37% |
| 30%–50% | 1475 | 38% | 52% |
| 50%–70% | 493 | 56% | 57% |
| 70%–85% | 18 | 70% | 50% |

**(c) point estimate (current)** calls every player 0% or 100% keepable: of the "100%" calls 55% were kept, of the "0%" calls 15% were.

## Confirmation fold 2024 — as of week 12

As of NFL week 12; seasons scored: 2024–2024.

### Relevant players

| Method | CRPS ($) | Option-value MAE ($) | Brier | p10 / p50 / p90 coverage | n |
|---|---|---|---|---|---|
| (a) prior only | 16.10 | 16.87 | 0.209 | 8% / 39% / 83% | 146 |
| (b) prior + shrunk adjustment | 12.63 | 15.83 | 0.147 | 11% / 52% / 89% | 146 |
| (c) point estimate (current) | 23.20 | 17.86 | 0.265 | 53% / 63% / 74% | 146 |
| (b′) individual, unshrunk | 12.71 | 15.84 | 0.146 | 11% / 52% / 88% | 146 |

### All players

| Method | CRPS ($) | Option-value MAE ($) | Brier | p10 / p50 / p90 coverage | n |
|---|---|---|---|---|---|
| (a) prior only | 4.64 | 6.01 | 0.068 | 10% / 51% / 91% | 715 |
| (b) prior + shrunk adjustment | 3.50 | 4.16 | 0.046 | 10% / 50% / 90% | 715 |
| (c) point estimate (current) | 5.84 | 4.31 | 0.076 | 19% / 51% / 83% | 715 |
| (b′) individual, unshrunk | 3.51 | 4.10 | 0.046 | 10% / 50% / 89% | 715 |

### CRPS by years in league (relevant)

| Years in league | n | mean w | (a) prior only | (b) prior + shrunk adjustment | (c) point estimate (current) | (b′) individual, unshrunk |
|---|---|---|---|---|---|---|
| Y1–2 | 66 | 0.83 | 11.25 | 9.88 | 11.98 | 9.88 |
| Y3–4 | 25 | 0.96 | 22.68 | 15.51 | 28.81 | 15.66 |
| Y5+ | 55 | 0.97 | 18.94 | 14.63 | 34.12 | 14.77 |

### Significance (relevant; player-clustered bootstrap)

| Comparison | Metric | Δ (first − second) | 95% CI | Verdict |
|---|---|---|---|---|
| (b) prior + shrunk adjustment vs (a) prior only | crps | -3.47 | [-5.61, -1.40] | (b) better |
| (b) prior + shrunk adjustment vs (a) prior only | ov_mae | -1.04 | [-3.07, 0.91] | not significant |
| (b) prior + shrunk adjustment vs (a) prior only | brier | -0.062 | [-0.096, -0.031] | (b) better |
| (b) prior + shrunk adjustment vs (c) point estimate (current) | crps | -10.57 | [-14.29, -6.93] | (b) better |
| (b) prior + shrunk adjustment vs (c) point estimate (current) | ov_mae | -2.03 | [-5.02, 0.93] | not significant |
| (b) prior + shrunk adjustment vs (c) point estimate (current) | brier | -0.118 | [-0.166, -0.073] | (b) better |
| (b) prior + shrunk adjustment vs (b′) individual, unshrunk | crps | -0.08 | [-0.39, 0.24] | not significant |
| (b) prior + shrunk adjustment vs (b′) individual, unshrunk | ov_mae | -0.01 | [-0.38, 0.39] | not significant |
| (b) prior + shrunk adjustment vs (b′) individual, unshrunk | brier | 0.000 | [-0.004, 0.004] | not significant |

### Calibration of P(keepable) (relevant, pooled over strikes)

**(b) prior + shrunk adjustment**

| Called keepable | n | Predicted | Observed |
|---|---|---|---|
| 0%–5% | 88 | 1% | 1% |
| 5%–15% | 134 | 8% | 3% |
| 15%–30% | 190 | 21% | 17% |
| 30%–50% | 157 | 39% | 34% |
| 50%–70% | 188 | 58% | 56% |
| 70%–85% | 56 | 75% | 79% |
| 85%–100% | 63 | 89% | 89% |

**(a) prior only**

| Called keepable | n | Predicted | Observed |
|---|---|---|---|
| 0%–5% | 101 | 2% | 7% |
| 5%–15% | 249 | 9% | 20% |
| 15%–30% | 236 | 20% | 30% |
| 30%–50% | 223 | 39% | 60% |
| 50%–70% | 49 | 54% | 53% |
| 70%–85% | 18 | 70% | 50% |

**(c) point estimate (current)** calls every player 0% or 100% keepable: of the "100%" calls 57% were kept, of the "0%" calls 9% were.

## Dev folds — as of week 0

As of NFL week 0; seasons scored: 2016–2023.

### Relevant players

| Method | CRPS ($) | Option-value MAE ($) | Brier | p10 / p50 / p90 coverage | n |
|---|---|---|---|---|---|
| (a) prior only | 15.99 | 16.44 | 0.219 | 8% / 40% / 79% | 1223 |
| (b) prior + shrunk adjustment | 13.61 | 15.89 | 0.176 | 10% / 48% / 87% | 1223 |
| (c) point estimate (current) | 26.01 | 18.80 | 0.358 | 54% / 63% / 72% | 1223 |
| (b′) individual, unshrunk | 13.59 | 15.86 | 0.176 | 11% / 49% / 87% | 1223 |

### All players

| Method | CRPS ($) | Option-value MAE ($) | Brier | p10 / p50 / p90 coverage | n |
|---|---|---|---|---|---|
| (a) prior only | 5.11 | 6.39 | 0.077 | 10% / 50% / 90% | 5297 |
| (b) prior + shrunk adjustment | 4.23 | 4.87 | 0.061 | 10% / 50% / 89% | 5297 |
| (c) point estimate (current) | 7.19 | 5.05 | 0.106 | 20% / 51% / 83% | 5297 |
| (b′) individual, unshrunk | 4.22 | 4.77 | 0.061 | 10% / 50% / 89% | 5297 |

### CRPS by years in league (relevant)

| Years in league | n | mean w | (a) prior only | (b) prior + shrunk adjustment | (c) point estimate (current) | (b′) individual, unshrunk |
|---|---|---|---|---|---|---|
| Y1–2 | 497 | 0.40 | 12.25 | 11.81 | 16.64 | 11.78 |
| Y3–4 | 228 | 0.93 | 19.60 | 15.72 | 32.27 | 15.75 |
| Y5+ | 498 | 0.96 | 18.07 | 14.45 | 32.50 | 14.40 |

### Significance (relevant; player-clustered bootstrap)

| Comparison | Metric | Δ (first − second) | 95% CI | Verdict |
|---|---|---|---|---|
| (b) prior + shrunk adjustment vs (a) prior only | crps | -2.38 | [-3.45, -1.36] | (b) better |
| (b) prior + shrunk adjustment vs (a) prior only | ov_mae | -0.56 | [-1.28, 0.15] | not significant |
| (b) prior + shrunk adjustment vs (a) prior only | brier | -0.043 | [-0.060, -0.027] | (b) better |
| (b) prior + shrunk adjustment vs (c) point estimate (current) | crps | -12.40 | [-13.83, -10.96] | (b) better |
| (b) prior + shrunk adjustment vs (c) point estimate (current) | ov_mae | -2.91 | [-4.05, -1.85] | (b) better |
| (b) prior + shrunk adjustment vs (c) point estimate (current) | brier | -0.182 | [-0.202, -0.162] | (b) better |
| (b) prior + shrunk adjustment vs (b′) individual, unshrunk | crps | 0.02 | [-0.08, 0.13] | not significant |
| (b) prior + shrunk adjustment vs (b′) individual, unshrunk | ov_mae | 0.03 | [-0.09, 0.18] | not significant |
| (b) prior + shrunk adjustment vs (b′) individual, unshrunk | brier | 0.000 | [-0.001, 0.001] | not significant |

### Calibration of P(keepable) (relevant, pooled over strikes)

**(b) prior + shrunk adjustment**

| Called keepable | n | Predicted | Observed |
|---|---|---|---|
| 0%–5% | 510 | 1% | 3% |
| 5%–15% | 1324 | 9% | 11% |
| 15%–30% | 2035 | 21% | 21% |
| 30%–50% | 1799 | 40% | 43% |
| 50%–70% | 1049 | 57% | 62% |
| 70%–85% | 372 | 75% | 68% |
| 85%–100% | 249 | 89% | 78% |

**(a) prior only**

| Called keepable | n | Predicted | Observed |
|---|---|---|---|
| 0%–5% | 888 | 1% | 13% |
| 5%–15% | 2083 | 9% | 22% |
| 15%–30% | 2296 | 21% | 35% |
| 30%–50% | 1550 | 38% | 51% |
| 50%–70% | 503 | 56% | 56% |
| 70%–85% | 18 | 70% | 50% |

**(c) point estimate (current)** calls every player 0% or 100% keepable: of the "100%" calls 48% were kept, of the "0%" calls 20% were.

## Confirmation fold 2024 — as of week 0

As of NFL week 0; seasons scored: 2024–2024.

### Relevant players

| Method | CRPS ($) | Option-value MAE ($) | Brier | p10 / p50 / p90 coverage | n |
|---|---|---|---|---|---|
| (a) prior only | 16.00 | 16.67 | 0.206 | 8% / 39% / 80% | 155 |
| (b) prior + shrunk adjustment | 13.40 | 16.58 | 0.163 | 10% / 51% / 90% | 155 |
| (c) point estimate (current) | 24.11 | 17.75 | 0.310 | 52% / 64% / 75% | 155 |
| (b′) individual, unshrunk | 13.42 | 16.72 | 0.162 | 10% / 51% / 90% | 155 |

### All players

| Method | CRPS ($) | Option-value MAE ($) | Brier | p10 / p50 / p90 coverage | n |
|---|---|---|---|---|---|
| (a) prior only | 5.04 | 6.51 | 0.073 | 10% / 50% / 91% | 655 |
| (b) prior + shrunk adjustment | 4.13 | 5.07 | 0.058 | 10% / 50% / 90% | 655 |
| (c) point estimate (current) | 6.76 | 4.82 | 0.095 | 20% / 51% / 83% | 655 |
| (b′) individual, unshrunk | 4.12 | 4.98 | 0.057 | 10% / 50% / 90% | 655 |

### CRPS by years in league (relevant)

| Years in league | n | mean w | (a) prior only | (b) prior + shrunk adjustment | (c) point estimate (current) | (b′) individual, unshrunk |
|---|---|---|---|---|---|---|
| Y1–2 | 63 | 0.46 | 12.33 | 11.75 | 15.51 | 11.56 |
| Y3–4 | 28 | 0.91 | 24.00 | 18.20 | 28.83 | 18.89 |
| Y5+ | 64 | 0.95 | 16.12 | 12.92 | 30.51 | 12.85 |

### Significance (relevant; player-clustered bootstrap)

| Comparison | Metric | Δ (first − second) | 95% CI | Verdict |
|---|---|---|---|---|
| (b) prior + shrunk adjustment vs (a) prior only | crps | -2.60 | [-4.38, -1.02] | (b) better |
| (b) prior + shrunk adjustment vs (a) prior only | ov_mae | -0.10 | [-1.60, 1.30] | not significant |
| (b) prior + shrunk adjustment vs (a) prior only | brier | -0.044 | [-0.071, -0.019] | (b) better |
| (b) prior + shrunk adjustment vs (c) point estimate (current) | crps | -10.71 | [-14.49, -6.92] | (b) better |
| (b) prior + shrunk adjustment vs (c) point estimate (current) | ov_mae | -1.17 | [-4.24, 1.84] | not significant |
| (b) prior + shrunk adjustment vs (c) point estimate (current) | brier | -0.147 | [-0.201, -0.093] | (b) better |
| (b) prior + shrunk adjustment vs (b′) individual, unshrunk | crps | -0.02 | [-0.35, 0.31] | not significant |
| (b) prior + shrunk adjustment vs (b′) individual, unshrunk | ov_mae | -0.14 | [-0.64, 0.34] | not significant |
| (b) prior + shrunk adjustment vs (b′) individual, unshrunk | brier | 0.001 | [-0.003, 0.005] | not significant |

### Calibration of P(keepable) (relevant, pooled over strikes)

**(b) prior + shrunk adjustment**

| Called keepable | n | Predicted | Observed |
|---|---|---|---|
| 0%–5% | 72 | 1% | 1% |
| 5%–15% | 157 | 9% | 10% |
| 15%–30% | 230 | 20% | 21% |
| 30%–50% | 213 | 39% | 30% |
| 50%–70% | 174 | 58% | 62% |
| 70%–85% | 71 | 73% | 80% |
| 85%–100% | 13 | 88% | 92% |

**(a) prior only**

| Called keepable | n | Predicted | Observed |
|---|---|---|---|
| 0%–5% | 112 | 1% | 12% |
| 5%–15% | 267 | 9% | 21% |
| 15%–30% | 265 | 20% | 27% |
| 30%–50% | 216 | 39% | 60% |
| 50%–70% | 52 | 54% | 52% |
| 70%–85% | 18 | 70% | 50% |

**(c) point estimate (current)** calls every player 0% or 100% keepable: of the "100%" calls 52% were kept, of the "0%" calls 14% were.
