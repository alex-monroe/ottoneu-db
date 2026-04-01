---
description: Run feature ablation study to measure individual feature contributions
---
Follow these steps to run a feature ablation study:

// turbo

1. **Identify the target model** (default: the current best model, v20_learned_usage). If the user specifies a model in the arguments, use that instead.

2. **List the model's features** by reading `scripts/feature_projections/model_config.py`. Identify the base feature (cannot be removed) and all adjustment features.

3. **For each adjustment feature**, run a hypothesis test that removes it:
   ```bash
   source venv/bin/activate && python scripts/feature_projections/hypothesis_test.py \
     --base-model MODEL_NAME --remove-feature FEATURE_NAME --seasons 2022,2023,2024,2025
   ```

   If `hypothesis_test.py` is not available or errors, manually:
   - Note the feature to remove
   - Create a temporary model variant in model_config.py without that feature
   - Run projections and backtest for the variant
   - Record the results
   - Revert the model_config.py change

4. **Compile results into an ablation table:**
   ```
   Feature Removed        | MAE Delta | R² Delta | Verdict
   age_curve              | +0.15     | -0.04    | KEEP (significant)
   regression_to_mean     | +0.02     | -0.01    | KEEP (marginal)
   qb_backup_penalty      | +0.005   | -0.001   | DROP CANDIDATE
   ```

5. **Assign verdicts per feature:**
   - **KEEP (significant)**: Removing increases MAE by >0.05
   - **KEEP (marginal)**: Removing increases MAE by 0.02-0.05
   - **DROP CANDIDATE**: Removing increases MAE by <0.02 or improves it
   - **HARMFUL**: Removing actually decreases MAE (improves accuracy)

6. **Summarize findings**: Which features are load-bearing? Which are deadweight? Are there any features that are actively harmful?
