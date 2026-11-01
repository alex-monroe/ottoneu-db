-- Migration 059: the live score worm — play-by-play feed labels and a pg_cron launcher.
--
-- scripts/live_score_worm.py keeps the live week's matchup_score_plays current
-- from ESPN's play-by-play, switching each NFL game to nflverse once nflverse
-- publishes it. It runs as a looping GitHub Actions job
-- (.github/workflows/live-score-worm.yml), because GitHub's own cron fires the
-- game-day schedules only every couple of hours. pg_cron starts that job on
-- time instead.
--
-- 1. matchup_score_plays.source — which feed a play's row came from: 'nflverse'
--    or 'espn'. NULL on the Kickoff and adjustment rows, and on rows written
--    before this column (all nflverse). A week with any 'espn' row is not yet
--    rebuilt; the daily rebuild_score_worm.py run redoes it from nflverse once
--    it is over.
--
-- 2. live_worm_state — one row the loop writes every pass: heartbeat_at (NULL
--    once it exits) and next_kickoff (the earliest NFL kickoff still to come, or
--    a day out when none is known).
--
-- 3. dispatch_live_worm(), run by pg_cron every 5 minutes: when no loop is
--    running (no heartbeat in the last 3 minutes, no dispatch in the last 10)
--    and the next kickoff is within 15 minutes or already past, it POSTs a
--    workflow_dispatch to GitHub through pg_net. The GitHub token is read from
--    Supabase Vault under the name 'github_actions_dispatch' (a fine-grained
--    token for alex-monroe/ottoneu-db with Actions: read and write); until that
--    secret exists the function does nothing. Create it once in the SQL editor:
--      select vault.create_secret('<token>', 'github_actions_dispatch');

ALTER TABLE matchup_score_plays
  ADD COLUMN IF NOT EXISTS source text CHECK (source IN ('nflverse', 'espn'));

CREATE TABLE IF NOT EXISTS live_worm_state (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  heartbeat_at timestamptz,
  next_kickoff timestamptz,
  dispatched_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO live_worm_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Written only with the service key; nothing on the site reads it.
ALTER TABLE live_worm_state ENABLE ROW LEVEL SECURITY;

-- pg_net's functions live in its own `net` schema; the extension itself goes in
-- `extensions`, not `public` (the Supabase advisor flags extension_in_public).
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron;

CREATE OR REPLACE FUNCTION public.dispatch_live_worm()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  state live_worm_state;
  token text;
BEGIN
  SELECT * INTO state FROM live_worm_state WHERE id = 1;
  IF state.heartbeat_at > now() - interval '3 minutes' THEN
    RETURN;  -- a loop is running
  END IF;
  IF state.dispatched_at > now() - interval '10 minutes' THEN
    RETURN;  -- one is starting up
  END IF;
  IF state.next_kickoff > now() + interval '15 minutes' THEN
    RETURN;  -- nothing on yet
  END IF;

  SELECT decrypted_secret INTO token
  FROM vault.decrypted_secrets
  WHERE name = 'github_actions_dispatch';
  IF token IS NULL THEN
    RETURN;
  END IF;

  PERFORM net.http_post(
    url := 'https://api.github.com/repos/alex-monroe/ottoneu-db/actions/workflows/live-score-worm.yml/dispatches',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || token,
      'Accept', 'application/vnd.github+json',
      'X-GitHub-Api-Version', '2022-11-28',
      'User-Agent', 'ottoneu-db-pg-cron'
    ),
    body := jsonb_build_object('ref', 'main')
  );
  UPDATE live_worm_state SET dispatched_at = now(), updated_at = now() WHERE id = 1;
END;
$$;

-- It reads a Vault secret: only pg_cron (as the owner) may run it.
REVOKE ALL ON FUNCTION public.dispatch_live_worm() FROM PUBLIC, anon, authenticated;

SELECT cron.schedule('live-score-worm-dispatch', '*/5 * * * *', 'SELECT public.dispatch_live_worm()');
