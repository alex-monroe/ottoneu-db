---
description: Run projection accuracy comparison across all models and generate a report table
---
Follow these steps to generate a projection accuracy comparison table:

// turbo
1. **If a new model was just added**, first run it for ALL backtest seasons before running the report.
   Missing seasons show as `—` in the table and corrupt the combined averages.
   ```
   just project <new_model> 2022,2023,2024,2025
   ```

2. Run backtests for all models, then generate the report
`just accuracy-report --run-backtest --seasons 2022,2023,2024,2025`

3. The report is saved to `docs/generated/projection-accuracy.md` and printed to stdout.
   Include the full markdown table in any task output or PR description when this relates to a projection model change.

4. When comparing a specific pair of models (e.g., after adding a new model), you can also run:
`just compare v1_baseline_weighted_ppg,<new_model> 2024`
