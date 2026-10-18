# Matchups, standings & the playoff picture

The in-season layer: who played whom, who won, and where that leaves the league.
Everything else this repo knows is about *players* — this is the only subsystem
that knows the league has games.

| | |
|---|---|
| **Tables** | `league_matchups` (migration 037) · `matchup_lineups` (migration 044) |
| **Scrapers** | `scripts/scrape_matchups.py` — `just scrape-matchups` · `scripts/scrape_lineups.py` — `just scrape-lineups` |
| **Derivation** | `web/lib/standings.ts` + `web/lib/live-matchup.ts` + `web/lib/playoff-odds.ts` (pure) · `web/lib/matchups.ts` + `web/lib/matchup-lineups.ts` + `web/lib/playoff-odds-data.ts` (fetchers) |
| **Routes** | `/scoreboard` and `/scoreboard/[gameId]` (public) · the homepage league-status section |
| **MCP tools** | `get_scoreboard` · `get_standings` (incl. playoff odds) |
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

## Playoff odds and the deadline signal

`clinched`/`eliminated` say what is settled; **playoff odds** say what is
likely. `web/lib/playoff-odds.ts` (pure) Monte Carlo simulates every
regular-season game not yet final — 5,000 seasons, seeded, so the same inputs
always give the same odds — and ranks each simulated season exactly as
`computeStandings` does (wins, then points for). Per team it reports playoff
odds, #1-seed odds and expected final wins.

**Each team's weekly score is a normal draw.**

| | From |
|---|---|
| Mean | the team's **optimal-lineup projection** (`optimizeLineup` over today's reconstructed roster, scored with `weekly_projections`); else its season PPG; else the league average |
| Spread | the SD of its own weekly scores, shrunk toward the league's pooled within-team SD (4 pseudo-games of prior) — five weeks of one team's scores is too noisy to trust alone; before anyone has two scores, 20% of the mean |
| A game in progress | drawn around its **live projection** (`live-matchup.ts`) with half the spread |

The projection is taken two ways (`playoff-odds-data.ts`). The projection
week's own optimal lineup — byes and all — is used for **that week's** game.
Every later week uses a **bye-neutral rate**: a player with no row this week is
scored at his previous week's projection, so a team with three starters on bye
is not simulated as that weak for the rest of the season. The preseason model
is not used (it is withheld in season, #748). The weekly projections behind
the means are gated, but only team-level odds leave the loader, so the odds are
**public** like the standings.

**Buy / sell / hold.** For each team the season is re-run with its mean raised
by **5 points per game** (a typical deadline upgrade) using the *same* random
draws — common random numbers — so the change in its odds is the upgrade's
effect, not simulation noise. Labels: **seller** if its odds stay under 15%
even with the upgrade; **buyer** if the upgrade moves them 8+ points (and it is
not already above 95%); **hold** otherwise. The signal is shown only while the
trade deadline (`league_calendar.trade_deadline`, via `season.ts`) is known and
has not passed.

**When it shows.** `getPlayoffOdds()` returns null unless the season phase is
`in_season`, the schedule's season is the league season, and at least one
regular-season game is not final — so it vanishes in the playoffs and the
offseason. It renders as extra columns on `StandingsTable` (playoff % on the
homepage; also #1 seed, expected wins and the deadline signal on
`/scoreboard`), a section on each team page, and fields on MCP `get_standings`.

**Known limits.** Rosters are today's: a trade changes the odds on the next
render, but injuries only through the projections. Head-to-head tiebreakers
are not modelled (the league's tiebreak is points for, which is).

## Backfill limitation

`/csv/schedule` and `/schedule` are **current-season only** — there is no
`/schedule/2025`. Past seasons' standings are still on Ottoneu at
`/standings/{year}`, and past playoff games appear there, but the regular-season
game log for a finished season is not retrievable. So `league_matchups` starts
accumulating from the 2026 season forward; earlier seasons will stay empty
unless someone enumerates game ids, which is not a polite thing to do to
somebody else's server.

## Lineups and the live matchup projection

`league_matchups` says who played whom; `matchup_lineups` says **who each team
actually started**. It is scraped from each game's public box score,
`/football/{league}/game/{game_id}` — both teams' full rosters with lineup slot,
`data-player-id` (Ottoneu's id, which joins straight to `players.ottoneu_id`),
the player's NFL game line and live points. One row per (game, player), bench
included; rows for a game are replaced wholesale each scrape (upsert, then prune
anyone no longer on the page), so a player cut or traded mid-week does not
linger.

`just scrape-lineups` scrapes every game of the **live fantasy week** — the one
whose `starts_on`–`ends_on` window contains today (ET). Ottoneu's windows run
Wednesday to Tuesday, so Tuesday morning's run still lands in the week Monday
night finished. `--week N` backfills a week. It runs as a second step of
`pull-matchups.yml`, on the same cadence (six requests a run, a second apart),
which now includes a Thursday-night window.

### Parsing: two traps

- **The page never closes its `<tr>`s**, so html.parser nests every row inside
  the one before it. The parser does not walk rows: it finds each
  `td[data-player-id]` and reads that player's fields by the per-player classes
  Ottoneu stamps on them (`player-points-{id}`, `player-game-info-{id}`,
  `player-stat-details-{id}`), searched inside the details table only — the
  per-team summary tables further down repeat the same classes.
- **Game state is derived from the game line**, like matchup status: a kickoff
  time (`Sun 1:00pm @IND`) is `scheduled`, a W/L/T result (`L 10-13 @SEA`) is
  `final`, `BYE` is `bye`, and anything else is `in_progress` — observed live as
  `0-3 SF Q1 2:39 SF25` (score, opponent, quarter, clock, ball on), whose clock
  the live projection reads. The line itself is
  stored verbatim in `game_info`. Unplayed points are `---` on the page and NULL
  in the table, distinct from a real 0.

A manager who has not set a lineup has every player on the bench (Marin County,
2026 Week 1). That is data, not a parse failure: the game page shows the empty
starting slots.

### Ottoneu's "Proj" column is not stored

The box score has a projection column, but Ottoneu **overwrites it with the
actual score once a player has played** (Drake Maye, Week 1: Proj 9.82, Pts
9.82). It cannot answer "what was he projected?", so it is ignored. The site's
projection is `weekly_projections.projected_points`, which the ingest freezes at
kickoff (see [weekly-projections.md](weekly-projections.md#the-kickoff-freeze)).

### The live projection is derived, not stored

Like the standings, the matchup projection is computed at read time
(`web/lib/live-matchup.ts`) from the lineup rows joined to the frozen weekly
projections:

| Starter's game | Counts toward the live projection |
|---|---|
| final / bye | his points |
| in progress | points so far + projection × share of the game left (read from the clock in the game line; ½ if unreadable) |
| not started | his original projection (0 if the source has none) |

Bench players never count. **Pre-game** is the same lineup's original
projections summed — what the matchup looked like before anyone played. Both
render on `/scoreboard/[gameId]` (slot-against-slot lineups, each player's
original projection beside his points, the benches) and the live figure on each
`/scoreboard` card. `/matchup` stays the *optimal*-lineup planner and links to
the real game; team schedules link to it too.

## Weekly pick'em

`/pickem` is a mini-game on top of the game log: signed-in accounts pick the
winner of every matchup in the current week, and a public board shows how
everyone did. Picks and board names are the only stored state
(`pickem_picks`, `pickem_players`, migration 046); **results are derived** from
`league_matchups` at read time, exactly like the standings, so the board is
live on a Sunday afternoon. Everything lives in `web/lib/pickem.ts`.

**The lock is a clock.** A week locks **Thursday 20:00 ET** of that NFL week,
fifteen minutes before Thursday Night Football, or **12:00 ET on Thanksgiving**
(first game 12:30). It is computed from `league_calendar` via the Week 1
anchor, DST-correct, with no stored lock time. `league_matchups.status` cannot
be the lock: Ottoneu flips a week to `in_progress` when the fantasy week opens
on **Wednesday**, a day before any NFL game (2026 Week 1 read in-progress on
Sep 9). Only the current NFL week can be picked, and the API re-checks the week,
the lock, the game and the team against the server's schedule on every pick. No
calendar date for the season means the week stays closed rather than guessing.
Non-Thursday openers other than Thanksgiving (a Christmas Day game before Thursday, say)
are **not** modelled; if the NFL schedules one, the lock rule needs a date
exception.

**Nobody sees anybody else's picks before the lock.** `buildBoard(…, revealed:
false)` returns a player count and nothing else, so the page has no picks to
leak. After the lock the board shows each player's record and, per game, who
picked each side.

**Scoring.** One point per pick of the winner of a **final** game. A lead in a
live game is still pending. A tied game is a push: no point, not a miss.
Players are ranked on points alone and share a rank when level (1, 2, 2, 4) —
tie-breaking on fewer misses would reward skipping games.

**Discord.** Once a week's games are all final, `post-pickem.yml` posts its
winner and the season leader to the league Discord, and it sends a reminder on
Thursday before the lock. The reminder gives a player count only. Saving a pick
fires the `pickem_pick` analytics event. See [discord-feed.md](discord-feed.md#pickem).

**Board names, not emails.** The board is public, so each player picks the name
they appear under (prefilled with their bound team). Names are unique per league
case-insensitively (a unique index), and a league franchise's name is reserved
for that franchise's own manager (`displayNameProblem`), so nobody can post
picks as someone else's team.

Picks point at Ottoneu's `game_id` and `team_id`, not at `league_matchups` rows —
there is deliberately no foreign key, so a re-drawn schedule scrape can never
cascade-delete a week of picks. `buildBoard` ignores a pick whose game or team is
no longer on the slate.

Routes: `/pickem` (`?week=N`), `PUT /api/pickem/pick` (save, change, or clear
with `teamId: null`), `PUT /api/pickem/name`.
