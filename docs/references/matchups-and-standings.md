# Matchups, standings & the playoff picture

The in-season layer: who played whom, who won, and where that leaves the league.
Everything else this repo knows is about *players* — this is the only subsystem
that knows the league has games.

| | |
|---|---|
| **Table** | `league_matchups` (migration 037) |
| **Scraper** | `scripts/scrape_matchups.py` — `just scrape-matchups` |
| **Derivation** | `web/lib/standings.ts` (pure) · `web/lib/matchups.ts` (fetchers) |
| **Routes** | `/scoreboard` (public) · the homepage league-status section |
| **MCP tools** | `get_scoreboard` · `get_standings` |
| **Workflow** | `.github/workflows/pull-matchups.yml` |

## The one design decision: standings are derived, not scraped

Ottoneu publishes a standings page, and scraping it into a `league_standings`
table would have been the obvious move. We store the **game log** instead and
compute standings from it at read time.

Two reasons, both practical:

1. **A stored standings row is only as fresh as its last scrape.** The point of
   an in-season scoreboard is Sunday afternoon, when three games are final and
   three are in progress. Derived standings move as the games move, from the
   same rows the scoreboard is drawing; a scraped table would show yesterday.
2. **Two sources of truth drift.** A standings table and a matchup table can
   disagree, and when they do there is no principled way to pick. One table
   cannot contradict itself.

The cost is that we have to know the league's rules rather than read them off a
page. Two are baked in, both verified against the league's real 2025 standings
(there is a test pinning the derivation to that final table — if the math ever
diverges from Ottoneu's, it fails):

- **Tiebreak is wins, then points for.**
- **Only regular-season games count.** The playoff and consolation brackets do
  not move the standings, which is exactly why `game_type` is stored per game.

**Known limitation:** the league has a single division ("The Division"), so
divisions are not modelled. A multi-division league would need the division
label, which only the standings page carries.

## Ingestion

Two public pages, plain HTTP, no browser and no login. As everywhere else in
this repo, the User-Agent is **honest** — spoofing a browser is what trips
Cloudflare (see [`scripts/ottoneu_http.py`](../../scripts/ottoneu_http.py)).

| Source | Supplies |
|---|---|
| `/football/{league}/schedule` | the authoritative game list: week numbers, the week's date window, each game's status label, and the playoff/championship/third-place icons |
| `/football/{league}/csv/schedule` | the same games as clean CSV — and the only source of Ottoneu's numeric **team ids** |

The HTML page leads because it carries the week structure and can list a game
before the CSV export catches up. The CSV supplies team ids, matched by name for
any game it has not listed yet (team ids are stable across the season, so a name
seen in *any* game identifies that team in *every* game). Either source alone
still produces rows, so a change to one does not take the feature down.

The whole regular-season schedule is published before kickoff, so the first run
of the season writes every game at 0-0 / `scheduled`, and later runs update those
same rows in place — the upsert conflicts on `(league_id, game_id)`.

### Status and game type

`status` is derived rather than read off the label, because only `Final` is a
literal we can trust; everything else Ottoneu prints is a date or a clock:

```
label ends with "Final"          -> final
any points on the board          -> in_progress
otherwise                        -> scheduled
```

Ottoneu's own words are kept verbatim in `status_label`, so a label shape we
have not seen yet is visible to a human rather than silently flattened.

`game_type` comes from the icon class on the status line
(`game-label-playoff` / `-championship` / `-third-place`). **An unbadged game in
a week that has a badged one is the consolation bracket** — Ottoneu draws those
exactly like regular-season games, and left as `regular` they would corrupt the
standings.

### Cadence

`pull-matchups.yml` runs daily at 11:00 UTC (the baseline, and off-season the
only one that matters), then every 30 minutes through the Sunday afternoon and
evening windows and the Sunday- and Monday-night games. There is **no in-season
gate**: the schedule page is public and cheap year-round, and the daily
off-season run is what catches next season's schedule the day it posts.

## Playoff picture

`computePlayoffPicture` seeds the top `PLAYOFF_TEAMS` (6, in `config.json`) and
reports games back for everyone chasing.

`clinched` and `eliminated` are deliberately **conservative**: a team is called
eliminated only when enough other teams already have more wins than it can still
reach, and clinched only when enough other teams can no longer reach the wins it
already has. Points-for tiebreaks and head-to-head can settle a spot earlier than
that. Being silent about a settled spot is a much cheaper error than telling a
manager their season is over when it is not, so the arithmetic is one-sided on
purpose — and the UI says so.

Ottoneu's own `/playoffs` page projects the field once the season starts; it is
not scraped, because the same answer falls out of the game log we already hold.

## Backfill limitation

`/csv/schedule` and `/schedule` are **current-season only** — there is no
`/schedule/2025`. Past seasons' standings are still on Ottoneu at
`/standings/{year}`, and past playoff games appear there, but the regular-season
game log for a finished season is not retrievable. So `league_matchups` starts
accumulating from the 2026 season forward; earlier seasons will stay empty
unless someone enumerates game ids, which is not a polite thing to do to
somebody else's server.

## What is deliberately not stored (yet)

`/football/{league}/game/{game_id}` is a full box score: every started player
with `data-player-id` (Ottoneu's id, which joins straight to `players.ottoneu_id`),
slot, projected points, actual points and a stat line. That is the natural next
table — it would let a matchup view show *who* won somebody the week, and it
would pair with `weekly_projections` for projection-vs-result at the lineup
level. It is six extra requests per week and a second parser, so it was left out
of the first cut rather than doubling the surface area of one change.
