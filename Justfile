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

# Run all analysis scripts
analyze:
    {{python}} scripts/run_all_analyses.py

# Verify database contents
check-db:
    {{python}} scripts/check_db.py

# ──────────────────────────────────────────────
# Harness checks
# ──────────────────────────────────────────────

# Run architectural/structural tests only
check-arch:
    {{pytest}} scripts/tests/test_architecture.py -v
    cd web && npx jest __tests__/lib/architecture.test.ts --no-coverage

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

# Train a learned model  (e.g. just train v24_learned_elite)
train model seasons="2022,2023,2024":
    {{python}} scripts/feature_projections/train_model.py --model {{model}} --seasons {{seasons}}

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

# Seed preseason win totals  (e.g. just seed-win-totals --season 2026)
seed-win-totals *args:
    {{python}} scripts/seed_preseason_win_totals.py {{args}}

# ──────────────────────────────────────────────
# Ad-hoc DB queries
# ──────────────────────────────────────────────

# Run a one-off Python snippet against the project venv (read-only diagnostics)
# Usage: just py "from scripts.config import get_supabase_client; print(get_supabase_client().table('players').select('id', count='exact').execute().count)"
py snippet:
    {{python}} -c {{quote(snippet)}}
