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

> **Worktree note:** Git worktrees share source files but not `node_modules/` or gitignored files.
> Before building in a worktree, run `npm install` in `web/` and copy `config.json` from the main repo root.

## Backend (run from project root, venv must be active)

> **Prefer `just` recipes** for consistency. Use the raw commands below as reference, or when running outside the repo root.

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
python scripts/scrape_arbitration_progress.py        # Scrape Ottoneu arbitration progress (allocations + team status)

# Feature-based Projections
python scripts/feature_projections/cli.py list                                              # List available model definitions
# Note: `run` uses --seasons but `backtest` uses --test-seasons (different flag names)
python scripts/feature_projections/cli.py run --model v1_baseline_weighted_ppg --seasons 2024,2025,2026  # Generate projections
python scripts/feature_projections/cli.py backtest --model v1_baseline_weighted_ppg --test-seasons 2024,2025  # Backtest against actuals
python scripts/feature_projections/cli.py compare --models v1_baseline_weighted_ppg,v2_age_adjusted --season 2024  # Compare models
python scripts/feature_projections/cli.py promote --model v2_age_adjusted                   # Promote model to production
python scripts/feature_projections/accuracy_report.py                                       # Generate accuracy table from cached backtest results
python scripts/feature_projections/accuracy_report.py --run-backtest                        # Re-run all backtests then generate report
python scripts/feature_projections/train_model.py --model <name> --seasons 2022,2023,2024   # Train a learned model (Ridge + LOSO CV)
python scripts/feature_projections/accuracy_report.py --seasons 2024,2025 --output PATH    # Custom seasons or output path
python scripts/feature_projections/cli.py diagnostics                                      # Per-player diagnostics (auto-detects model & season)
python scripts/feature_projections/cli.py diagnostics --model v6_usage_share --season 2025 --top 20  # Custom options
python scripts/feature_projections/diagnostics.py --output docs/generated/player-diagnostics.md      # Standalone with markdown output
python scripts/feature_projections/cli.py segment-analysis                                         # Segmented accuracy analysis (all segments, default models/seasons)
python scripts/feature_projections/cli.py segment-analysis --segments experience,age_bucket         # Specific segments only
python scripts/feature_projections/cli.py segment-analysis --models v8_age_regression --seasons 2024,2025  # Custom models/seasons
python scripts/feature_projections/promote.py <model_name>                                             # Promote a model to production (clears stale rows + upserts new + flips is_active)

# Projection Development Workflow (two-step process)
# Step 1: Generate projections for the model (required after any feature code change)
python scripts/feature_projections/cli.py run --model <name> --seasons 2022,2023,2024,2025
# Step 2: Backtest to evaluate accuracy (uses stored projections from step 1)
python scripts/feature_projections/cli.py backtest --model <name> --test-seasons 2022,2023,2024,2025
# Note: accuracy_report.py --run-backtest re-backtests ALL models but does NOT re-generate
# projections. If you changed feature code, you MUST run step 1 first or results will be stale.

# Learned Model Workflow (three-step: train → run → backtest)
# Step 0: Train the model (fit Ridge coefficients via LOSO cross-validation)
python scripts/feature_projections/train_model.py --model v20_learned_usage --seasons 2022,2023,2024
# Step 1-2: Same as above (run → backtest)

# Model Iteration Tools (substitute --base-model with whatever currently has is_active=TRUE)
python scripts/feature_projections/hypothesis_test.py --base-model <model_name> --scale-feature age_curve=1.5 --seasons 2022,2023,2024,2025  # Quick weight experiment
python scripts/feature_projections/hypothesis_test.py --base-model <model_name> --remove-feature qb_backup_penalty --seasons 2022,2023,2024,2025  # Feature removal test
python scripts/feature_projections/feature_analysis.py --model v20_learned_usage --seasons 2022,2023,2024  # Feature correlation, VIF, importance
python scripts/feature_projections/residual_analysis.py --model v20_learned_usage --seasons 2022,2023,2024,2025  # Residual distribution, heteroscedasticity, persistent errors
python scripts/feature_projections/residual_analysis.py --model v20_learned_usage --seasons 2022,2023,2024,2025 --output docs/generated/residual-analysis.md  # Write markdown report

# Backfills / Seeds
python scripts/backfill_nfl_stats.py --seasons 2024                    # Backfill NFL stats from nflverse for given seasons
python scripts/backfill_draft_capital.py --since 2010                  # Backfill NFL draft picks → `draft_capital`
python scripts/backfill_vegas_lines.py --since 2016                    # Backfill per-team-season Vegas implied totals → `team_vegas_lines`
python scripts/seed_preseason_win_totals.py --season 2026              # Seed preseason win totals (implied_total NULL) before schedule release

# Utilities
python scripts/check_db.py                           # Verify database contents
streamlit run scripts/visualize_app.py               # Streamlit dashboard
python -m pytest                                     # Run all Python tests
```

## just Recipes

Install `just` once with `brew install just`, then run any recipe from the repo root:

```bash
just                    # List all recipes
just install            # Install all dependencies (Python + Node)
just dev                # Start Next.js dev server on localhost:3000
just build              # Production build
just lint               # ESLint
just typecheck          # TypeScript type check
just test               # Run all tests (Python + web)
just test-python        # Python tests with coverage
just test-web           # Jest tests with coverage
just test-web-file <path>  # Run a single web test file (e.g. just test-web-file __tests__/lib/session.test.ts)
just scrape             # Full scrape pipeline
just analyze            # Run all analysis scripts
just check-db           # Verify database contents
just check-arch         # Architectural/structural tests only
just check-docs         # Documentation freshness check
just ci                 # Full CI suite (lint + typecheck + tests + doc checks)

# Projection CLI
just list-models                                    # List available models
just project <model> [seasons]                      # Generate projections
just backtest <model> [seasons]                     # Backtest against actuals
just train <model> [seasons]                        # Train a learned model
just promote <model>                                # Promote model to production
just compare <models> [season]                      # Compare two or more models
just diagnostics [--model <m>] [--season <s>] ...  # Per-player diagnostics
just segment-analysis [--segments <s>] ...          # Segmented accuracy analysis
just accuracy-report [--run-backtest] ...           # Generate accuracy report

# Backfills / Seeds
just backfill-nfl-stats --seasons 2024              # Backfill nflverse NFL stats (supports --dry-run)
just backfill-draft-capital --since 2010            # Backfill NFL draft picks → draft_capital
just backfill-vegas --since 2016                    # Backfill Vegas implied team totals → team_vegas_lines
just seed-win-totals --season 2026                  # Seed preseason win totals before schedule release

# Ad-hoc DB queries
just py "<python_snippet>"                          # Run a one-off Python snippet against the project venv (read-only diagnostics)
just test-web-file <path>                           # Run a single web test file without coverage
```

## Daily Scheduling (cron)

```bash
# Daily at 6 AM: enqueue batch and run worker
0 6 * * * cd /path/to/ottoneu_db && source venv/bin/activate && python scripts/enqueue.py batch && python scripts/worker.py

# Every 6 hours (Jan-Mar): scrape arbitration progress
0 */6 * 1-3 * cd /path/to/ottoneu_db && source venv/bin/activate && python scripts/scrape_arbitration_progress.py
```
