-- Weekly pick'em: signed-in users pick the winner of every league matchup in a
-- week, and a public board shows how everyone did.
--
-- ## Picks lock on a clock, not on a game status
--
-- A week's picks lock at **Thursday 20:00 America/New_York** of that NFL week
-- (noon on Thanksgiving, when the first game kicks off at 12:30), computed in
-- web/lib/pickem.ts from the league calendar. `league_matchups.status` is no
-- use as the lock: Ottoneu flips a week's games to in-progress when the fantasy
-- week opens on Wednesday, a day before any NFL game is played.
--
-- Until a week locks, nobody's picks are shown to anyone but their owner —
-- otherwise the last person to pick could copy the room.
--
-- ## Why picks point at a team id, and not at league_matchups
--
-- A pick is (game, team). `game_id` and `picked_team_id` are Ottoneu's own ids,
-- the same ones `league_matchups` is keyed on, so a team renaming itself
-- mid-season does not orphan a pick. There is deliberately **no foreign key to
-- league_matchups**: the matchups scrape owns those rows, and a re-drawn
-- schedule must never cascade-delete somebody's week of picks. The API checks
-- that the game belongs to the week and the team plays in it.
--
-- A game that ends level scores nobody — neither side won.

CREATE TABLE IF NOT EXISTS pickem_picks (
  league_id integer NOT NULL,
  season integer NOT NULL,
  week integer NOT NULL,
  game_id integer NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  picked_team_id integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (league_id, game_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_pickem_picks_week
  ON pickem_picks (league_id, season, week);

COMMENT ON TABLE pickem_picks IS
  'One user''s pick for one league matchup. Locks Thursday 20:00 ET of the week (noon on Thanksgiving); hidden from everyone else until then.';

-- ## The name on the board
--
-- The standings board is public, so it cannot show an email address, and a
-- listener has no team to go by. Each player chooses the name they appear
-- under, once, and it is prefilled with their bound team when they have one.
-- Names are unique per league regardless of case, and the API refuses a league
-- team's name unless it is the player's own team, so nobody can post picks as
-- somebody else's franchise.

CREATE TABLE IF NOT EXISTS pickem_players (
  league_id integer NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 2 AND 30),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (league_id, user_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pickem_players_name
  ON pickem_players (league_id, lower(display_name));

COMMENT ON TABLE pickem_players IS
  'The name a pick''em player appears under on the public board. Unique per league, case-insensitively.';

-- Server-only: read and written by Next.js server code with the service key.
-- The public board is rendered server-side, and unlocked picks must never be
-- readable through the anon client, so there is no anon policy.
ALTER TABLE public.pickem_picks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pickem_players ENABLE ROW LEVEL SECURITY;
