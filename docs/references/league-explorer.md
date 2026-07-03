# League Explorer — surveying other Ottoneu football leagues

`scripts/league_explorer/` scrapes the **public** pages of other Ottoneu
football leagues into a local SQLite database, so trends across the platform
(salary structure, format mix, what league winners' rosters look like) can be
explored by scripts and AI agents without touching the shared Supabase
project.

```bash
just league-explorer scan                           # enumerate ALL leagues (full ID sweep + activity check)
just league-explorer discover                       # find leagues linked from our players' cards
just league-explorer scrape --active                # full-scrape every active league
just league-explorer scrape --discovered            # scrape every discovered league
just league-explorer scrape --league-ids 33,74      # or scrape specific leagues
just league-explorer report                         # canned cross-league summaries
just league-explorer query "SELECT ... "            # ad-hoc SQL (add --csv for CSV output)
```

All artifacts live under `data/league_explorer/` (gitignored):
`league_explorer.db` (SQLite) plus `cache/` (raw fetched pages).

## Finding leagues: `scan` (complete) and `discover` (incremental)

**`scan` enumerates the entire platform.** Football league IDs are small
sequential integers (the space currently tops out around ~340); deleted or
never-created IDs 307-redirect to `/football/?invalidLeague=1`, which the
fetcher treats as "dead" (it never follows redirects). `scan` walks IDs from
`--start`, auto-stopping after `--stop-after-misses` (default 120)
consecutive dead IDs — new leagues each season push the ceiling up, so the
auto-stop keeps future sweeps complete. For each live league it stores the
settings row plus a cheap activity probe (2 extra requests): the current
rosters CSV snapshot and the latest completed season's standings.

**A league is "active"** if it played the latest completed season AND
currently has rostered players (`ACTIVE_LEAGUES_SQL` in `cli.py`). `report`
prints the count, and `scrape --active` full-scrapes exactly that set.

**`discover` is the incremental alternative:** Ottoneu player cards show
"trades in other leagues" links. `discover` reads our league's roster CSV,
walks the rostered players' cards (`--max-players`, default 75), and records
every `/football/{id}/` league it sees into `discovered_leagues`. Useful for
finding the leagues most connected to ours; `scan` supersedes it for
completeness.

## What gets scraped per league (~25 requests, 1 req/s)

| Page | Data | History? |
|---|---|---|
| `/football/{id}/settings` | name, tier, points system (PPR type), roster type (Superflex vs Two Flex), #teams, established year, private flag | n/a |
| `/football/{id}/standings/{year}` | W-L-T, PF/PA, division per team | ✅ every season since the league was established |
| `/football/{id}/team/{tid}` | manager username + **trophy case** (champion / runner-up / third place, per season) | ✅ full title history |
| `/football/{id}/finances` | per-team salary totals, cap penalties, loans, free cap space | snapshot per run |
| `/football/{id}/csv/rosters` | every rostered player with position and salary | snapshot per run |

Two kinds of history:

- **Truly historical:** standings and trophies go back to each league's
  founding — winners over time are available immediately.
- **Snapshot-accrued:** rosters/salaries and finances are only published as
  *current* state, so `roster_slots` and `finances` are keyed by
  `snapshot_date`. Re-running `scrape` (e.g. monthly, or before/after keeper
  deadlines and arbitration) builds the salary-evolution time series going
  forward. Per-player salary history also exists on player cards
  (transaction log) but is not scraped in v1 — it's the natural next lever
  if deeper history is needed.

## SQLite schema

- `leagues` — settings + format metadata, one row per league
- `teams` — team id/name/manager per league
- `trophies` — (league, team, season, place) with `place` ∈ `champion | runner_up | third_place`
- `standings` — (league, season, team) records and points
- `roster_slots` — (snapshot_date, league, team, player) with position + salary
- `finances` — (snapshot_date, league, team) cap totals
- `discovered_leagues` — crawl frontier with provenance (`seed`, `player_card:{pid}`)

Example agent queries:

```sql
-- Do champions pay more at QB in superflex leagues?
SELECT l.roster_settings, ROUND(AVG(rs.salary),1) avg_qb_salary
FROM roster_slots rs
JOIN leagues l USING (league_id)
WHERE rs.positions = 'QB'
GROUP BY 1;

-- Repeat winners
SELECT league_id, team_id, COUNT(*) titles
FROM trophies WHERE place='champion'
GROUP BY 1,2 HAVING titles > 1 ORDER BY titles DESC;
```

## Politeness & caching

- Descriptive User-Agent, default 1 request/second (`--delay`), retries with
  backoff; `robots.txt` only restricts AI-training crawlers, and this is a
  personal research tool hitting public pages.
- Every fetched page is cached on disk. Completed-season standings are
  immutable (cached forever); mutable pages (rosters, finances, settings)
  expire after hours-to-weeks, and `scrape --refresh` forces a refetch.
  Re-parsing after a parser change is therefore free and offline.

## Limitations / future work

- Pages that redirect (dead league IDs, login-gated pages) are treated as
  unavailable and skipped; the fetcher never follows redirects.
- Champions come from team trophy cases; a team deleted from a league takes
  its trophies with it.
- Historical *rosters* (as opposed to standings) are not retroactively
  available; only snapshots accrue. Player-card transaction logs are the
  next data source if per-player salary history across leagues is wanted.
- Eventually some of this could feed the sofa-db website (cross-league
  salary benchmarks on player pages); that would mean promoting a curated
  subset into Supabase — out of scope for v1 deliberately.
