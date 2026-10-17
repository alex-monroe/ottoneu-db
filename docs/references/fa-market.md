# Free-agent market board (open auctions + waivers)

The "Open auctions & waivers" section at the top of `/free-agents`: who is up for
auction right now, who was cut in the last 24 hours and can still be claimed, how
long each window has left, and what the viewer should do about each one.

| Piece | Where |
|---|---|
| Scraper | `scripts/scrape_fa_market.py` (`just scrape-fa-market [--dry-run]`) |
| Login | `scripts/fangraphs_login.py` (shared with the arbitration scrape) |
| Schedule | `.github/workflows/scrape-fa-market.yml` — every 3 hours, gated to the `in_season` phase by `scripts/fa_market_gate.py` |
| Table | `fa_market` (migration 050) — a snapshot, one row per player on the market |
| Pricing | `web/lib/fa-market.ts` (pure) · `web/lib/fa-market-data.ts` (read) |
| UI | `web/app/free-agents/FaMarketBoard.tsx`, wired in `web/app/free-agents/page.tsx` |

## What Ottoneu exposes (spike, 2026-10-17)

| Page | Access | Shows | Does not show |
|---|---|---|---|
| `/football/{league}/auctions` | **Public** | Active auctions: player, a countdown ("1 hours 30 minutes 6 seconds"), minimum bid. Logged in, each row also carries Ottoneu's auction id in its bid box. | The nominating team, any bid (bids are blind) |
| `/football/{league}/waivers` | **Login-gated** (anonymous requests 307 to the league home) | Waiver claims: player, salary, cut time. Logged in, each row carries the claim id. | The team that cut him |

So the scrape logs in when `FANGRAPHS_USERNAME` / `FANGRAPHS_PASSWORD` are set and
reads both pages in one Playwright session. Without them it reads the public auctions
page over plain HTTP (`scripts/ottoneu_http.py`, honest User-Agent) and leaves the
waiver rows alone. The board says "nominated by" nowhere because no page says it.

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
- If the site clock turns out not to be Eastern, waiver deadlines shift by the offset;
  auction deadlines are unaffected.
