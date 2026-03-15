-- Migration 005: Add raw NFL stat columns to player_stats
-- These columns store per-season aggregated stats from nfl_data_py
-- All columns are nullable (historical data may not exist for every player)

ALTER TABLE player_stats
  ADD COLUMN IF NOT EXISTS passing_yards integer,
  ADD COLUMN IF NOT EXISTS passing_tds integer,
  ADD COLUMN IF NOT EXISTS interceptions integer,
  ADD COLUMN IF NOT EXISTS rushing_yards integer,
  ADD COLUMN IF NOT EXISTS rushing_tds integer,
  ADD COLUMN IF NOT EXISTS rushing_attempts integer,
  ADD COLUMN IF NOT EXISTS receptions integer,
  ADD COLUMN IF NOT EXISTS receiving_yards integer,
  ADD COLUMN IF NOT EXISTS receiving_tds integer,
  ADD COLUMN IF NOT EXISTS targets integer,
  ADD COLUMN IF NOT EXISTS fg_made_0_39 integer,
  ADD COLUMN IF NOT EXISTS fg_made_40_49 integer,
  ADD COLUMN IF NOT EXISTS fg_made_50_plus integer,
  ADD COLUMN IF NOT EXISTS pat_made integer;
