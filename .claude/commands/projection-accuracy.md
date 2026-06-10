---
description: Run projection accuracy comparison across all models and generate a report table
---
Generate the model accuracy comparison. **Lead with the leakage-free held-out
ranking**; the in-sample `accuracy-report` table is a secondary diagnostic only
(it scores learned models on data they trained on — methodology audit, Findings
1 & 2).

// turbo

1. **Held-out ranking (the honest comparison).** Re-rank every model
   out-of-sample (learned models retrain in a sandbox; the cache makes re-runs
   fast). Prefer the rolling-origin protocol (#594):
   ```bash
   just holdout-eval --protocol rolling --eval-seasons 2023,2024,2025 --min-train-season 2021
   ```
   Output: `docs/generated/projection-holdout-eval-rolling.md` (fixed-window:
   `projection-holdout-eval.md`). This is the table to quote in any PR. It also
   carries the **Ranking quality** section — per-position Spearman ρ + top-N hit
   rate (#598), the metrics VORP/auction/keeper decisions actually consume.

2. **Significance of any close call.** A point-estimate MAE gap is not a result;
   confirm it with the player-clustered paired bootstrap:
   ```bash
   just significance MODEL_A MODEL_B --protocol rolling --eval-seasons 2023,2024,2025 --min-train-season 2021
   ```

3. **In-sample diagnostic (optional, label it as such).** Useful for spotting
   per-season anomalies, never for picking a winner:
   ```bash
   just accuracy-report --run-backtest --seasons 2022,2023,2024,2025
   ```
   If you include this table anywhere, label it "in-sample diagnostic — not the
   ranking" and pair it with the held-out table.

4. **If a new additive/external model was just added**, generate its held-out
   projections first so it appears in the report (learned models need no
   pre-projection — `holdout-eval` retrains them):
   ```bash
   just project <new_model> 2023,2024,2025
   ```
