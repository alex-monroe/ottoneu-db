# Projection Prediction Intervals

_Generated 2026-07-20 01:32 UTC · model `v33_tuned_base`_

Empirical 80% intervals from held-out rolling-origin residuals (eval 2023, 2024, 2025). Segment = position × projected-PPG tier (n=4); thin tiers (< 30) fall back to the position-wide residual band.

## Held-out coverage (fit on earlier seasons, confirm on last)

Nominal coverage: **80%**. Confirm season: **2025**.

| Position | Coverage | N |
| --- | --- | --- |
| ALL | 80.3% | 351 |
| QB | 84.9% | 53 |
| RB | 73.8% | 84 |
| WR | 86.2% | 130 |
| TE | 75.0% | 84 |

## Fitted band offsets (production calibration, all eval seasons)

### QB

| Tier (proj PPG) | Low offset | High offset |
| --- | --- | --- |
| ≤ 8.5 | -6.99 | +6.88 |
| 8.5–14.2 | -8.82 | +4.21 |
| 14.2–16.4 | -4.72 | +5.16 |
| > 16.4 | -4.68 | +3.03 |

### RB

| Tier (proj PPG) | Low offset | High offset |
| --- | --- | --- |
| ≤ 2.9 | -1.79 | +2.70 |
| 2.9–5.7 | -2.90 | +2.50 |
| 5.7–10.1 | -5.51 | +3.58 |
| > 10.1 | -3.12 | +5.26 |

### WR

| Tier (proj PPG) | Low offset | High offset |
| --- | --- | --- |
| ≤ 3.2 | -1.87 | +2.97 |
| 3.2–5.6 | -2.96 | +3.18 |
| 5.6–9.0 | -4.08 | +3.40 |
| > 9.0 | -4.26 | +3.73 |

### TE

| Tier (proj PPG) | Low offset | High offset |
| --- | --- | --- |
| ≤ 2.0 | -1.18 | +1.37 |
| 2.0–3.4 | -2.03 | +1.96 |
| 3.4–5.7 | -3.02 | +3.05 |
| > 5.7 | -2.35 | +3.31 |
