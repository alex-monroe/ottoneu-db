-- Add non-negative check constraints
ALTER TABLE league_prices ADD CONSTRAINT chk_price_non_negative CHECK (price >= 0);
ALTER TABLE transactions ADD CONSTRAINT chk_salary_non_negative CHECK (salary >= 0);

-- Update foreign keys to cascade on delete
ALTER TABLE player_stats DROP CONSTRAINT IF EXISTS player_stats_player_id_fkey;
ALTER TABLE player_stats ADD CONSTRAINT player_stats_player_id_fkey FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE;

ALTER TABLE league_prices DROP CONSTRAINT IF EXISTS league_prices_player_id_fkey;
ALTER TABLE league_prices ADD CONSTRAINT league_prices_player_id_fkey FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE;

ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_player_id_fkey;
ALTER TABLE transactions ADD CONSTRAINT transactions_player_id_fkey FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE;

ALTER TABLE surplus_adjustments DROP CONSTRAINT IF EXISTS surplus_adjustments_player_id_fkey;
ALTER TABLE surplus_adjustments ADD CONSTRAINT surplus_adjustments_player_id_fkey FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE;

ALTER TABLE player_projections DROP CONSTRAINT IF EXISTS player_projections_player_id_fkey;
ALTER TABLE player_projections ADD CONSTRAINT player_projections_player_id_fkey FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE;

ALTER TABLE nfl_stats DROP CONSTRAINT IF EXISTS nfl_stats_player_id_fkey;
ALTER TABLE nfl_stats ADD CONSTRAINT nfl_stats_player_id_fkey FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE;
