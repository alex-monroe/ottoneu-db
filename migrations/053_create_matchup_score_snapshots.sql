-- Migration 053: matchup_score_snapshots — each game's score, every time it is scraped.
--
-- `matchup_lineups` (044) is replaced wholesale on every scrape, so it only ever
-- knows the score *now*. The game page's "worm" — both teams' running totals
-- across the week, after the cricket chart of the same name — needs the score
-- at every point it was read. This table keeps one row per game per lineup
-- scrape: the two starters' point totals, exactly as `matchup_lineups` had them
-- at that moment.
--
-- Source: scripts/scrape_lineups.py, appended after each game's lineup is
-- written (every 5 minutes through game windows). A snapshot is written only
-- once at least one starter in the game has points — before kickoff every row
-- would read 0–0. Totals are stored, not derived later, because the lineups
-- they came from are overwritten by the next scrape.
--
-- There is no backfill: weeks played before this table existed have no
-- history, and the worm is simply not drawn for them.
--
-- Read by the public game page, so RLS is enabled with an anon SELECT policy —
-- mirrors matchup_lineups.

CREATE TABLE IF NOT EXISTS matchup_score_snapshots (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,

  league_id integer NOT NULL,
  season integer NOT NULL,
  week integer NOT NULL,
  game_id bigint NOT NULL,

  -- Sum of the starters' live points on each side, as Ottoneu scores them.
  home_points numeric NOT NULL,
  away_points numeric NOT NULL,

  -- The scrape run's timestamp (shared with matchup_lineups.scraped_at).
  scraped_at timestamp with time zone NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,

  CONSTRAINT matchup_score_snapshots_game_time_key UNIQUE (league_id, game_id, scraped_at)
);

CREATE INDEX IF NOT EXISTS idx_matchup_score_snapshots_season_week
  ON matchup_score_snapshots(league_id, season, week);

ALTER TABLE public.matchup_score_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon read access to matchup_score_snapshots" ON public.matchup_score_snapshots;
CREATE POLICY "Allow anon read access to matchup_score_snapshots"
  ON public.matchup_score_snapshots FOR SELECT TO anon USING (true);
