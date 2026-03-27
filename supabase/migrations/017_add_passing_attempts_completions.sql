-- Add passing_attempts and completions columns to nfl_stats
-- for QB usage share feature (GH #250)
ALTER TABLE nfl_stats ADD COLUMN passing_attempts integer;
ALTER TABLE nfl_stats ADD COLUMN completions integer;
