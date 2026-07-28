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
The scraping pipeline runs on GitHub Actions (`.github/workflows/scrape-players.yml`),
triggering the batch enqueue followed by the worker loop. The schedule is season-aware:

- **In-season (Sep–Jan):** daily at 06:00 UTC.
- **Offseason (Feb–Aug):** weekly on Mondays at 06:00 UTC — rosters still churn
  (keeper cuts, arbitration results, trades), so `league_prices` needs a periodic
  refresh even out of season, just less often than in-season.
- **`workflow_dispatch`:** always runs, bypassing the season gate (use this for an
  on-demand refresh).

The workflow defines two cron entries and a gate step routes each trigger so exactly
one fires per day. The scrape season resolves at runtime from `stats_season()`
(`scripts/season.py`) — it is not hardcoded.

## Authentication / Cloudflare

Ottoneu sits behind a Cloudflare anti-bot challenge. A headless, anonymous scrape
from a datacenter IP (GitHub Actions runners **included** — they no longer reliably
pass) is served a 403 `Just a moment…` interstitial, so every `scrape_roster` job
times out waiting for `a.top_players` and is marked `failed`. When that happens no
roster row is written and `league_prices` silently freezes at the last successful
scrape — cuts/adds/trades stop appearing on the site even though `pull_nfl_stats`
(which never touches Ottoneu) keeps succeeding.

**Mitigation — reuse a real logged-in session:**

1. From a local machine (a residential IP), run `just ottoneu-login`. A visible
   browser opens; sign in and clear any Cloudflare check, then press Enter.
2. That saves a Playwright `storage_state` (cookies **and** localStorage — Ottoneu
   keeps its session in localStorage) to `ottoneu_state.json` (gitignored;
   path overridable via `OTTONEU_STORAGE_STATE`).
3. `scripts/worker.py` loads it into the browser context automatically when
   present, clearing the challenge. It falls back to anonymous browsing when absent.

If the login window loops on the Cloudflare "verify you're human" (Turnstile)
check — you click it and it re-appears — that is Cloudflare refusing to issue a
clearance token to an automation-flagged browser (`navigator.webdriver`, the
`--enable-automation` switch). `ottoneu_login.py` launches with those signals
dropped (`--disable-blink-features=AutomationControlled`, `ignore_default_args=
["--enable-automation"]`, and a `navigator.webdriver` mask) so the human can pass
their own login; it never solves the challenge programmatically. The login and
worker share `SCRAPER_USER_AGENT` because Cloudflare binds the clearance cookie to
the UA — a mismatch would invalidate the saved session. If it still loops, fall
back to the official Ottoneu CSV roster export (planned follow-up).

The roster scrape raises an explicit `Cloudflare challenge` error (instead of a bare
selector timeout) when it detects the `Just a moment…` title, so the failure is
actionable. `OTTONEU_HEADLESS=0` runs a visible browser for debugging.

Diagnosing a "missing cut/roster change" report: check `scraper_jobs` for recent
`failed` `scrape_roster` rows and read their `last_error`; a `league_prices` row
whose `updated_at` predates the reported change confirms the freeze.
