# League Discord feed

The league talks in Discord, not on the site. In 2026 it made 170 adds, 168 cuts
and 18 trades on Ottoneu while pick'em fell from 8 players in week 2 to 1 in
week 6. The feed takes the site's news to where the conversation already is, and
links back to the site with tags that show which posts bring people over.

Every post goes out as the league's existing bot, the same one the power rankings
use ([podcast-tools.md](podcast-tools.md#the-discord-post)). There is one bot and
one channel, not a webhook per feature.

| Post | Job | When | `post_type` / key |
|---|---|---|---|
| Pending trade (heads-up) | `web/scripts/post-trades.ts` | after each 4-hourly trade-history scrape | `trade_pending` / trade id |
| Processed trade | same | same | `trade_processed` / trade id |
| Daily moves digest | `web/scripts/post-moves-digest.ts` | **paused** — manual dispatch only | `moves_digest` / `YYYY-MM-DD` |
| Pick'em results | `web/scripts/post-pickem.ts --results` | daily 15:00 UTC; posts once a week is final | `pickem_results` / `<season>-w<week>` |
| Pick'em reminder | `web/scripts/post-pickem.ts --reminder` | Thursday 15:00 UTC, before the lock | `pickem_reminder` / `<season>-w<week>` |
| Power rankings, vote reminder | `post-power-rankings.ts`, `post-vote-reminder.ts` | Thu / Wed | not logged (see podcast-tools.md) |

Code: `web/lib/discord.ts` (message type, send, link tagging),
`web/lib/discord-feed.ts` (what to post and how it reads, pure),
`web/lib/discord-feed-data.ts` (reads plus the post log). The tests are
`web/__tests__/lib/discord*.test.ts`.

## Never twice: the `discord_posts` log

Migration 050. One row per post, primary key `(league_id, post_type, post_key)`.
Every feed job works out what it could post, drops anything already in the log,
and sends the rest through `sendFeedPost`, which:

1. **Claims the row first.** If the insert hits the primary key, another run
   already has it and this one stops (`already-posted`).
2. Posts to Discord.
3. If Discord rejects the post, **deletes the claim** so the next run retries.
   If it succeeds, stores Discord's message id on the row.

Posting first and recording afterwards would double-post every time the record
failed after a successful send, so the claim comes first. The cost is that if a
job dies between the claim and the send, that item is skipped. That is the
better way to fail for a league channel.

Server-only: RLS is on and there is no anon policy, so the jobs write with the
service key. To re-post something, delete its row and re-run the job.

## Dry run

Every job takes `--dry-run`, and every workflow has a `dry_run` dispatch input.
A dry run prints each message as JSON and touches neither Discord nor the log.
It still *reads* the log, so it shows exactly what a real run would post now.

```bash
just post-trades --dry-run --max-age-days 7
```

```bash
just post-moves-digest --dry-run --date 2026-10-15
```

```bash
just post-pickem --results --dry-run --week 2
```

The recipes read `web/.env.local`, which needs `SUPABASE_SECRET_KEY` because the
post log and pick'em picks are server-only.

## Trades

`post-trades.ts` runs as a second job in `scrape-trade-history.yml`, after the
scrape. It reads trade-history trades (`trades` + `trade_assets`, shaped by
`tradesFromHistory` in `web/lib/trades.ts`), and for each one:

- **pending** (inside Ottoneu's 48-hour veto window): one heads-up post, marked
  pending, with the scheduled processing time printed as Ottoneu site-clock text.
  That clock has no zone (migration 049), so it is not turned into a Discord
  timestamp.
- **processed**: one post, even when a pending post already went out.
- **removed** (vetoed or withdrawn): nothing.

Only trades from the last `--max-age-days` (default 3) count, by acceptance date
when pending and processing date when processed. That keeps the first run, or
the first run after an outage, from flooding the channel with the back catalogue.
Only trade-history trades are posted, because they carry Ottoneu's trade id to
key the log on. Trades rebuilt from player cards have none.

**The post (currently a plain summary):** each side's received players, with
position and salary, and any cap loan (loans expire after the regular season),
then a link to the trade replayed in the trade builder
(`/trades/builder?trade=<ottoneu trade id>`, which rebuilds both rosters as they
were before the trade; see [trades.md](trades.md#replaying-a-recorded-trade))
and to `/trades`. The footer reads "From Ottoneu's trade log."

**The value read is switched off for now** (October 2026). The league wants the
trade builder's method settled before analysis goes to Discord, so
`buildTradeMessage` posts the plain summary unless it is called with
`{ valueRead: true }`. The read below is built and tested; turning it back on is
that one option in `web/scripts/post-trades.ts`.

**When on, the value read uses production, not projections.** The preseason projection
model is withheld once games start (#748), so a trade is read on what the players
have done. Each player's this-season **earned value** (`web/lib/earned-value.ts`,
the same numbers as the `/value` earned tab and the MCP `get_earned_value` tool,
over the live stat window) is divided by the window's fraction of a season to
give a full-season **pace**. Pace is in the same units as salary, so a line like
"$52 of pace in for $40 salary" compares like with like. A side's read is pace
received minus pace given up. A player with nothing to price (no games yet, a
kicker, a college prospect) counts as zero and his line says why. Before any
games the post says there is no value read. In the offseason the window is last
season's, and the label in the post says so.

This is deliberately thinner than `/trades`, which values trades on the
projection model plus keeper value. The Discord read is a quick read of
production so far, and its footer says that.

## Daily moves digest

**Paused (October 2026).** The daily schedule is off: beside the trade posts,
a daily post read as spam. The workflow still runs by hand (`workflow_dispatch`),
and the header comment in `post-moves-digest.yml` has the cron line to restore.

When scheduled, `post-moves-digest.yml` runs daily at 13:30 UTC, well after the
06:40 UTC player-card scrape has written the previous day. By default it covers
**yesterday** in America/New_York (`--date` overrides). It reads through
`fetchWeekMoves` (`web/lib/recap-moves.ts`, the same reader the weekly recap
uses) and keeps only **scraped** adds and cuts: an inferred row's date is the
reconciliation run, not the move (`web/lib/mcp/transactions.ts`). Trades are
left out because they get their own post. Moves are grouped by team, adds then
cuts, biggest salary first, each with the salary it was added or cut at. A quiet
day posts nothing. A very busy one (an auction) is cut to Discord's 4,096-character
embed limit with an "…and N more" line.

If the card scrape failed overnight, the digest posts whatever it has, and that
day is then logged as posted. Re-post a corrected day by deleting its
`moves_digest` row and dispatching the workflow with `date`.

## Pick'em

`post-pickem.yml` runs daily at 15:00 UTC, and adds the reminder on Thursdays
(ET).

- **Results** (`--results`): the latest week of the season being played whose
  league games are **all** `final` (`latestFinishedWeek`). The post names the
  week's winner or winners (ties are shared, as on the board), the top five of
  the week's board, and the **season leader**: every revealed week's board summed
  by `seasonLeaderboard`, with level totals sharing a rank. It ends with a link
  to the next week's picks when that week is open, or to the board when it is
  not. Running daily catches the week whenever the matchup pull marks it final,
  and the log makes every later run a no-op. A week whose window (`ends_on`)
  closed more than three days ago is not announced unless `--week` is passed,
  so the first run after deploy does not announce a stale winner. A week nobody
  picked posts nothing.
- **Reminder** (`--reminder`): only while the current week is open
  (`pickemOpen`). It carries the lock time as a Discord timestamp and **how many**
  players are in so far. That comes from the unrevealed board read, which
  returns a count and nothing else, so the reminder cannot leak who picked or
  what. 15:00 UTC Thursday is before both the 20:00 ET lock and the noon lock on
  Thanksgiving.

Both read the schedule only when it belongs to the season the NFL-week resolver
says is being played, so they no-op out of season and the scheduled run still
succeeds.

## Measurement

**Every link is tagged.** `discordLink(siteUrl, path, campaign)` adds
`utm_source=discord&utm_campaign=<post type>`. The campaigns are the
`DiscordCampaign` union in `web/lib/discord.ts`: `trade_pending`,
`trade_processed`, `moves_digest`, `pickem_results`, `pickem_reminder`,
`power_rankings`, `vote_reminder`. Vercel Analytics breaks page views down by
UTM parameter, which is how a post type's pull is read.

**Custom events** (Vercel Analytics `track`, with `<Analytics />` in
`web/app/layout.tsx`):

| Event | Fired by | Properties |
|---|---|---|
| `pickem_pick` | `web/app/pickem/PickSheet.tsx`, after the server saves a pick | `week`, `cleared` (true when the tap un-picked) |
| `power_ranking_ballot` | `web/app/power-rankings/vote/ListenerBallot.tsx` and `web/app/podcast/power-rankings/BallotEditor.tsx`, when a ballot is locked in (not on autosaves) | `week`, `voter` (`listener` / `host`) |

Events carry no user id or team. They count engagement and nothing else.

## Operating it

- **Secrets:** `DISCORD_TOKEN` (the GitHub Actions secret the power rankings
  already use) and the channel id in each workflow. `SITE_URL` sets the links'
  origin.
- **Monitoring:** `Post Moves Digest` and `Post Pickem` are on the
  `alert-scheduled-failure.yml` list. The trade posts run inside `Scrape Trade
  History`, so a failed post fails that run and alerts under its name.
- **Changing what a post says** is a `web/lib/discord-feed.ts` edit plus its
  test. **Adding a post type** means extending the `post_type` CHECK in a new
  migration, `FeedPostType` and `DiscordCampaign`, and this page.
