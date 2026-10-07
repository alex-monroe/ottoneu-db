-- Admin-issued password resets.
--
-- There is no mail infrastructure in this app (see the note on
-- /api/access-request), so "forgot password" cannot email anybody a link.
-- Instead it works like the projections-access queue:
--
--   1. A user who forgot their password submits their email on
--      /forgot-password, which stamps `users.password_reset_requested_at`.
--      That surfaces the account at the top of /admin.
--   2. An admin clicks "Reset link" on the account's row — with or without a
--      pending request — which issues a single-use token and shows the admin
--      the /reset-password URL to hand over by text, Discord, etc.
--   3. The user opens the link and picks a new password. The token is consumed
--      and the request stamp cleared.
--
-- Tokens follow the oauth_authorization_codes pattern (migration 034): only a
-- SHA-256 hash is stored, the plaintext exists only in the URL, and consumption
-- is a conditional UPDATE (`... AND consumed_at IS NULL`) so a replayed link
-- loses the race in the database. Issuing a new link burns any earlier unused
-- one for the same account, so only the most recent link ever works.

ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_requested_at timestamptz;

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  -- SHA-256 of the token; the plaintext only ever exists in the reset URL.
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- The admin who issued the link. Kept for the audit trail; an admin account
  -- being deleted must not take its users' pending resets with it.
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL,
  -- Set when the link is used, or when a newer link supersedes it.
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id
  ON password_reset_tokens (user_id);

-- Credentials: RLS enabled with no anon policy, like `users` (migration 015).
-- Reached only through the service key (getSupabaseAdmin()).
ALTER TABLE password_reset_tokens ENABLE ROW LEVEL SECURITY;
