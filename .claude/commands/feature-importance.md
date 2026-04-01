---
description: Inspect learned model coefficients and feature importance
---
Follow these steps to analyze feature importance for a learned model:

// turbo

1. **Identify the learned model** (default: v20_learned_usage). If the user specifies a model in the arguments, use that instead.

2. **Try running the feature analysis script:**
   ```bash
   source venv/bin/activate && python scripts/feature_projections/feature_analysis.py \
     --model MODEL_NAME --seasons 2022,2023,2024
   ```

3. **If the script succeeds**, present its output (correlation matrix, feature-target correlations, VIF, importance ranking).

4. **If the script fails or doesn't exist**, manually analyze the trained model JSON:
   - Read `scripts/feature_projections/trained_models/MODEL_NAME.json`
   - For each feature, compute effective importance = |coefficient| × scaler_scale
   - Rank features by effective importance
   - Compute and flag VIF concerns (features with similar names/roles)

5. **Present a ranked importance table:**
   ```
   Rank | Feature                         | Coefficient | Scale  | Importance | Notes
   1    | weighted_ppg_no_qb_trajectory   | +1.170      | 4.867  | 5.694      | Base feature
   2    | usage_share_raw*base_ppg        | +0.517      | 1.568  | 0.811      | Interaction
   3    | age_curve                       | -0.342      | 1.203  | 0.411      | Adjustment
   ...
   ```

6. **Flag concerns:**
   - Features with near-zero importance (candidates for removal via `/ablation`)
   - Features with VIF > 5 (multicollinearity concern)
   - Unexpected coefficient signs (e.g., positive age_curve for old players)

7. **Summarize**: Which features drive the model? Are there redundant features? Any surprising coefficient directions?
