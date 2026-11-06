-- Migration 063: create nfl_team_volume and nfl_team_weekly_volume
--
-- Stores team-level offensive play-by-play volume totals (pass attempts, carries,
-- dropbacks, sacks, total plays, and neutral-situation volume) at both the
-- full-season and weekly levels.
--
-- Used by stat-level projection models (docs/exec-plans/stat-projections/00-synthesis.md
-- and 07-projection-calendar.md):
--   1. nfl_team_volume (season totals): serves as the denominator for target and
--      carry share models and role constraints.
--   2. nfl_team_weekly_volume (per-game logs): enables leakage-free in-season
--      vintages (e.g. V0 after week 10) to aggregate team volume as of any calendar date.
--
-- Ingested by scripts/backfill_nfl_team_volume.py from nflverse play-by-play.

CREATE TABLE IF NOT EXISTS nfl_team_volume (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team text NOT NULL,
  season integer NOT NULL,
  season_type text NOT NULL DEFAULT 'REG',
  games integer NOT NULL DEFAULT 0,
  plays integer NOT NULL DEFAULT 0,
  pass_attempts integer NOT NULL DEFAULT 0,
  rush_attempts integer NOT NULL DEFAULT 0,
  dropbacks integer NOT NULL DEFAULT 0,
  sacks integer NOT NULL DEFAULT 0,
  passing_yards integer NOT NULL DEFAULT 0,
  rushing_yards integer NOT NULL DEFAULT 0,
  neutral_plays integer NOT NULL DEFAULT 0,
  neutral_pass_attempts integer NOT NULL DEFAULT 0,
  neutral_rush_attempts integer NOT NULL DEFAULT 0,
  neutral_dropbacks integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE (team, season, season_type)
);

CREATE INDEX IF NOT EXISTS idx_nfl_team_volume_season ON nfl_team_volume(season);

ALTER TABLE public.nfl_team_volume ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable read access for all users" ON public.nfl_team_volume
  FOR SELECT TO anon USING (true);

CREATE TABLE IF NOT EXISTS nfl_team_weekly_volume (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team text NOT NULL,
  season integer NOT NULL,
  week integer NOT NULL,
  season_type text NOT NULL DEFAULT 'REG',
  game_id text,
  game_date date,
  opponent_team text,
  plays integer NOT NULL DEFAULT 0,
  pass_attempts integer NOT NULL DEFAULT 0,
  rush_attempts integer NOT NULL DEFAULT 0,
  dropbacks integer NOT NULL DEFAULT 0,
  sacks integer NOT NULL DEFAULT 0,
  passing_yards integer NOT NULL DEFAULT 0,
  rushing_yards integer NOT NULL DEFAULT 0,
  neutral_plays integer NOT NULL DEFAULT 0,
  neutral_pass_attempts integer NOT NULL DEFAULT 0,
  neutral_rush_attempts integer NOT NULL DEFAULT 0,
  neutral_dropbacks integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE (team, season, week, season_type)
);

CREATE INDEX IF NOT EXISTS idx_nfl_team_weekly_volume_season_week ON nfl_team_weekly_volume(season, week);

ALTER TABLE public.nfl_team_weekly_volume ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable read access for all users" ON public.nfl_team_weekly_volume
  FOR SELECT TO anon USING (true);
