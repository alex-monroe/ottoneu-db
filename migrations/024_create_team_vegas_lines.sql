-- Migration 024: Create team_vegas_lines table for preseason Vegas implied team
-- totals. Sourced by scraping Pro-Football-Reference game schedules and
-- aggregating per-game implied totals into a season-level total per team.
-- Used by the implied_team_total_raw feature to inject market expectations
-- (a strong, qualitative-factor-aware signal) into season projections.
-- GH #378.

CREATE TABLE team_vegas_lines (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  team text NOT NULL,
  season integer NOT NULL,
  implied_total numeric(6,2) NOT NULL,
  win_total numeric(4,1),

  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,

  UNIQUE(team, season)
);

CREATE INDEX idx_team_vegas_lines_season ON team_vegas_lines(season);
CREATE INDEX idx_team_vegas_lines_team ON team_vegas_lines(team);
