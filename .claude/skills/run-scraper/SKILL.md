---
name: run-scraper
description: Run the Ottoneu data pull (roster CSV + player-card transactions) to update data
---
Refresh Ottoneu data over plain HTTP (no browser). Both recipes dry-run by
default — show the dry-run summary before re-running with `--apply`.

1. Reconcile roster/salary state from the CSV export (needs a residential IP or
   `OTTONEU_COOKIE`; or pass `--file roster.csv`):
   `just reconcile-roster --apply --infer-transactions`
2. Scrape transaction history from every DB player's card:
   `just scrape-player-cards --apply`

See [docs/references/roster-csv-reconciliation.md](../../../docs/references/roster-csv-reconciliation.md).
