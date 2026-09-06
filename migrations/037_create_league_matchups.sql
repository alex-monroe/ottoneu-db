-- Migration 037: league_matchups — the head-to-head game log for the league.
--
-- The in-season primitive the site was missing. Everything the season-cycle
-- resolver and the weekly-projection tables know is about *players*; nothing
-- recorded who played whom, or who won. One row per Ottoneu game, keyed by
-- Ottoneu's own `game_id` (stable across the season and across re-scrapes, and
-- the id in the /football/{league}/game/{game_id} URL).
--
-- Source: scripts/scrape_matchups.py, which reads the league's public
-- `/csv/schedule` export (ids, week, teams, live scores) and enriches it from
-- the `/schedule` page HTML (week date ranges, status label, playoff labels).
-- The full schedule is published before kickoff, so rows are inserted with
-- score 0 / status 'scheduled' and updated in place as games are played.
--
-- STANDINGS ARE DERIVED, NOT STORED. Wins, losses, points for/against and the
-- playoff seeding all fall out of the final rows in this table
-- (web/lib/standings.ts). That is deliberate: a second scraped standings table
-- would be a second source of truth that can disagree with this one, and it
-- could not answer "what do the standings look like with Sunday's games half
-- played", which is the whole point of an in-season scoreboard.
--
-- Read by the public /scoreboard page and the homepage for anonymous visitors,
-- so RLS is enabled WITH an anon SELECT policy — mirrors league_calendar (027)
-- and weekly_projections (035).

CREATE TABLE IF NOT EXISTS league_matchups (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,

  league_id integer NOT NULL,
  season integer NOT NULL,
  week integer NOT NULL,

  -- Ottoneu's own game id. Unique per league and stable, so it is what the
  -- upsert conflicts on: a re-scrape of a week updates scores in place rather
  -- than duplicating the slate.
  game_id bigint NOT NULL,

  home_team_id integer NOT NULL,
  home_team_name text NOT NULL,
  home_score numeric,

  away_team_id integer NOT NULL,
  away_team_name text NOT NULL,
  away_score numeric,

  -- 'scheduled' | 'in_progress' | 'final'. Derived by the scraper from the
  -- page's status label plus the week's date window; see _derive_status.
  status text NOT NULL DEFAULT 'scheduled',

  -- 'regular' | 'playoff' | 'championship' | 'third_place' | 'consolation'.
  -- Only 'regular' games count toward the standings.
  game_type text NOT NULL DEFAULT 'regular',

  -- The Ottoneu fantasy week's window (e.g. Week 1 = Sep 9 to Sep 15), from the
  -- schedule page. Nullable: the CSV alone cannot supply it.
  starts_on date,
  ends_on date,

  -- Ottoneu's own words for the game state ("Sep 9", "Final", "Q3 4:12"), kept
  -- verbatim so a label shape we have not seen yet is still visible to a human
  -- rather than silently flattened into `status`.
  status_label text,

  scraped_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,

  CONSTRAINT league_matchups_league_game_key UNIQUE (league_id, game_id)
);

CREATE INDEX IF NOT EXISTS idx_league_matchups_season_week
  ON league_matchups(league_id, season, week);

ALTER TABLE public.league_matchups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon read access to league_matchups" ON public.league_matchups;
CREATE POLICY "Allow anon read access to league_matchups"
  ON public.league_matchups FOR SELECT TO anon USING (true);
