-- Migration: Create market projection tables
-- Based on docs/exec-plans/market-projections.md
-- Created: 2026-05-22

-- 1. betting_game_lines
-- Stores Vegas lines and implied team scores for each game
CREATE TABLE IF NOT EXISTS betting_game_lines (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  season integer NOT NULL,
  week integer NOT NULL,
  home_team text NOT NULL,
  away_team text NOT NULL,
  spread_line numeric,
  total_line numeric,
  home_implied_score numeric,
  away_implied_score numeric,
  source text,
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(season, week, home_team, away_team)
);

CREATE INDEX IF NOT EXISTS idx_betting_lines_season ON betting_game_lines(season);
CREATE INDEX IF NOT EXISTS idx_betting_lines_week ON betting_game_lines(week);


-- 2. team_season_stats
-- Aggregated player stats to team level + average implied score
CREATE TABLE IF NOT EXISTS team_season_stats (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  season integer NOT NULL,
  nfl_team text NOT NULL,
  games integer,
  team_passing_yards integer,
  team_rushing_yards integer,
  team_targets integer,
  avg_implied_score numeric,
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(season, nfl_team)
);

CREATE INDEX IF NOT EXISTS idx_team_stats_season ON team_season_stats(season);
CREATE INDEX IF NOT EXISTS idx_team_stats_nfl_team ON team_season_stats(nfl_team);


-- 3. player_historical_shares
-- Calculated market shares (yards/targets) for each player-season
CREATE TABLE IF NOT EXISTS player_historical_shares (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  player_id uuid REFERENCES players(id) NOT NULL,
  season integer NOT NULL,
  nfl_team text,
  position text,
  pass_yard_share numeric,
  rush_yard_share numeric,
  target_share numeric,
  rec_yard_share numeric,
  reception_share numeric,
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(player_id, season)
);

CREATE INDEX IF NOT EXISTS idx_player_shares_player_id ON player_historical_shares(player_id);
CREATE INDEX IF NOT EXISTS idx_player_shares_season ON player_historical_shares(season);


-- 4. market_player_projections
-- Final projections derived from team implied totals + player shares
CREATE TABLE IF NOT EXISTS market_player_projections (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  player_id uuid REFERENCES players(id) NOT NULL,
  season integer NOT NULL,
  nfl_team text,
  position text,
  projected_ppg numeric,
  projected_passing_yards numeric,
  projected_rushing_yards numeric,
  projected_receiving_yards numeric,
  projected_targets numeric,
  implied_team_score numeric,
  projection_source text,
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(player_id, season)
);

CREATE INDEX IF NOT EXISTS idx_market_projections_player_id ON market_player_projections(player_id);
CREATE INDEX IF NOT EXISTS idx_market_projections_season ON market_player_projections(season);


-- 5. player_draft_info
-- Metadata about player draft status (used as features for ML model)
CREATE TABLE IF NOT EXISTS player_draft_info (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  player_id uuid REFERENCES players(id) NOT NULL,
  draft_year integer,
  draft_round integer,
  draft_pick integer,
  is_undrafted boolean DEFAULT false,
  created_at timestamptz DEFAULT now() NOT NULL,
  UNIQUE(player_id)
);

CREATE INDEX IF NOT EXISTS idx_draft_info_player_id ON player_draft_info(player_id);
CREATE INDEX IF NOT EXISTS idx_draft_info_draft_year ON player_draft_info(draft_year);
