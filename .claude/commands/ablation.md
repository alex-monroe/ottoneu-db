---
description: Run feature ablation study to measure individual feature contributions
---
Measure each feature's contribution **on the leakage-free held-out harness**.
The old `hypothesis_test.py` flow is **in-sample only** (it scores over the same
seasons the model trained on) and its 0.05/0.02 MAE thresholds are exactly the
arbitrary-band decisions Finding 2 condemned — do not use it for verdicts.

// turbo

1. **Identify the target model** (default: the active model `v44_eb_pooling_perpos`
   as of 2026-07 — always confirm from `projection_models.is_active`). If the user
   specifies a model, use that.

2. **List the model's features** from `scripts/feature_projections/model_config.py`.
   Identify the base feature (cannot be removed) and the adjustment features.

3. **For each adjustment feature, define a temporary ablated variant** in
   `model_config.py` (same model minus that one feature/interaction), with a clear
   name like `MODEL_NAME_no_FEATURE`. Keep the edits staged but uncommitted.

4. **Score the full model and every ablated variant on the held-out harness**
   (rolling protocol; the cache makes the repeated runs fast):
   ```bash
   just holdout-eval --protocol rolling --eval-seasons 2023,2024,2025 --min-train-season 2021 \
     --models MODEL_NAME,MODEL_NAME_no_FEATURE_A,MODEL_NAME_no_FEATURE_B,...
   ```
   For each ablated variant, test whether removing the feature *significantly*
   changes accuracy vs the full model:
   ```bash
   just significance MODEL_NAME MODEL_NAME_no_FEATURE_A --protocol rolling \
     --eval-seasons 2023,2024,2025 --min-train-season 2021
   ```

5. **Compile the ablation table** from the held-out numbers + significance:
   ```
   Feature Removed     | Held-out MAE Δ | 95% CI            | Significant? | Verdict
   age_curve           | +0.15          | [+0.08, +0.22]    | Y            | KEEP (load-bearing)
   regression_to_mean  | +0.02          | [-0.03, +0.07]    | N            | DROP CANDIDATE
   qb_backup_penalty   | -0.01          | [-0.05, +0.03]    | N            | DROP CANDIDATE
   ```

6. **Assign verdicts from significance, not a fixed MAE band:**
   - **KEEP (load-bearing)** — removing it *significantly* increases MAE (CI > 0).
   - **DROP CANDIDATE** — removing it has no significant effect (CI spans 0). The
     feature is not earning its complexity; prune it (Finding 4: prune, don't add).
   - **HARMFUL** — removing it *significantly* decreases MAE (CI < 0). Remove it.
   Check the per-position **Ranking quality** section too (#598): a feature can be
   MAE-neutral but improve within-position ordering, which the decisions consume.

7. **Revert the temporary `model_config.py` variants** once the table is recorded.

8. **Summarize**: which features are load-bearing, which are deadweight, which are
   actively harmful — all judged on the held-out, significance-tested numbers.
