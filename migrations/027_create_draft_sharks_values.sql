-- Migration 027: Create draft_sharks_values table.
--
-- Stores Draft Sharks Half-PPR Superflex auction values, scraped per player
-- per season by scripts/scrape_draft_sharks.py. Draft Sharks publishes values
-- on a $200 cap; this league uses $400, so the scraper stores values already
-- multiplied by 2 (i.e. the $400-scale value).
--
-- Two dollar columns are captured:
--   * ds_auction_value     — Draft Sharks' own model-recommended bid
--   * market_auction_value — Draft Sharks' consensus "auction market value"
--
-- Reads: the web frontend reads this table via the anon Supabase client
-- (web/lib/data.ts) to show values on player cards / hover cards for users
-- with projections access, so it needs a public SELECT policy. Writes happen
-- server-side via the service key (scripts/config.get_supabase_client()),
-- which bypasses RLS.

CREATE TABLE IF NOT EXISTS public.draft_sharks_values (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    player_id            uuid NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
    season               integer NOT NULL,
    ds_auction_value     numeric,
    market_auction_value numeric,
    scraped_at           timestamptz NOT NULL DEFAULT now(),
    UNIQUE (player_id, season)
);

CREATE INDEX IF NOT EXISTS idx_draft_sharks_values_season
    ON public.draft_sharks_values (season);

ALTER TABLE public.draft_sharks_values ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable read access for all users" ON public.draft_sharks_values
  FOR SELECT TO anon USING (true);
