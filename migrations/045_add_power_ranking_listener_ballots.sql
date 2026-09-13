-- Listener power-ranking ballots, and a public community ranking built from
-- every vote.
--
-- Until now every row in `power_ranking_ballots` was a podcast host's, and the
-- reveal consolidated all of them. Listeners (signed-in accounts without
-- `is_podcaster`) can now cast a ballot too. Two audiences, two results:
--
--   * **The reveal** — the countdown the hosts record — counts host ballots
--     only. A listener vote must never move it.
--   * **The community ranking** (`/power-rankings`) counts every submitted
--     ballot, hosts and listeners alike, and is public once the week is
--     published.
--
-- ## Why a column rather than a second table
--
-- A listener ballot is the same object as a host's — a total order of the
-- league for one week, a draft until locked — so it reuses both tables and the
-- consolidation code unchanged. What differs is who counts it, and that is one
-- column: `voter_kind`. It is stamped from the voter's role **when the ballot
-- is saved**, so a host whose role is later revoked does not retroactively
-- pull a locked ballot out of an episode that has already been recorded.
--
-- The (league, season, week, user) key is unchanged: one ballot per account
-- per week, whichever kind it is.
--
-- The DEFAULT 'host' exists only so the code already deployed — which writes
-- host ballots and does not know the column — keeps working between this
-- migration and the deploy. The application always writes `voter_kind`
-- explicitly (`SaveBallotInput.voterKind` is required).

ALTER TABLE power_ranking_ballots
  ADD COLUMN IF NOT EXISTS voter_kind text NOT NULL DEFAULT 'host'
    CONSTRAINT power_ranking_ballots_voter_kind_check
    CHECK (voter_kind IN ('host', 'listener'));

CREATE INDEX IF NOT EXISTS idx_power_ranking_ballots_week_kind
  ON power_ranking_ballots (league_id, season, week, voter_kind);

COMMENT ON COLUMN power_ranking_ballots.voter_kind IS
  'host = counts towards the podcast reveal and the community ranking; listener = community ranking only. Stamped from is_podcaster at save time.';

-- ## When a week's community ranking goes public
--
-- By default a week publishes itself at **Thursday 09:00 America/New_York** of
-- the week being ranked (web/lib/community-rankings.ts computes it from the
-- league calendar). A host can override that per week:
--
--   * publish early — `published_at` set, `held` false;
--   * hold it back  — `published_at` NULL, `held` true, so Thursday passes
--     without it going out;
--   * return to the schedule — delete the row.
--
-- No row at all is the common case and means "on the schedule", so nothing has
-- to be written for a week that simply goes out on Thursday.
--
-- Publishing is also what closes listener voting for the week: once the result
-- is public, a ballot changed afterwards would silently rewrite it.

CREATE TABLE IF NOT EXISTS power_ranking_publications (
  league_id integer NOT NULL,
  season integer NOT NULL,
  week integer NOT NULL,
  -- When a host published it early. NULL = not published by hand.
  published_at timestamptz,
  -- True = held back past the Thursday schedule until published by hand.
  held boolean NOT NULL DEFAULT false,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (league_id, season, week),
  CONSTRAINT power_ranking_publications_state_check
    CHECK (NOT (held AND published_at IS NOT NULL))
);

COMMENT ON TABLE power_ranking_publications IS
  'Per-week override of when the community power ranking goes public. No row = publishes Thursday 09:00 ET of that week.';

-- Server-only, like the ballots: read and written by Next.js server code with
-- the service key. The public page renders the consolidated result server-side,
-- so no anon policy is needed.
ALTER TABLE public.power_ranking_publications ENABLE ROW LEVEL SECURITY;
