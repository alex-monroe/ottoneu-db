-- A host's private working notes on each team, on the power-rankings ballot.
--
-- `power_ranking_entries` already had `note`: the one-liner read out when that
-- team's slot is revealed. This is the opposite field. It is the scratch pad a
-- host keeps open while deciding the order — the case for moving a team up,
-- what they talked themselves out of last week, the thing to remember to say —
-- and it is never read out, never consolidated and never shown to the other
-- host.
--
-- That privacy is enforced by which queries exist rather than by filtering:
-- `fetchBallots` in web/lib/power-rankings.ts does not select this column, so
-- the `Ballot` objects that reach consolidation and the reveal screen have no
-- field for it to leak through. The only read that returns it,
-- `fetchPrepNotes`, is scoped to one `user_id`.
--
-- Nullable with no default: a team with nothing written about it stores NULL
-- rather than an empty string, the same shape `note` uses, so "untouched" and
-- "deliberately blanked" do not need telling apart.
--
-- Notes are per (ballot, team), and a ballot is per (season, week, host), so
-- they do not carry over between weeks. A new week starts with a clean sheet;
-- last week's thinking stays readable on last week's ballot via the week
-- picker.

ALTER TABLE power_ranking_entries
  ADD COLUMN IF NOT EXISTS prep_note text;

COMMENT ON COLUMN power_ranking_entries.prep_note IS
  'The host''s private working notes on this team. Never revealed, never consolidated, visible only to the ballot owner.';
