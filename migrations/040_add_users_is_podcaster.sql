-- The podcaster role.
--
-- The site had two orthogonal-in-name-only flags: `is_admin` (who runs the
-- pipeline) and `has_projections_access` (who may see the model's numbers).
-- The league's podcast is a third thing entirely — a couple of hosts who need
-- production tooling nobody else should see, and who are not necessarily
-- operators and do not need projections to record a show.
--
-- So this is a third independent boolean rather than a level on a ladder: any
-- account can be a podcaster, with or without admin or projections access. The
-- gate lives in web/lib/access.ts (PODCASTER_ROUTES) like every other route
-- rule; the toggle is on /admin beside the projections one.
--
-- Seeded true for admins so the operator's own account can open the tools
-- immediately, exactly as 039 seeded their team binding. Note the session
-- cookie is a 7-day snapshot of these flags, so an account granted the role
-- has to re-sign it (POST /api/auth/refresh) before middleware agrees — the
-- /podcast hub does that automatically.

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_podcaster boolean NOT NULL DEFAULT false;

UPDATE users
   SET is_podcaster = true
 WHERE is_admin = true;

COMMENT ON COLUMN users.is_podcaster IS
  'Account may open the podcast production tools under /podcast. Independent of is_admin and has_projections_access; see web/lib/access.ts.';
