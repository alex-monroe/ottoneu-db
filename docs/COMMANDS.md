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

> **Worktree note:** Git worktrees check out tracked files (including `config.json`) but not `node_modules/` or other gitignored files.
> Before building in a worktree, run `npm install` in `web/`. `config.json` is tracked, so no copy step is needed.

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
# Note: VORP, surplus value, arbitration, and projected-salary calculations now live
# canonically in the TypeScript web UI (web/lib/). The former analyze_*.py report
# scripts have been removed; only the projection update step remains on the backend.
python scripts/update_projections.py                 # Update player projections (runs active model + promote + rookie fallback)
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

# Utilities
python scripts/check_db.py                           # Verify database contents
python -m pytest                                     # Run all Python tests
```

## just Recipes

Install `just` once with `brew install just`, then run any recipe from the repo root:

```bash
just                    # List all recipes
just install            # Install all dependencies (Python + Node) from the pinned lock
just lock               # Regenerate uv.lock + requirements.txt after editing pyproject.toml deps
just gen-config         # Regenerate the league-constant blocks in config.py + config.ts from config.json
just doctor             # Diagnose known environment traps (offline, ~1s)
just dev                # Start Next.js dev server on localhost:3000
just dev-stop           # Kill the dev server + stray Turbopack/postcss workers
just build              # Production build
just lint               # ESLint
just typecheck          # TypeScript type check
just test               # Run all tests (Python + web)
just test-python        # Python tests with coverage
just test-web           # Jest tests with coverage
just test-web-file <path>  # Run a single web test file (e.g. just test-web-file __tests__/lib/session.test.ts)
just scrape             # Full scrape pipeline
just analyze            # Update player projections (active model + promote + rookie fallback)
just check-db           # Verify database contents
just check-arch         # Architectural/structural tests (includes check-migrations)
just check-migrations   # Lint migrations/ naming + sequence (offline; see migrations/README.md)
just check-docs         # Documentation freshness check
just check-schema       # DB schema drift: live DB vs types + db-schema.md (read-only; on-demand, post-migration)
just permission-report [--days N] [--check]  # Permission-prompt rate + top families; --check exits 2 on 7d-vs-28d regression (see docs/references/autonomous-operation.md)
just preflight          # Fast pre-PR gate (~9s): lint + typecheck + both test suites (no coverage) + doc checks
just install-hooks      # Install the opt-in pre-push hook that runs `just preflight` (skip a push with --no-verify)
just ci                 # Full CI suite (lint + typecheck + tests + doc checks)
just roster-context [season]  # Build the roster-question context pack (live league data); season defaults to 2026
just league-explorer <cmd>    # Explore other public Ottoneu leagues → local SQLite (scan | discover | scrape | report | query); see docs/references/league-explorer.md

# Projection CLI
just list-models                                    # List available models
just project <model> [seasons]                      # Generate projections
just backtest <model> [seasons]                     # Backtest against actuals
just rookie-backtest [--seasons ...] [--output ...] # Backtest rookie (0-history) path vs baselines
just train <model> [seasons]                        # Train a learned model
just promote <model>                                # Promote model to production
just compare <models> [season]                      # Compare two or more models
just diagnostics [--model <m>] [--season <s>] ...  # Per-player diagnostics
just segment-analysis [--segments <s>] ...          # Segmented accuracy analysis
just accuracy-report [--run-backtest] ...           # Generate accuracy report (in-sample diagnostic)

# Honest (leakage-free) evaluation harness — the gate for any projection change
just holdout-eval [--protocol rolling] [--eval-seasons ...] [--min-train-season Y] [--models ...] [--matched] [--population harmonized] [--no-cache]
                                                    # Re-rank all models out-of-sample (GH #572, #594)
                                                    # --population harmonized: fixed top-N/position to neutralise 2021–2023 coverage drift (#599)
just significance <model_a> <model_b> [--protocol rolling] [--eval-seasons ...] [--no-cache]
                                                    # Player-clustered paired bootstrap of the MAE gap (GH #573, #594)
just availability-backtest [...]                    # Availability-inclusive backtest (rate vs availability budget, GH #574)
just coverage-report [--min-games N]                # Qualifying-population coverage: player_stats vs nflverse, per season (GH #599)
# Held-out predictions are cached under .cache/holdout/, keyed on (model, train window, eval window,
# model-definition fingerprint), so a second holdout-eval/significance run skips retraining (GH #597).
# The cache is SHARED across git worktrees (GH #629): it resolves to the main checkout's
# .cache/holdout (override with OTTONEU_HOLDOUT_CACHE), so experiment worktrees reuse the main
# checkout's folds instead of recomputing them.
# Editing a model's definition or any feature code invalidates the affected entries automatically;
# pass --no-cache to force a full retrain. After a stats backfill the keys are stale (they don't
# capture DB contents) — clear with `just clear-holdout-cache`.
just clear-holdout-cache                            # Delete the (shared) holdout cache — run after a stats backfill (GH #597, #629)

# Backfills / seeds
just backfill-nfl-stats [--seasons ...] [--dry-run]    # Backfill nfl_stats from nflverse
just backfill-draft-capital [--since YYYY] [--dry-run] # Backfill draft_capital from nflverse draft_picks
just backfill-vegas [--since YYYY | --current] [--dry-run]  # Backfill team_vegas_lines from nflverse games.csv (--current = projection season only)
just backfill-depth-charts [--since YYYY] [--until YYYY] [--current] [--dry-run]  # Backfill depth_charts (opening-day depth tier) from nflverse (--current = projection season only)
just seed-win-totals --season YYYY                     # Upsert preseason sportsbook win totals (implied_total left NULL until schedule drops)
just scrape-draft-sharks [--season YYYY] [--positions qb rb wr te] [--dry-run]  # Scrape Draft Sharks Half-PPR Superflex auction values (stored ×2 for the $400 cap)
just scrape-calendar [--dry-run]                      # Scrape the Ottoneu finances Calendar into league_calendar (drives the season-cycle resolver)

# Ad-hoc DB queries
just py "<python-snippet>"                          # Run a one-off Python snippet against the project venv (read-only diagnostics)
```

## Scheduled & On-Demand Automation

Production scheduling lives in **GitHub Actions** (`.github/workflows/`), not a local cron.
The cron snippets at the bottom of this section are kept only as a reference for what an
equivalent self-hosted setup would look like.

### GitHub Actions

| Workflow | Trigger | What it runs |
|----------|---------|--------------|
| `scrape-players.yml` | Daily 06:00 UTC (gated to Sep–Jan) + `workflow_dispatch` | `scripts/ottoneu_scraper.py` — full roster + player-card scrape (uses `SUPABASE_URL` / `SUPABASE_SECRET_KEY`) |
| `scrape-arbitration-progress.yml` | Every 6h (gated to Jan–Mar + Apr 1) + `workflow_dispatch` | `scripts/scrape_arbitration_progress.py` — pulls per-team allocation status via FanGraphs login (`FANGRAPHS_USERNAME` / `FANGRAPHS_PASSWORD`) |
| `scrape-draft-sharks.yml` | Mondays 08:00 UTC + `workflow_dispatch` | `scripts/scrape_draft_sharks.py` — Draft Sharks Half-PPR Superflex auction values (no in-season gate; ×2 for the $400 cap) |
| `scrape-league-calendar.yml` | Mondays 12:00 UTC + `workflow_dispatch` | `scripts/scrape_league_calendar.py` — refreshes `league_calendar`, the source of truth for the season-cycle resolver. Requires FanGraphs login. |
| `update-projections.yml` | `workflow_dispatch` only (push trigger removed in #622 — promotion is a deliberate local action via `just promote`) | `scripts/update_projections.py` — re-runs the active model and promotes its outputs into `player_projections` |
| `offseason-data-refresh.yml` | Daily 09:00 UTC (Apr–Sep) + `workflow_dispatch` | Refreshes the upcoming season's evolving inputs — `backfill_depth_charts.py --current` (depth charts) + `backfill_vegas_lines.py --current` (Vegas lines) — then `update_projections.py` to re-project. Idempotent; no-ops until the season's nflverse data appears. GH #555 |
| `backfill-nfl-stats.yml` | `workflow_dispatch` only (seasons + dry-run inputs) | `scripts/backfill_nfl_stats.py` — historical NFL stats backfill from nflverse |
| `backfill-player-stats.yml` | `workflow_dispatch` only (seasons input) | Historical Ottoneu `player_stats` backfill |
| `run-tests.yml` | Push & PR against `main`/`master` | Full CI — Python (`pytest`) + web (Jest) + doc freshness check |
| `claude-code-review.yml` | PR opened by Jules · `/claude-review` comment · `workflow_dispatch` | Claude-driven automated code review on the target PR |

All scheduled scraping workflows that hit Supabase use the **service key**
(`secrets.SUPABASE_SECRET_KEY`) for writes — anon would be blocked by RLS.

### Equivalent local cron (reference only)

```bash
# Daily at 6 AM: enqueue batch and run worker
0 6 * * * cd /path/to/ottoneu_db && source venv/bin/activate && python scripts/enqueue.py batch && python scripts/worker.py

# Every 6 hours (Jan-Mar): scrape arbitration progress
0 */6 * 1-3 * cd /path/to/ottoneu_db && source venv/bin/activate && python scripts/scrape_arbitration_progress.py
```
