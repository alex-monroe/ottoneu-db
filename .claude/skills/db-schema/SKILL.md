---
name: db-schema
description: Detailed explanation of the Supabase PostgreSQL database schema.
---

# Database Schema

The database for the Ottoneu Fantasy Football League 309 contains eleven main tables, all with UUID primary keys.

1. **`players`**: Core metadata for each player.
   - Unique on `ottoneu_id`.
   - Has `name`, `position`, `nfl_team`, `is_college` fields.

2. **`player_stats`**: Seasonal statistics for each player.
   - Foreign Key: `player_id` references `players(id)`.
   - Unique constraint on `(player_id, season)`.
   - Fields include `total_points`, `games_played`, `snaps`, `ppg` (Points Per Game), and `pps` (Points Per Snap).

3. **`league_prices`**: Current salary and team ownership states for players in a specific league.
   - Foreign Key: `player_id` references `players(id)`.
   - Unique constraint on `(player_id, league_id)`.
   - Fields include `league_id`, `price` (salary), and `team_name` (the fantasy team that owns the player).

4. **`transactions`**: Structured event log representing roster moves.
   - Used for adds, cuts, trades, and auctions.
   - Foreign Key: `player_id` references `players(id)`.
   - Fields include `league_id`, `season`, `transaction_type`, `team_name`, `from_team`, `salary`, `transaction_date`, and `raw_description`.
   - Unique constraint on `(player_id, league_id, transaction_type, transaction_date, salary)` to prevent duplicate entries.

5. **`surplus_adjustments`**: Manual value overrides used to override VORP-calculated dollar values.
   - Foreign Key: `player_id` references `players(id)` and `user_id` references `users(id)`.
   - Unique on `(player_id, league_id, user_id)`.
   - Fields include `adjustment` (numeric) and `notes`.

6. **`player_projections`**: Calculated projection outputs from the Python backend.
   - Foreign Key: `player_id` references `players(id)`.
   - Unique on `(player_id, season)`.
   - Fields include `projected_ppg` and `projection_method`.

7. **`users`**: User accounts for authentication and access control.
   - Unique on `email`.
   - Fields include `password_hash`, `is_admin`, and `has_projections_access`.

8. **`nfl_stats`**: Pure NFL stats from nflverse-data, 2010-present.
   - Foreign Key: `player_id` references `players(id)`.
   - Unique on `(player_id, season)`.
   - Fields include `games_played`, `passing_yards`, `rushing_tds`, `targets`, `snaps`, etc.

9. **`arbitration_plans`**: Named arbitration budget allocation plans per user.
   - Foreign Key: `user_id` references `users(id)`.
   - Unique on `(league_id, name, user_id)`.
   - Fields include `league_id` and `name`.

10. **`arbitration_plan_allocations`**: Per-player dollar allocations within an arbitration plan.
    - Foreign Key: `plan_id` references `arbitration_plans(id)` and `player_id` references `players(id)`.
    - Unique on `(plan_id, player_id)`.
    - Fields include `allocation` (dollar amount).

11. **`scraper_jobs`**: Persistent job queue for the backend data pipeline.
    - Used by the Playwright/Python worker to scrape stats and rosters.
    - Fields include `task_type`, `status`, `depends_on`, `error_message`, and timestamps.
