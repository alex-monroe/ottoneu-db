-- Migration 011: Create nfl_stats table for pure NFL statistical data
-- This table stores real NFL stats (from nflverse-data) separately from
-- Ottoneu fantasy data (which lives in player_stats).
-- Covers 2010-present with per-season aggregated regular-season stats.

CREATE TABLE nfl_stats (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  player_id uuid REFERENCES players(id) NOT NULL,
  season integer NOT NULL,

  -- Games
  games_played integer,

  -- Passing
  passing_yards integer,
  passing_tds integer,
  interceptions integer,

  -- Rushing
  rushing_yards integer,
  rushing_tds integer,
  rushing_attempts integer,

  -- Receiving
  receptions integer,
  targets integer,
  receiving_yards integer,
  receiving_tds integer,

  -- Kicking
  fg_made_0_39 integer,
  fg_made_40_49 integer,
  fg_made_50_plus integer,
  pat_made integer,

  -- Snap counts (from nflverse snap_counts dataset)
  offense_snaps integer,
  defense_snaps integer,
  st_snaps integer,
  total_snaps integer,

  -- Calculated fantasy scoring (Ottoneu Half PPR formula)
  total_points numeric,
  ppg numeric,

  -- Timestamps
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,

  UNIQUE(player_id, season)
);

-- Indexes for common query patterns
CREATE INDEX idx_nfl_stats_season ON nfl_stats(season);
CREATE INDEX idx_nfl_stats_player_id ON nfl_stats(player_id);
