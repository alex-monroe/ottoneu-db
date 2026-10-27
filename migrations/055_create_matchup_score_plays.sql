-- Migration 055: matchup_score_plays — each game's score worm, rebuilt play by play.
--
-- `matchup_score_snapshots` (053) is the live worm: one row per lineup scrape,
-- so it is only as fine-grained as GitHub's cron, which in practice fires a
-- 5-minute schedule every couple of hours. Once a week's NFL games are over,
-- nflverse play-by-play has every play with a wall-clock timestamp, so the worm
-- can be rebuilt exactly: one row per play that changed either side's starters'
-- total, scored with the league's rules (SCORING_SETTINGS + SCORING_EXTRAS).
--
-- Source: scripts/rebuild_score_worm.py, run daily after the week's games are
-- final and nflverse has published them. Each run replaces a game's rows
-- wholesale. When a rebuild's final total differs from Ottoneu's (a stat
-- correction nflverse has not picked up), a last row with note
-- 'Adjustment to Ottoneu's final' brings it level.
--
-- The game page draws these rows in place of the snapshots whenever a game has
-- any. Read by the public game page, so RLS is enabled with an anon SELECT
-- policy — mirrors matchup_score_snapshots.

CREATE TABLE IF NOT EXISTS matchup_score_plays (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,

  league_id integer NOT NULL,
  season integer NOT NULL,
  week integer NOT NULL,
  game_id bigint NOT NULL,

  -- Order within the game (1-based), so plays sharing a timestamp stay ordered.
  seq integer NOT NULL,
  -- When the play happened (nflverse time_of_day, UTC).
  play_at timestamp with time zone NOT NULL,

  -- Running totals of each side's starters after this play.
  home_points numeric NOT NULL,
  away_points numeric NOT NULL,

  -- Who scored on the play, e.g. "J. Chase +9.40 · J. Burrow +2.36".
  note text,

  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,

  CONSTRAINT matchup_score_plays_game_seq_key UNIQUE (league_id, game_id, seq)
);

CREATE INDEX IF NOT EXISTS idx_matchup_score_plays_season_week
  ON matchup_score_plays(league_id, season, week);

ALTER TABLE public.matchup_score_plays ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon read access to matchup_score_plays" ON public.matchup_score_plays;
CREATE POLICY "Allow anon read access to matchup_score_plays"
  ON public.matchup_score_plays FOR SELECT TO anon USING (true);
