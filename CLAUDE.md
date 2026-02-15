# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Fantasy football analytics platform for Ottoneu leagues. Python scripts scrape player data and NFL stats into a Supabase PostgreSQL database. A Next.js frontend visualizes player salary vs. production efficiency (PPG/PPS) via interactive scatter charts. Target league is ID 309.

## Commands

### Frontend (run from `web/`)
- `npm run dev` — dev server on localhost:3000
- `npm run build` — production build
- `npm run lint` — ESLint
- `npm start` — production server

### Backend (run from project root, activate venv first)
- `source venv/bin/activate`
- `python scripts/ottoneu_scraper.py` — scrape Ottoneu player prices (backward-compat wrapper: enqueues batch + runs worker)
- `python scripts/enqueue.py batch` — enqueue full pipeline (NFL stats + all 5 positions)
- `python scripts/enqueue.py roster --position QB` — enqueue single position scrape
- `python scripts/enqueue.py player --ottoneu-id 6771 --name "Josh Allen" --player-uuid <uuid>` — enqueue single player card scrape
- `python scripts/enqueue.py nfl-stats` — enqueue NFL stats pull only
- `python scripts/enqueue.py status` — show recent job statuses
- `python scripts/worker.py` — process pending scraper jobs (exit when done)
- `python scripts/worker.py --poll` — process jobs continuously (for scheduling)
- `python scripts/analyze_efficiency.py` — calculate efficiency metrics
- `python scripts/run_all_analyses.py` — run full analysis suite (projected salary, VORP, surplus value, arbitration)
- `python scripts/analyze_projected_salary.py` — keep vs cut decisions for The Witchcraft
- `python scripts/analyze_vorp.py` — positional scarcity / Value Over Replacement
- `python scripts/analyze_surplus_value.py` — dollar value vs salary for all players
- `python scripts/analyze_arbitration.py` — identify opponents' vulnerable players for arbitration
- `python scripts/check_db.py` — verify database contents
- `streamlit run scripts/visualize_app.py` — Streamlit dashboard

### Daily Scheduling (cron)
```bash
# Daily at 6 AM: enqueue batch and run worker
0 6 * * * cd /path/to/ottoneu_db && source venv/bin/activate && python scripts/enqueue.py batch && python scripts/worker.py
```

## Architecture

```
Python Scripts (scraper/analysis)
        │ upsert via supabase-py
        ▼
   Supabase (PostgreSQL)
        │ queried via @supabase/supabase-js
        ▼
   Next.js App (web/)
```

**Data pipeline:** Uses a worker-based job queue. `scripts/enqueue.py` inserts jobs into the `scraper_jobs` table in Supabase. `scripts/worker.py` polls the queue, dispatches tasks, and manages a shared Playwright browser. Three task types: `pull_nfl_stats` (sync, loads snap counts via `nfl_data_py`), `scrape_roster` (async, scrapes one position from Ottoneu search page), `scrape_player_card` (async, scrapes FA transaction history for real salary). Jobs support dependencies, retries (up to 3 attempts), and batch grouping. `ottoneu_scraper.py` is a backward-compatible wrapper that enqueues a batch and runs the worker. Data is upserted into three tables: `players`, `player_stats`, `league_prices`.

**Worker task modules** (`scripts/tasks/`): Each task type lives in its own module. `__init__.py` defines task type constants and `TaskResult` dataclass. The worker caches NFL stats in memory so roster scrapes can match snap counts by player name.

**Database schema** (`schema.sql`): Three data tables with UUID primary keys and foreign keys from `player_stats` and `league_prices` to `players`. Key unique constraints: `players(ottoneu_id)`, `player_stats(player_id, season)`, `league_prices(player_id, league_id, season)`. The `scraper_jobs` table stores the persistent job queue (see `migrations/002_add_scraper_jobs.sql`).

**Frontend structure** (`web/`): Next.js App Router with five pages. Shared `Navigation.tsx` nav bar and `DataTable.tsx` sortable table component. Analysis math is ported to `web/lib/analysis.ts` (TS equivalent of `analysis_utils.py`). All pages are server components that fetch live data from Supabase (revalidate every hour) with client wrappers for interactivity.

**Web routes:**
- `/` — Player Efficiency scatter chart (PPG/PPS vs salary)
- `/projected-salary` — Keep vs cut decisions for The Witchcraft
- `/vorp` — VORP analysis with bar chart and filterable table
- `/surplus-value` — Surplus value rankings, bargains, overpaid, team summaries
- `/arbitration` — Arbitration targets with per-opponent breakdown

**Analysis suite** (`scripts/analysis_utils.py` + `scripts/analyze_*.py`): Shared config and DB helpers in `analysis_utils.py`. Four analysis scripts produce markdown reports in `reports/` (gitignored). `run_all_analyses.py` orchestrates them in dependency order: projected salary -> VORP -> surplus value -> arbitration. VORP and surplus value expose `calculate_vorp()` and `calculate_surplus()` for import by downstream scripts.

**Key metrics:**
- PPG (Points Per Game) = total_points / games_played
- PPS (Points Per Snap) = total_points / snaps
- VORP (Value Over Replacement) = ppg - replacement_ppg at position
- Surplus Value = dollar_value (from VORP) - salary
- Chart shows salary (Y-axis) vs. selected metric (X-axis), bubble size = total points

## Code Organization

### Python Configuration
All configuration constants live in `scripts/config.py`:
- League settings (LEAGUE_ID, SEASON, MY_TEAM)
- Fantasy rules (NUM_TEAMS, CAP_PER_TEAM, POSITIONS)
- Analysis thresholds (MIN_GAMES, REPLACEMENT_LEVEL)
- Arbitration constants
- Shared Supabase client via `get_supabase_client()`

All scripts import from `config.py` to eliminate duplication and ensure consistency.

### TypeScript Types
Shared type definitions in `web/lib/types.ts`:
- Player data interfaces (Player, VorpPlayer, SurplusPlayer, ChartPoint)
- Chart component types (TooltipProps)
- Position constants (Position type, POSITIONS array, POSITION_COLORS)

### Reusable Components
- `DataTable` — generic sortable table with type safety and highlight rules
- `SummaryCard` — metric display cards with variant styles (default, positive, negative)
- `PositionFilter` — position selection buttons with multi-select support
- `ScatterChart` — player efficiency scatter plot with interactive filters
- Column definitions in `web/lib/columns.ts` for consistent table layouts

## Git Workflow

**CRITICAL: All changes MUST be submitted as pull requests. NEVER commit directly to `main`.**

### Starting a New Task

Before beginning ANY new task or change, always follow this workflow:

1. **Check out and update the main branch:**
   ```bash
   git checkout main
   git pull origin main
   ```

2. **Create a new feature branch from main:**
   ```bash
   git checkout -b descriptive-branch-name
   ```
   Use descriptive branch names like `fix-vorp-calculation` or `add-roster-analysis-page`.

3. **Make your changes and commit:**
   ```bash
   # Make changes to files
   git add .
   git commit -m "Clear description of changes"
   ```

4. **Push the branch and create a pull request:**
   ```bash
   git push -u origin descriptive-branch-name
   gh pr create --fill
   ```

**Always start from an updated `main` branch to avoid merge conflicts and ensure you're working with the latest code.**

## Ottoneu Fantasy Football Rules

League 309 is a **12-team Superflex Half PPR** league.

### Scoring (Half PPR)

| Stat | Points |
|------|--------|
| Passing yards | 0.04/yd (1 pt per 25 yds) |
| Passing TD | 4 |
| Interception | -2 |
| Rushing yards | 0.1/yd (1 pt per 10 yds) |
| Rushing TD | 6 |
| Receptions | 0.5 |
| Receiving yards | 0.1/yd (1 pt per 10 yds) |
| Receiving TD | 6 |
| FG 0-39 yds | 3 |
| FG 40-49 yds | 4 |
| FG 50+ yds | 5 |
| Extra point | 1 |

### Roster (Superflex format)

20 roster spots per team. Starting lineup: 1 QB, 2 RB, 2 WR, 1 TE, 1 K, 1 Superflex (QB/RB/WR/TE). In superflex, it is almost always optimal to start a QB in the superflex slot, making QBs significantly more valuable than in standard formats.

IR/PUP/NFI players don't count against roster limits but do count against salary cap.

### Salary Cap & Player Acquisition

- **$400 cap** per team
- **Auctions:** 24-hour blind Vickrey-style (winner pays second-highest bid + $1). Minimum bid is the player's current cap penalty or $1.
- **Waivers:** Cut players can be claimed within 24 hours at their full previous salary.
- **Cutting:** Incurs a cap penalty of half the player's salary (rounded up). Player cannot be reacquired by the same team for 30 days.

### Salary Increases & Arbitration

- **End of season:** +$4 for players who played at least 1 NFL game, +$1 for all others.
- **Arbitration (Feb 15 - Mar 31):** Each team has a $60 allocation budget distributed across other teams. Each team must give every other team $1-$8, and no single player can receive more than $4 from one team (max $44 league-wide per player).

### Season Structure

- Season ends after NFL week 16.
- Trade deadline: day before Thanksgiving. Trades can include cap space loans (expire end of regular season). Trades require 48-hour league approval; 7 of 12 managers must vote against to veto.

## Tech Stack

- **Frontend:** Next.js 16, React 19, TypeScript, Tailwind CSS 4, Recharts
- **Backend:** Python 3, Playwright (scraping), pandas, nfl_data_py
- **Database:** Supabase (PostgreSQL)
- **Environment:** `.env` (root, for Python) and `web/.env.local` (for Next.js) hold Supabase credentials
