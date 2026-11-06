-- Migration 061: nfl_weekly_stats — one row per player per game.
--
-- nfl_stats holds season totals; the stat-level projection work
-- (docs/exec-plans/stat-projections/06-vintages-and-internal-calendar.md and
-- 07-projection-calendar.md) needs the weekly rows underneath them: the
-- in-season projection vintage (V0) is built from games played so far, and
-- split-half reliability studies compare odd and even weeks.
--
-- Source: nflverse stats_player_week_{year}.parquet (REG and POST) plus the
-- snap_counts file and games.csv (game_date). Written by
-- scripts/backfill_nfl_weekly_stats.py. Stat columns mirror nfl_stats (names
-- and types), so summing a player's REG weeks reproduces their nfl_stats row.
-- gsis_id is the nflverse player_id, kept so a future players.gsis_id can be
-- derived and name matching retired.

CREATE TABLE IF NOT EXISTS nfl_weekly_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL REFERENCES players(id),
  gsis_id text,
  season integer NOT NULL,
  week integer NOT NULL,
  season_type text NOT NULL,          -- 'REG' or 'POST'
  game_id text,
  game_date date,
  team text,
  opponent_team text,

  -- Passing
  passing_attempts integer,
  completions integer,
  passing_yards integer,
  passing_tds integer,
  interceptions integer,
  sacks_suffered integer,
  sack_yards_lost integer,
  passing_air_yards integer,
  passing_yards_after_catch integer,
  passing_first_downs integer,
  passing_epa real,

  -- Rushing
  rushing_attempts integer,
  rushing_yards integer,
  rushing_tds integer,
  rushing_first_downs integer,
  rushing_epa real,

  -- Receiving
  targets integer,
  receptions integer,
  receiving_yards integer,
  receiving_tds integer,
  receiving_air_yards integer,
  receiving_yards_after_catch integer,
  receiving_first_downs integer,
  receiving_epa real,
  target_share double precision,
  air_yards_share double precision,
  wopr double precision,
  racr double precision,

  -- Kicking
  fg_made_0_39 integer,
  fg_made_40_49 integer,
  fg_made_50_plus integer,
  fg_att integer,
  fg_missed integer,
  pat_made integer,
  pat_att integer,
  pat_missed integer,

  -- Scoring extras (config.json SCORING_EXTRAS)
  fumbles_lost integer,
  two_point_pass integer,
  two_point_rush_rec integer,

  -- Snap counts (nflverse snap_counts, per game)
  offense_snaps integer,
  offense_pct real,

  -- Ottoneu points for this game (scripts/scoring.py score_stats)
  total_points real,

  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,

  UNIQUE (player_id, season, week, season_type)
);

CREATE INDEX IF NOT EXISTS idx_nfl_weekly_stats_season_week ON nfl_weekly_stats(season, week);

-- Public reference data, like nfl_stats (migration 015): RLS on, anon read-only.
ALTER TABLE public.nfl_weekly_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for all users" ON public.nfl_weekly_stats
  FOR SELECT TO anon USING (true);
