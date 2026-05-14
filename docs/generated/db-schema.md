# Database Schema

Nineteen tables, all with UUID primary keys.

## Tables

| Table | Purpose | Unique Constraint |
|-------|---------|-------------------|
| `users` | User accounts with email/password auth | `email` |
| `players` | Player metadata (includes `birth_date`, `is_college`) | `ottoneu_id` |
| `player_stats` | Ottoneu fantasy season records (FK -> `players`) | `(player_id, season)` |
| `nfl_stats` | Pure NFL stats from nflverse-data, 2010-present (FK -> `players`) | `(player_id, season)` |
| `league_prices` | Current salaries (FK -> `players`) | `(player_id, league_id)` |
| `transactions` | Event log of all roster moves (adds, cuts, trades, auctions) | -- |
| `surplus_adjustments` | Manual value overrides per player per league per user (FK -> `players`, `users`) | `(player_id, league_id, user_id)` |
| `player_projections` | Active projection outputs promoted from `model_projections` (FK -> `players`) | `(player_id, season)` |
| `arbitration_plans` | Named arbitration budget allocation plans per user (FK -> `users`) | `(league_id, name, user_id)` |
| `arbitration_plan_allocations` | Per-player dollar allocations within a plan (FK -> `arbitration_plans`, `players`) | `(plan_id, player_id)` |
| `scraper_jobs` | Persistent job queue with status tracking, dependencies, and retry logic | -- |
| `projection_models` | Registry of versioned projection models (internal feature-based v1–v27+ and external sources) | `(name, version)` |
| `model_projections` | Per-model projected PPG with raw feature values (FK -> `projection_models`, `players`) | `(model_id, player_id, season)` |
| `backtest_results` | Cached accuracy metrics per model × season × position (FK -> `projection_models`) | `(model_id, season, position)` |
| `arbitration_progress` | Scraped player allocation data from Ottoneu arbitration page | -- |
| `arbitration_progress_teams` | Per-team arbitration completion status | `(league_id, season, team_name)` |
| `arbitration_allocation_details` | Per-team individual allocation breakdowns (which team allocated how much to which player) | `(league_id, season, ottoneu_id, allocating_team_name)` |
| `draft_capital` | NFL draft pick metadata sourced from nflverse `draft_picks` (FK -> `players`) | `(player_id)` |
| `team_vegas_lines` | Per-team-season Vegas implied total + Pythagorean win total, aggregated from nflverse `games.csv`. `implied_total` is nullable so preseason win totals can be seeded before the NFL schedule is released (see migration 025). | `(team, season)` |

### Projection tables detail

**`projection_models`**
- `id` UUID PK
- `name` text — model identifier (e.g. `v2_age_adjusted`, `external_fantasypros_v1`)
- `version` int — version number
- `description` text
- `features` jsonb — list of feature names used
- `config` jsonb — weight configuration
- `is_baseline` bool — marks the v1 control model
- `is_active` bool — whether this model's projections are promoted to `player_projections`

**`model_projections`**
- `model_id` UUID FK -> `projection_models`
- `player_id` UUID FK -> `players`
- `season` int
- `projected_ppg` float
- `feature_values` jsonb — per-feature computed values for audit/debug

**`backtest_results`**
- `model_id` UUID FK -> `projection_models`
- `season` int
- `position` text (`ALL`, `QB`, `RB`, `WR`, `TE`, `K`)
- `mae` float — Mean Absolute Error
- `bias` float — mean(actual − projected); positive = model under-projects
- `r_squared` float — goodness of fit
- `rmse` float — Root Mean Square Error
- `player_count` int — sample size for this season × position

### `player_stats` columns

Ottoneu fantasy data only: `games_played`, `snaps`, `ppg`, `pps`, `h1_snaps`, `h1_games`, `h2_snaps`, `h2_games`, `total_points`. Raw NFL stat columns were removed in migration 021 — all NFL stats now live exclusively in `nfl_stats`.

### `nfl_stats` columns

Core stat columns: `games_played`, `passing_yards`, `passing_tds`, `interceptions`, `passing_attempts`, `completions`, `rushing_yards`, `rushing_tds`, `rushing_attempts`, `receptions`, `targets`, `receiving_yards`, `receiving_tds`, `fg_made_0_39`, `fg_made_40_49`, `fg_made_50_plus`, `pat_made`, `total_points`, `ppg`, `offense_snaps`, `defense_snaps`, `st_snaps`, `total_snaps`, `recent_team`.

Advanced receiving (added in migration 022, populated for 2018+ via nflverse `stats_player`): `target_share`, `air_yards_share`, `wopr` (Weighted Opportunity Rating), `racr` (Receiver Air Conversion Ratio), `receiving_air_yards`.

### `draft_capital` columns

- `player_id` UUID FK -> `players` (unique)
- `season_drafted` int — draft year
- `round` int — draft round (1–7)
- `overall_pick` int — overall pick number

Backfilled from nflverse `draft_picks` parquet via `scripts/backfill_draft_capital.py` (default since 2010). Consumed by the `draft_capital_raw` feature (v23+, v25, v27) to inject pre-NFL signal into rookie and early-career projections. The `--update-rosters` flag also flips matched college players to NFL and inserts new player rows for fresh drafts.

### `team_vegas_lines` columns

- `team` text — NFL team abbreviation
- `season` int
- `implied_total` numeric(6,2), **nullable** — sum of per-game implied points-for across the regular season, derived from nflverse `games.csv` `spread_line` + `total_line`
- `win_total` numeric(4,1) — Pythagorean expectation `PF^k / (PF^k + PA^k) * games` with k=2.37, OR preseason sportsbook win total when `implied_total` is null

Backfilled via `scripts/backfill_vegas_lines.py` (nflverse games, 2016+) and seeded via `scripts/seed_preseason_win_totals.py` (hand-curated sportsbook win totals for upcoming seasons). Consumed by the `implied_team_total_raw` feature (v26, v27) to inject market expectations into season projections.

## Schema Files

- **Canonical schema:** `schema.sql` (auto-generated via Supabase MCP)
- **Migrations:** `migrations/` (numbered SQL migration files)
- **Job queue:** `migrations/002_add_scraper_jobs.sql` defines the `scraper_jobs` table for the persistent job queue

## Key Relationships

- `player_stats.player_id` -> `players.id`
- `nfl_stats.player_id` -> `players.id`
- `league_prices.player_id` -> `players.id`
- `surplus_adjustments.user_id` -> `users.id`
- `arbitration_plans.user_id` -> `users.id`
