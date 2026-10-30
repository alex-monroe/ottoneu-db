# Free-agent market board (open auctions + waivers)

The "Open auctions & waivers" section at the top of `/free-agents`: who is up for
auction right now, who was cut in the last 24 hours and can still be claimed, how
long each window has left, and what the viewer should do about each one.

| Piece | Where |
|---|---|
| Scraper | `scripts/scrape_fa_market.py` (`just scrape-fa-market [--dry-run]`) |
| Login | `scripts/fangraphs_login.py` (shared with the arbitration scrape) |
| Schedule | `.github/workflows/scrape-fa-market.yml` — every 3 hours, gated to the `in_season` phase by `scripts/fa_market_gate.py` |
| Table | `fa_market` (migration 051) — a snapshot, one row per player on the market; `fa_auction_results` (migration 054) — completed auctions |
| Discord | `.github/workflows/post-auctions.yml` — every 10 minutes, `--auctions-only`, then posts openings and results ([discord-feed.md](discord-feed.md#fa-auctions)) |
| Pricing | `web/lib/fa-market.ts` (pure) · `web/lib/fa-market-data.ts` (read) |
| UI | `web/app/free-agents/FaMarketBoard.tsx`, wired in `web/app/free-agents/page.tsx` |

## What Ottoneu exposes (spike, 2026-10-17)

| Page | Access | Shows | Does not show |
|---|---|---|---|
| `/football/{league}/auctions` | **Public** | Active auctions: player, a countdown ("1 hours 30 minutes 6 seconds"), minimum bid. Logged in, each row also carries Ottoneu's auction id in its bid box. | The nominating team, any bid (bids are blind) |
| `/football/{league}/waivers` | **Login-gated** (anonymous requests 307 to the league home) | Waiver claims: player, salary, cut time. Logged in, each row carries the claim id. | The team that cut him |
| `/football/{league}/auctions/<id>` (checked 2026-10-21) | **Public**, once closed; linked from the "Completed Auctions" table on `/auctions` (which also prints the price and the ending time) | Who started it, when it ended, every bid with its team, highest first | Anything while the auction is open |

So the scrape logs in when `FANGRAPHS_USERNAME` / `FANGRAPHS_PASSWORD` are set and
reads both pages in one Playwright session. Without them it reads the public auctions
page over plain HTTP (`scripts/ottoneu_http.py`, honest User-Agent) and leaves the
waiver rows alone. The board says "nominated by" nowhere because no page says it while the auction is open;
the closed auction's page does, which is what the Discord result post uses.

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
no auction id. `carry_over` also keeps a logged-in scrape's `market_id` when a public
scrape cannot see it. Both workflows share the `scrape-fa-market` concurrency group so two
runs never race on `first_seen_at`.

**FanGraphs login change (October 2026).** `wp-login.php` was re-skinned: the stock
`#wp-submit` button is still in the form but hidden, and the visible "Sign In" button is
`input.fg-login-submit`. The old click on `#wp-submit` timed out, so
`fangraphs_login.py` now clicks whichever `name=wp-submit` input is visible. The
arbitration scrape uses the same function.

## Times

- **Auctions** print a countdown, so `ends_at = scraped_at + countdown` — an absolute
  instant, no zone to guess.
- **Waivers** print the cut time on Ottoneu's site clock. It is stored verbatim as
  `cut_at_local` (the `trades` convention), and the claim deadline is that wall time read
  as US Eastern (`nfl_week.LEAGUE_TZ`) plus `WAIVER_CLAIM_HOURS` (config.json, 24).

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
