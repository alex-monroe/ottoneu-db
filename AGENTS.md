# AGENTS.md

Universal instructions for AI coding agents working on this repository.

## Project Overview

Comprehensive database and analytics platform for Ottoneu Fantasy Football League 309 (12-team Superflex Half PPR). Python scripts scrape player data and NFL stats into a Supabase PostgreSQL database. A Next.js frontend provides interactive analytics and visualizations.

**Tech stack:** Python 3.9+ · Next.js 16 · React 19 · TypeScript · Tailwind CSS 4 · Supabase (PostgreSQL) · Playwright · pandas · Recharts

## Commands

### Frontend (run from `web/`)
```bash
npm run dev          # Dev server on localhost:3000
npm run build        # Production build (validates correctness)
npm run lint         # ESLint
npx tsc --noEmit     # TypeScript type checking
npm test             # Jest tests
```

### Backend (run from project root, venv must be active)
```bash
source venv/bin/activate
python -m pytest                          # Run all Python tests
python scripts/ottoneu_scraper.py         # Full scrape pipeline
python scripts/enqueue.py batch           # Enqueue all jobs
python scripts/worker.py                  # Process job queue
python scripts/run_all_analyses.py        # Run all analysis scripts
python scripts/check_db.py               # Verify database contents
```

### Using the Makefile
```bash
make test          # Run all tests (Python + web)
make lint          # ESLint
make typecheck     # TypeScript type check
make build         # Production build
make dev           # Start dev server
```

## Git Workflow

**CRITICAL: Never commit directly to `main`. All changes must go through pull requests.**

**CRITICAL: Always conclude your work by creating a pull request.** Every task—no matter how small—must end with a branch pushed and a PR created via `gh pr create --fill`. Do not leave changes uncommitted or on a local branch without a PR.

```bash
git checkout main && git pull origin main   # 1. Start from latest main
git checkout -b descriptive-branch-name     # 2. Create feature branch
# ... make changes ...
git add . && git commit -m "Description"    # 3. Commit
git push -u origin descriptive-branch-name  # 4. Push
gh pr create --fill                         # 5. Create PR (ALWAYS do this)
```

## Architecture

```
Python Scripts (scripts/)
        │ upsert via supabase-py
        ▼
   Supabase (PostgreSQL)
        │ queried via @supabase/supabase-js
        ▼
   Next.js App (web/)
```

**Data pipeline:** Job queue pattern. `scripts/enqueue.py` → `scraper_jobs` table → `scripts/worker.py` dispatches tasks from `scripts/tasks/`. Three task types: `pull_nfl_stats`, `scrape_roster`, `scrape_player_card`.

**Analysis pipeline:** `scripts/run_all_analyses.py` orchestrates in dependency order: projected salary → VORP → surplus value → arbitration → arbitration simulation. Shared config in `scripts/analysis_utils.py`.

## Key File Locations

| Area | Path | Purpose |
|------|------|---------|
| Python config | `scripts/config.py` | All league constants, Supabase client factory |
| TS config | `web/lib/config.ts` | Frontend constants (**must stay in sync with `config.py`**) |
| TS types | `web/lib/types.ts` | All shared TypeScript interfaces |
| Analysis math | `web/lib/analysis.ts` | TS port of `scripts/analysis_utils.py` |
| Arb logic | `web/lib/arb-logic.ts` | Arbitration simulation logic |
| DB schema | `schema.sql` | Canonical schema definition |
| Migrations | `migrations/` | Numbered SQL migration files |
| Components | `web/components/` | Reusable React components |
| Pages | `web/app/` | Next.js App Router pages |
| CI/CD | `.github/workflows/` | GitHub Actions (tests, scraping, projections) |

## Database Schema

Six tables, all with UUID primary keys:

- **`players`** — Player metadata. Unique on `ottoneu_id`.
- **`player_stats`** — Season statistics. FK to `players`, unique on `(player_id, season)`.
- **`league_prices`** — Current salaries. FK to `players`, unique on `(player_id, league_id)`.
- **`transactions`** — Event log of all roster moves (adds, cuts, trades, auctions).
- **`surplus_adjustments`** — Manual value overrides per player per league.
- **`player_projections`** — Calculated projection outputs from Python backend.

See `schema.sql` for full DDL and `migrations/` for incremental changes.

## Environment Variables

**Root `.env`** (for Python scripts):
- `SUPABASE_URL` — Supabase project URL
- `SUPABASE_KEY` — Supabase anon/service key

**`web/.env.local`** (for Next.js):
- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase anon key
- `SUPABASE_SERVICE_ROLE_KEY` — Service role key (server-side only)

See `.env.example` and `web/.env.local.example` for templates.

## Testing

**Python tests** (from `scripts/` directory):
- Test files in `scripts/tests/`
- Config in `pyproject.toml` (or `scripts/pytest.ini`)
- Run: `python -m pytest` from project root

**Web tests** (from `web/` directory):
- Test files in `web/__tests__/`
- Config in `web/jest.config.ts`
- Run: `npm test` from `web/`

**CI:** GitHub Actions runs both test suites on every PR (`.github/workflows/run-tests.yml`).

## Domain Rules (Ottoneu League 309)

- **12-team Superflex Half PPR** — QBs are highly valuable (almost always start 2)
- **$400 salary cap** per team, 20 roster spots
- **Arbitration (Feb 15–Mar 31):** $60 budget per team, $1–$8 per opponent, max $4 per player per team
- **Annual raises:** +$4 active players, +$1 inactive
- **Cut penalty:** Half salary (rounded up), 30-day re-acquisition block
- **Key metrics:** PPG, PPS, VORP, Surplus Value, Dollar Value
