-- Migration 043: weekly_projections.game_date — the date of the player's NFL game.
--
-- The ingest needs to know when a projection stops being a forecast. Sleeper
-- keeps revising a week's projections after its games are played: the morning
-- after the 2026 opener (NE @ SEA, Wednesday 9 September) every player in that
-- finished game came back re-stamped with a new number (Drake Maye 19.0 -> 19.67,
-- Sam Darnold 16.38 -> 17.11), and the checked-in 2025 Week 1 fixture carries a
-- `last_modified` a month after its game. The daily upsert copied each revision
-- over the stored row, so the projection a lineup had been set against was
-- silently replaced with a post-game figure nobody could have seen beforehand.
--
-- With the game date stored, the ingest freezes a row once its game has started
-- (date before today, America/New_York) and never overwrites or clears its
-- projection again — see scripts/weekly_projections/ingest.py
-- (`apply_kickoff_freeze`, `partition_dropped_rows`). The value is Sleeper's
-- per-row `date` field.
--
-- Nullable: rows written before this migration have no date, and for those the
-- ingest falls back to "an actual is recorded" as the started signal.

ALTER TABLE weekly_projections
  ADD COLUMN IF NOT EXISTS game_date date;

COMMENT ON COLUMN weekly_projections.game_date IS
  'Date of the player''s NFL game (source''s own field). Once it is past, the projection is frozen as the pre-kickoff forecast.';
