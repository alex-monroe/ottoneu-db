-- Migration 057: matchup_score_plays — the home side's win probability at each play.
--
-- Drives the score worm's "Win %" view. Written by scripts/rebuild_score_worm.py:
-- each side's expected final is its points so far plus every starter's kickoff
-- projection (weekly_projections, as stored — the game page's live projection
-- uses the same numbers) for the share of his game still to play; the
-- uncertainty left is WORM_LINEUP_SD × √(share of the lineup's minutes still to
-- play) per side; the win probability is the normal chance the expected margin
-- holds. Each game also gains a 0–0 "Kickoff" row holding the pre-game value.
--
-- NULL on rows written before this column existed, until their week is rebuilt.

ALTER TABLE matchup_score_plays
  ADD COLUMN IF NOT EXISTS home_win_prob numeric;
