---
description: Side-by-side comparison of 2-3 projection models with per-player divergence
---
Compare 2–3 projection models side by side, **leading with held-out (leakage-free)
metrics**. The in-sample `accuracy-report` / `cli.py compare` tables score
learned models on data they trained on (Findings 1 & 2) — use them only for
per-player divergence inspection, never to declare a winner.

// turbo

1. **Parse model names from arguments** (2–3 names, e.g. `v44 v14`). Resolve
   partial names to full names from `model_config.py` (`v44` → `v44_eb_pooling_perpos`).

2. **Held-out comparison (the verdict).** Score exactly the requested models
   out-of-sample on the shared window:
   ```bash
   just holdout-eval --protocol rolling --eval-seasons 2023,2024,2025 --min-train-season 2021 \
     --models MODEL_A,MODEL_B[,MODEL_C]
   ```
   Present the focused per-position table from the generated report, including the
   **Ranking quality** rows (Spearman ρ + top-N hit, #598). Whenever two models
   are close, confirm with the paired bootstrap rather than eyeballing MAE:
   ```bash
   just significance MODEL_A MODEL_B --protocol rolling --eval-seasons 2023,2024,2025 --min-train-season 2021
   ```
   State the winner as "significantly better" or "not separable", never as a bare
   MAE delta.

3. **Per-player divergence (diagnostic, most recent season).** Use `cli.py
   compare` to see where the models disagree most — this is for understanding
   *why* they differ, not for scoring:
   ```bash
   just compare MODEL_A,MODEL_B 2025
   ```
   Present the top ~10 players by absolute projection difference.

4. **Summarize**: which model is significantly better out-of-sample (level *and*
   ordering), where each is strong/weak by position, and what drives the largest
   per-player disagreements.
