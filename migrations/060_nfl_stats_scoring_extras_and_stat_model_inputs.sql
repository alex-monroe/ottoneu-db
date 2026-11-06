-- Migration 060: nfl_stats — store the scoring extras and the stat-model inputs.
--
-- 1. Scoring extras (config.json SCORING_EXTRAS): fumbles_lost, two_point_pass,
--    two_point_rush_rec, fg_missed, pat_missed. scripts/backfill_nfl_stats.py
--    already computed them (scripts/scoring.py add_nflverse_extras) to score
--    total_points, then dropped them, so a stored row could not be re-scored
--    to its own total_points. Stored now, score_stats(row) == total_points.
-- 2. Inputs for the stat-level projection model
--    (docs/exec-plans/stat-projections/00-synthesis.md), all nflverse
--    stats_player season totals: sacks (pass attempts -> dropbacks), air
--    yards vs yards after catch, first downs, EPA, and kick attempts.
--
-- All nullable: NULL until scripts/backfill_nfl_stats.py re-runs a season.

ALTER TABLE nfl_stats
  ADD COLUMN IF NOT EXISTS fumbles_lost integer,
  ADD COLUMN IF NOT EXISTS two_point_pass integer,
  ADD COLUMN IF NOT EXISTS two_point_rush_rec integer,
  ADD COLUMN IF NOT EXISTS fg_missed integer,
  ADD COLUMN IF NOT EXISTS pat_missed integer,
  ADD COLUMN IF NOT EXISTS sacks_suffered integer,
  ADD COLUMN IF NOT EXISTS sack_yards_lost integer,
  ADD COLUMN IF NOT EXISTS passing_air_yards integer,
  ADD COLUMN IF NOT EXISTS passing_yards_after_catch integer,
  ADD COLUMN IF NOT EXISTS passing_first_downs integer,
  ADD COLUMN IF NOT EXISTS passing_epa real,
  ADD COLUMN IF NOT EXISTS rushing_first_downs integer,
  ADD COLUMN IF NOT EXISTS rushing_epa real,
  ADD COLUMN IF NOT EXISTS receiving_yards_after_catch integer,
  ADD COLUMN IF NOT EXISTS receiving_first_downs integer,
  ADD COLUMN IF NOT EXISTS receiving_epa real,
  ADD COLUMN IF NOT EXISTS fg_att integer,
  ADD COLUMN IF NOT EXISTS pat_att integer;
