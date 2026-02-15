# Ottoneu Fantasy Football Analytics Platform

A comprehensive analytics platform for Ottoneu fantasy football leagues, featuring automated data scraping, advanced statistical analysis, and interactive visualizations to optimize roster decisions and identify arbitration targets.

## Overview

This platform helps manage and analyze fantasy football rosters in Ottoneu League 309 (12-team Superflex Half PPR). It combines automated web scraping of player data from Ottoneu with NFL statistics to provide insights on:

- **Player efficiency** metrics (PPG, PPS)
- **Projected salaries** to guide keep/cut decisions
- **VORP** (Value Over Replacement Player) by position
- **Surplus value** analysis to identify bargains and overpaid players
- **Arbitration targets** to optimize strategic salary increases on opponents' rosters

## Features

### Data Collection & Management
- **Automated scraping** of Ottoneu player prices and transaction history via Playwright
- **NFL stats integration** using `nfl_data_py` for snap counts and performance data
- **Worker-based job queue** for reliable, scheduled data updates
- **Persistent PostgreSQL storage** via Supabase

### Analytics Suite
- **Player Efficiency Analysis**: Compare PPG/PPS vs salary across all positions
- **Projected Salary Calculator**: Keep/cut recommendations based on $400 salary cap
- **VORP Analysis**: Positional scarcity and replacement-level player identification
- **Surplus Value Rankings**: Find undervalued players and overpaid liabilities
- **Arbitration Targets**: Identify opponents' vulnerable players for strategic salary increases

### Interactive Web Interface
- **Real-time dashboards** built with Next.js and React
- **Interactive scatter charts** using Recharts
- **Sortable, filterable tables** for deep-dive analysis
- **Mobile-responsive design** with Tailwind CSS

## Prerequisites

- **Python 3.9+** with pip and venv
- **Node.js 18+** with npm
- **Supabase account** (PostgreSQL database)
- **Playwright browser dependencies** (installed automatically)

## Setup

### 1. Clone the Repository

```bash
git clone <repository-url>
cd ottoneu_db
```

### 2. Database Setup

Create a Supabase project and run the schema migration:

```sql
-- Run schema.sql to create tables
-- Run migrations/002_add_scraper_jobs.sql for job queue
```

### 3. Backend Setup

```bash
# Create and activate virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Install Playwright browsers
playwright install chromium

# Create .env file with Supabase credentials
cat > .env << EOF
SUPABASE_URL=your-project-url
SUPABASE_KEY=your-anon-key
EOF
```

### 4. Frontend Setup

```bash
cd web

# Install dependencies
npm install

# Create .env.local with Supabase credentials
cat > .env.local << EOF
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
EOF
```

## Usage

### Running the Frontend

```bash
cd web

# Development server (with hot reload)
npm run dev

# Production build
npm run build
npm start

# Linting
npm run lint
```

The frontend will be available at `http://localhost:3000`.

### Running the Backend

All backend commands should be run from the project root with the virtual environment activated:

```bash
source venv/bin/activate
```

#### Data Scraping

**Quick start (backward compatible):**
```bash
python scripts/ottoneu_scraper.py
```
This enqueues a full batch and runs the worker to completion.

**Advanced workflow:**

```bash
# Enqueue a full pipeline (NFL stats + all 5 positions)
python scripts/enqueue.py batch

# Enqueue specific position
python scripts/enqueue.py roster --position QB

# Enqueue single player card scrape
python scripts/enqueue.py player --ottoneu-id 6771 --name "Josh Allen" --player-uuid <uuid>

# Enqueue NFL stats pull only
python scripts/enqueue.py nfl-stats

# Check job status
python scripts/enqueue.py status

# Run worker (processes jobs until queue is empty)
python scripts/worker.py

# Run worker in continuous polling mode (for cron)
python scripts/worker.py --poll
```

#### Analytics

```bash
# Run full analysis suite (generates all reports)
python scripts/run_all_analyses.py

# Individual analyses
python scripts/analyze_projected_salary.py   # Keep vs cut for The Witchcraft
python scripts/analyze_vorp.py               # VORP analysis by position
python scripts/analyze_surplus_value.py      # Surplus value rankings
python scripts/analyze_arbitration.py        # Arbitration targets

# Calculate efficiency metrics
python scripts/analyze_efficiency.py

# Verify database contents
python scripts/check_db.py

# Launch Streamlit dashboard
streamlit run scripts/visualize_app.py
```

### Automated Daily Updates

Add to crontab for daily 6 AM updates:

```bash
crontab -e

# Add this line:
0 6 * * * cd /path/to/ottoneu_db && source venv/bin/activate && python scripts/enqueue.py batch && python scripts/worker.py
```

## Architecture

### System Overview

```
Python Scripts (scraper/analysis)
        │ upsert via supabase-py
        ▼
   Supabase (PostgreSQL)
        │ queried via @supabase/supabase-js
        ▼
   Next.js App (web/)
```

### Data Pipeline

The system uses a worker-based job queue for reliable data collection:

1. **Job Enqueueing**: `scripts/enqueue.py` inserts jobs into the `scraper_jobs` table
2. **Worker Processing**: `scripts/worker.py` polls the queue and dispatches tasks
3. **Task Execution**: Three task types via `scripts/tasks/`:
   - `pull_nfl_stats`: Synchronous NFL stats via `nfl_data_py`
   - `scrape_roster`: Async position-based Ottoneu search scraping
   - `scrape_player_card`: Async free agent transaction history scraping
4. **Data Storage**: Upserted into `players`, `player_stats`, and `league_prices` tables

Jobs support:
- **Dependencies**: Tasks can wait for prerequisites
- **Retries**: Up to 3 attempts with exponential backoff
- **Batch grouping**: Related jobs grouped for atomic operations

### Database Schema

**Core tables:**
- `players`: Player metadata (UUID primary key, unique `ottoneu_id`)
- `player_stats`: Season statistics (FK to `players`, unique per player/season)
- `league_prices`: League-specific salaries (FK to `players`, unique per player/league/season)

**Job queue:**
- `scraper_jobs`: Persistent job queue with status tracking, dependencies, and retry logic

See `schema.sql` and `migrations/002_add_scraper_jobs.sql` for full schema.

### Frontend Architecture

**Next.js App Router structure:**
- Server components for data fetching (revalidate every hour)
- Client wrappers for interactivity (charts, filters, collapsible sections)
- Shared components: `Navigation.tsx`, `DataTable.tsx`
- Analysis logic ported to TypeScript in `web/lib/analysis.ts`

**Pages:**
- `/`: Player Efficiency scatter chart
- `/projected-salary`: Keep vs cut recommendations
- `/vorp`: VORP analysis with bar chart
- `/surplus-value`: Surplus value rankings
- `/arbitration`: Arbitration target identification

## Ottoneu League 309 Rules

### League Format
- **12-team Superflex Half PPR**
- **Roster**: 20 players (1 QB, 2 RB, 2 WR, 1 TE, 1 K, 1 Superflex)
- **Superflex strategy**: Almost always optimal to start a QB, making QBs highly valuable

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

### Salary Cap & Transactions

- **$400 salary cap** per team
- **Auctions**: 24-hour blind Vickrey auctions (second-price + $1)
- **Waivers**: 24-hour claim period at full previous salary
- **Cut penalties**: Half of player's salary (rounded up), 30-day re-acquisition block
- **Annual raises**: +$4 for active players, +$1 for inactive

### Arbitration (Feb 15 - Mar 31)

Each team has a **$60 allocation budget** to distribute across opponents' rosters:
- Give $1-$8 to each of 11 opponents
- Maximum $4 per player from any single team
- Maximum $44 league-wide per player

### Season Structure

- Regular season through NFL Week 16
- Trade deadline: day before Thanksgiving
- Trades require 48-hour approval (7 of 12 must veto to block)

## Key Metrics

- **PPG (Points Per Game)**: `total_points / games_played`
- **PPS (Points Per Snap)**: `total_points / snaps`
- **VORP (Value Over Replacement)**: `ppg - replacement_ppg` at position
- **Surplus Value**: `dollar_value - salary` (derived from VORP)
- **Dollar Value**: Conversion of VORP to fantasy auction value

## Tech Stack

### Frontend
- Next.js 16 (App Router)
- React 19
- TypeScript
- Tailwind CSS 4
- Recharts (data visualization)
- Supabase JS client

### Backend
- Python 3.9+
- Playwright (web scraping)
- pandas (data analysis)
- nfl_data_py (NFL statistics)
- Supabase Python client

### Infrastructure
- Supabase (PostgreSQL database)
- GitHub (version control)
- cron (scheduled updates)

## Project Structure

```
ottoneu_db/
├── scripts/               # Python backend
│   ├── tasks/            # Worker task modules
│   │   ├── __init__.py   # Task types and results
│   │   ├── nfl_stats.py  # NFL stats scraping
│   │   ├── roster.py     # Roster scraping
│   │   └── player.py     # Player card scraping
│   ├── enqueue.py        # Job queue management
│   ├── worker.py         # Job processor
│   ├── ottoneu_scraper.py # Backward-compatible wrapper
│   ├── analysis_utils.py # Shared analysis logic
│   ├── analyze_*.py      # Analysis scripts
│   └── run_all_analyses.py # Orchestrate analyses
├── web/                  # Next.js frontend
│   ├── app/             # App Router pages
│   ├── components/      # Shared components
│   └── lib/             # TypeScript utilities
├── migrations/          # Database migrations
├── reports/            # Generated markdown reports (gitignored)
├── schema.sql          # Database schema
└── .env                # Environment variables (gitignored)
```

## Development Workflow

### Git Workflow

Never commit directly to `main`. For every change:

```bash
# Create feature branch
git checkout main && git pull
git checkout -b feature-name

# Make changes and commit
git add .
git commit -m "Description of changes"

# Push and create PR
git push -u origin feature-name
gh pr create --fill
```

### Testing Changes

```bash
# Backend: Check database contents
python scripts/check_db.py

# Frontend: Run development server
cd web && npm run dev

# Frontend: Validate production build
cd web && npm run build
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is for personal use in Ottoneu League 309.

## Acknowledgments

- [Ottoneu](https://ottoneu.fangraphs.com/) for the fantasy football platform
- [nfl_data_py](https://github.com/cooperdff/nfl_data_py) for NFL statistics
- [Supabase](https://supabase.com/) for database hosting
