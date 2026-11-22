-- Migration 065: stop pg_cron dispatching the live score worm to GitHub
--
-- The worm now runs on the DigitalOcean droplet: a systemd timer starts
-- `scripts/live_score_worm.py --loop --if-due` every minute (deploy/droplet/),
-- and --if-due makes the start decision dispatch_live_worm() used to make.
-- GitHub is no longer a fallback, so the every-5-minute job from migration 059
-- comes off. live_worm_state stays (the droplet's loop reads and writes it), and
-- so does dispatch_live_worm(), unscheduled, in case the fallback is wanted back:
--   SELECT cron.schedule('live-score-worm-dispatch', '*/5 * * * *',
--                        'SELECT public.dispatch_live_worm()');

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'live-score-worm-dispatch') THEN
    PERFORM cron.unschedule('live-score-worm-dispatch');
  END IF;
END
$$;
