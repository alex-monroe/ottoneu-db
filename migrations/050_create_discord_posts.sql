-- What the league Discord feed has already posted, so no job posts twice.
--
-- The feed jobs (web/scripts/post-*.ts) are idempotent by construction: each one
-- works out what *could* be posted from the data, skips any (post_type,
-- post_key) already in this table, posts the rest, and records each post here
-- straight after Discord accepts it. Re-running a job — a retry, a manual
-- dispatch, two crons that overlap — therefore posts nothing new.
--
-- post_type        post_key            posted by
-- ---------------  ------------------  --------------------------------------
-- trade_pending    <ottoneu trade id>  post-trades.ts (heads-up, 48h veto window)
-- trade_processed  <ottoneu trade id>  post-trades.ts
-- moves_digest     YYYY-MM-DD          post-moves-digest.ts (the day covered)
-- pickem_results   <season>-w<week>    post-pickem.ts --results
-- pickem_reminder  <season>-w<week>    post-pickem.ts --reminder
--
-- See docs/references/discord-feed.md.

CREATE TABLE IF NOT EXISTS discord_posts (
  league_id integer NOT NULL,
  post_type text NOT NULL CHECK (post_type IN (
    'trade_pending', 'trade_processed', 'moves_digest', 'pickem_results', 'pickem_reminder'
  )),
  post_key text NOT NULL,
  -- Discord's message id, so a later job could edit or link the post.
  discord_message_id text,
  posted_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  PRIMARY KEY (league_id, post_type, post_key)
);

COMMENT ON TABLE discord_posts IS
  'One row per message the league Discord feed has posted, keyed (post_type, post_key) so no job double-posts; see web/lib/discord-feed.ts.';

-- Written and read only by the feed jobs, with the service key.
ALTER TABLE public.discord_posts ENABLE ROW LEVEL SECURITY;
