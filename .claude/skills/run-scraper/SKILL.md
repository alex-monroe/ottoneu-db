---
name: run-scraper
description: Run the Ottoneu data pull (roster CSV + player-card transactions) to update data
---
Follow these steps to refresh Ottoneu data over plain HTTP (no browser):

// turbo
1. Reconcile roster/salary state from the CSV export
`source venv/bin/activate && python scripts/reconcile_roster.py --apply --infer-transactions`

// turbo
2. Scrape transaction history from every DB player's card
`source venv/bin/activate && python scripts/scrape_player_cards.py --apply`
