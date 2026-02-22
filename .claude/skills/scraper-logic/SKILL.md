---
name: scraper-logic
description: Detailed explanation of the scraping pipeline for Ottoneu data and NFL stats.
---

# Scraper Logic

The project uses a Python-based job queue pattern to update its database through scraping NFL stats and Ottoneu fantasy data. 
The scraping heavily relies on Playwright for browser automation and Supabase for persistence.

## Overall Architecture

1.  **Job Queue Pattern**: 
    - Jobs are enqueued into the `scraper_jobs` table in Supabase.
    - `scripts/worker.py` polls this table, claiming and executing tasks.

2.  **Enqueueing Data**:
    - The wrapper `scripts/ottoneu_scraper.py` runs a full update sequence by batching all required tasks.
    - Can manually enqueue specific tasks using `scripts/enqueue.py` (e.g., `python scripts/enqueue.py batch` for everything).

## Main Job Types

1.  **`pull_nfl_stats`**
    - **Logic**: A synchronous task that pulls NFL play-by-play data, mainly snap counts. Uses `nfl_data_py` to load stats.
    - **Caching Task**: Caches the NFL stats in memory so that subsequent roster scrapes can quickly match snap counts to players by name.

2.  **`scrape_roster`**
    - **Logic**: An asynchronous task that uses Playwright to visit the Ottoneu players search page for a specific position (e.g. QB, RB, WR, TE).
    - **Dependencies**: It strictly depends on the previous `pull_nfl_stats` job having completed to get snap counts.
    - **Processing**: Reads player performance metrics and current salary, matches this tightly to the cached NFL stats, and upserts player details into the `players`, `player_stats`, and `league_prices` tables.

3.  **`scrape_player_card`**
    - **Logic**: An asynchronous task that visits an individual player's card to scrape explicit transaction history entries (Free Agency adds, drops, trades, etc.).
    - **Processing**: This tracks historical salary movement into the `transactions` table.

## Automated Runs
The scraping pipeline is commonly set to run daily at 6 AM using cron or GitHub Actions. 
These scheduled runs will trigger the batch enqueue followed by the worker loop.
