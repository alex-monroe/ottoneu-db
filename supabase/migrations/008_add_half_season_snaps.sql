ALTER TABLE player_stats
  ADD COLUMN IF NOT EXISTS h1_snaps   integer,
  ADD COLUMN IF NOT EXISTS h1_games   integer,
  ADD COLUMN IF NOT EXISTS h2_snaps   integer,
  ADD COLUMN IF NOT EXISTS h2_games   integer;
