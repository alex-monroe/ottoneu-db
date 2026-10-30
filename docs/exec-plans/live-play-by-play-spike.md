# Spike — Same-day, low-latency play-by-play

## Status: Research complete (2026-10-29) · nothing built yet

> **Verdict:** Paying isn't necessary yet. Most of today's lag comes from how we
> schedule our own jobs, not from the data source.
>
> 1. **Free, about an hour after each game ends: rebuild per NFL game instead of
>    per week, on nflverse's existing same-night runs.** nflverse already publishes
>    play-by-play after every game window (Sunday ~6 PM, ~8 PM and ~1 AM ET), not
>    "next day". We wait for the *whole week* plus our 15:30 UTC daily cron.
>    **Do this first.**
> 2. **Free, a minute or two behind live: ESPN's unofficial Core API plays feed.**
>    Every play has a `wallclock` and its `participants` (passer, rusher, receiver,
>    kicker). Polled every minute it would replace the two-hourly live snapshots.
>    The catch is the scheduler: GitHub cron can't fire every minute, so this
>    needs one (Cloudflare Workers cron, or Supabase `pg_cron` + an Edge Function).
> 3. **Paid fallback if ESPN breaks or blocks us: BALLDONTLIE NFL "GOAT" at
>    $39.99/mo.** It has the same shape as ESPN (`wallclock`, `participants` with
>    `player_id`), with a documented API and a 600 req/min limit. Nothing cheaper
>    has a verified live play-by-play feed.

---

## Where the lag comes from today

The score worm (see [matchups-and-standings.md](../references/matchups-and-standings.md#the-score-worm))
has two sources:

| Source | Resolution | Latency | What limits it |
|---|---|---|---|
| Live: `matchup_score_snapshots` from the lineup scrape (`pull-matchups.yml`) | One point per scrape | Asked for every 5 min; GitHub fired a whole Sunday window about **every 2 h** in Oct 2026 | GitHub cron reliability |
| Rebuilt: `matchup_score_plays` from nflverse (`rebuild-score-worms.yml`) | One point per play | **Tuesday ~15:30 UTC** for the whole week | Our gate: every NFL game of the week has ended + every league game is `final` + the daily cron time |

nflverse is not what holds up the rebuilt worm. The `update_data.yaml` workflow in
[nflverse/nflverse-pbp](https://github.com/nflverse/nflverse-pbp/blob/master/.github/workflows/update_data.yaml)
uploads `play_by_play_{season}.parquet` on these schedules (September–February):

| cron (UTC) | Window it follows | ET (EST, from Nov 1) |
|---|---|---|
| `3 9 * * *` | daily | 4:03 AM |
| `33 5 * * 5` | TNF | Fri 12:33 AM |
| `3 22 * * 0` | Sunday early | Sun 5:03 PM |
| `7 0 * * 1` | Sunday late | Sun 7:07 PM |
| `33 5 * * 1` | SNF | Mon 12:33 AM |
| `33 5 * * 2` | MNF | Tue 12:33 AM |

Two details matter for a client:

- **A build only uploads if every game in it finished building** (`n_pbp_ids ==
  n_ids` in `R/update_pbp.R`). One bad game means the run uploads nothing and the
  previous file stays up. So the parquet can occasionally be a window behind.
- **The raw per-game JSON appears sooner, "usually within 15 minutes after a game
  has ended"** ([nflreadr data schedule](https://nflreadr.nflverse.com/articles/nflverse_data_schedule.html)).
  `nflfastR::build_nflfastR_pbp()` reads it from `nflverse/nflverse-pbp-internal`.
  That route is R-only and its URLs aren't documented, so it's a fallback, not a plan.
  `https://github.com/nflverse/nflverse-data/releases/download/pbp/timestamp.json`
  (`last_updated`) is the cheap way to check for a new upload before downloading
  the parquet.

Nothing in nflverse covers games that are still being played.

## Options

### 1. Rebuild per NFL game on nflverse's same-night uploads (free; ~1 h after the window)

Change `rebuild_score_worm.py`'s readiness check from "the week is over" to "this
starter's NFL game is over". For each league game, use play-by-play rows for
starters whose NFL game has an `END GAME` row, and keep the live snapshots for
the rest. Add crons a little after each nflverse run (e.g. `30 22 * * 0`,
`45 0 * * 1`, `0 6 * * 1,2,5`). A run should poll `timestamp.json` first and exit
if nothing has changed.

- **Gets you:** exact per-play worms for the Sunday early games by about 6 PM ET,
  the late games by about 8 PM, and SNF/MNF just after midnight. Today you wait
  until Tuesday afternoon.
- **Costs:** the worm becomes a mix of play rows and snapshots until the week is
  over. `web/lib/score-worm.ts` currently picks one source per game, so drawing
  both on one chart is the real work. The Ottoneu-final check and the
  `Adjustment to Ottoneu's final` row still only make sense once the league game
  is `final`. Keep that step on the existing week-over pass.
- **Risk:** low. Same data, same scoring code, same player matching.

### 2. ESPN Core API plays feed (free, unofficial; ~1–2 min behind live)

`https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/events/{id}/competitions/{id}/plays?limit=300`
returns every play so far. Checked against a real 2024 game (KC–BAL, event `401671789`):

```json
{"id":"40167178960","sequenceNumber":"6000","type":{"text":"Rush"},
 "text":"(Shotgun) D.Henry left end to BLT 32 for 2 yards (Ja.Watson).",
 "awayScore":0,"homeScore":0,"period":{"number":1},
 "clock":{"value":900.0,"displayValue":"15:00"},
 "scoringPlay":false,"scoreValue":0,"statYardage":2,
 "wallclock":"2024-09-06T00:45:36Z","modified":"2024-09-11T20:52Z",
 "participants":[{"athlete":{"$ref":".../seasons/2024/athletes/3043078"},"order":1,"type":"rusher"},
                 {"athlete":{"$ref":".../seasons/2024/athletes/4697639"},"order":2,"type":"tackler"}]}
```

- **What it has:** a wall-clock time per play (to the second), the players
  involved by role, play-level yardage, scoring flags and the running score.
  Event ids come from the public scoreboard
  (`site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?week=N`).
- **What it lacks:** per-player stats on each play. Points come from role ×
  `statYardage`, with the play text for two-pointers, fumbles lost and missed
  kicks. That is a second scorer next to the nflverse one in
  `rebuild_score_worm.py`. It doesn't have to be exact: once nflverse publishes,
  the nflverse rebuild (option 1) replaces it, and that rebuild is the one
  checked against Ottoneu.
- **Athlete ids** are only inside the `$ref` URL. nflverse's players file carries
  an `espn_id` alongside `gsis_id`, which gives a direct mapping. *Unverified in
  this spike:* confirm the column before building on it.
- **Gotchas found:** plays get edited after the game (`modified` was 5 days
  later). Some plays wiped out by a penalty have `isPenalty: false` but say
  "No Play" in the text. Kickoff and the first snap share a `clock`, so sort by
  `sequenceNumber`. One gist comment reports a phantom play that isn't in the
  official game book.
- **Terms and limits:** undocumented and unofficial. No auth, no published rate
  limit, and it may change without notice. One request per in-progress game per
  minute is about 15 requests a minute at peak. For a 12-team league site that
  is the polite end of how this API is commonly used, but it is not licensed
  use. *Not measured here:* how many seconds after the snap a play appears. Poll
  one live game and compare `wallclock` with the time it was fetched.
- **Scheduler:** this is where the engineering cost is. GitHub Actions can't do
  it: its 5-minute minimum fired about every 2 h. Free options that fire every
  minute: **Cloudflare Workers cron triggers** (would need TypeScript and a
  Supabase write key in Worker secrets), or **Supabase `pg_cron` calling an Edge
  Function** (stays on the infrastructure we already run). The same fix would
  also make the live Ottoneu lineup scrape fire on time, which is arguably the
  bigger win on its own.

### 3. Paid feeds

| Provider | Price | Live play-by-play | Notes |
|---|---|---|---|
| **BALLDONTLIE NFL** ([docs](https://nfl.balldontlie.io/)) | **GOAT $39.99/mo** ($383.90/yr); ALL-STAR $9.99 lacks plays | Yes, `GET /nfl/v1/plays?game_id=`, ordered by `wallclock`, `participants[{player_id, type}]` | 600 req/min. 48 h GOAT trial (card required). "Real-time" is promised for games/stats; play latency not stated. Non-commercial terms not checked |
| MySportsFeeds ([pricing](https://www.mysportsfeeds.com/feed-pricing/)) | Personal from ~$5/mo CAD for CORE, non-live | Play-by-play is the DETAILS add-on; live access is a higher tier; **price for both not published** | Freshness is set by plan ("every 5 min" etc.); personal pricing must be applied for |
| Sportradar ([update frequencies](https://developer.sportradar.com/football/docs/nfl-ig-update-frequencies)) | Contract, B2B | Yes, 3 s TTL while in progress | The gold standard (it is what Sleeper's stats come from) but priced for businesses. Trial keys exist |
| SportsDataIO | Contract for play-by-play; personal "Fantasy" plans don't clearly include it | Unverified | Pricing pages 404'd |
| Tank01 (RapidAPI), API-Sports | Unverified | Unverified | Pages are JS-rendered or blocked; couldn't confirm |

Sleeper (already used for weekly projections) is **not** a play-by-play source.
`api.sleeper.app/stats/nfl/{season}/{week}` gives one cumulative line per
player-game (`game_id`, `updated_at`, `company: "sportradar"`). In principle,
polling it and diffing would give a worm point per poll. But it isn't documented,
and whether it updates during games is unverified. Option 2 is strictly better.

## Recommended order

1. **Option 1** (free, same data, Python only): mixed play/snapshot worms, plus
   crons on nflverse's windows gated on `timestamp.json`.
2. **A reliable every-minute scheduler** (Supabase `pg_cron` → Edge Function).
   Point it at the existing lineup scrape first, so live snapshots really are
   ~5 min, then decide whether option 2 is still worth it.
3. **Option 2** on that scheduler, writing provisional `matchup_score_plays` rows
   (with a source column) that the nflverse rebuild overwrites.
4. Swap ESPN for **BALLDONTLIE GOAT** only if ESPN blocks us, changes shape, or
   proves too slow. The schema is close enough that only the fetcher changes.

## Checks before building

- `just rebuild-score-worm --dry-run --week N` still matches Ottoneu's finals
  after the per-game gate change (the 1,295-player-game agreement must hold).
- For option 2, one live Sunday: log fetch time minus `wallclock` per play
  (latency), and compare the ESPN-scored total per starter with the later
  nflverse rebuild (agreement).
