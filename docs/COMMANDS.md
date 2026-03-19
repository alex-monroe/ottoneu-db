# Commands

## Frontend (run from `web/`)

```bash
npm run dev          # Dev server on localhost:3000
npm run build        # Production build (validates correctness)
npm run lint         # ESLint
npx tsc --noEmit     # TypeScript type checking
npm test             # Jest tests
npm start            # Production server
```

## Backend (run from project root, venv must be active)

All Python commands below assume the venv is activated. If running without activation, use `venv/bin/python` instead of `python`.

```bash
source venv/bin/activate

# Scraping
python scripts/ottoneu_scraper.py                    # Full scrape pipeline (backward-compat wrapper: enqueues batch + runs worker)
python scripts/enqueue.py batch                      # Enqueue full pipeline (NFL stats + all 5 positions)
python scripts/enqueue.py roster --position QB       # Enqueue single position scrape
python scripts/enqueue.py player --ottoneu-id 6771 --name "Josh Allen" --player-uuid <uuid>  # Enqueue single player card scrape
python scripts/enqueue.py nfl-stats                  # Enqueue NFL stats pull only
python scripts/enqueue.py status                     # Show recent job statuses
python scripts/worker.py                             # Process pending scraper jobs (exit when done)
python scripts/worker.py --poll                      # Process jobs continuously (for scheduling)

# Analysis
python scripts/analyze_efficiency.py                 # Calculate efficiency metrics
python scripts/run_all_analyses.py                   # Run full analysis suite
python scripts/update_projections.py                 # Update player projections
python scripts/analyze_projected_salary.py           # Keep vs cut decisions for The Witchcraft
python scripts/analyze_vorp.py                       # Positional scarcity / Value Over Replacement
python scripts/analyze_surplus_value.py              # Dollar value vs salary for all players
python scripts/analyze_arbitration.py                # Identify opponents' vulnerable players
python scripts/analyze_arbitration_simulation.py     # Monte Carlo arbitration simulation (100 runs)
python scripts/analyze_projected_arbitration.py      # Projected arbitration targets based on historical stats

# Feature-based Projections
python scripts/feature_projections/cli.py list                                              # List available model definitions
python scripts/feature_projections/cli.py run --model v1_baseline_weighted_ppg --seasons 2024,2025,2026  # Generate projections
python scripts/feature_projections/cli.py backtest --model v1_baseline_weighted_ppg --test-seasons 2024,2025  # Backtest against actuals
python scripts/feature_projections/cli.py compare --models v1_baseline_weighted_ppg,v2_age_adjusted --season 2024  # Compare models
python scripts/feature_projections/cli.py promote --model v2_age_adjusted                   # Promote model to production
python scripts/feature_projections/accuracy_report.py                                       # Generate accuracy table from cached backtest results
python scripts/feature_projections/accuracy_report.py --run-backtest                        # Re-run all backtests then generate report
python scripts/feature_projections/accuracy_report.py --seasons 2024,2025 --output PATH    # Custom seasons or output path
python scripts/feature_projections/cli.py diagnostics                                      # Per-player diagnostics (auto-detects model & season)
python scripts/feature_projections/cli.py diagnostics --model v6_usage_share --season 2025 --top 20  # Custom options
python scripts/feature_projections/diagnostics.py --output docs/generated/player-diagnostics.md      # Standalone with markdown output
python scripts/feature_projections/cli.py segment-analysis                                         # Segmented accuracy analysis (all segments, default models/seasons)
python scripts/feature_projections/cli.py segment-analysis --segments experience,age_bucket         # Specific segments only
python scripts/feature_projections/cli.py segment-analysis --models v8_age_regression --seasons 2024,2025  # Custom models/seasons

# Utilities
python scripts/check_db.py                           # Verify database contents
streamlit run scripts/visualize_app.py               # Streamlit dashboard
python -m pytest                                     # Run all Python tests
```

## Makefile Shortcuts

```bash
make test          # Run all tests (Python + web)
make lint          # ESLint
make typecheck     # TypeScript type check
make build         # Production build
make dev           # Start dev server
make check-arch    # Run architectural/structural tests only
make check-docs    # Check documentation freshness
make ci            # Full CI suite (lint + typecheck + tests + doc checks)
```

## Daily Scheduling (cron)

```bash
# Daily at 6 AM: enqueue batch and run worker
0 6 * * * cd /path/to/ottoneu_db && source venv/bin/activate && python scripts/enqueue.py batch && python scripts/worker.py
```
