# Database Schema

Twenty-four tables owned by this project, all with UUID primary keys.

## Shared Database — Hands Off `fp_*`

The Supabase project (`OttoneuDB`, ref `rbinbcwinchphipvcfqk`) is **shared with a separate app, `fantasy-pulse`**, as of 2026-05. Any table whose name starts with `fp_` belongs to fantasy-pulse and is owned by that codebase, not this one.

**Rules:**
- **Do not read, write, alter, drop, or migrate any `fp_*` table** from this project's scripts, web app, or migrations.
- Do not include `fp_*` tables in TypeScript type generation outputs intended for this repo unless you explicitly strip them — they will appear in `mcp__supabase__list_tables` output and in regenerated `web/types/supabase.ts`. Leave them alone, but be aware they show up.
- New migrations in `migrations/` must only touch ottoneu tables. Never write a migration that modifies an `fp_*` table.
- When listing tables for any purpose (analysis, debugging, schema docs), filter `fp_*` out.

**Current fantasy-pulse tables (informational, do not modify):** `fp_notes`, `fp_user_integrations`, `fp_leagues`, `fp_teams`. This list may grow — anything matching `fp_*` belongs to fantasy-pulse.

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
| `player_projections` | Active projection outputs promoted from `model_projections` (FK -> `players`). Columns: `projected_ppg`, `projection_method`, `projected_games` (migration 030; promoted from `model_projections.projected_games`, NULL = no estimate / full availability). | `(player_id, season)` |
| `arbitration_plans` | Named arbitration budget allocation plans per user (FK -> `users`) | `(league_id, name, user_id)` |
| `arbitration_plan_allocations` | Per-player dollar allocations within a plan (FK -> `arbitration_plans`, `players`) | `(plan_id, player_id)` |
| `scraper_jobs` | Persistent job queue with status tracking, dependencies, and retry logic | -- |
| `projection_models` | Registry of versioned projection models (internal feature-based v1–v21+ and external sources) | `(name, version)` |
| `model_projections` | Per-model projected PPG with raw feature values (FK -> `projection_models`, `players`) | `(model_id, player_id, season)` |
| `backtest_results` | Cached accuracy metrics per model × season × position (FK -> `projection_models`) | `(model_id, season, position)` |
| `arbitration_progress` | Scraped player allocation data from Ottoneu arbitration page | -- |
| `arbitration_progress_teams` | Per-team arbitration completion status | `(league_id, season, team_name)` |
| `arbitration_allocation_details` | Per-team individual allocation breakdowns (which team allocated how much to which player) | `(league_id, season, ottoneu_id, allocating_team_name)` |
| `draft_capital` | NFL draft pick metadata sourced from nflverse `draft_picks` (FK -> `players`) | `(player_id)` |
| `draft_sharks_values` | Draft Sharks Half-PPR Superflex auction values, scraped per player per season by `scripts/scrape_draft_sharks.py` and stored at $400-cap scale (site values are ×2). Columns: `ds_auction_value`, `market_auction_value` (FK -> `players`) | `(player_id, season)` |
| `league_calendar` | Per-season Ottoneu boundary dates (`season_start`, `arb_start`, `arb_end`, `keeper_deadline`, `auction_date`, `regular_season_start`, `trade_deadline`, `last_auction_date`, `raw` jsonb). Scraped from the league finances page by `scripts/scrape_league_calendar.py`; the source of truth for the season-cycle resolver (`scripts/season.py`, `web/lib/season.ts`). | `(league_id, season)` |
| `team_vegas_lines` | Per-team-season Vegas implied total + win total. `implied_total` is aggregated per-game from nflverse `games.csv` and is **nullable** (migration 025) — preseason win totals publish months before the NFL schedule, so the column stays NULL until per-game lines are available. `win_total` is Pythagorean (back-calculated from per-game implied totals) for past seasons, or the sportsbook preseason consensus seeded via `scripts/seed_preseason_win_totals.py` for upcoming seasons. | `(team, season)` |
| `team_coaching` | Per-team-season season-opening head coach + offseason coaching-change signal, derived from nflverse `games.csv` (`home_coach`/`away_coach`) by `scripts/backfill_team_coaching.py`. Columns: `head_coach`, `head_coach_changed` (boolean, NULL when no prior season to compare), `coach_tenure_years`. A leakage-free forward signal (hires complete by Jan–Feb) for the `coaching_change_raw` / `coach_tenure_raw` features (spike #651). Python-only read (service key); RLS enabled, no anon policy. | `(team, season)` |
| `depth_charts` | Per-player-season opening-day NFL depth tier (`depth_team` 1 = starter / 2 = backup / 3 = deep reserve) for offensive skill positions, backfilled from nflverse by `scripts/backfill_depth_charts.py` (FK -> `players`). The pre-2025 per-slot `depth_team` and the 2025+ snapshot `pos_rank` schemas are both normalized to the 1/2/3 tier. A forward-looking role signal (set before the projected season's games) for the `depth_chart_position_raw` / `role_change_raw` features. RLS enabled with an anon SELECT policy (migration 029) so the `/depth-charts` page can read it. | `(player_id, season)` |
| `ngs_passing` | Per-player-season NFL Next Gen Stats passing aggregates (QB advanced efficiency), sourced from nflverse `import_ngs_data(stat_type="passing")` (regular-season `week == 0` row) by `scripts/backfill_ngs_passing.py` (FK -> `players`; full `player_display_name` matched directly to `players.name`). Columns: `attempts`, `completion_pct_above_expectation` (CPOE), `avg_air_yards_to_sticks`, `aggressiveness`, `avg_time_to_throw`, `avg_air_yards_differential`, plus supporting `avg_completed_air_yards` / `avg_intended_air_yards` / `expected_completion_pct` / `max_completed_air_distance` / `passer_rating`. Migration 033. The stabilized, less-luck-driven QB-skill signal for the QB-only NGS features (issue #674 / spike #667) — process metrics more persistent year-to-year than realized comp%/YPA/TD rate. Python-only read (service key); RLS enabled, no anon policy. | `(player_id, season)` |
| `red_zone_usage` | Per-player-season red-zone (`yardline_100 ≤ 20`) and goal-line (`≤ 10`) opportunity counts — `rz_carries`, `rz_targets`, `rz_pass_attempts`, `gz_carries`, `gz_targets` — aggregated from nflverse play-by-play by `scripts/backfill_red_zone.py` (FK -> `players`; gsis ids crosswalked to `players.name`). Migration 032. The role-based, leakage-free "expected TDs" signal for the xFP base (issue #671 / spike #667): a goal-line back's RZ carries predict rushing TDs as durable role, not luck. Python-only read (service key); RLS enabled, no anon policy. | `(player_id, season)` |

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
- `projected_ppg` float — pure-rate per-game projection
- `projected_games` numeric — expected games played (0–17), leakage-free recency-weighted mean of the player's prior-season `games_played` (#587 stage c). `NULL` = no estimate / full availability. Availability-inclusive PPG = `projected_ppg × min(projected_games,17)/17`.
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

## Schema Files

- **Migrations (source of intent):** `migrations/` — numbered `NNN_snake_case.sql` files. See [migrations/README.md](../../migrations/README.md) for naming and the apply-via-MCP workflow. Linted offline by `just check-migrations`.
- **Remote system of record:** the `supabase_migrations.schema_migrations` table — audit via the `list_migrations` MCP tool.
- **This document:** a generated, human-readable schema reference. It can lag the migrations directory (e.g. tables added via `apply_migration` or the dashboard without a numbered file, or migrations added after the last regeneration). Treat it as a convenience reference, not the source of truth.
- **Job queue:** `migrations/002_add_scraper_jobs.sql` defines the `scraper_jobs` table for the persistent job queue.

## Row-Level Security

All public tables have RLS enabled. Server-side code uses the Supabase **service key** (Python via `scripts.config.get_supabase_client()`, Next.js writes via `web/lib/supabase.supabaseAdmin`) which bypasses RLS. The anon key is restricted to read-only access on a curated set of public reference data.

**Tables with an anon SELECT policy** (web reads via the anon client): `players`, `player_stats`, `nfl_stats`, `league_prices`, `transactions`, `surplus_adjustments`, `player_projections`, `projection_models`, `model_projections`, `backtest_results`, `arbitration_progress`, `arbitration_progress_teams`, `arbitration_allocation_details`, `team_vegas_lines`, `draft_sharks_values`, `league_calendar`, `depth_charts`.

**Tables with no anon policy** (server-only, anon fully blocked): `users`, `arbitration_plans`, `arbitration_plan_allocations`, `scraper_jobs`, `draft_capital`.

When adding a new table, decide upfront: does the web frontend read from it via the anon `supabase` client (see `web/lib/supabase.ts`)? If yes, the migration must `ENABLE ROW LEVEL SECURITY` *and* add a `FOR SELECT TO anon USING (true)` policy. If no, just enable RLS — server writes via the service key still work, and anon is locked out. The Supabase advisor (`mcp__supabase__get_advisors --type security`) will flag `rls_disabled_in_public` as a critical ERROR if either step is skipped. See migrations 015 and 026 for the canonical pattern.

## Key Relationships

- `player_stats.player_id` -> `players.id`
- `nfl_stats.player_id` -> `players.id`
- `league_prices.player_id` -> `players.id`
- `surplus_adjustments.user_id` -> `users.id`
- `arbitration_plans.user_id` -> `users.id`
