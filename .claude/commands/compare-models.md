---
description: Side-by-side comparison of 2-3 projection models with per-player divergence
---
Follow these steps to compare projection models side-by-side:

// turbo

1. **Parse model names from arguments.** The user should provide 2-3 model names separated by spaces (e.g., `v14 v20 v24`). Resolve partial names to full names from model_config.py (e.g., `v14` → `v14_qb_starter`).

2. **Run the full accuracy report** (if not recently generated):
   ```bash
   source venv/bin/activate && python scripts/feature_projections/accuracy_report.py \
     --seasons 2022,2023,2024,2025 --output docs/generated/projection-accuracy.md
   ```

3. **Extract metrics** for ONLY the specified models from the report. Present a focused comparison table per position:
   ```
   Position | Metric | Model A    | Model B    | Model C    | Best
   ALL      | MAE    | 2.515      | 2.412      | 2.469      | B
   ALL      | R²     | 0.542      | 0.577      | 0.565      | B
   ALL      | Bias   | +0.170     | -0.026     | -0.050     | B
   QB       | MAE    | 3.801      | 3.650      | 3.700      | B
   ...
   ```

4. **For the most recent season** (2025), identify top 10 players where the models diverge most. Fetch projections from DB:
   ```bash
   source venv/bin/activate && python -c "
   from config import get_supabase_client
   supabase = get_supabase_client()
   # Fetch projections for the specified models and compare
   "
   ```

5. **Present the divergence table:**
   ```
   Player         | Pos | Model A | Model B | Max Diff
   Patrick Mahomes| QB  | 18.5    | 20.1    | 1.6
   ...
   ```

6. **Summarize**: Which model wins overall? Where does each model have strengths/weaknesses? Are there position-specific recommendations?
