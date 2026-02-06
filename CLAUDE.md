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
- `python scripts/ottoneu_scraper.py` — scrape Ottoneu player prices
- `python scripts/analyze_efficiency.py` — calculate efficiency metrics
- `python scripts/check_db.py` — verify database contents
- `streamlit run scripts/visualize_app.py` — Streamlit dashboard

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

**Data pipeline:** `ottoneu_scraper.py` uses Playwright to scrape Ottoneu.com rosters/salaries and `nfl_data_py` for NFL snap counts and stats. Data is upserted into three tables: `players`, `player_stats`, `league_prices`. The frontend merges all three tables server-side and renders a client-side Recharts scatter plot.

**Database schema** (`schema.sql`): Three tables with UUID primary keys and foreign keys from `player_stats` and `league_prices` to `players`. Key unique constraints: `players(ottoneu_id)`, `player_stats(player_id, season)`, `league_prices(player_id, league_id, season)`.

**Frontend structure** (`web/`): Next.js App Router with a single page. `page.tsx` is a server component that fetches and joins data from Supabase (revalidates every hour). `components/ScatterChart.tsx` is a `"use client"` component rendering an interactive scatter plot with position filters, min games slider, and PPG/PPS metric toggle.

**Key metrics:**
- PPG (Points Per Game) = total_points / games_played
- PPS (Points Per Snap) = total_points / snaps
- Chart shows salary (Y-axis) vs. selected metric (X-axis), bubble size = total points

## Git Workflow

Never commit directly to `main`. For every change, create a new branch off `main`, commit there, push, and open a PR.

```bash
git checkout main && git pull
git checkout -b my-branch-name
# ... make changes and commit ...
git push -u origin my-branch-name
gh pr create --fill
```

## Tech Stack

- **Frontend:** Next.js 16, React 19, TypeScript, Tailwind CSS 4, Recharts
- **Backend:** Python 3, Playwright (scraping), pandas, nfl_data_py
- **Database:** Supabase (PostgreSQL)
- **Environment:** `.env` (root, for Python) and `web/.env.local` (for Next.js) hold Supabase credentials
