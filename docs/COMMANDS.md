# Commands

## Frontend (run from `web/`)

```bash
npm run dev          # Dev server on localhost:3000
npm run build        # Production build (validates correctness)
npm run lint         # ESLint
npx tsc --noEmit     # TypeScript type checking
npm test             # Jest tests
npm start            # Production server
```

## Backend (run from project root, venv must be active)

```bash
source venv/bin/activate

# Scraping
python scripts/ottoneu_scraper.py                    # Full scrape pipeline (backward-compat wrapper: enqueues batch + runs worker)
python scripts/enqueue.py batch                      # Enqueue full pipeline (NFL stats + all 5 positions)
python scripts/enqueue.py roster --position QB       # Enqueue single position scrape
python scripts/enqueue.py player --ottoneu-id 6771 --name "Josh Allen" --player-uuid <uuid>  # Enqueue single player card scrape
python scripts/enqueue.py nfl-stats                  # Enqueue NFL stats pull only
python scripts/enqueue.py status                     # Show recent job statuses
python scripts/worker.py                             # Process pending scraper jobs (exit when done)
python scripts/worker.py --poll                      # Process jobs continuously (for scheduling)

# Analysis
python scripts/analyze_efficiency.py                 # Calculate efficiency metrics
python scripts/run_all_analyses.py                   # Run full analysis suite
python scripts/analyze_projected_salary.py           # Keep vs cut decisions for The Witchcraft
python scripts/analyze_vorp.py                       # Positional scarcity / Value Over Replacement
python scripts/analyze_surplus_value.py              # Dollar value vs salary for all players
python scripts/analyze_arbitration.py                # Identify opponents' vulnerable players
python scripts/analyze_arbitration_simulation.py     # Monte Carlo arbitration simulation (100 runs)

# Utilities
python scripts/check_db.py                           # Verify database contents
streamlit run scripts/visualize_app.py               # Streamlit dashboard
python -m pytest                                     # Run all Python tests
```

## Makefile Shortcuts

```bash
make test          # Run all tests (Python + web)
make lint          # ESLint
make typecheck     # TypeScript type check
make build         # Production build
make dev           # Start dev server
```

## Daily Scheduling (cron)

```bash
# Daily at 6 AM: enqueue batch and run worker
0 6 * * * cd /path/to/ottoneu_db && source venv/bin/activate && python scripts/enqueue.py batch && python scripts/worker.py
```
