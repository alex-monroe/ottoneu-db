-- Add recent_team column to nfl_stats for historical team tracking.
-- This enables the team_context projection feature to correctly handle
-- players who changed teams between seasons.
alter table nfl_stats add column if not exists recent_team text;
alter table nfl_stats add column if not exists passing_attempts integer;
alter table nfl_stats add column if not exists completions integer;
