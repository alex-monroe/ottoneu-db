# Architecture

## System Overview

```
Python Scripts (scripts/)
        │ upsert via supabase-py
        ▼
   Supabase (PostgreSQL)
        │ queried via @supabase/supabase-js
        ▼
   Next.js App (web/)
```

## Tech Stack

- **Frontend:** Next.js 16, React 19, TypeScript, Tailwind CSS 4, Recharts
- **Backend:** Python 3.9+, Playwright (scraping), pandas, nfl_data_py
- **Database:** Supabase (PostgreSQL)
- **Environment:** `.env` (root, for Python) and `web/.env.local` (for Next.js) hold Supabase credentials

## Data Pipeline

Uses a worker-based job queue. `scripts/enqueue.py` inserts jobs into the `scraper_jobs` table in Supabase. `scripts/worker.py` polls the queue, dispatches tasks, and manages a shared Playwright browser.

Three task types:
- `pull_nfl_stats` — sync, loads snap counts via `nfl_data_py`
- `scrape_roster` — async, scrapes one position from Ottoneu search page
- `scrape_player_card` — async, scrapes FA transaction history for real salary

Jobs support dependencies, retries (up to 3 attempts), and batch grouping. `ottoneu_scraper.py` is a backward-compatible wrapper that enqueues a batch and runs the worker. Data is upserted into three tables: `players`, `player_stats`, `league_prices`.

### NFL Stats (separate from Ottoneu data)

`nfl_stats` stores pure NFL statistical data from nflverse-data (2010–present), kept separate from the Ottoneu fantasy data in `player_stats`. Backfilled via `scripts/backfill_nfl_stats.py` or the `Backfill NFL Stats` GitHub Action.

- **`player_stats`** = Ottoneu fantasy data (total_points, ppg, pps, snaps from scraping)
- **`nfl_stats`** = Real NFL stats (passing_yards, rushing_tds, snap counts, etc. from nflverse)

### Worker Task Modules (`scripts/tasks/`)

Each task type lives in its own module. `__init__.py` defines task type constants and `TaskResult` dataclass. The worker caches NFL stats in memory so roster scrapes can match snap counts by player name.

## Analysis Pipeline

`scripts/run_all_analyses.py` orchestrates analysis in dependency order:

```
update projections → projected salary → VORP → surplus value → arbitration → arbitration simulation → projected arbitration
```

Shared config and DB helpers in `scripts/analysis_utils.py`. Five analysis scripts produce markdown reports in `reports/` (gitignored). VORP and surplus value expose `calculate_vorp()` and `calculate_surplus()` for import by downstream scripts. Arbitration simulation uses Monte Carlo methods to predict opponent spending patterns (100 runs with ±20% value variation per team).

### Key Metrics

- **PPG** (Points Per Game) = total_points / games_played
- **PPS** (Points Per Snap) = total_points / snaps
- **VORP** (Value Over Replacement) = ppg - replacement_ppg at position
- **Surplus Value** = dollar_value (from VORP) - salary
- Chart shows salary (Y-axis) vs. selected metric (X-axis), bubble size = total points

## Authentication & Authorization

User accounts with email/password login stored in the `users` table. Passwords are hashed with bcrypt (`bcryptjs`). Sessions use HMAC-SHA256 signed tokens stored in HTTP-only cookies (7-day expiry). The session payload encodes `userId`, `isAdmin`, and `hasProjectionsAccess` — no DB lookup needed for authorization.

- **`SESSION_SECRET`** env var provides the HMAC signing key
- **Middleware** (`web/middleware.ts`) enforces route protection:
  - Protected routes (projections, VORP, surplus, arbitration) require `hasProjectionsAccess`
  - Admin routes (`/admin`) require `isAdmin`
- **User-scoped data:** `surplus_adjustments` and `arbitration_plans` are scoped to `user_id` — each user sees only their own data
- **Admin panel** (`/admin`) allows admins to create users, toggle projections access, and delete users

## Feature Projection System (`scripts/feature_projections/`)

Generates season-long player PPG projections from historical data using a stacked feature model. Six progressive models (v1–v6) add features incrementally: weighted PPG baseline, age curve, stat efficiency, games availability, team context, and usage share.

### Projection Pipeline

```
model_config.py  →  runner.py  →  model_projections table
    (defines)        (computes)       (stores)
```

- `model_config.py` — model registry (name, version, features, weights, is_baseline)
- `runner.py` — fetches historical player_stats + nfl_stats, runs combiner, batch upserts
- `combiner.py` — base feature PPG + weighted sum of adjustment feature deltas
- `backtest.py` — compares projected_ppg to actual actuals (MAE, RMSE per model)
- `accuracy_report.py` — side-by-side model comparison table across all seasons

### External Projection Sources (`external_sources/`)

A separate ingestion pipeline that pulls third-party consensus projections and stores them as named models in `model_projections`, making them directly comparable to internal models via the existing backtest and accuracy_report infrastructure.

```
external_sources/
├── __init__.py
├── fantasypros_fetcher.py  — scrape FP projections by position + year (requests + pd.read_html)
├── scoring.py              — convert stat totals to Ottoneu Half-PPR PPG
├── player_matcher.py       — fuzzy name+team matching to players table
└── ingest_external.py      — register model + upsert to model_projections (standalone script)
```

**Running FantasyPros ingestion:**
```
python scripts/feature_projections/external_sources/ingest_external.py \
    --source fantasypros --seasons 2022,2023,2024,2025,2026
```

Model name: `external_fantasypros_v1`. No DB schema changes required — uses existing `model_projections` table with `feature_values` jsonb for raw stat storage.

**Adding a new external model — checklist:**
1. **Verify column names before writing parsers.** FP HTML uses multi-level headers; always test-fetch one position and print `df.columns` before finalizing column mappings. The actual flattened names (e.g. `passing_yds`, `receiving_rec`) differ from the raw header labels (`YDS`, `REC`).
2. **Deduplicate by `player_id` before upserting.** Fuzzy name matching can map two different source rows to the same `player_id`. Postgres's `ON CONFLICT DO UPDATE` rejects duplicate keys within the same batch — deduplicate first.
3. **Register in `model_config.py`.** `accuracy_report.py` iterates `MODELS` in `model_config.py` to build comparison tables. External models must be added there (with `features=["external"]`) to appear in the report.
4. **Ensure `lxml` is installed.** `pandas.read_html` requires `lxml` as its HTML parser. It is in `requirements.txt` but must be explicitly installed (`pip install lxml`) if the venv was created before it was added.
