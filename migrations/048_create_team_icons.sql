-- Team icons: a small square image each manager can set for their team, shown
-- beside the team's name everywhere the site renders it.
--
-- ## Why the image lives in a table, not a storage bucket
--
-- There are twelve teams and each icon is a 128×128 image the browser has
-- already resized and re-encoded before upload (a few KB). A table keeps the
-- whole feature in one place — no bucket, no bucket policy, no second thing to
-- provision per environment — and the site serves the bytes itself from
-- `/team-icons/[team]` with an immutable cache header, so the database is read
-- once per icon change, not once per page view.
--
-- ## Keyed by team name
--
-- Teams are free text matching `league_prices.team_name`, the same choice
-- migrations 039 (`users.team_name`) and 041 (power rankings) made: teams are
-- scraped rows keyed by name rather than a table of their own. A team that
-- renames itself loses its icon and sets it again.
--
-- ## What may be stored
--
-- Only raster formats a browser canvas produces: PNG, JPEG, WebP. Never SVG —
-- an SVG served from the site's own origin can carry script. The API also
-- checks the magic bytes match the declared type, and caps the decoded size.

CREATE TABLE IF NOT EXISTS team_icons (
  league_id integer NOT NULL,
  team_name text NOT NULL,
  content_type text NOT NULL
    CHECK (content_type IN ('image/png', 'image/jpeg', 'image/webp')),
  -- Base64 of the image bytes. ~200KB of base64 is ~150KB decoded; the API
  -- enforces a much smaller cap, this is the backstop.
  image_data text NOT NULL CHECK (char_length(image_data) <= 200000),
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (league_id, team_name)
);

COMMENT ON TABLE team_icons IS
  'A manager-uploaded icon for one league team, shown beside its name across the site. Served by /team-icons/[team]; see web/lib/team-icons.ts.';

-- Server-only: read and written by Next.js server code with the service key.
-- The icon route serves the bytes publicly, so there is nothing an anon policy
-- would add.
ALTER TABLE public.team_icons ENABLE ROW LEVEL SECURITY;
