---
description: Run a controlled experiment on a new/modified projection model variant
---
Run a controlled experiment on a projection model **on the leakage-free held-out
harness** (GH #572/#573/#594). Do **not** use the in-sample `accuracy-report`
flow to decide anything — it scores learned models on the data they trained on
(methodology audit, Findings 1 & 2). A verdict is "significant or not", never a
point-estimate delta.

// turbo

1. **Identify the model to test.** If no model is given in the arguments, check
   `git diff` for changes to `model_config.py`. If nothing is found, ask the user.

2. **Make the model's held-out projections available.**
   - **Additive / external models are parameter-free** w.r.t. training seasons, so
     `holdout-eval` reads their projections from the DB — generate them first:
     ```bash
     just project MODEL_NAME 2023,2024,2025
     ```
   - **Learned / residual models** are retrained out-of-sample inside the
     `holdout-eval` sandbox automatically — no pre-training or pre-projection
     needed (and never train on the eval seasons yourself).

3. **Run the held-out re-rank** against production (`v31_depth_chart`) and the
   naïve baselines (`naive_prior_season_ppg`, `position_mean_baseline`). Prefer
   the rolling-origin protocol (#594); the cache (#597) makes re-runs fast:
   ```bash
   just holdout-eval --protocol rolling --eval-seasons 2023,2024,2025 --min-train-season 2021 \
     --models MODEL_NAME,v31_depth_chart,naive_prior_season_ppg,position_mean_baseline
   ```
   Read the **Ranking quality** section too (per-position Spearman ρ + top-N hit
   rate, #598) — the projections feed VORP/auction/keepers, which consume
   *ordering*, not just PPG level.

4. **Test significance vs the production model** (player-clustered paired
   bootstrap, #594). This is the gate:
   ```bash
   just significance MODEL_NAME v31_depth_chart --protocol rolling \
     --eval-seasons 2023,2024,2025 --min-train-season 2021
   ```

5. **If the model touches availability / expected games**, additionally report
   the availability budget (rate vs availability MAE, #574):
   ```bash
   just availability-backtest --models MODEL_NAME,v31_depth_chart
   ```

6. **State the verdict** from the significance test, not an MAE band:
   - **SIGNIFICANT WIN** — the 95% CI for MAE(NEW) − MAE(v31_depth_chart) lies
     entirely below 0. Only this clears the bar to consider promotion.
   - **NOT SIGNIFICANT** — CI spans 0. The gap is sampling noise; do not promote
     on it, regardless of the point estimate.
   - **SIGNIFICANT REGRESSION** — CI lies entirely above 0.
   Also note whether the model out-*ranks* `v14` (Spearman/top-N) even at MAE
   parity — that can justify a ranking-motivated bet (#590/#592).

7. **Append to the experiment log** (`docs/generated/experiment-log.md`) using the
   held-out columns: date, model, change, **held-out ALL MAE**, **Δ vs
   v31_depth_chart**, **95% CI**, **significant? (Y/N)**, protocol, PR. The
   in-sample `accuracy-report` is a secondary diagnostic only.

8. **In the PR description**, lead with the held-out + significance result; the
   in-sample accuracy table, if included, must be labelled "in-sample diagnostic".

**Confirmation discipline (#594):** iterate against the rolling folds; the final
window (2025, then 2026 actuals) is confirmation-only — one look per experiment.
Promotion requires a *significant* held-out win over the active model.
