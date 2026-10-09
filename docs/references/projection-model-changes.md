# Projection Model Changes

The validation protocol for any change to the projection system. Summarised in
[AGENTS.md](../../AGENTS.md); this is the full version. The `/experiment`,
`/ablation`, `/compare-models` and `/projection-accuracy` skills implement it.

## The gate

When any task modifies the projection system — including `scripts/feature_projections/`, `scripts/projection_methods.py`, `scripts/update_projections.py`, or `model_config.py` — you MUST validate it on the **leakage-free held-out harness**. The in-sample `accuracy-report` scores learned models on the seasons they trained on (methodology audit, Findings 1 & 2); it is a **secondary diagnostic only** and must never be the gate or the basis for a promote decision. Use `/experiment` to run this flow.

1. **Run the held-out re-rank** against the active model and the naïve baselines,
   (confirm which model is active with `just list-models --check` — it is read from
   `projection_models.is_active`, not hardcoded; as of 2026-08-31 it is `v44_eb_pooling_perpos`), on the rolling-origin protocol (#594). Learned models retrain out-of-sample inside the sandbox; additive/external models need their held-out projections generated first (`just project <name> 2023,2024,2025`). The cache (#597) makes re-runs fast.
   ```
   just holdout-eval --protocol rolling --eval-seasons 2023,2024,2025 --min-train-season 2021 \
     --models <name>,<active-model>,naive_prior_season_ppg,position_mean_baseline
   ```
2. **Test significance vs the active model** (player-clustered paired bootstrap). This is the gate — a point-estimate MAE delta is **not** a result:
   ```
   just significance <name> <active-model> --protocol rolling --eval-seasons 2023,2024,2025 --min-train-season 2021
   ```
   **Ranking gate (#667 L4):** add `--metric spearman --position <QB|RB|WR|TE>` to bootstrap the **Spearman-ρ delta** instead of the MAE delta — the within-position *ordering* gate the downstream consumers (VORP, surplus, auction, keepers) actually care about (#598). The ranking signal is larger than the MAE signal, so this gate detects ordering wins/losses the underpowered MAE bootstrap is blind to (it confirmed FP significantly out-orders v33 at QB, ρ 0.71 vs 0.81, p=0.001). For ordering-targeted changes, gate on ρ and require MAE not significantly regress; for level changes, the reverse.
   Availability-touching changes additionally run `just availability-backtest` and report **both** rate and availability MAE (#574).
3. **In the PR description**, lead with the held-out ranking + significance verdict (and the per-position Ranking-quality rows, #598). Include the in-sample `accuracy-report` table only if labelled "in-sample diagnostic — not the ranking".
4. **Promotion requires a *significant* held-out win over the active model** (CI excludes 0), never a point-estimate delta. Promote via `just promote <model>` (or `cli.py promote --model <name>`) — `update_projections.py` reads `projection_models.is_active` dynamically (no hardcoded `ACTIVE_MODEL`). Methodology copy on `/projections`, `/arbitration` (projected mode), and `/projection-accuracy` is rendered live by `<ActiveModelCard>` (`web/components/ActiveModelCard.tsx`) from `fetchActiveProjectionModel()`, so do **not** hardcode model names or feature lists in page copy.

**Confirmation discipline (#594):** iterate against the rolling folds; the final window (2025, then 2026 actuals) is confirmation-only — one look per experiment. See [docs/exec-plans/projection-methodology-audit.md](../exec-plans/projection-methodology-audit.md) for the protocol. This ensures every projection change is empirically validated, out-of-sample, before merge.

## Feature changes require test updates

When adding or rewriting a projection feature, check and update the corresponding tests in `scripts/tests/test_feature_projections.py`. Each feature class has a `Test<FeatureName>Feature` test class. Behavioral changes (e.g., a feature that previously required 2 seasons now works with 1) will cause existing tests to fail in CI if not updated.

## Rookie snap trajectory (weighted_ppg feature)

The `WeightedPPGFeature` applies an H2/H1 snap-per-game multiplier to first-year players (`_rookie_trajectory`). This is appropriate for skill positions (WR/RB/TE) where rising snap share signals growing role. It is **not** appropriate for:

- **QB**: A starting QB already receives all offensive snaps. A high H2/H1 ratio simply means they took over mid-season, not that they'll be better next year.
- **K**: Snap counts are irrelevant to kicker scoring.

`v12_no_qb_trajectory` and every model that inherits its base feature (e.g. `WeightedPPGNoQBTrajectoryFeature`) disable the trajectory for QB and K. Do not re-enable it for those positions in new models.
