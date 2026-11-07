-- Migration 064: add nflverse_birth_date to players
--
-- Birth date from the nflverse player registry, joined on players.gsis_id
-- (99%+ of NFL players since 2010). Kept separate from the Ottoneu-scraped
-- players.birth_date (2-57% filled by season) on purpose: the live v44 model's
-- age_curve feature reads birth_date, so filling that column would change live
-- projections without a held-out gate. Read by the stat-level models (stat_*,
-- docs/exec-plans/stat-projections/09-stat-model-ledger.md). Backfilled by
-- scripts/backfill_players_gsis_id.py.

ALTER TABLE players
  ADD COLUMN IF NOT EXISTS nflverse_birth_date date;
