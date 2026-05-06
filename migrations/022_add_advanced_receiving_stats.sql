-- Add advanced receiving columns from nflverse stats_player parquet.
-- target_share, air_yards_share, wopr, racr capture opportunity independent
-- of efficiency, the strongest WR/TE volume signal. receiving_air_yards is
-- the underlying count input to those rate stats. GH #375.
alter table nfl_stats add column if not exists target_share double precision;
alter table nfl_stats add column if not exists air_yards_share double precision;
alter table nfl_stats add column if not exists wopr double precision;
alter table nfl_stats add column if not exists racr double precision;
alter table nfl_stats add column if not exists receiving_air_yards integer;
