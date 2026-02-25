# Database Schema

Supabase PostgreSQL database with six data tables, all using UUID primary keys.

## Tables

### `players`
Player metadata. One row per player across the system.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | Auto-generated |
| `ottoneu_id` | integer | **Unique.** Ottoneu's player identifier |
| `name` | text | Full player name |
| `position` | text | NFL position (QB, RB, WR, TE, K) |
| `nfl_team` | text | NFL team abbreviation (see config.py `NFL_TEAM_CODES`). College players have their school name here. |
| `is_college` | boolean | True for college/draft prospect players |
| `birth_date` | date | Player's date of birth (nullable) |

### `player_stats`
Season-level statistics. FK to `players`. Unique on `(player_id, season)`.

| Column | Type | Notes |
|--------|------|-------|
| `player_id` | uuid FK | References `players(id)` |
| `season` | integer | NFL season year |
| `total_points` | numeric | Half-PPR fantasy points for the season |
| `games_played` | integer | Games with stats recorded |
| `snaps` | integer | Total offensive snaps |
| `ppg` | numeric | Points per game (`total_points / games_played`) |
| `pps` | numeric | Points per snap (`total_points / snaps`) |

### `league_prices`
Current roster state and salaries. FK to `players`. Unique on `(player_id, league_id)`.

| Column | Type | Notes |
|--------|------|-------|
| `player_id` | uuid FK | References `players(id)` |
| `league_id` | integer | Ottoneu league number (309 for this league) |
| `price` | integer | Current salary (already includes end-of-season bump) |
| `team_name` | text | Fantasy team that owns the player (`NULL` = free agent) |

### `transactions`
Event log of all roster moves. FK to `players`. Unique on `(player_id, league_id, transaction_type, transaction_date, salary)`.

| Column | Type | Notes |
|--------|------|-------|
| `player_id` | uuid FK | References `players(id)` |
| `league_id` | integer | Ottoneu league number |
| `season` | integer | NFL season year |
| `transaction_type` | text | e.g., "add", "cut", "trade", "auction" |
| `team_name` | text | Team involved |
| `from_team` | text | Source team (for trades) |
| `salary` | integer | Salary at time of transaction |
| `transaction_date` | date | When the transaction occurred |
| `raw_description` | text | Original description text from Ottoneu |

### `surplus_adjustments`
Manual overrides to VORP-calculated dollar values. Unique on `(player_id, league_id)`.

| Column | Type | Notes |
|--------|------|-------|
| `player_id` | uuid FK | References `players(id)` |
| `league_id` | integer | Ottoneu league number |
| `adjustment` | numeric | Dollar amount to add/subtract from calculated value |
| `notes` | text | Reason for the override |

### `player_projections`
Calculated projection outputs from the Python backend. Unique on `(player_id, season)`.

| Column | Type | Notes |
|--------|------|-------|
| `player_id` | uuid FK | References `players(id)` |
| `season` | integer | NFL season year |
| `projected_ppg` | numeric | Projected points per game |
| `projection_method` | text | Algorithm used (e.g., "weighted_average") |

### `scraper_jobs`
Persistent job queue for the worker pipeline. See `migrations/002_add_scraper_jobs.sql` for DDL.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | Auto-generated |
| `job_type` | text | Task type: `pull_nfl_stats`, `scrape_roster`, `scrape_player_card` |
| `status` | text | `pending`, `running`, `completed`, `failed` |
| `params` | jsonb | Task-specific parameters |
| `batch_id` | text | Groups related jobs together |
| `depends_on` | uuid | Job that must complete first |
| `attempts` | integer | Retry count (max 3) |

## Canonical Sources

- **Full DDL:** `schema.sql`
- **Migrations:** `migrations/` (numbered SQL files)
- **ER diagram:** `ARCHITECTURE.md`
