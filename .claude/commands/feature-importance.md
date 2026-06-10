---
description: Inspect learned model coefficients and feature importance
---
Inspect a learned model's coefficients to understand *what it leans on*. This is
a **diagnostic**, not a selection tool: coefficient magnitude is in-sample and
says nothing about out-of-sample value. To decide whether a feature earns its
place, cross-check with held-out ablation (`/ablation`, #588), not these numbers.

// turbo

1. **Identify the learned model** (default: `v20_learned_usage` — note this is a
   learned reference model, not production; production is the additive
   `v14_qb_starter`, which has no learned coefficients to inspect). Use the
   user-specified model if given.

2. **Run the feature analysis script** (use `venv/bin/python` directly — no
   `source venv/bin/activate`, which fails in worktrees):
   ```bash
   venv/bin/python scripts/feature_projections/feature_analysis.py \
     --model MODEL_NAME --seasons 2022,2023,2024
   ```

3. **If the script succeeds**, present its output (correlation matrix,
   feature-target correlations, VIF, importance ranking).

4. **If the script fails or doesn't exist**, analyze the trained model JSON at
   `scripts/feature_projections/trained_models/MODEL_NAME.json`: per feature,
   effective importance = |coefficient| × scaler_scale; rank by it; flag likely
   collinear feature pairs.

5. **Present a ranked importance table** (Rank | Feature | Coefficient | Scale |
   Importance | Notes).

6. **Flag concerns** — near-zero-importance features (ablation candidates),
   VIF > 5 (multicollinearity), unexpected coefficient signs.

7. **Summarize**, and explicitly route any "this feature looks weak/redundant"
   hunch to `/ablation` for a held-out, significance-tested decision — importance
   here is only a hypothesis generator.
