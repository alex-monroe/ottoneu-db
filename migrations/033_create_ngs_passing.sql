-- Migration 033: Create ngs_passing table for per-player-season NFL Next Gen
-- Stats passing metrics (QB advanced efficiency).
--
-- Sourced from nflverse Next Gen Stats (`nfl_data_py.import_ngs_data(
-- stat_type="passing")`) by `scripts/backfill_ngs_passing.py`. NGS publishes a
-- per-(player, season) regular-season aggregate row (week == 0, season_type ==
-- 'REG'). We store the advanced columns that are *stabilized, less-luck-driven*
-- measures of QB skill — more persistent year-to-year than the realized
-- efficiency (comp %, YPA, TD rate) already baked into PPG:
--
--   completion_pct_above_expectation  -- CPOE: accuracy vs expected
--   avg_air_yards_to_sticks           -- intended depth past the first-down marker
--   aggressiveness                    -- % throws into tight coverage
--   avg_time_to_throw                 -- pocket/process time
--   avg_air_yards_differential        -- completed minus intended air yards
--   (+ supporting air-yards / passer_rating / attempts for filtering)
--
-- These power a QB-only feature (issue #674, the #667 spike's "new information"
-- follow-up) stacked on the best QB model (v44_eb_pooling_perpos). NGS-era
-- coverage begins 2016; we backfill 2018+ (the training window). Leakage-free:
-- the feature reads only a player's *prior* seasons.
--
-- Read only by Python (service key, bypasses RLS), so RLS is enabled with no
-- anon SELECT policy — mirrors red_zone_usage (032), team_coaching (031) and
-- draft_capital (026).

CREATE TABLE ngs_passing (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  player_id uuid NOT NULL REFERENCES players(id),
  season integer NOT NULL,

  -- Volume (season regular-season pass attempts) — used to filter thin samples.
  attempts integer NOT NULL DEFAULT 0,

  -- Stabilized skill / process metrics (the modeling signal).
  completion_pct_above_expectation real,  -- CPOE
  avg_air_yards_to_sticks real,
  aggressiveness real,
  avg_time_to_throw real,
  avg_air_yards_differential real,         -- completed minus intended air yards

  -- Supporting NGS columns (stored for completeness / future use).
  avg_completed_air_yards real,
  avg_intended_air_yards real,
  expected_completion_pct real,
  max_completed_air_distance real,
  passer_rating real,

  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,

  UNIQUE(player_id, season)
);

CREATE INDEX idx_ngs_passing_season ON ngs_passing(season);
CREATE INDEX idx_ngs_passing_player ON ngs_passing(player_id);

ALTER TABLE public.ngs_passing ENABLE ROW LEVEL SECURITY;
