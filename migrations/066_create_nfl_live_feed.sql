-- Migration 066: the league-agnostic live NFL feed.
--
-- scripts/live_score_worm.py already turns ESPN's (and, once a game is
-- published, nflverse's) play-by-play into nflverse-shaped rows every minute
-- while games are on. Until now it only wrote what this league needs from them:
-- each Ottoneu matchup's running totals (matchup_score_plays). These three
-- tables publish the plays themselves, before any league's scoring or lineups
-- are applied, so another app on this database (Roster Loom, alex-monroe/
-- fantasy-pulse, which aggregates Sleeper, Yahoo, ESPN and Ottoneu leagues with
-- their own scoring) can score them its own way instead of scraping ESPN again.
-- Written by scripts/live_feed.py from inside the live loop; see
-- docs/references/matchups-and-standings.md#the-live-nfl-feed.
--
-- 1. nfl_live_games — one row per NFL game of the live week: its state, which
--    feed its plays come from, and its game clock (elapsed seconds and length,
--    60 minutes until it runs into overtime), rewritten every pass.
--
-- 2. nfl_live_plays — one row per timed play of every NFL game that has kicked
--    off: wall-clock time, game seconds elapsed, and each player's stat line on
--    that play, keyed by gsis id, in Sleeper's stat keys (pass_yd, rec, rush_td,
--    fgm_40_49, fum_lost, ...), so any league's scoring settings apply directly.
--    Plays with no stats keep the clock moving. A game's rows are replaced
--    wholesale whenever they change (ESPN revises plays; nflverse takes over).
--
-- 3. nfl_live_players — gsis id -> ESPN id, name, position and team, from the
--    season's nflverse roster, so readers can join their own player ids.
--
-- All three are public NFL data: readable by anon and authenticated, written
-- only with the service key.

CREATE TABLE IF NOT EXISTS nfl_live_games (
  game_id text PRIMARY KEY,                    -- nflverse id: {season}_{week}_{away}_{home}
  season integer NOT NULL,
  week integer NOT NULL,
  espn_event text,
  home_team text NOT NULL,                     -- nflverse team codes
  away_team text NOT NULL,
  kickoff timestamptz,
  state text NOT NULL CHECK (state IN ('pre', 'in', 'post')),
  source text CHECK (source IN ('nflverse', 'espn')),   -- NULL until it kicks off
  elapsed_seconds real NOT NULL DEFAULT 0,
  length_seconds real NOT NULL DEFAULT 3600,
  finished boolean NOT NULL DEFAULT false,     -- the feed has its END GAME
  last_play_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS nfl_live_games_season_week_idx ON nfl_live_games (season, week);

CREATE TABLE IF NOT EXISTS nfl_live_plays (
  id bigserial PRIMARY KEY,                    -- stable paging order for readers
  game_id text NOT NULL,
  season integer NOT NULL,
  week integer NOT NULL,
  play_id real NOT NULL,                       -- the feed's play id; a try is play_id + 0.5
  play_at timestamptz NOT NULL,
  elapsed_seconds real,                        -- game seconds played at this play
  stats jsonb,                                 -- {gsis_id: {sleeper_stat_key: value}}; NULL if none
  source text NOT NULL CHECK (source IN ('nflverse', 'espn')),
  UNIQUE (game_id, play_id)
);
CREATE INDEX IF NOT EXISTS nfl_live_plays_season_week_idx ON nfl_live_plays (season, week);

CREATE TABLE IF NOT EXISTS nfl_live_players (
  gsis_id text PRIMARY KEY,
  season integer NOT NULL,
  espn_id text,
  full_name text NOT NULL,
  position text,
  team text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS nfl_live_players_espn_id_idx ON nfl_live_players (espn_id);

ALTER TABLE nfl_live_games ENABLE ROW LEVEL SECURITY;
ALTER TABLE nfl_live_plays ENABLE ROW LEVEL SECURITY;
ALTER TABLE nfl_live_players ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read" ON nfl_live_games;
CREATE POLICY "Public read" ON nfl_live_games FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Public read" ON nfl_live_plays;
CREATE POLICY "Public read" ON nfl_live_plays FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Public read" ON nfl_live_players;
CREATE POLICY "Public read" ON nfl_live_players FOR SELECT TO anon, authenticated USING (true);

-- live_worm_state's heartbeat is how a reader knows the feed is moving. It has
-- no secrets in it, so let other apps on the database read it too.
DROP POLICY IF EXISTS "Public read" ON live_worm_state;
CREATE POLICY "Public read" ON live_worm_state FOR SELECT TO anon, authenticated USING (true);
