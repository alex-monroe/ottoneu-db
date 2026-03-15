-- Add is_college flag to players table to distinguish college prospects from NFL players.
-- College players have their college name in nfl_team (e.g., "Colorado") instead of
-- an NFL team abbreviation (e.g., "KC").

ALTER TABLE players ADD COLUMN IF NOT EXISTS is_college boolean NOT NULL DEFAULT false;

-- Backfill existing college players based on nfl_team not matching any NFL abbreviation.
-- Ottoneu uses "LA" for Rams and "JAC" for Jaguars (not standard "LAR"/"JAX").
UPDATE players SET is_college = true
WHERE nfl_team NOT IN (
  'ARI','ATL','BAL','BUF','CAR','CHI','CIN','CLE',
  'DAL','DEN','DET','GB','HOU','IND','JAC','KC',
  'LA','LAC','LV','MIA','MIN','NE','NO','NYG',
  'NYJ','PHI','PIT','SEA','SF','TB','TEN','WAS',
  'FA','Unknown'
) AND nfl_team IS NOT NULL;
