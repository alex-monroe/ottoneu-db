# Projection Experiment Log

_Tracks every model iteration attempt to prevent re-trying failed approaches._

> ⚠️ **The historical table at the bottom is in-sample for the learned models
> (`v20`–`v31`) — they were trained on the seasons they're scored on; do not read
> those deltas as real gains.** The [methodology audit](../exec-plans/projection-methodology-audit.md)
> (2026-06-10) re-ranked everything out-of-sample. At that point the additive
> `v14_qb_starter` was the honest best (the `v20`→`v31` in-sample "progression"
> was a leakage artifact). **That reversed after the #599 coverage backfill**
> (PRs #607/#608): on the corrected population the learned **`v31_depth_chart`**
> is the honest held-out #1 and *significantly* beats `v14_qb_starter`
> (Δ−0.091, CI [−0.163, −0.020], rolling-origin), so `v31_depth_chart` was
> promoted to active (#609). The current comparator/gate is the active model
> (`projection_models.is_active` = `v31_depth_chart`), **not** `v14_qb_starter`.

## Held-out experiments (post-audit protocol — #594+)

New experiments are logged here with **leakage-free held-out** numbers, the gate
being a *significant* win over the active model. Generate the row with
`/experiment`: `just holdout-eval --protocol rolling …` for the MAE/CI and
`just significance NEW v31_depth_chart --protocol rolling …` for the verdict. Δ
and CI are for `MAE(model) − MAE(v31_depth_chart)` (negative ⇒ model better).
Iterate on the rolling folds; the final window is confirmation-only (one look).

| Date | Model | Change | Held-out ALL MAE | Δ vs v14 | 95% CI | Significant? | Protocol | PR |
|------|-------|--------|------------------|----------|--------|--------------|----------|-----|
| 2026-06-10 | v31_depth_chart | #599 backfill of 2021–2023 player_stats (coverage 29–40%→82–84%); all models re-projected/retrained on the corrected population | 2.232 | **−0.091** | [−0.163, −0.020] | **Y** (p=0.014, 617 clusters) | rolling 2023–2025 | #599 backfill |
| 2026-06-10 | v31_depth_chart | same — fixed window (3-season train handicap) | 2.269 | −0.020 | [−0.113, +0.078] | N (p=0.68) | fixed 2021–23→24–25 | #599 backfill |
| 2026-06-10 | v20_learned_usage | same backfill — over-projection bias check | 2.325 | — | bias −1.060→**−0.032** | bias artifact removed | fixed | #599 backfill |

### Availability / expected-games (#587) — measured on `availability-backtest`, not rate MAE

#587 targets the *availability budget* (avail-MAE − rate-MAE), a different metric
from the rate-MAE held-out table above. Stage (a) is a leakage-free eval-time
expected-games haircut on the rate projection
(`pred_avail = pred × min(E[games], 17)/17`, E[games] from seasons strictly before
the target), exposed as `just availability-backtest --expected-games {none,constant,history}`.
The rate projection — and its `significance` gate — are untouched, so this isolates
the availability question. Seasons 2022–2025, model `v14_qb_starter` (DoD names its
+0.589 budget):

| Mode | Avail MAE | Availability budget | Avail bias | Note |
|------|-----------|---------------------|------------|------|
| none (raw rate) | 2.986 | +0.589 | −1.946 | baseline — no availability modeling |
| constant (per-position mean games) | 2.630 | +0.232 | +1.020 | overcorrects — flat haircut over-penalises durable players |
| **history (player recency-weighted games)** | **2.268** | **−0.130** | **−0.236** | **bar-setter: −0.718 avail MAE (−24%), budget turns negative, bias collapses** |

The per-player **history** haircut clears the DoD decisively — v14's availability
budget +0.589 → −0.130 (below even FantasyPros's −0.124) and the −1.95
over-projection bias collapses to −0.24, with the rate projection unchanged. The
same effect holds on `v8_age_regression` (budget +0.625 → −0.138), so it is not a
v14 quirk. **Guardrail:** the haircut *hurts* already-availability-aware projections
(FantasyPros budget −0.124 → +0.084) — apply it to pure-rate models only.

**Stage (b) — structural expected-games model: NEGATIVE.** Age/position/depth-role
features (linear) tie plain history on games-MAE (3.59→3.58); a nonlinear GBM gets
a fragile ~4% that is hyperparameter-sensitive and burns confirmation looks. Plain
history is the robust production estimator; no trained model. (Matches the issue's
own staging — injury/structural features only if (b) leaves budget; it doesn't.)

**Stage (c) — productionised** as the `projected_games` column (PR #613) and
availability-inclusive value in VORP/surplus/arbitration (PR #614).

**Thin-history guard (c2 review).** The before/after review showed plain history
over-penalises *ascending young players* (thin/partial history reflects a rising
role, not injury — e.g. Penix, Skattebo, Daniels). Empirically, any guard that
lifts them costs games-MAE because the thin-history cohort genuinely under-plays on
average (a blunt "young ⇒ full 17 games" gate worsens games-MAE 3.59→4.74). The
chosen guard floors only players with <3 prior played seasons at 12 games
(`YOUNG_PLAYER_GAMES_FLOOR`): vets keep the full discount, young players aren't
read as injury risks. Cost: v14 availability budget −0.130 → **−0.042** (still well
below the +0.589 no-modeling baseline; avail MAE 2.986 → 2.356, −21%; bias −1.95 →
−0.46) — a deliberate accuracy-for-fairness trade on the young cohort.

| Mode | Avail MAE | Budget | Avail bias |
|------|-----------|--------|------------|
| none (raw rate) | 2.986 | +0.589 | −1.946 |
| history (unguarded) | 2.268 | −0.130 | −0.236 |
| **history + thin-history guard (production)** | **2.356** | **−0.042** | **−0.464** |

## Historical (in-sample) log — pre-audit, deltas not reliable

These rows predate the held-out harness; their `ALL MAE`/`R²` are in-sample for
the learned models (see the warning above). Kept to prevent re-trying failed
approaches, **not** as a ranking.

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
| 2026-06-08 | v28 | v22 with base feature swapped to `weighted_ppg_reliability_no_qb`: per-season games-played reliability factor uses exponent 1.5 instead of linear 1.0, so `(games/17)**1.5` down-weights low-games seasons more aggressively when blending the recency-weighted average. Full-season players are byte-identical (1.0**1.5 == 1.0). Learned ridge refit. | 2.533 | 0.584 | -0.373 | IMPROVEMENT (vs v22 all-seasons: −0.068 MAE, R² +0.051, bias −0.725→−0.373; beats active v25 on MAE 2.542→2.533, R² 0.566→0.584, RMSE 3.393→3.323. Wins every position vs v22: QB 3.789→3.741, RB 3.095→3.029, WR 2.585→2.449, TE 1.811→1.798. Addresses the concern that a recent 3-game season carries less signal than a prior 17-game season — e.g. 3g@6/17g@15 projection moves 12.48→13.74.) | #TBD |
| 2026-06-08 | v29 | v25's residual stack rebuilt on the reliability base: v28_reliability_weighting frozen as base + draft_capital_raw residual (seasons_since_draft ≤ 3, fit_intercept=False). | 2.521 | 0.586 | -0.469 | IMPROVEMENT over v25 (active): −0.022 MAE, R² +0.021. Reliability base lifts the active architecture, but still trails plain v27 (2.483). | #553 |
| 2026-06-08 | v30 | v27's full Ridge refit (advanced receiving + draft_capital + Vegas) with base feature swapped to `weighted_ppg_reliability_no_qb` (reliability exponent 1.5). | 2.507 | 0.590 | -0.376 | REGRESSION vs v27 (2.483→2.507). On the identical 601-player intersection: v27 2.486 vs v30 2.556. Folding the steeper small-sample down-weighting into the best model HURTS — v27 already proxies full-time role via usage/Vegas/draft features, so a distorted base removes signal. Confirms reliability helps thin-feature models only. | #553 |
| 2026-06-08 | v31 | Full Ridge refit on v27's feature set (usage + advanced receiving + draft_capital + Vegas) plus two opening-day depth-chart signals: `depth_chart_position_raw` (starter score 2 − depth_team) and `role_change_raw` (year-over-year depth-tier change), with a `depth_chart_position_raw*position` interaction. New `depth_charts` table backfilled from nflverse (`import_depth_charts`); pre-2025 per-slot `depth_team` and 2025+ snapshot `pos_rank` schemas both normalized to a 1/2/3 tier. Finally replaces the failed historical `team_context` feature with forward-looking role info. GH #391. | 2.439 | 0.620 | -0.356 | BEST (vs v27 all-seasons: −0.044 MAE, R² +0.020, RMSE 3.248→3.183). Wins exactly where role matters most: QB −0.126 MAE (R² 0.404→0.461) and RB −0.203 MAE (R² 0.427→0.494). WR flat (+0.013), TE slight regression (+0.108), K incidental −0.039. Largest learned interaction is `depth_chart_position_raw*QB` (+0.93 PPG/tier) — a starting QB is worth ~a full tier more than the model otherwise sees. Confirms the #391 hypothesis that depth-chart role is most impactful for QB. Not promoted (left to operator). | #554 |
| 2026-06-08 | v31 (retrain) | Same v31 feature set, expanded training data: backfilled `player_stats` 2018–2020 (history window for 2021) and added **2021 + 2025** as training seasons (`just train` default now `2021,2022,2023,2024,2025`). Training set 613 → 1203 samples. No model/feature change — pure data expansion. GH #380. | 2.358 | 0.645 | -0.155 | IMPROVEMENT (same 2022–2025 backtest, N=989: vs prior v31 −0.069 MAE, R² +0.021, RMSE 3.155→3.053, bias −0.438→−0.155). Promoted (remains active). | #TBD |
