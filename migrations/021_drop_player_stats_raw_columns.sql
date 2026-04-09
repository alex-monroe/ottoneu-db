-- Drop redundant raw NFL stat columns from player_stats.
-- These columns duplicate data in the nfl_stats table (migration 011).
-- player_stats now contains only Ottoneu fantasy data:
--   player_id, season, total_points, games_played, snaps, ppg, pps,
--   h1_snaps, h1_games, h2_snaps, h2_games

ALTER TABLE player_stats
  DROP COLUMN IF EXISTS passing_yards,
  DROP COLUMN IF EXISTS passing_tds,
  DROP COLUMN IF EXISTS interceptions,
  DROP COLUMN IF EXISTS rushing_yards,
  DROP COLUMN IF EXISTS rushing_tds,
  DROP COLUMN IF EXISTS rushing_attempts,
  DROP COLUMN IF EXISTS receptions,
  DROP COLUMN IF EXISTS receiving_yards,
  DROP COLUMN IF EXISTS receiving_tds,
  DROP COLUMN IF EXISTS targets,
  DROP COLUMN IF EXISTS fg_made_0_39,
  DROP COLUMN IF EXISTS fg_made_40_49,
  DROP COLUMN IF EXISTS fg_made_50_plus,
  DROP COLUMN IF EXISTS pat_made,
  DROP COLUMN IF EXISTS passing_attempts,
  DROP COLUMN IF EXISTS completions;
