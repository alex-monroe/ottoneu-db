# Trades: history, cap loans, sell-offs and pending trades

The `/trades` page and the data behind it. It answers four questions about the
league's trade market:

1. **What is pending right now, and who is it good for?**
2. **When a losing team sells off, does it pay?** (keeper value, next season's record)
3. **How often are cap loans used, how big, and who lends them?**
4. **Where did a trade's players go next?** (trade trees and owner chains)

| | |
|---|---|
| **Tables** | `trades` · `trade_assets` (migration 049), plus the `move (from X)` rows in `transactions` |
| **Ingestion** | `scripts/scrape_trade_history.py` — `just scrape-trades` |
| **Workflow** | `.github/workflows/scrape-trade-history.yml` (every 4 hours) |
| **Logic** | `web/lib/trades.ts` (pure) · `web/lib/trades-data.ts` (reads) |
| **Route** | `/trades` — gated on projections access, like `/value` · `/trades/builder` ([below](#trade-builder)) |

## Data: two sources merged into one log

**Ottoneu's trade history** (`/football/309/trade_history`) lists every
*accepted* trade: when both managers agreed, both sides, and status —
`Processed` or `Awaiting League Approval`. It is the only place that shows
**cap loans** ("Loan: $82") and **pending trades**. One `/view_trade/{id}` page
per trade adds the processed time (or, pending, the scheduled one — "Will be
processed on …"), the approve/veto count, and each player's NFL team and
position.

- Each side's cell lists **what that team gives up**. A loan under a team is
  money that team lends; the view_trade page's "Cap available will change by"
  line nets it out (Triple Helix sends Hampton $54 + an $18 loan for $23 of
  salary → +$13), and `valueTrade`'s `capNet` is tested against that figure.
- The page holds accepted trades only. A pending trade that is vetoed or
  withdrawn simply disappears, so the scraper marks a stored `pending` trade
  that is no longer listed `removed` — it cannot tell which of the two happened.
- **Coverage stops at September 2025.** The page is not paginated and ignores
  `?season=` / `?page=` (checked October 2026).
- A three-team trade appears as separate two-team trades a minute apart.

**Player cards** (the `transactions` table) record one `move (from X)` row per
player traded, stamped with the minute Ottoneu *processed* it. They reach back
further but never show a loan. `tradesFromCards` regroups them by minute and
team pair (the same rule as `web/lib/recap-moves.ts`); `mergeTrades` keeps a
card trade only when no processed trade-history trade between the same two
teams explains it (card stamp within a day of `processed_at`, or between
acceptance and four days after when the processed time is not stored).

A card-rebuilt trade carries `loansKnown: false`, and the UI says "loans not
visible". **Loan statistics count only trades whose loans are known** —
counting card trades as loan-free would understate how often loans are used.

## How a trade is valued

Every player is priced by the same full-reset market as `/value`
(`calculateSurplus`): one season's projected PPG → VORP → a share of the
league's distributable cap. A pricing pool is built per season from
`player_projections` (`projectedPool`); salary does not move a dollar value, so
the pool carries none. Each side of a trade is then read three ways:

| Read | Meaning |
|---|---|
| **This season** | Projected dollar value received minus given, × the share of the fantasy regular season still to play when it processed (`remainingSeasonFraction`, from `league_matchups` weeks). A $60 player on the deadline is worth a fraction of $60. |
| **Keeper value** | Next season's projected value minus next season's salary (salary + `SEASON_END_RAISE_PLAYED`/`_OTHER`), **floored at zero** — an over-priced contract is cut in the offseason at no penalty ([ottoneu-rules.md](ottoneu-rules.md)), so it is worth nothing, not a loss. When next season has no projections yet (e.g. any in-season trade), this season's projection stands in, flagged `nextIsProxy`. |
| **Cap room** | Salary out − salary in − loan made + loan received. Loans expire at the end of the regular season, so they move this season's cap only. |

A player missing from a season's projections that *exist* is priced at the
roster-spot floor (`MIN_PLAYER_SALARY`) and marked `*`; a whole season with no
projections makes that read `—` rather than a misleading partial sum.

**Projections are preseason.** A November trade is judged on what the model
believed in August. That is leakage-free — it never credits a trade with what
the season had not yet revealed — but it cannot see an injury the managers
could. The sell-off table's last column, *produced next yr*, is the hindsight
counterweight: realized dollar value from `player_stats` in the following season
(partial while that season is in progress).

## Sell-offs

`findSellOffs` flags a side that gave up at least `SELL_OFF_MIN_SEASON_VALUE`
($25) of prorated this-season value, net. Each is paired with:

- **Standing then** — the record from games finished before the trade
  (`standingAt`); for an offseason trade, last season's final table.
- **Next season** — the seller's record the following season (final, or so far).
- **Keeper value** and **produced next year**, as above.

`judgeSellOffs` rolls up the bottom-half sell-offs (rank worse than half the
table): how many gained keeper value, the average, and how many finished higher
the next season. With one complete season of trade history (2025) the sample is
small — read it as a set of case studies, not a law.

## Lineage

- `playerTradeChain` — one player's owners in order, with the salary he carried.
- `mostTradedPlayers` — the league's most-travelled players.
- `tradeTree` — for one side of a trade, each player received and, if that team
  later traded him away, what came back, recursively (depth 4). Shown under
  "What it turned into" on each trade card.

## Operating it

```bash
just scrape-trades --dry-run     # fetch + parse, print, write nothing
just scrape-trades               # write trades + trade_assets
just scrape-trades --no-details  # list page only (no view_trade fetches)
just scrape-trades --file saved_trade_history.html --dry-run
```

A view_trade page is fetched only for a trade that is new, still pending, or
missing its processed time, so a routine run is one or two requests.

## Trade builder

`/trades/builder` judges a trade **before** it is proposed. Pick the players
(and an optional cap loan) each side sends; every number updates as you go, and
the URL (`?a=&b=&as=&bs=&la=&lb=`) carries the trade so a link reproduces it.

Unlike the rest of this page it is priced on **this season's production**, not
the preseason projection: in season the model is withheld (#748), and a
deadline trade is about the weeks left. Logic in `web/lib/trade-builder.ts`
(pure, tested in `web/__tests__/lib/trade-builder.test.ts`); reads in
`web/lib/trade-builder-data.ts`.

| Read | Meaning |
|---|---|
| **Starting lineup** | The optimal Superflex lineup (`optimizeLineup`, as on `/lineup`) on season-to-date PPG, before and after. Moving a bench player moves nothing. |
| **Rest of season** | Each player's earned value (`earned-value.ts`) scaled from the games played to a full-season pace, × the share of regular-season weeks still to play (`remainingSeasonFraction`). Received minus sent. |
| **Keeper value** | Full-season pace minus next season's salary (+`SEASON_END_RAISE_PLAYED` if he played a game, else +`SEASON_END_RAISE_OTHER`), floored at zero — the same convention as above. |
| **Cap room** | `CAP_PER_TEAM` − current salary (from `league_prices`), then ± salary moved and the loan. Existing cap loans and cut penalties are not stored, so this is salary-only; the page links Ottoneu's finances page for the real figure. |
| **Roster spots** | Count after the trade against `ROSTER_SPOTS`. IR players are in the count (Ottoneu excludes them). |

Because loans, penalties and IR are unknown, several teams already read as over
the cap or the roster limit. A warning fires only when the trade itself makes
that worse (more salary while over, or more bodies while over), so it is not
repeated on every trade such a team looks at.

Blind spots: kickers and college players earn no value in this method, so they
read $0; a pace in the first weeks rests on few games.

### Replaying a recorded trade

`/trades/builder?trade=<ottoneu trade id>` (the `trades.trade_id`, the same id
as Ottoneu's `/view_trade/<id>`) replays a trade from the log. `replayTrade`
puts every player it moved back on the team that sent him — a processed trade
is rewound, a pending one is already in place — and pre-selects both sides and
the loan. A player since traded on or cut is found wherever he is now. Values
still use production **through today**, so a replay is the trade judged with
hindsight, and the page says so. Every trade card on `/trades` links its
replay ("In trade builder"), and the Discord trade posts link the same URL.
Once someone edits the selections the URL carries them alongside `trade=`, and
they win over the recorded sides.
