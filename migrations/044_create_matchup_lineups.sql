-- Migration 044: matchup_lineups — who each team actually played, per game.
--
-- `league_matchups` (037) records who played whom and the team totals, but not
-- the lineups behind them. Those live on Ottoneu's public box score,
-- /football/{league}/game/{game_id}: every rostered player of both teams with
-- their lineup slot, Ottoneu's player id, their NFL game state and live points.
-- One row per (game, player), starters and bench alike.
--
-- Source: scripts/scrape_lineups.py, run on the same cadence as the matchup
-- scrape (every 30 minutes through game windows). Rows for a game are replaced
-- wholesale on each scrape, so a player benched, cut or traded mid-week does not
-- linger in a lineup he has left.
--
-- WHAT IS DELIBERATELY NOT STORED: Ottoneu's own "Proj" column. Ottoneu
-- overwrites it with the actual score once the player has played, so it cannot
-- be the pre-game projection. The site's weekly projection is
-- `weekly_projections.projected_points`, frozen at kickoff (migration 043), and
-- the live matchup projection — finished players' points plus remaining
-- players' projections — is derived at read time (web/lib/live-matchup.ts),
-- the same derive-don't-store rule the standings follow.
--
-- Read by the public /scoreboard pages, so RLS is enabled with an anon SELECT
-- policy — mirrors league_matchups.

CREATE TABLE IF NOT EXISTS matchup_lineups (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,

  league_id integer NOT NULL,
  season integer NOT NULL,
  week integer NOT NULL,
  game_id bigint NOT NULL,

  -- 'home' | 'away', matching the game's side in league_matchups.
  side text NOT NULL,
  team_id integer NOT NULL,
  team_name text NOT NULL,

  -- Ottoneu's player id (the box score's data-player-id), and our player when
  -- one matches players.ottoneu_id. Nullable so a player the roster scrape has
  -- not seen yet still appears in the lineup by name.
  ottoneu_id integer NOT NULL,
  player_id uuid REFERENCES players(id) ON DELETE SET NULL,
  player_name text NOT NULL,
  nfl_team text,
  position text,

  -- Lineup slot: 'QB' | 'RB' | 'WR' | 'TE' | 'K' | 'FLEX' | 'SFLX' | 'BN', and
  -- the index within repeated slots (RB 0 and RB 1).
  slot text NOT NULL,
  slot_number integer NOT NULL DEFAULT 0,
  is_starter boolean NOT NULL,

  -- Live fantasy points, as Ottoneu scores them. NULL until the player's game
  -- has started ("---" on the page), which is distinct from a real 0.
  points numeric,

  -- 'scheduled' | 'in_progress' | 'final' | 'bye', derived from `game_info`,
  -- which keeps Ottoneu's own words ("Sun 1:00pm @IND", "L 10-13 @SEA")
  -- verbatim so an unrecognised shape is visible rather than flattened.
  game_state text NOT NULL DEFAULT 'scheduled',
  game_info text,

  injury_status text,
  stat_line text,

  scraped_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,

  CONSTRAINT matchup_lineups_game_player_key UNIQUE (league_id, game_id, ottoneu_id)
);

CREATE INDEX IF NOT EXISTS idx_matchup_lineups_season_week
  ON matchup_lineups(league_id, season, week);

ALTER TABLE public.matchup_lineups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon read access to matchup_lineups" ON public.matchup_lineups;
CREATE POLICY "Allow anon read access to matchup_lineups"
  ON public.matchup_lineups FOR SELECT TO anon USING (true);
