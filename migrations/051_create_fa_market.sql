-- The open free-agent market: who is up for auction right now, and who was cut
-- in the last 24 hours and can still be claimed at full salary.
--
-- Scraped by scripts/scrape_fa_market.py from two Ottoneu pages:
--   /football/{league}/auctions  (public)       -> kind = 'auction'
--   /football/{league}/waivers   (login-gated)  -> kind = 'waiver'
--
-- One row per player currently on the market. Each kind is a snapshot of its
-- page — the scraper upserts what is listed and deletes what is not — so the
-- table never grows. Rows whose `ends_at` has passed are stale (the auction has
-- closed or the claim window has shut) and readers filter them out.
--
-- Bids are blind and Ottoneu shows nobody the nominating team, the bids, or the
-- team that cut a waiver player, so none of those are stored.

CREATE TABLE IF NOT EXISTS fa_market (
  id bigserial PRIMARY KEY,
  league_id integer NOT NULL,
  kind text NOT NULL CHECK (kind IN ('auction', 'waiver')),

  -- 'nfl:7366' / 'college:139723'. NFL and college ids are separate number
  -- spaces on Ottoneu, so the id alone does not identify a player.
  player_key text NOT NULL,
  ottoneu_id integer NOT NULL,
  is_college boolean NOT NULL DEFAULT false,
  -- NULL when the player has no `players` row yet.
  player_id uuid REFERENCES players(id) ON DELETE SET NULL,
  player_name text NOT NULL,
  -- NFL team (or school, for a college player) and position, as the page prints them.
  nfl_team text,
  position text,
  injury_status text,

  -- Ottoneu's auction id / claim id. Only printed on the logged-in pages.
  market_id integer,

  -- Auctions: the minimum bid. Waivers: the salary a claim pays (the full
  -- salary the player was cut at).
  min_bid integer,
  salary integer,

  -- Waivers: the cut time verbatim on Ottoneu's site clock (no zone) — the
  -- same convention as trades.accepted_at.
  cut_at_local timestamp without time zone,

  -- When the auction closes / the claim window shuts. Auctions: scraped_at +
  -- the page's countdown. Waivers: cut_at_local read as US Eastern + 24 hours.
  ends_at timestamp with time zone NOT NULL,

  scraped_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,

  UNIQUE (league_id, kind, player_key)
);

CREATE INDEX IF NOT EXISTS idx_fa_market_league_ends ON fa_market(league_id, ends_at);

COMMENT ON TABLE fa_market IS
  'Open free-agent auctions and claimable waiver players (snapshot); see scripts/scrape_fa_market.py.';

-- /free-agents reads it through the anon client.
ALTER TABLE public.fa_market ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon read access to fa_market" ON public.fa_market;
CREATE POLICY "Allow anon read access to fa_market"
  ON public.fa_market FOR SELECT TO anon USING (true);
