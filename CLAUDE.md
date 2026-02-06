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
