---
description: Run projection accuracy comparison across all models and generate a report table
---
Follow these steps to generate a projection accuracy comparison table:

// turbo
1. Activate the virtual environment and run backtests for all models, then generate the report
`source venv/bin/activate && python scripts/feature_projections/accuracy_report.py --run-backtest --seasons 2024,2025`

2. The report is saved to `docs/generated/projection-accuracy.md` and printed to stdout.
   Include the full markdown table in any task output or PR description when this relates to a projection model change.

3. When comparing a specific pair of models (e.g., after adding a new model), you can also run:
`source venv/bin/activate && python scripts/feature_projections/cli.py compare --models v1_baseline_weighted_ppg,<new_model> --season 2024`
