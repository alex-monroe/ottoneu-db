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
| 2026-05-05 | v22 | v20 + advanced receiving (target_share, air_yards_share, wopr, racr) for WR/TE; learned ridge with target_share*position, wopr*base_ppg, wopr^2 interactions | 2.380 | 0.572 | -0.167 | IMPROVEMENT (vs v20 all-seasons: −0.032 MAE; WR −0.151, TE −0.053. K regresses 1.228→1.287 from full-refit leakage.) | #375 |
| 2026-05-06 | v23 | v22 + draft_capital_raw (log overall pick, returns 0 after 3rd NFL season) with draft_capital_raw*position interaction; **full ridge refit** | 2.379 | 0.585 | -0.026 | NEUTRAL aggregate (ALL MAE essentially flat vs v22; R²/bias improve). LOSO CV regressed (v22 2.406 → v23 2.428) and full refit shifts unrelated coefficients (weighted_ppg 4.76→4.07, regression_to_mean 1.09→0.74) — vet predictions drift even though feature is 0 for vets. Motivated v25. | #376 |
| 2026-05-06 | v24 | v23 + per-feature standardization opt-out for draft_capital_raw | n/a | n/a | n/a | NULL RESULT (verified that scaler perturbation was not the source of v23 vet regression — coefficients essentially unchanged from v23) | (not shipped) |
| 2026-05-06 | v25 | Two-stage residual: v22 frozen as base + tiny ridge on draft_capital_raw + draft_capital_raw*position fit on (actual − v22_pred) for seasons_since_draft ≤ 3 only, fit_intercept=False (best α=100) | 2.370 | 0.575 | -0.191 | BEST (vs v22 all-seasons: −0.010 MAE; TE −0.014, WR −0.031. Vets receive byte-identical v22 predictions by construction — residual features all 0 → residual = 0.) | #376 fu |
| 2026-05-07 | v26 | Stacked residual on v25: tiny ridge on `implied_team_total_raw` (centered Vegas team-total vs season league mean) + `implied_team_total_raw*position` fit to v25 residuals across all players (no draft filter). Required nested-residual support in `predict_residual` and `train_ridge_residual`. Backfill via nflverse `games.csv` (PFR is now Cloudflare-walled). | 2.530 | 0.537 | -0.647 | NEUTRAL (vs current v25 backtest 2.551 / 0.534 / -0.627: −0.021 MAE, R² +0.003, bias unchanged). Coefficients tiny across the board (≤+0.005 PPG/pt) — Vegas signal is real but largely absorbed by v22's existing usage/receiving features once draft capital is in. Confirms Vegas-residual-on-residual is a mild win at best. | #378 |
| 2026-05-07 | v27 | Full Ridge refit: v22 features + draft_capital_raw + implied_team_total_raw with `implied_team_total_raw*position` interaction. Same risk profile as v23 (joint refit may drift unrelated coefficients). | 2.458 | 0.582 | -0.041 | BEST (vs v25 all-seasons: −0.093 MAE, R² +0.048, bias −0.627→−0.041 — six-fold reduction). Wins every position vs v25 (QB −0.084, RB −0.105, WR −0.171, K −0.117; TE flat). Position-conditional Vegas coefficients largest for WR (+0.20) and RB/QB (~+0.09), TE near zero. Unlike v23, no vet regression in the position breakdown — WR (vet-heavy) is the biggest winner — suggesting the joint refit is *finding* signal v25's frozen base couldn't. | #378 |
