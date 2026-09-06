-- Track who has asked for projections access.
--
-- New accounts self-register with has_projections_access = false and an admin
-- has to flip it by hand. Nothing told the admin an account was waiting, and
-- nothing told the user their account was pending. This column is that signal:
-- self-registration stamps it, /access lets an existing account raise it, and
-- /admin sorts pending accounts to the top.
--
-- NULL = never asked. Backfilled for existing ungranted accounts from their
-- creation date, since registering is itself a request.

ALTER TABLE users ADD COLUMN IF NOT EXISTS access_requested_at timestamptz;

UPDATE users
   SET access_requested_at = created_at
 WHERE has_projections_access = false
   AND access_requested_at IS NULL;

COMMENT ON COLUMN users.access_requested_at IS
  'When the user asked for projections access (NULL = never asked). Set on self-registration and by POST /api/access-request.';
