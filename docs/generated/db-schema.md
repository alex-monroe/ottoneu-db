# Database Schema

Nine tables, all with UUID primary keys.

## Tables

| Table | Purpose | Unique Constraint |
|-------|---------|-------------------|
| `players` | Player metadata | `ottoneu_id` |
| `player_stats` | Ottoneu fantasy season statistics (FK → `players`) | `(player_id, season)` |
| `nfl_stats` | Pure NFL stats from nflverse-data, 2010–present (FK → `players`) | `(player_id, season)` |
| `league_prices` | Current salaries (FK → `players`) | `(player_id, league_id)` |
| `transactions` | Event log of all roster moves (adds, cuts, trades, auctions) | — |
| `surplus_adjustments` | Manual value overrides per player per league | — |
| `player_projections` | Calculated projection outputs from Python backend | — |
| `arbitration_plans` | Saved arbitration allocation plans per league | `(league_id, name)` |
| `arbitration_plan_allocations` | Per-player dollar allocations within a plan (FK → `arbitration_plans`, `players`) | `(plan_id, player_id)` |

## Schema Files

- **Canonical schema:** `schema.sql`
- **Migrations:** `migrations/` (numbered SQL migration files)
- **Job queue:** `migrations/002_add_scraper_jobs.sql` defines the `scraper_jobs` table for the persistent job queue

## Key Relationships

- `player_stats.player_id` → `players.id`
- `nfl_stats.player_id` → `players.id`
- `league_prices.player_id` → `players.id`
- `arbitration_plan_allocations.plan_id` → `arbitration_plans.id` (CASCADE DELETE)
- `arbitration_plan_allocations.player_id` → `players.id`
