-- Migration 035: Create weekly_projections table.
--
-- In-season, per-game projections for the upcoming NFL week, ingested from a
-- third party by scripts/weekly_projections/ingest.py. These are deliberately
-- NOT the same thing as player_projections:
--
--   player_projections  — our own feature model, season-long PPG, market-free,
--                         produced once in the offseason for auction/keeper/
--                         arbitration valuation.
--   weekly_projections  — a third party's forecast of points in ONE game,
--                         market-aware, refreshed daily during the season, for
--                         start/sit decisions.
--
-- Keeping them in separate tables with differently-named value columns
-- (projected_ppg vs projected_points) is what stops the two from being confused
-- in code, in the MCP payload, or by a reader. Nothing under
-- scripts/feature_projections/ may read this table — doing so would leak market
-- information into a projection system whose value proposition is being early
-- and market-free (enforced by TestNoWeeklyProjectionsInModel in
-- scripts/tests/test_architecture.py).
--
-- Projections and actuals share a row. Slightly impure for a table named
-- "weekly_projections", but the player card and the MCP tool both want them
-- together — the point of retaining a played week is showing the projection
-- next to what actually happened — and it avoids a join plus a second purge
-- rule. The database has no other weekly actuals: player_stats and nfl_stats
-- are both one-row-per-player-season.
--
-- The stat lines are jsonb rather than columns: we display them but never model
-- on them, so a rigid schema buys nothing and would need a migration per stat.
--
-- Retention: ingest.py purges seasons older than the current one. A full season
-- is roughly 600 players x 18 weeks, so the table stays a couple of megabytes
-- and never grows year over year.
--
-- Reads: the web frontend reads this via the anon Supabase client
-- (web/lib/weekly-projections.ts) for player cards, /weekly, and the MCP
-- get_weekly_projections tool, so it needs a public SELECT policy. Writes happen
-- server-side via the service key (scripts.config.get_supabase_client()), which
-- bypasses RLS.

CREATE TABLE IF NOT EXISTS public.weekly_projections (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id         uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
    season            integer NOT NULL,
    week              integer NOT NULL CHECK (week BETWEEN 1 AND 18),
    -- Which provider produced this row. Part of the unique key so a second
    -- source can be added later without a migration.
    source            text    NOT NULL DEFAULT 'sleeper',

    -- Ottoneu points for this single game, computed by us from projected_stats
    -- using scripts.config.SCORING_SETTINGS — never the source's own fantasy
    -- point total, which is scored under the source's rules, not this league's.
    projected_points  numeric,
    projected_stats   jsonb,
    opponent          text,

    -- Filled by a second ingest pass once the games are played; NULL until then.
    actual_points     numeric,
    actual_stats      jsonb,

    projected_at      timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    UNIQUE (player_id, season, week, source)
);

CREATE INDEX IF NOT EXISTS idx_weekly_projections_season_week
    ON public.weekly_projections (season, week);

CREATE INDEX IF NOT EXISTS idx_weekly_projections_player
    ON public.weekly_projections (player_id, season, week);

ALTER TABLE public.weekly_projections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for all users" ON public.weekly_projections
  FOR SELECT TO anon USING (true);
