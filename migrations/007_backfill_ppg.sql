-- Migration 007: Backfill ppg for historical player_stats rows
-- pull_player_stats.py writes total_points and games_played but previously
-- did not calculate ppg. This backfills all rows where ppg IS NULL but
-- total_points and games_played are both available.

UPDATE player_stats
SET ppg = ROUND((total_points / games_played)::numeric, 2)
WHERE ppg IS NULL
  AND games_played IS NOT NULL
  AND games_played > 0
  AND total_points IS NOT NULL;
