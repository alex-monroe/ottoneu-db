# Justfile — Common recipes for the Ottoneu DB project
# Usage: just <recipe>  |  just --list

python := "venv/bin/python"
pytest  := "venv/bin/pytest"

# Show all available recipes
default:
    @just --list

# ──────────────────────────────────────────────
# Setup
# ──────────────────────────────────────────────

# Install all dependencies (Python + Node)
install:
    python3 -m venv venv
    venv/bin/pip install -r requirements.txt
    venv/bin/playwright install chromium
    cd web && npm install

# ──────────────────────────────────────────────
# Frontend
# ──────────────────────────────────────────────

# Start Next.js dev server on localhost:3000
dev:
    cd web && npm run dev

# Stop any running Next dev server and stray Turbopack/postcss workers
dev-stop:
    -pkill -f "next-server" 2>/dev/null; pkill -f "next dev" 2>/dev/null; pkill -f ".next/dev/build" 2>/dev/null; true

# Production build (validates correctness)
build:
    cd web && npm run build

# Run ESLint on web/
lint:
    cd web && npm run lint

# TypeScript type checking
typecheck:
    cd web && npx tsc --noEmit

# ──────────────────────────────────────────────
# Testing
# ──────────────────────────────────────────────

# Run all tests (Python + web)
test: test-python test-web

# Run Python tests with coverage
test-python:
    {{pytest}}

# Run Jest tests with coverage
test-web:
    cd web && npx jest --coverage

# Run a single web test file (no coverage)  (e.g. just test-web-file __tests__/lib/session.test.ts)
test-web-file file:
    cd web && npx jest {{file}} --no-coverage

# ──────────────────────────────────────────────
# Backend
# ──────────────────────────────────────────────

# Run full scrape pipeline
scrape:
    {{python}} scripts/ottoneu_scraper.py

# Update player projections (VORP/surplus/arbitration now computed in the web UI)
analyze:
    {{python}} scripts/update_projections.py

# Verify database contents
check-db:
    {{python}} scripts/check_db.py

# Build the roster-question context pack (live league data)  (e.g. just roster-context 2026)
roster-context season="2026":
    {{python}} scripts/roster_context_pack.py --season {{season}}

# ──────────────────────────────────────────────
# Harness checks
# ──────────────────────────────────────────────

# Run architectural/structural tests only
check-arch: check-migrations
    {{pytest}} scripts/tests/test_architecture.py -v
    cd web && npx jest __tests__/lib/architecture.test.ts --no-coverage

# Lint the migrations/ directory naming + sequence (offline; see migrations/README.md)
check-migrations:
    {{pytest}} scripts/tests/test_migrations.py -v

# Check documentation freshness
check-docs:
    {{python}} scripts/check_docs_freshness.py

# Full CI suite (lint + typecheck + tests + doc checks)
ci: lint typecheck test check-docs

# ──────────────────────────────────────────────
# Projection CLI — fixed args
# ──────────────────────────────────────────────

# Generate projections for a model  (e.g. just project v24_learned_elite)
project model seasons="2022,2023,2024,2025":
    {{python}} scripts/feature_projections/cli.py run --model {{model}} --seasons {{seasons}}

# Backtest a model against actuals  (e.g. just backtest v24_learned_elite)
backtest model seasons="2022,2023,2024,2025":
    {{python}} scripts/feature_projections/cli.py backtest --model {{model}} --test-seasons {{seasons}}

# Backtest the rookie (0-history) projection path  (e.g. just rookie-backtest --seasons 2023,2024,2025)
rookie-backtest *args:
    {{python}} scripts/feature_projections/rookie_backtest.py {{args}}

# Train a learned model  (e.g. just train v24_learned_elite)
train model seasons="2021,2022,2023,2024,2025":
    {{python}} scripts/feature_projections/train_model.py --model {{model}} --seasons {{seasons}}

# Held-out re-rank: retrain learned models on a clean window, score all models OOS (GH #572)
#   rolling-origin folds (#594): just holdout-eval --protocol rolling --eval-seasons 2023,2024,2025 --min-train-season 2021
holdout-eval *args:
    {{python}} scripts/feature_projections/holdout_eval.py {{args}}

# Paired bootstrap (player-clustered): is the held-out MAE gap between two models significant? (GH #573, #594)
#   e.g. just significance v14_qb_starter v31_depth_chart
#   rolling: just significance NEW v14_qb_starter --protocol rolling --eval-seasons 2023,2024,2025 --min-train-season 2021
significance model_a model_b *args:
    {{python}} scripts/feature_projections/significance.py {{model_a}} {{model_b}} {{args}}

# Availability-inclusive backtest: keep injured/partial seasons, measure the availability budget (GH #574)
availability-backtest *args:
    {{python}} scripts/feature_projections/availability_backtest.py {{args}}

# Qualifying-population coverage analysis: player_stats vs nflverse, per season (GH #599)
coverage-report *args:
    {{python}} scripts/feature_projections/coverage_analysis.py {{args}}

# Promote a model to production  (e.g. just promote v24_learned_elite)
promote model:
    {{python}} scripts/feature_projections/cli.py promote --model {{model}}

# Compare two or more models  (e.g. just compare v23_baseline,v24_learned_elite 2024)
compare models season="2024":
    {{python}} scripts/feature_projections/cli.py compare --models {{models}} --season {{season}}

# List all available model definitions
list-models:
    {{python}} scripts/feature_projections/cli.py list

# ──────────────────────────────────────────────
# Projection CLI — variadic passthrough
# ──────────────────────────────────────────────

# Per-player diagnostics  (e.g. just diagnostics --model v24 --season 2025 --top 20)
diagnostics *args:
    {{python}} scripts/feature_projections/cli.py diagnostics {{args}}

# Segmented accuracy analysis  (e.g. just segment-analysis --segments experience,age_bucket)
segment-analysis *args:
    {{python}} scripts/feature_projections/cli.py segment-analysis {{args}}

# Generate accuracy report  (e.g. just accuracy-report --run-backtest)
accuracy-report *args:
    {{python}} scripts/feature_projections/accuracy_report.py {{args}}

# ──────────────────────────────────────────────
# Backfills / seeds
# ──────────────────────────────────────────────

# Backfill NFL stats  (e.g. just backfill-nfl-stats --seasons 2024 ; or --seasons 2018 2019 2020 ; --dry-run supported)
backfill-nfl-stats *args:
    {{python}} scripts/backfill_nfl_stats.py {{args}}

# Backfill draft capital  (e.g. just backfill-draft-capital --since 2010 ; --dry-run supported)
backfill-draft-capital *args:
    {{python}} scripts/backfill_draft_capital.py {{args}}

# Backfill Vegas lines  (e.g. just backfill-vegas --since 2016 ; --dry-run supported)
backfill-vegas *args:
    {{python}} scripts/backfill_vegas_lines.py {{args}}

# Backfill depth charts  (e.g. just backfill-depth-charts --since 2016 ; --dry-run supported)
backfill-depth-charts *args:
    {{python}} scripts/backfill_depth_charts.py {{args}}

# Seed preseason win totals  (e.g. just seed-win-totals --season 2026)
seed-win-totals *args:
    {{python}} scripts/seed_preseason_win_totals.py {{args}}

# Scrape Draft Sharks auction values (x2 for the $400 cap)  (e.g. just scrape-draft-sharks --season 2026 --dry-run)
scrape-draft-sharks *args:
    {{python}} scripts/scrape_draft_sharks.py {{args}}

# Scrape the Ottoneu finances Calendar into league_calendar (drives the season-cycle resolver)
scrape-calendar *args:
    {{python}} scripts/scrape_league_calendar.py {{args}}

# ──────────────────────────────────────────────
# Ad-hoc DB queries
# ──────────────────────────────────────────────

# Run a one-off Python snippet against the project venv (read-only diagnostics)
# Usage: just py "from scripts.config import get_supabase_client; print(get_supabase_client().table('players').select('id', count='exact').execute().count)"
py snippet:
    {{python}} -c {{quote(snippet)}}
