-- Power-rankings ballots for the podcast.
--
-- Each host independently ranks all twelve teams ahead of an NFL week, and the
-- show reveals the consolidated order from the bottom up, live. Two things
-- follow from that:
--
--   1. **Ballots are private until locked.** Consolidation reads only ballots
--      with `submitted_at` set, so neither host can see the other's ordering
--      while still building their own. `submitted_at IS NULL` is a draft.
--   2. **A ballot is a total order, not a scattering of opinions.** The rank
--      column carries a per-ballot uniqueness constraint, so the database
--      itself refuses two teams tied at 4th — the consolidation maths (mean
--      rank, with the tiebreak in web/lib/power-rankings.ts) assumes a
--      complete permutation of the league.
--
-- Teams are free text matching `league_prices.team_name`, the same choice
-- migration 039 made for `users.team_name`: teams are scraped rows keyed by
-- name, not a first-class table, so there is nothing to point a foreign key at.
--
-- (season, week) is the NFL week the ranking is *ahead of* — "pre week 3" is
-- week = 3 — resolved by web/lib/nfl-week.ts, not stored as a date.

CREATE TABLE IF NOT EXISTS power_ranking_ballots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  league_id integer NOT NULL,
  season integer NOT NULL,
  week integer NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- NULL = still a draft, and invisible to consolidation.
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT power_ranking_ballots_week_user_key UNIQUE (league_id, season, week, user_id)
);

CREATE INDEX IF NOT EXISTS idx_power_ranking_ballots_week
  ON power_ranking_ballots (league_id, season, week);

CREATE TABLE IF NOT EXISTS power_ranking_entries (
  ballot_id uuid NOT NULL REFERENCES power_ranking_ballots(id) ON DELETE CASCADE,
  team_name text NOT NULL,
  rank integer NOT NULL CHECK (rank > 0),
  -- The host's one-liner on this team, read out on the show when its slot is
  -- revealed. Optional.
  note text,
  PRIMARY KEY (ballot_id, team_name),
  CONSTRAINT power_ranking_entries_ballot_rank_key UNIQUE (ballot_id, rank)
    DEFERRABLE INITIALLY DEFERRED
);

COMMENT ON TABLE power_ranking_ballots IS
  'One host''s power-ranking ballot for one NFL week. submitted_at NULL = draft, excluded from consolidation.';
COMMENT ON TABLE power_ranking_entries IS
  'One team''s slot on one ballot. Ranks are unique per ballot (deferred, so a reorder can be rewritten in a single transaction).';

-- RLS: these rows are read and written exclusively by the Next.js server
-- routes under /api/podcast, which use the service key and bypass RLS. Nothing
-- reads them through the anon client, so — unlike team_vegas_lines in 026 —
-- there is no public SELECT policy. Ballots are private by construction.
ALTER TABLE public.power_ranking_ballots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.power_ranking_entries ENABLE ROW LEVEL SECURITY;
