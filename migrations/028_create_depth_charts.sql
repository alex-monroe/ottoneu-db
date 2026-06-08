-- Migration 028: Create depth_charts table for NFL opening-day depth-chart
-- position. Sourced from nflverse (`nfl_data_py.import_depth_charts`), taking
-- each player's Week 1 regular-season offensive depth-team rank (1 = starter,
-- 2 = backup, 3 = third string). This is a forward-looking role signal — set
-- before any of the projected season's games are played — that the 3-year
-- weighted-PPG model is blind to (e.g. a backup promoted to starter via free
-- agency, or a rookie who wins a Week 1 job). Used by the
-- depth_chart_position_raw and role_change_raw features. GH #391.

CREATE TABLE depth_charts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  player_id uuid NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  season integer NOT NULL,
  team text,
  position text,
  depth_team smallint NOT NULL,
  week smallint NOT NULL DEFAULT 1,

  scraped_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,

  UNIQUE(player_id, season)
);

CREATE INDEX idx_depth_charts_season ON depth_charts(season);
CREATE INDEX idx_depth_charts_player ON depth_charts(player_id);

-- RLS: depth_charts is read only by Python (service key, bypasses RLS); it is
-- not read from the web. Enable RLS to satisfy the `rls_disabled_in_public`
-- advisor, with no anon policy (matches draft_capital). GH #391.
ALTER TABLE public.depth_charts ENABLE ROW LEVEL SECURITY;
