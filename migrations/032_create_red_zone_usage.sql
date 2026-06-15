-- Migration 032: Create red_zone_usage table for per-player-season red-zone
-- and goal-line opportunity counts.
--
-- Sourced from nflverse play-by-play (`import_pbp_data`) by
-- `scripts/backfill_red_zone.py`: red-zone = plays with yardline_100 <= 20,
-- goal-line = yardline_100 <= 10. Per (player, season) we record the player's
-- carries, targets, and (for QBs) pass attempts inside those zones.
--
-- Red-zone usage is the role-based, leakage-free signal a same-data model
-- cannot derive from a player's own PPG: a goal-line back SHOULD score more
-- rushing TDs — that is durable role, not luck. It powers the xFP base (issue
-- #671, the #667 spike's "new information" lever) which replaces realized TDs
-- with red-zone-usage-expected TDs, fixing L1's flaw of regressing every
-- player's TD rate toward one population mean.
--
-- Read only by Python (service key, bypasses RLS), so RLS is enabled with no
-- anon SELECT policy — mirrors draft_capital (026) and team_coaching (031).

CREATE TABLE red_zone_usage (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  player_id uuid NOT NULL REFERENCES players(id),
  season integer NOT NULL,

  -- Inside the 20 (red zone)
  rz_carries integer NOT NULL DEFAULT 0,
  rz_targets integer NOT NULL DEFAULT 0,
  rz_pass_attempts integer NOT NULL DEFAULT 0,
  -- Inside the 10 (goal-line) — the highest-TD-leverage subset
  gz_carries integer NOT NULL DEFAULT 0,
  gz_targets integer NOT NULL DEFAULT 0,

  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,

  UNIQUE(player_id, season)
);

CREATE INDEX idx_red_zone_usage_season ON red_zone_usage(season);
CREATE INDEX idx_red_zone_usage_player ON red_zone_usage(player_id);

ALTER TABLE public.red_zone_usage ENABLE ROW LEVEL SECURITY;
