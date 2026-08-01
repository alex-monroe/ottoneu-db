---
name: scraper-logic
description: Detailed explanation of the scraping pipeline for Ottoneu data and NFL stats.
---

# Scraper Logic

Ottoneu data is pulled over **plain HTTP with `requests` + `BeautifulSoup` — no
browser**. (The old Playwright search-page crawl + player-card scrape were removed.)
NFL stats come from nflverse via a browser-free job queue.

## Ottoneu data (plain HTTP, no browser)

Two standalone tools, both fetchable from datacenter IPs (incl. GitHub-hosted
runners):

1. **`scripts/reconcile_roster.py`** (`just reconcile-roster`) — ingests the official
   `/football/{league_id}/csv/rosters` export and reconciles it into `league_prices`
   (team ownership + salary; absent-but-owned players → FA). With
   `--infer-transactions` it also writes a `transactions` row per detected
   cut/trade/add. See `docs/references/roster-csv-reconciliation.md`.

2. **`scripts/scrape_player_cards.py`** (`just scrape-player-cards`) — iterates every
   player in the DB with a real Ottoneu id and fetches its player card
   (`/football/{league_id}/player_card/{nfl|college}/{id}`), parsing the **Transaction
   History** table into `transactions` (real dates + types: `add` / `cut` /
   `increase` / `move (from <team>)`). We already know every id from the database (and
   new ones arrive via roster-CSV reconciliation), so there is no need to crawl the
   search page to *discover* players. Writes the `transactions` table only.

Player discovery / new-id adoption is handled by `reconcile_roster.py` via
`choose_prospect_to_adopt` (`scripts/prospect_adopt.py`).

## NFL stats (browser-free job queue)

- Jobs are enqueued into the `scraper_jobs` table (`scripts/enqueue.py`).
- `scripts/worker.py` polls the queue, claiming and dispatching tasks. It no longer
  launches a browser.
- Task types:
  - **`pull_nfl_stats`** — loads snap counts / play-by-play via `nfl_data_py`.
  - **`pull_player_stats`** — computes Ottoneu fantasy points / ppg into
    `player_stats` from nflverse (this is what populates `player_stats.total_points`,
    independent of any Ottoneu scrape).

## Automated Runs (GitHub Actions)

- **`pull-roster-csv.yml`** — daily 06:17 UTC + `workflow_dispatch`: curl the CSV
  export → `reconcile_roster.py --apply --infer-transactions`.
- **`scrape-player-cards.yml`** — daily 06:40 UTC + `workflow_dispatch`: run
  `scrape_player_cards.py --apply` over every DB player id.
- The nflverse batch (`enqueue.py batch` + `worker.py`) runs browser-free.

## Cloudflare (important, counter-intuitive)

Ottoneu sits behind Cloudflare, but the block is driven by **User-Agent, not IP**:
a request that *impersonates a browser* (a `Mozilla/…Chrome` UA with none of a real
browser's fingerprint) is served the 403 "Just a moment…" interstitial, while an
**honest** automated UA (curl default, `python-requests`, or a descriptive tool UA)
passes straight through — from datacenter IPs (incl. GitHub-hosted runners) included.
So the HTTP tools deliberately send a descriptive, honest User-Agent and never spoof a
browser. `OTTONEU_COOKIE` is an optional escape hatch only. (See PR #690.)

Note: the CSV export lists only current rostered players — no free agents and no
transaction history — which is exactly why the player-card scrape complements it: the
cards supply the real transaction log for every known id, FAs included.
