-- Bind each user account to the league team they manage.
--
-- "My team" was a single global constant (config.json MY_TEAM = 'The Witchcraft')
-- referenced by a dozen components: page titles, surplus highlight rules, the
-- lineup default, the standings bold row, arbitration target exclusion. Every
-- signed-in leaguemate therefore saw the operator's team as their own, which
-- made the site unusable as a league tool rather than a personal one.
--
-- NULL = not bound yet. The team name is the Ottoneu team name as it appears in
-- league_prices.team_name; it is deliberately free text rather than a FK,
-- because teams are scraped rows keyed by name, not a first-class table.

ALTER TABLE users ADD COLUMN IF NOT EXISTS team_name text;

-- The operator's account predates per-user teams; keep their view unchanged.
UPDATE users
   SET team_name = 'The Witchcraft'
 WHERE is_admin = true
   AND team_name IS NULL;

COMMENT ON COLUMN users.team_name IS
  'Ottoneu team this account manages (matches league_prices.team_name). NULL = unbound; see web/lib/viewer-team.ts.';
