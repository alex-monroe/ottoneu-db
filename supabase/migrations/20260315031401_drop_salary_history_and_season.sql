-- Migration: Drop salary_history table and remove season from league_prices
-- Created: 2026-02-14
--
-- salary_history is replaced by the transactions table which captures
-- real transaction events with dates. league_prices now represents
-- current state only, so season is unnecessary.

-- 1. Drop salary_history table and its indexes
DROP INDEX IF EXISTS idx_salary_history_player_league_season;
DROP INDEX IF EXISTS idx_salary_history_latest;
DROP TABLE IF EXISTS salary_history;

-- 2. Remove season from league_prices
-- Drop the old unique constraint that includes season
ALTER TABLE league_prices DROP CONSTRAINT IF EXISTS league_prices_player_id_league_id_season_key;

-- Drop the season column
ALTER TABLE league_prices DROP COLUMN IF EXISTS season;

-- Add new unique constraint without season
ALTER TABLE league_prices ADD CONSTRAINT league_prices_player_id_league_id_key UNIQUE(player_id, league_id);
