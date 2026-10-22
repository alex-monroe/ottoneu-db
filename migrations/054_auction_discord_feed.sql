-- FA auctions in the league Discord feed: a post when an auction opens and
-- another when it closes, replacing the standalone Railway bot
-- (alex-monroe/ottoneu-discord-auction-bot) with a scheduled GitHub Actions job.
--
-- The bot kept the auctions it had announced in memory. Here that state lives
-- in the database, so a job that runs every few minutes and then exits can do
-- the same work:
--
--   fa_market.first_seen_at   when the scrape first saw this auction listed.
--                             Carried over on every later scrape, so
--                             (player_key, first_seen_at) names one auction for
--                             its whole life — the key of its 'auction_started'
--                             post. The public page prints no auction id.
--   fa_auction_results        one row per completed auction, from Ottoneu's
--                             public per-auction page (/auctions/<id>): who won,
--                             for how much, who nominated, every bid. Keyed by
--                             Ottoneu's auction id, which keys 'auction_finished'.
--
-- See docs/references/discord-feed.md and docs/references/fa-market.md.

ALTER TABLE fa_market ADD COLUMN IF NOT EXISTS first_seen_at timestamp with time zone;
UPDATE fa_market SET first_seen_at = scraped_at WHERE first_seen_at IS NULL;
ALTER TABLE fa_market
  ALTER COLUMN first_seen_at SET DEFAULT timezone('utc'::text, now()),
  ALTER COLUMN first_seen_at SET NOT NULL;

COMMENT ON COLUMN fa_market.first_seen_at IS
  'When the scrape first listed this row; carried over by every later scrape, so it is stable for the auction''s life.';

CREATE TABLE IF NOT EXISTS fa_auction_results (
  league_id integer NOT NULL,
  -- Ottoneu's auction id: the /auctions/<id> link on the completed table, and
  -- the same number as the bid box on the logged-in active table.
  auction_id integer NOT NULL,

  player_key text NOT NULL,
  ottoneu_id integer NOT NULL,
  is_college boolean NOT NULL DEFAULT false,
  player_id uuid REFERENCES players(id) ON DELETE SET NULL,
  player_name text NOT NULL,
  nfl_team text,
  position text,

  -- The winning price (second-highest bid + $1, or the lone bid).
  salary integer,
  -- "Ended at" verbatim on Ottoneu's site clock (US Eastern, no zone) — the
  -- same convention as trades.accepted_at.
  ended_at_local timestamp without time zone NOT NULL,

  started_by_team_name text,
  winner_team_id integer,
  winner_team_name text,
  -- Every bid, highest first: [{"team_id": 2629, "team_name": "…", "amount": 6}].
  bids jsonb NOT NULL DEFAULT '[]'::jsonb,

  scraped_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  PRIMARY KEY (league_id, auction_id)
);

CREATE INDEX IF NOT EXISTS idx_fa_auction_results_league_ended
  ON fa_auction_results(league_id, ended_at_local);

COMMENT ON TABLE fa_auction_results IS
  'Completed FA auctions with winner, price and bids, from Ottoneu''s public auction pages; see scripts/scrape_fa_market.py.';

-- Ottoneu shows all of this publicly once an auction closes.
ALTER TABLE public.fa_auction_results ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon read access to fa_auction_results" ON public.fa_auction_results;
CREATE POLICY "Allow anon read access to fa_auction_results"
  ON public.fa_auction_results FOR SELECT TO anon USING (true);

ALTER TABLE discord_posts DROP CONSTRAINT IF EXISTS discord_posts_post_type_check;
ALTER TABLE discord_posts ADD CONSTRAINT discord_posts_post_type_check CHECK (post_type IN (
  'trade_pending', 'trade_processed', 'moves_digest', 'pickem_results', 'pickem_reminder',
  'auction_started', 'auction_finished'
));
