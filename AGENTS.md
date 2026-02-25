# AGENTS.md

Universal instructions for AI coding agents working on this repository.

## Project Overview

Ottoneu Fantasy Football League 309 analytics platform. Python scripts scrape data into Supabase (PostgreSQL). Next.js frontend provides interactive visualizations.

**Tech stack:** Python 3.9+ · Next.js 16 · React 19 · TypeScript · Tailwind CSS 4 · Supabase · Playwright · pandas · Recharts

## Commands

```bash
# Frontend (from web/)
npm run dev                    # Dev server
npm run build                  # Production build
npm run lint                   # ESLint
npx tsc --noEmit               # TypeScript type check
npm test                       # Jest tests

# Backend (from root, venv active)
python -m pytest               # Python tests
python scripts/enqueue.py batch && python scripts/worker.py  # Scrape pipeline
python scripts/run_all_analyses.py   # All analysis scripts

# Makefile shortcuts
make ci                        # Full CI suite (lint + typecheck + test + build)
make test                      # All tests (Python + web)
make lint                      # All linting (Python + web)
```

## Verification

**Before creating a PR, run `make ci` to validate all checks pass.** This mirrors the GitHub Actions pipeline exactly.

## Git Workflow

**CRITICAL: Never commit directly to `main`. All changes go through pull requests.**

```bash
git checkout main && git pull origin main
git checkout -b descriptive-branch-name
# ... make changes ...
git add . && git commit -m "Description"
git push -u origin descriptive-branch-name
gh pr create --fill              # ALWAYS create a PR
```

## Key File Locations

| Area | Path | Details |
|------|------|---------|
| Python config | `scripts/config.py` | All constants. **Must stay in sync with `web/lib/config.ts`** (enforced by `test_config_sync.py`) |
| TS config | `web/lib/config.ts` | Frontend constants (synced with above) |
| TS types | `web/lib/types.ts` | All shared TypeScript interfaces |
| DB schema | `schema.sql` | Canonical DDL |
| Migrations | `migrations/` | Numbered SQL migration files |
| Components | `web/components/` | Reusable React components |
| Pages | `web/app/` | Next.js App Router pages |
| CI/CD | `.github/workflows/` | GitHub Actions |

## Deep Reference Docs

| Doc | What it covers |
|-----|---------------|
| `docs/database-schema.md` | All tables, columns, constraints, relationships |
| `docs/domain-rules.md` | Ottoneu league rules: scoring, roster, salary cap, arbitration |
| `docs/testing-guide.md` | Test frameworks, file locations, patterns, CI pipeline |
| `ARCHITECTURE.md` | System architecture, data flow diagrams, pipeline design |
| `docs/market-projections-plan.md` | Market projection feature design |

## Architecture (summary)

```
Python Scripts (scripts/) → Supabase (PostgreSQL) → Next.js App (web/)
```

- **Data pipeline:** `enqueue.py` → `scraper_jobs` table → `worker.py` → `scripts/tasks/`
- **Analysis pipeline:** `run_all_analyses.py` orchestrates: projected salary → VORP → surplus value → arbitration → simulation
- **Config sync:** `scripts/config.py` ↔ `web/lib/config.ts` — enforced by structural test in CI

## Environment Variables

See `.env.example` (Python) and `web/.env.local.example` (Next.js) for required Supabase credentials.
