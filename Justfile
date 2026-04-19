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
