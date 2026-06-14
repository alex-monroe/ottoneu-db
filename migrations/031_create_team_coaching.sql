-- Migration 031: Create team_coaching table for per-team-season head-coach
-- identity and offseason coaching-change signal.
--
-- Sourced from nflverse `games.csv` (home_coach/away_coach per game) — the same
-- free, leakage-checkable source as team_vegas_lines. For each (team, season)
-- we record the season-opening head coach, whether that coach changed versus
-- the prior season (the offseason "new scheme" signal that a stats-only model
-- cannot see), and the coach's consecutive tenure with the team.
--
-- Powers the coaching_change_raw / coach_tenure_raw projection features
-- (spike #651): a new head coach changes scheme/pace/pass-rate, the classic
-- QB/WR breakout-or-bust driver invisible to a player's own PPG history.
--
-- Read only by Python (service key, bypasses RLS), so RLS is enabled with no
-- anon SELECT policy — mirrors draft_capital (migration 026).

CREATE TABLE team_coaching (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  team text NOT NULL,
  season integer NOT NULL,
  head_coach text NOT NULL,
  -- 1 if the season-opening head coach differs from the prior season's;
  -- NULL when no prior season is available to compare against.
  head_coach_changed boolean,
  -- Consecutive seasons (including this one) the opening head coach has led
  -- the team, computed over the full loaded history.
  coach_tenure_years integer NOT NULL,

  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,

  UNIQUE(team, season)
);

CREATE INDEX idx_team_coaching_season ON team_coaching(season);
CREATE INDEX idx_team_coaching_team ON team_coaching(team);

ALTER TABLE public.team_coaching ENABLE ROW LEVEL SECURITY;
