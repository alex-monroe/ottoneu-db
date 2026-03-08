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
