# Free-agent market board (open auctions + waivers)

The "Open auctions & waivers" section at the top of `/free-agents`: who is up for
auction right now, who was cut in the last 24 hours and can still be claimed, how
long each window has left, and what the viewer should do about each one.

| Piece | Where |
|---|---|
| Auctions | `scripts/scrape_fa_market.py` (`just scrape-fa-market [--dry-run]`): the public `/auctions` page, run by the droplet's Post Auctions job every 5 minutes (below) |
| Waivers | `scripts/infer_fa_waivers.py` (`just infer-fa-waivers [--dry-run]`): inferred from the public roster CSV; `deploy/droplet/fa-waivers.sh` every 10 minutes, gated to the `in_season` phase by `scripts/fa_market_gate.py` |
| Table | `fa_market` (migration 051) — a snapshot, one row per player on the market; `fa_auction_results` (migration 054) — completed auctions |
| Discord | `deploy/droplet/post-auctions.sh` on the DigitalOcean droplet — every 5 minutes, `--auctions-only`, then posts openings and results ([discord-feed.md](discord-feed.md#fa-auctions)) |
| Pricing | `web/lib/fa-market.ts` (pure) · `web/lib/fa-market-data.ts` (read) |
| UI | `web/app/free-agents/FaMarketBoard.tsx`, wired in `web/app/free-agents/page.tsx` |

## What Ottoneu exposes (spike, 2026-10-17)

| Page | Access | Shows | Does not show |
|---|---|---|---|
| `/football/{league}/auctions` | **Public** | Active auctions: player, a countdown ("1 hours 30 minutes 6 seconds"), minimum bid. Logged in, each row also carries Ottoneu's auction id in its bid box. | The nominating team, any bid (bids are blind) |
| `/football/{league}/waivers` | **Login-gated** (anonymous requests 307 to the league home) | Waiver claims: player, salary, cut time. Logged in, each row carries the claim id. | The team that cut him |
| `/football/{league}/auctions/<id>` (checked 2026-10-21) | **Public**, once closed; linked from the "Completed Auctions" table on `/auctions` (which also prints the price and the ending time) | Who started it, when it ended, every bid with its team, highest first | Anything while the auction is open |

Nothing here logs in. Auctions come from the public page over plain HTTP
(`scripts/ottoneu_http.py`, honest User-Agent). Waivers are inferred from the public roster
CSV (next section). The waivers page itself is no longer read: until November 2026 a
logged-in Playwright scrape on GitHub read it, but the FanGraphs login
(`blogs.fangraphs.com/wp-login.php`) answers the droplet's DigitalOcean IP with a
Cloudflare challenge whatever the client. The auction and claim ids that only logged-in
pages show (`fa_market.market_id`) were never read by anything, so they went too. The board says "nominated by" nowhere because no page says it while the auction is open;
the closed auction's page does, which is what the Discord result post uses.

## Waivers from the roster CSV (`infer_fa_waivers.py`)

A waiver follows from the public `/football/{league}/csv/rosters` export
(`reconcile_roster.parse_roster_csv`). A player on a roster at the last poll and on none
now was cut. He is on waivers for `WAIVER_CLAIM_HOURS` (24), and a claim pays the salary
he was cut at, his salary in the last poll. He leaves when he is on a roster again
(claimed, or added once the window closed) or when the window ends. The droplet polls
every ten minutes and diffs against the previous poll, kept as a JSON snapshot in
`.cache/fa-waivers/roster-snapshot.json` on the droplet.

- **The cut time is a bound.** The cut happened between two polls. The row takes the
  earlier poll's time, so the board's claim deadline is never later than the real one,
  and at worst it is ten minutes early.
- **A trade is not a cut:** the player is still on a roster.
- **A cut and a claim inside one poll** never show, because he was claimable for less
  than ten minutes.
- **Guards.** A snapshot over an hour old (droplet down, or the off-season gate kept the
  job idle) is only re-baselined. A CSV below `reconcile_roster`'s row/team floor fails
  the run and keeps the old snapshot. More than 12 players leaving rosters in one poll
  (a season rollover, say) re-baselines without inferring anything.

The job writes only `kind='waiver'` rows, incrementally (insert new cuts, delete the
finished ones), and revalidates `/free-agents` when anything changed.

## Completed auctions and the Discord feed

Each run also reads the "Completed Auctions" table on the page it already fetched and,
for each auction that ended in the last `RESULT_LOOKBACK_DAYS` (2) and is not stored yet,
loads its `/auctions/<id>` page into `fa_auction_results`: price, ending time (site
clock), who started it, every bid, and the winner (the top bid). A page that parses to no
bids is left unstored for the next run to retry.

**Tied top bids.** Ottoneu breaks a tie in reverse standings order — of the teams tied for
the top bid, the one lowest in the standings wins — and the auction page lists tied bids in
no useful order, so its first row is not necessarily the winner (Eli Raridon,
`/auctions/66346`, was posted for the wrong team). `break_ties` settles it from the
standings, derived from `league_matchups` the same way as `web/lib/standings.ts` (wins, then
points for; the previous season's final standings until a game of the new one is final),
and moves the winner to the front of `bids`. A tie the standings cannot settle (a tied team
missing from them, or a `--dry-run`, which reads no DB) is left unstored and retried. The
Discord post adds a line saying the tiebreak decided it.

`fa_market.first_seen_at` is the first scrape that listed a row, carried over by every later
scrape (`carry_over`), so `(player_key, first_seen_at)` names an open auction for its whole
life. That is the key of its "auction started" Discord post, because the public page prints
no auction id. Only the droplet's five-minute Post Auctions run writes auction rows on a
schedule, so it is the only writer of `first_seen_at`. The waivers job never touches
auction rows. It still takes the same `flock /run/lock/ottoneu-fa-market.lock`, so no two
droplet jobs read and write `fa_market` at once.

**FanGraphs login change (October 2026).** `wp-login.php` was re-skinned: the stock
`#wp-submit` button is still in the form but hidden, and the visible "Sign In" button is
`input.fg-login-submit`. The old click on `#wp-submit` timed out, so
`fangraphs_login.py` now clicks whichever `name=wp-submit` input is visible. Only the
arbitration scrape logs in now.

## Times

- **Auctions** print a countdown, so `ends_at = scraped_at + countdown` — an absolute
  instant, no zone to guess.
- **Waivers** take the cut time from the poll that last saw the player rostered (see
  above). It is stored on Ottoneu's site clock as `cut_at_local` (the `trades`
  convention), and the claim deadline is that wall time read as US Eastern
  (`nfl_week.LEAGUE_TZ`) plus `WAIVER_CLAIM_HOURS` (config.json, 24).

The board counts down client-side from `ends_at`, because the page is cached for up to an
hour and a server-rendered "2h left" would be stale.

## Pricing (`web/lib/fa-market.ts`)

1. **League value** — this season's earned value (`computeEarnedValue`) with no stat
   window, which puts production to date on the *full-season* dollar scale. That is the
   right unit against a bid or a claim, because an Ottoneu salary is annual. The preseason
   model is withheld in season (#748), so nothing projected goes in. Kickers and college
   players have no earned value and show a dash.
2. **Fit** — `classifyFreeAgents` (`free-agent-upgrades.ts`, #769) on season PPG against
   the viewer's roster: starter, bye fill, top bench, or would not dress.
3. **Value to you** — league value × `FIT_WEIGHT[fit]` (starter 1, top bench 0.5, bye fill
   0.25, would not dress 0.2; no viewer team = 1).
4. **Auction: suggested max bid** = value to you, floored to whole dollars, capped at the
   viewer's cap room; *Pass* below the minimum bid; *No cap room* if the minimum is
   unaffordable. Ottoneu FA auctions are sealed second-price (winner pays second-highest +
   $1), where bidding your true value is the dominant strategy — so the suggestion is the
   value, not a guess at the market.
5. **Waiver: claim or pass** — a claim pays the full salary he was cut at, no bidding, so
   it is value to you − salary. With several claims the lowest-ranked team wins.

Cap room and open roster spots come from the viewer's reconstructed roster
(`roster-reconstruction.ts`; cap loans are not included).

## Known gaps

- The fit weights are judgement calls, not fitted. They live in one constant.
- Earned value early in the season is a small sample; the full-season scaling magnifies
  it. The PPG column shows games played so the reader can discount it.
- The site clock was confirmed Eastern on 2026-10-17: an auction whose countdown put
  its close at 01:01 UTC was listed as completed "Oct 17, 2026 9:01 PM" (EDT). If Ottoneu
  ever starts printing times in the viewer's profile zone instead, waiver deadlines shift
  by the offset; auction deadlines are unaffected.
