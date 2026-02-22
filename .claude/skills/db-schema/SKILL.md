---
name: db-schema
description: Detailed explanation of the Supabase PostgreSQL database schema.
---

# Database Schema

The database for the Ottoneu Fantasy Football League 309 contains six main tables, all with UUID primary keys.

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
   - Foreign Key: `player_id` references `players(id)`.
   - Unique on `(player_id, league_id)`.
   - Fields include `adjustment` (numeric) and `notes`.

6. **`player_projections`**: Calculated projection outputs from the Python backend.
   - Foreign Key: `player_id` references `players(id)`.
   - Unique on `(player_id, season)`.
   - Fields include `projected_ppg` and `projection_method`.
