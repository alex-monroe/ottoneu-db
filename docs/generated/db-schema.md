# Database Schema

Twelve tables, all with UUID primary keys.

## Tables

| Table | Purpose | Unique Constraint |
|-------|---------|-------------------|
| `users` | User accounts with email/password auth | `email` |
| `players` | Player metadata | `ottoneu_id` |
| `player_stats` | Ottoneu fantasy season statistics (FK -> `players`) | `(player_id, season)` |
| `nfl_stats` | Pure NFL stats from nflverse-data, 2010-present (FK -> `players`) | `(player_id, season)` |
| `league_prices` | Current salaries (FK -> `players`) | `(player_id, league_id)` |
| `transactions` | Event log of all roster moves (adds, cuts, trades, auctions) | -- |
| `surplus_adjustments` | Manual value overrides per player per league per user (FK -> `players`, `users`) | `(player_id, league_id, user_id)` |
| `player_projections` | Calculated projection outputs from Python backend | `(player_id, season)` |
| `arbitration_plans` | Named arbitration budget allocation plans per user (FK -> `users`) | `(league_id, name, user_id)` |
| `arbitration_plan_allocations` | Per-player dollar allocations within a plan (FK -> `arbitration_plans`, `players`) | `(plan_id, player_id)` |
| `scraper_jobs` | Persistent job queue with status tracking, dependencies, and retry logic | -- |


## Schema Files

- **Canonical schema:** `schema.sql`
- **Migrations:** `migrations/` (numbered SQL migration files)
- **Job queue:** `migrations/002_add_scraper_jobs.sql` defines the `scraper_jobs` table for the persistent job queue

### `scraper_jobs` Schema Details
- **task_type:** 'scrape_roster', 'scrape_player_card', 'pull_nfl_stats'
- **status:** 'pending', 'running', 'completed', 'failed'
- **params:** JSONB task-specific parameters
- **depends_on:** Self-referential FK to coordinate job dependencies
- **batch_id:** UUID to group jobs from one enqueue call


## Key Relationships

- `player_stats.player_id` -> `players.id`
- `nfl_stats.player_id` -> `players.id`
- `league_prices.player_id` -> `players.id`
- `surplus_adjustments.user_id` -> `users.id`
- `arbitration_plans.user_id` -> `users.id`
