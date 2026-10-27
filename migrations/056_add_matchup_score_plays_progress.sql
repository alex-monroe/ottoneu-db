-- Migration 056: matchup_score_plays — each side's share of lineup minutes played.
--
-- The score worm's "Minutes played" view plots each team's score against how
-- much of its own lineup's game time has elapsed, rather than the wall clock —
-- cricket's worm, where each innings is measured in its own overs. Each starter
-- brings his NFL game's full length (60 minutes plus any overtime), so every
-- lineup finishes at exactly 1; a starter on bye brings none.
--
-- Written by scripts/rebuild_score_worm.py alongside the running totals. NULL
-- on rows written before this column existed, until their week is rebuilt.

ALTER TABLE matchup_score_plays
  ADD COLUMN IF NOT EXISTS home_progress numeric,
  ADD COLUMN IF NOT EXISTS away_progress numeric;
