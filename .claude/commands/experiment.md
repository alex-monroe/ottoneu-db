---
description: Run a controlled experiment on a new/modified projection model variant
---
Follow these steps to run a controlled experiment on a projection model:

// turbo

1. **Identify the model to test.** If no model is specified in the arguments, check `git diff` for changes to `model_config.py` to detect new/modified models. If nothing found, ask the user which model to test.

2. **If the model uses `combiner_type="learned"`**, train it first:
   ```bash
   source venv/bin/activate && python scripts/feature_projections/train_model.py --model MODEL_NAME --seasons 2022,2023,2024
   ```

3. **Generate projections for ALL backtest seasons** (this is mandatory — do not skip any season):
   ```bash
   source venv/bin/activate && python scripts/feature_projections/cli.py run --model MODEL_NAME --seasons 2022,2023,2024,2025
   ```

4. **Run backtest and generate accuracy report:**
   ```bash
   source venv/bin/activate && python scripts/feature_projections/accuracy_report.py --run-backtest --seasons 2022,2023,2024,2025 --output docs/generated/projection-accuracy.md
   ```

5. **Extract metrics** from the generated report for the new model, v1_baseline_weighted_ppg (baseline), and v20_learned_usage (current best). Present a compact verdict table:
   ```
   Model              | ALL MAE | ALL R² | QB MAE | RB MAE | WR MAE | TE MAE | Verdict
   v1_baseline        | X.XXX   | 0.XXX  | X.XXX  | X.XXX  | X.XXX  | X.XXX  | baseline
   v20_learned_usage  | X.XXX   | 0.XXX  | X.XXX  | X.XXX  | X.XXX  | X.XXX  | current best
   NEW_MODEL          | X.XXX   | 0.XXX  | X.XXX  | X.XXX  | X.XXX  | X.XXX  | ???
   ```

6. **State the verdict:**
   - **IMPROVEMENT** if ALL MAE < v20's ALL MAE
   - **REGRESSION** if ALL MAE > v20's ALL MAE
   - **NEUTRAL** if ALL MAE within ±0.01 of v20

7. **Append to experiment log** at `docs/generated/experiment-log.md` with date, model name, change description, ALL MAE, ALL R², ALL Bias, verdict, and PR number (if known).

8. **Include the full accuracy table** in any PR description when creating a PR for this change.
