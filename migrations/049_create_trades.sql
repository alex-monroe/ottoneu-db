-- Trades as Ottoneu records them: one row per trade, plus one row per thing a
-- side gave up (a player, or a cap loan).
--
-- ## Why this is not just `transactions`
--
-- The player-card scrape already logs every traded player as a
-- `move (from <team>)` row, and web/lib/recap-moves.ts glues those rows back
-- into trades by timestamp. Three things a trade carries never reach a player
-- card, and they are the reason this table exists:
--
-- * **Cap loans.** "Loan: $18" is part of the deal, not a player, so no card
--   shows it. Loans expire at the end of the regular season (ottoneu-rules.md).
-- * **Pending trades.** A trade awaiting the 48-hour league approval has moved
--   nobody yet, so it is on no card. It is on /trade_history, with status
--   "Awaiting League Approval".
-- * **Who proposed it, and the vote.** Offered-by / to, approve and veto counts.
--
-- Scraped from the public /football/{league}/trade_history list plus one
-- /view_trade/{id} page per trade by scripts/scrape_trade_history.py.
--
-- ## Coverage
--
-- Ottoneu's trade history page only reaches back so far (to September 2025 when
-- this was written), and nothing on it paginates. Older trades survive only as
-- player-card `move` rows, without loans; web/lib/trades.ts merges the two.
--
-- ## Times are the Ottoneu site clock
--
-- `accepted_at` / `processed_at` are `timestamp without time zone` holding the
-- wall-clock text the page prints ("October 14, 2026 6:32 AM"), the same clock
-- the player card prints — which is what lets the two sources be matched.

CREATE TABLE IF NOT EXISTS trades (
  league_id integer NOT NULL,
  -- Ottoneu's own trade id, from /view_trade/{id}. Global across Ottoneu, so it
  -- is only meaningful together with league_id.
  trade_id integer NOT NULL,
  -- Calendar year of accepted_at — the same convention the player-card scrape
  -- uses for transactions.season.
  season integer NOT NULL,

  -- When both managers agreed (the date the list prints). The league then has
  -- 48 hours to veto before Ottoneu processes it.
  accepted_at timestamp without time zone NOT NULL,
  -- When it was processed — or, for a pending trade, when Ottoneu says it will
  -- be ("Will be processed on …").
  processed_at timestamp without time zone,

  -- 'pending'   listed as "Awaiting League Approval"
  -- 'processed' listed as "Processed"
  -- 'removed'   was pending, then dropped off the list without processing —
  --             vetoed or withdrawn; the page does not say which.
  status text NOT NULL CHECK (status IN ('pending', 'processed', 'removed')),
  -- Ottoneu's words, verbatim, so an unrecognised status is visible.
  status_label text,

  offered_by_team_id integer,
  offered_by_team_name text NOT NULL,
  offered_to_team_id integer,
  offered_to_team_name text NOT NULL,

  approve_votes integer,
  veto_votes integer,

  first_seen_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  scraped_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,

  PRIMARY KEY (league_id, trade_id)
);

CREATE INDEX IF NOT EXISTS idx_trades_league_season ON trades(league_id, season);

CREATE TABLE IF NOT EXISTS trade_assets (
  league_id integer NOT NULL,
  trade_id integer NOT NULL,
  -- 'nfl:2293' / 'college:133832' for a player, 'loan' for a cap loan. A side
  -- gives at most one loan and a player appears in a trade once, so this keys
  -- the row within its trade.
  asset_key text NOT NULL,

  asset_type text NOT NULL CHECK (asset_type IN ('player', 'loan')),

  -- The side that gives the asset up, and the side that receives it.
  from_team_id integer,
  from_team_name text NOT NULL,
  to_team_id integer,
  to_team_name text NOT NULL,

  -- Player identity (NULL for a loan). player_id is NULL when the player has
  -- no `players` row yet.
  ottoneu_id integer,
  is_college boolean,
  player_id uuid REFERENCES players(id) ON DELETE SET NULL,
  player_name text,
  position text,
  nfl_team text,

  -- Whole dollars: the salary a player carries (a trade never changes it), or
  -- the size of the loan.
  amount integer NOT NULL,

  scraped_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,

  PRIMARY KEY (league_id, trade_id, asset_key),
  FOREIGN KEY (league_id, trade_id) REFERENCES trades(league_id, trade_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_trade_assets_player ON trade_assets(player_id);

COMMENT ON TABLE trades IS
  'One row per Ottoneu trade (pending, processed, or removed) from /trade_history; see scripts/scrape_trade_history.py.';
COMMENT ON TABLE trade_assets IS
  'What each side of a trade gave up: players (amount = salary) and cap loans (amount = loan size).';

-- The /trades page reads both through the anon client.
ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon read access to trades" ON public.trades;
CREATE POLICY "Allow anon read access to trades"
  ON public.trades FOR SELECT TO anon USING (true);

ALTER TABLE public.trade_assets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow anon read access to trade_assets" ON public.trade_assets;
CREATE POLICY "Allow anon read access to trade_assets"
  ON public.trade_assets FOR SELECT TO anon USING (true);
