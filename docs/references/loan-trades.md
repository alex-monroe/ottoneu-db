# Loan trades — valuing a trade that carries a cap loan

`/loan-calculator` (gated on projections access) values a trade that includes a
cap loan for both teams. The math is in `web/lib/loan-trade.ts` (pure, tested in
`web/__tests__/lib/loan-trade.test.ts`); the page only gathers inputs.

## Why a loan trade splits cleanly in two

Two rules make the valuation separable:

- **A loan expires at the end of the regular season.** Nothing is repaid.
- **Every team starts the next season at a clean $400.** In-season cut penalties
  reset, and offseason cuts are free (see [ottoneu-rules.md](ottoneu-rules.md)).

So the loan itself has **no keeper consequence for either side**. Everything that
carries into next season rides on the players. A loan trade is:

> a player swap + a transfer of cap that only exists until the end of this regular season.

and each half is priced on its own terms.

### This season: title odds

Players and cap only matter this season through what they do to each team's
chance of winning **this** title. `simulateTitleOdds` runs the rest of the
regular season and a single-elimination playoff, before and after the trade:

- each team scores N(mean, sd) a week, where the mean is its best lineup by
  projected PPG (`projectedWeeklyPoints`, reusing `optimizeLineup`) and the sd
  is measured from this season's final games (`estimateWeeklySd`; 25 until
  enough games are final);
- seeds go by wins then points for (as in `standings.ts`); the top
  `PLAYOFF_TEAMS` make it, top seeds take any byes, and the bracket is fixed;
- "before" and "after" share one random stream, so the difference is the trade
  rather than simulation noise.

The change in title odds is priced at `titleValue` — the dollars of future keeper
surplus a whole title is worth to a manager. **It is the one input that cannot be
derived**; it is a preference, and the page asks for it. It applies to both
teams: a rebuilder with ~0% title odds is automatically indifferent to this
season without needing a "posture" flag.

The lender also gives up whatever its cap would otherwise have bought this
season (an in-season auction, absorbing salary elsewhere): `lenderCapValue`
dollars per loaned dollar, close to zero for a rebuilder at the deadline.

### Next season onward: keeper options

Because offseason cuts are free, a player's future is worth his keeper surplus
when it is positive and **nothing** when it is not — a call option, not an
expectation. `keeperOptionValue` simulates his dollar value as a random walk from
today's projected value (sd = `valueUncertainty` × value, floored at
`minValueSd`); each offseason his salary rises by `ANNUAL_RAISE_ACTIVE` and he is
kept only while his value covers it. A cut is permanent (re-buying him costs
market price, so no surplus). Later seasons are discounted by `keeperDiscount`.

Consequences worth knowing:

- **Volatility helps the receiver.** For a player near break-even, more
  uncertainty means more value, because the downside is capped at zero. That is
  why rebuilders should ask for young, wide-outcome players (QBs above all in
  superflex).
- **The borrower's future cost is the keepers it sends**, not the loan. An
  expensive veteran it takes on is normally cut for free in the offseason and
  costs nothing next year.

### Reading the result

Each side's net is title-odds value + keeper value received − keeper value sent
(− the lender's other uses of the cap). When both nets are positive the deal
works for both, and their sum is the gain the two teams are splitting: the
borrower could send up to its net in extra keeper value, or the lender could
accept up to its net less. "Keeper value per $100 loaned" is the lender's net
keeper gain divided by the loan — the price the loan fetched.

## Limits

- Team strength is a projected-PPG lineup: byes, injuries and weekly matchups are
  not modelled, and season-to-date results enter only through the standings.
- Keeper value starts from this season's projected dollar value with no aging
  curve, and arbitration is not modelled.
- The cap check counts roster salaries only — cut penalties and existing loans
  are not in the database.
- The bracket assumes no reseeding.

## Background: how common loans are

A one-off crawl of every public Ottoneu football league's trade history (October
2026; 58 live leagues, 3,092 accepted trades) found loans in ~73% of in-season
trades and essentially none in the offseason. The median loan was $30 (middle
half $12–$59), and loan sizes grew toward the trade deadline. That crawl is not
part of this repo; it motivated the calculator.
