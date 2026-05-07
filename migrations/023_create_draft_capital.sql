-- Migration 023: Create draft_capital table for NFL draft pick metadata.
-- Sourced from nflverse draft_picks parquet. Used by the draft_capital_raw
-- feature to inject pre-NFL signal (round, overall pick) into rookie and
-- early-career projections. GH #376.

CREATE TABLE draft_capital (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  player_id uuid REFERENCES players(id) NOT NULL,
  season_drafted integer NOT NULL,
  round integer NOT NULL,
  overall_pick integer NOT NULL,

  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,

  UNIQUE(player_id)
);

CREATE INDEX idx_draft_capital_player_id ON draft_capital(player_id);
CREATE INDEX idx_draft_capital_season ON draft_capital(season_drafted);
