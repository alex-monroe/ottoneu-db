-- Migration 062: add gsis_id to players
--
-- Adds the canonical nflverse player identifier (e.g. '00-0033873') to players.
-- This allows unambiguous matching between Ottoneu players and nflverse data,
-- eliminating duplicate players and name-collision ambiguities (e.g. Mike Williams,
-- Josh Allen). Backfilled by scripts/backfill_players_gsis_id.py.

ALTER TABLE players
  ADD COLUMN IF NOT EXISTS gsis_id text;

CREATE INDEX IF NOT EXISTS idx_players_gsis_id ON players(gsis_id);
