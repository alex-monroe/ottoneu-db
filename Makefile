# Makefile — Common commands for the Ottoneu DB project
# Usage: make <target>

.PHONY: install dev build lint typecheck test test-python test-web scrape analyze check-db help

# ──────────────────────────────────────────────
# Setup
# ──────────────────────────────────────────────

install: ## Install all dependencies (Python + Node)
	python3 -m venv venv
	. venv/bin/activate && pip install -r requirements.txt
	. venv/bin/activate && playwright install chromium
	cd web && npm install

# ──────────────────────────────────────────────
# Frontend
# ──────────────────────────────────────────────

dev: ## Start Next.js dev server on localhost:3000
	cd web && npm run dev

build: ## Production build (validates correctness)
	cd web && npm run build

lint: ## Run ESLint on web/
	cd web && npm run lint

typecheck: ## TypeScript type checking
	cd web && npx tsc --noEmit

# ──────────────────────────────────────────────
# Testing
# ──────────────────────────────────────────────

test: test-python test-web ## Run all tests

test-python: ## Run Python tests with coverage
	. venv/bin/activate && python -m pytest --cov=. --cov-report=term-missing

test-web: ## Run Jest tests with coverage
	cd web && npx jest --coverage

# ──────────────────────────────────────────────
# Backend
# ──────────────────────────────────────────────

scrape: ## Run full scrape pipeline (enqueue batch + worker)
	. venv/bin/activate && python scripts/ottoneu_scraper.py

analyze: ## Run all analysis scripts
	. venv/bin/activate && python scripts/run_all_analyses.py

check-db: ## Verify database contents
	. venv/bin/activate && python scripts/check_db.py

# ──────────────────────────────────────────────
# CI validation (mimics GitHub Actions)
# ──────────────────────────────────────────────

ci: lint typecheck test ## Run full CI suite locally

# ──────────────────────────────────────────────
# Help
# ──────────────────────────────────────────────

help: ## Show this help message
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2}'
