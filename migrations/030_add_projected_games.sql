-- Migration 030: Add projected_games to model_projections and player_projections.
--
-- The availability-inclusive backtest (#574) and #587 stage (a) showed every
-- pure-rate PPG projection pays a large availability budget (+0.59 MAE for the
-- production line, a −1.95 over-projection bias) because missed games are
-- unmodeled. The robust, deterministic fix (#587 stage c) stores a per-player
-- expected-games estimate — a leakage-free, recency-weighted mean of the
-- player's own prior-season games_played (see scripts/feature_projections/
-- expected_games.py, "history" mode). Consumers compute availability-inclusive
-- production as `projected_ppg × min(projected_games, 17) / 17` without
-- disturbing the rate projection (and its leakage-free significance gate).
--
-- NULL means "no estimate" (e.g. a player with no prior games): consumers treat
-- NULL as full availability (no haircut), preserving the prior rate behaviour.

ALTER TABLE model_projections ADD COLUMN projected_games numeric;
ALTER TABLE player_projections ADD COLUMN projected_games numeric;

COMMENT ON COLUMN model_projections.projected_games IS
  'Expected games played (0-17), leakage-free recency-weighted mean of the '
  'player''s prior-season games_played (#587). NULL = no estimate / full '
  'availability. Consumers: availability-inclusive PPG = projected_ppg × '
  'min(projected_games,17)/17.';
COMMENT ON COLUMN player_projections.projected_games IS
  'Expected games played (0-17), promoted from model_projections (#587). '
  'NULL = no estimate / full availability.';
