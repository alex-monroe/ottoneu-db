# Auction Simulator — pressure-testing a draft strategy

`scripts/auction_simulator.py` Monte-Carlos the league's annual blind keeper
auction so you can test an auction plan *before* draft day. It answers, over
hundreds of simulated drafts:

- What will elite players actually **clear at** (mean + p10–p90)?
- Does your strategy **fill your starting lineup**, and does your money land in
  it (vs. sitting on your bench)?
- How much **cap** will you have left for in-season waivers?
- What will your **opponents** do — who overpays for QBs, who bids you up?

It was built during the 2026 offseason to iterate on "The Witchcraft"'s plan
(League 309). The model is generic; the one team-specific piece is the
`TEAM_OVERRIDES` block, which you retarget for a different team or season.

```bash
venv/bin/python scripts/auction_simulator.py            # 400-sim aggregate stats
venv/bin/python scripts/auction_simulator.py --full     # one full-league roster dump (all 12 teams)
venv/bin/python scripts/auction_simulator.py --steals   # 6 sample drafts, your below-market steals flagged
venv/bin/python scripts/auction_simulator.py --sample   # one quick sample of just your buys
venv/bin/python scripts/auction_simulator.py --refresh   # re-pull data from Supabase first (after a re-scrape)
```

> Not a projection tool. Prices are anchored to an external market
> (`draft_sharks_values`), and the AIs are deliberately simple heuristics. Treat
> the output as *"one plausible way the room behaves,"* not a forecast — the
> value is in the distribution across many runs and in falsifying a strategy
> (e.g. "will I actually get a WR1, or get outbid?").

## Data

Pulled once and cached to `.cache/auction_sim_cache.json` (gitignored); pass
`--refresh` to re-pull. Sources (same as `just roster-context`):

| Source | Used for |
|---|---|
| `league_prices` | current rosters, per-team committed salary → cap space, and the FA pool |
| `players` | id → name / position |
| `draft_sharks_values.market_auction_value` (season = `SEASON`) | each player's superflex market price — the bid anchor |

All three reads paginate via `fetch_all_rows` (the `league_prices` table exceeds
the 1000-row PostgREST cap once the scraper writes free agents — see
[the pagination note in CLAUDE.md](../../CLAUDE.md)).

## The model

Each of the 12 teams is a heuristic bidder. Players are nominated roughly in
descending market value (with per-run noise), and each is sold second-price
(Vickrey): the top bidder wins and pays `second-highest + 1`, capped at
`MAX_BID`. For each player a team computes a private max bid:

1. **Starter need** — if it has fewer than `START[pos]` *startable* players
   (market value ≥ `STARTABLE[pos]`) at the position, it bids full market
   (QBs get a `SF_PREMIUM` bump — Superflex teams lock down two QBs first).
2. **Bench depth** — once starters are filled, it bids `DEPTH_DISC × market`
   up to `START + BENCH`.
3. **Affordability** — every bid keeps the team's `reserve` plus $1 for each
   still-needed roster spot, so no team ends broke with holes.
4. **Pounce** (optional, per team) — reach for a below-market elite up to
   `frac × market` regardless of position need, funded by spare cap.

After the auction, `fill_rosters` tops every team up to `FILL_TO` with $1 filler
(and a $1 streaming kicker) so end states are realistic. **Enforcement**
optionally lets rivals *bid up* a cash-rich "whale" that's about to steal an
elite cheap — either taxing it or getting stuck with the overpay (this is what
makes cash-poor teams run out of money sooner).

## Tuning — the CONFIG block

Everything lives at the top of the script.

### Global knobs

| Knob | Meaning |
|---|---|
| `N_SIMS` | sims for the aggregate report |
| `MAX_BID` | league-wide max any team pays for one player |
| `RESERVE` | default cap every team keeps for the season |
| `FILL_TO` | how many roster spots teams fill (of 20) |
| `SF_PREMIUM` | how hard teams pay up for a 2nd startable QB |
| `TASTE_SIGMA` | per-team valuation noise (bigger = more run-to-run variety) |
| `DEPTH_DISC` | fraction of market a team pays for bench depth |
| `STARTABLE` | min market $ to count as a starter at each position |
| `START` / `BENCH` | target roster shape (starters, then bench) every team builds toward |
| `ENFORCE_*` / `WHALE_RATIO` | the "bid up the whale" behavior (see comments; ruthless stress-test values are noted inline) |

### Per-team strategy (`TEAM_OVERRIDES`)

This is the main surface. Any team can override:

| Field | Effect |
|---|---|
| `aggression` | scales every bid |
| `reserve` | cap this team keeps (else global `RESERVE`) |
| `start` / `bench` | its own `{pos: n}` targets |
| `force_start` | rostered players to treat as owned starters (won't buy over them) |
| `startable` | per-team `{pos: $}` starter thresholds |
| `pos_cap` | hard max it bids for any one player at a position |
| `max_buy` | hard cap on how many it BUYS at a position |
| `pounce` | `{frac, min_market, max, skip:[pos]}` — reach for below-market elites |

The shipped block encodes The Witchcraft's 2026 plan: spend into the **starting
lineup** (WR1 upgrade first, a functional cheap QB2 instead of an elite one),
keep the RB1 keeper a starter with one RB2 + a backup, and hold ~$30 for
waivers. Retarget it by editing the dict (and the `TEAM` constant in the
reporting section) for a different team.

## Reading the output

- **Clearing prices** — mean and p10–p90 for marquee players, plus how often
  each was bought at all. Sanity-check these against your read of the room.
- **`<TEAM>, across sims`** — your average spend, leftover cap, elite buys, and
  final roster shape, plus the players you win most often. This is where you see
  whether a plan reliably delivers the pieces you want.
- **`--full`** — one complete league: every roster, each team's starting lineup,
  a consistency check (nobody broke-with-holes; everyone has 2 QBs), the
  enforcement log, and the top leftover free agents (a realism gut-check — these
  should be replacement-level, not stranded studs).

## Limitations

- Simple heuristics, not real managers — no nomination gamesmanship, bluffing,
  or grudges; rivals don't coordinate.
- Anchored to one external price set (Draft Sharks); your league's tastes differ.
- One realization per run — trust the distribution, not a single draft.
- The starting-lineup helper models QB+SF+2RB+2WR+TE+K and treats extra
  WR/RB as flex-eligible, but does not solve the optimal FLEX assignment.

## See also

- [`docs/references/ottoneu-strategy.md`](ottoneu-strategy.md) — the format economics the AIs approximate.
- [`docs/references/ottoneu-rules.md`](ottoneu-rules.md) — roster/lineup/cap mechanics.
- `scripts/roster_context_pack.py` (`just roster-context`) — the live roster/cap snapshot the sim reads from.
