-- Migration 025: Allow team_vegas_lines.implied_total to be null.
--
-- Preseason win totals are published in March/April of each year, but
-- per-game spread/total lines (which the Pythagorean implied total is
-- derived from) require the NFL schedule. The schedule is typically
-- released in mid-May, so for a few weeks every spring we can know
-- win_total without yet being able to compute implied_total. Relaxing
-- this constraint lets us seed those rows on the win_total side and
-- backfill implied_total later when nflverse picks up the schedule.
--
-- The implied_team_total_raw projection feature already returns None
-- when a (team, season) row lacks implied_total — those samples
-- contribute zero through the learned ridge. GH #378 follow-up.

ALTER TABLE team_vegas_lines
  ALTER COLUMN implied_total DROP NOT NULL;
