-- Migration 058: matchup_score_plays — each side's projected points still to come.
--
-- Drives the score worm's "hurricane" cone. On hover, from any moment t, each
-- side's score at a later moment s is expected to be
--   points(t) + proj_remaining(t) − proj_remaining(s)
-- give or take WORM_LINEUP_SD × √(progress(s) − progress(t)) (progress is the
-- side's share of lineup minutes played, migration 056). The shaded band is the
-- central 80% of that, so it has no width at the hovered moment and widens to
-- the final-score range at the end of the week.
--
-- Written by scripts/rebuild_score_worm.py: every starter's kickoff projection
-- (weekly_projections, as stored) × the share of his game not yet played; 0 on
-- the closing adjustment row. NULL on rows written before this column existed,
-- until their week is rebuilt.

ALTER TABLE matchup_score_plays
  ADD COLUMN IF NOT EXISTS home_proj_remaining numeric,
  ADD COLUMN IF NOT EXISTS away_proj_remaining numeric;
