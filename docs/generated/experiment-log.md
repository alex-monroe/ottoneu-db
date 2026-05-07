# Projection Experiment Log

_Tracks every model iteration attempt to prevent re-trying failed approaches._

| Date | Model | Change | ALL MAE | ALL R² | ALL Bias | Verdict | PR |
|------|-------|--------|---------|--------|----------|---------|-----|
| 2026-01-15 | v2 | + age_curve | 2.584 | 0.499 | -0.120 | IMPROVEMENT | — |
| 2026-01-20 | v3 | + stat_efficiency (v1) | 2.950+ | degrades | — | REGRESSION | — |
| 2026-01-20 | v4 | + games_played | 2.950+ | degrades | — | REGRESSION | — |
| 2026-01-20 | v5 | + team_context (v1) | 3.290+ | degrades | — | REGRESSION | — |
| 2026-01-20 | v6 | + usage_share (v1) | 4.323+ | degrades | — | REGRESSION | — |
| 2026-02-01 | v8 | optimal sweep: base + age + regression | 2.530 | 0.522 | +0.075 | IMPROVEMENT | — |
| 2026-02-05 | v9 | per-position configs (confirmed uniform) | 2.530 | 0.522 | +0.075 | EQUIVALENT | — |
| 2026-02-10 | v10 | + stat_efficiency v2 (rate-based) | 2.535 | 0.520 | — | NEUTRAL | — |
| 2026-02-10 | v11 | + team_context v2 (K excl, pos scaling) | 2.535 | 0.520 | — | NEUTRAL | — |
| 2026-02-15 | v12 | disable QB/K snap trajectory | 2.525 | 0.526 | +0.103 | IMPROVEMENT | — |
| 2026-02-20 | v13 | + QB starter volume trend | 2.530 | — | — | REGRESSION | — |
| 2026-02-25 | v14 | v12 + backup QB penalty (15%) | 2.515 | 0.542 | +0.170 | IMPROVEMENT | — |
| 2026-03-01 | v15 | v2 + snap trend | 2.584 | 0.499 | — | NEUTRAL | — |
| 2026-03-01 | v16 | v14 + snap trend | 2.515 | 0.542 | — | NEUTRAL | — |
| 2026-03-05 | v17 | v14 + rookie growth curves | 2.516 | 0.541 | — | NEUTRAL | — |
| 2026-03-10 | v18 | v2 + usage_share v2 (level) | 2.584 | — | — | NEUTRAL | — |
| 2026-03-10 | v19 | v14 + usage_share v2 (level) | 2.510 | 0.545 | — | NEUTRAL | — |
| 2026-03-29 | v20 | Ridge regression + interactions | 2.412 | 0.577 | -0.026 | BEST | #370 |
| 2026-03-29 | v21 | v14 + tiered regression | 2.515 | 0.542 | — | NEUTRAL (bench bias improved) | #373 |
| 2026-05-05 | v22 | v20 + advanced receiving (target_share, air_yards_share, wopr, racr) | 2.380 | 0.572 | -0.167 | IMPROVEMENT (vs v20 on matched 583 player-seasons: -0.033 MAE; WR MAE -0.06) | #375 |
| 2026-05-06 | v23 | v22 + draft_capital_raw (log overall pick, first 3 NFL seasons) | 2.009 (2024) | 0.705 (2024) | +0.204 (2024) | IMPROVEMENT (best 2024 ALL MAE; learned position interactions: WR 0.23, RB 0.19, QB 0.03, TE -0.17) | #376 |
| 2026-05-06 | v24 | v23 + per-feature standardization opt-out for draft_capital_raw | n/a | n/a | n/a | NULL RESULT (verified that scaler perturbation was not the source of v23 vet regression — coefficients essentially unchanged from v23) | (not shipped) |
| 2026-05-06 | v25 | Two-stage residual: v22 unchanged + tiny ridge on draft_capital_raw fit only on rookies/sophs/3rd-year (fit_intercept=False) | 2.044 | 0.695 | +0.004 | IMPROVEMENT (vs v22 matched: -0.013 MAE overall, sophomore -0.051, 4th-yr -0.023, vet 5+ exactly 0.000 byte-identical to v22) | #376 fu |
