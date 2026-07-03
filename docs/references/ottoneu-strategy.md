# Ottoneu Fantasy Football — Strategy Primer

**Purpose.** This is the document that does not exist on the public internet. AI models have
read extensive material on Ottoneu *baseball* (FanGraphs runs a regular column) and on standard
dynasty/redraft *football*, but almost nothing on **superflex Ottoneu football**. Without this
bridge, a model defaults to the nearest neighbor — standard dynasty — and silently imports wrong
assumptions: snake-draft thinking, no salary cap, no arbitration tax, no annual raise treadmill.

This file makes the format's emergent economics first-class, reasoning-ready concepts. It is meant
to be loaded as context whenever answering advanced roster-construction questions. Pair it with
[ottoneu-rules.md](ottoneu-rules.md) (the mechanics) and the live data (the market state).

Numbers below are specific to **League 309: 12-team, $400 cap, 20 roster spots, Superflex Half-PPR**.

---

## 0. The one-sentence mental model

> Ottoneu is not a draft game; it is a **continuous salary-cap economy** where you win by
> accumulating **surplus value** (production worth more than its salary) faster than 11 rivals,
> while the **+$4 annual raise** and **arbitration** constantly tax your best assets back toward
> fair price.

Every strategic question reduces to some version of: *"Does this move increase my expected surplus,
accounting for raises, arbitration, and roster-spot scarcity?"*

---

## 1. Surplus value is the unit of account (not points, not wins)

Raw projected points rank players. **Surplus value ranks *roster decisions*.** A player is only an
asset to the degree his production is worth more than what he costs.

This repo computes it concretely (`web/lib/surplus.ts`, `web/lib/vorp.ts`):

1. **VORP** — points per game above positional replacement level. Replacement level is the *median
   PPG of the bottom-salary quartile of rostered players at that position* (a "market consensus"
   replacement, not a fixed rank). Kickers are excluded from VORP.
2. **Dollar value** — total positive VORP across the league is mapped onto the *spendable* cap:
   ```
   total nominal cap   = 12 teams × $400        = $4,800
   spendable-on-surplus = $4,800 × 0.875         = $4,200   ← the 0.875 is from web/lib/surplus.ts
   dollar_per_VORP      = $4,200 / Σ(positive full-season VORP)
   ```
   The full league cap is **$4,800**. The `0.875` factor assumes ~87.5% of cap chases
   above-replacement production; the remaining ~12.5% (~$600) is the $1 minimum-salary floor every
   team pays for replacement-level roster filler, which isn't bidding on VORP. So `$4,200` is
   "spendable-on-surplus cap," **not** the total cap.
3. **Surplus = dollar_value − salary.**

**Keep/cut thresholds used in the app** (`analyzeProjectedSalary`):
`surplus ≥ +10` Strong Keep · `≥ 0` Keep · `≥ −5` Borderline · `< −5` Cut Candidate.

**Why this matters for AI answers:** When asked "is player X worth it," the model should reason in
surplus dollars, not points or name recognition. A $5 RB projected at $18 of value (+$13 surplus)
is a *better roster decision* than a $55 elite WR projected at $58 (+$3), even though the WR scores
far more points. The cheap player is the engine; the expensive star is just fairly priced.

---

## 2. Dollar-per-point inflation (the auction-economy lens)

There are 12 × $400 = **$4,800** of nominal cap, but only ~$4,200 effectively chases
above-replacement production (the rest is the $1-floor filler). Divide that by the league's total
positive VORP to get the going rate per unit of production — the `dollar_per_VORP` above. This rate
**is the market price of a point.** It is not fixed; it drifts with the projection set and roster
composition each season.

Practical consequences a model should apply:
- **"Fair price" is computable, not vibes.** Any player's fair auction price ≈ `dollar_value`. Bid
  to (and rarely above) that for stars; hunt for players the market will misprice *below* it.
- **Scarcity bends the rate.** A position with few above-replacement bodies (see §3, QB) commands a
  premium *per point* because demand for the scarce starting slots is inelastic.
- **Cap is always ~100% committed in a healthy league.** Unspent cap is wasted surplus. The
  question is never "can I afford X" in isolation — it's "what do I cut to afford X, and is the
  surplus swing positive."

---

## 3. The Superflex QB premium — quantify it, don't hand-wave it

Starting lineup is 1 QB + 1 Superflex, and a QB is almost always the optimal Superflex play. So the
league wants **~24 starting QBs** (12 teams × 2) out of roughly **~20–22 startable NFL QBs**.
Demand exceeds startable supply. This is the single biggest format-specific distortion.

Implications:
- **QB replacement level is brutal.** The 24th-best QB is a streamer; VORP at QB is steep at the top
  and craters fast. Elite QBs carry enormous dollar values relative to their fantasy-point lead over
  WR/RB, because their *positional* scarcity is extreme.
- **Owning 2+ startable QBs cheaply is a structural moat.** A team with two $15–25 QBs producing
  startable points has locked the scarcest resource at a discount; a team chasing QB on waivers
  every week is structurally behind regardless of its skill-position talent.
- **Rookie/young QBs are the highest-variance surplus lottery.** A cheap QB who hits a starting job
  is the most valuable cheap-keeper outcome in the format (ties to §4).
- **Do not let a model price QBs like a 1-QB league.** That is the most common cross-contamination
  error from standard-dynasty training data.

---

## 4. The raise treadmill (+$4/yr) and why churn is mandatory

Every player who appears in ≥1 NFL game gets **+$4** next season (+$1 if inactive). Salaries rise;
projected production does not automatically follow. So **surplus decays by ~$4/player/year unless
the player's value grows faster than his salary.**

- A $3 breakout becomes $7, $11, $15… You keep him only while `dollar_value` outruns the climbing
  salary. Strong-keep players are those whose value curve is still ahead of the treadmill.
- **Young/ascending players beat established stars as keepers**, because their value can grow into
  and past the raises; a 30-year-old star's value typically erodes *toward* his rising salary.
- This is the football analog of Ottoneu baseball's "$3 keeper" engine: the league is won in the
  cheap-surplus tier, churned annually, far more than in the marquee-star tier.

---

## 5. Arbitration is a progressive tax on winning

Feb 15–Mar 31: every team distributes a **$60 budget** across the other 11 teams, **$1–$8 each**,
**max $4 to any one player** (≤ $44 leaguewide per player). The money becomes permanent salary on
the targeted players.

Game-theoretic reading:
- **Arbitration punishes legible surplus.** The cheap stud everyone can see (a $6 player obviously
  worth $25) is the league's collective arbitration magnet. His surplus is partly an illusion — it
  will be taxed back toward fair price next offseason.
- **Build to be a small target.** Two roster shapes resist arbitration:
  1. **Already fairly priced** — few obvious bargains to tax.
  2. **Surplus spread thin** — many small edges rather than a few glaring ones; opponents can only
     send ≤$4/player, so diffuse surplus is hard to tax efficiently.
- **Spend your $60 to flatten the best rosters**, not to vent. Target opponents' *most legible,
  least-replaceable* bargains (a contender's cheap QB), where the raise most damages their cap
  flexibility. Coordinate-able but not collusive: the equilibrium already concentrates fire on
  obvious value.
- **Discount future surplus on cheap stars by expected arbitration.** A model valuing a $4 player at
  +$20 surplus should note that ~$10–16 of that may be arbitrated away over a year or two.

The repo has a Monte-Carlo arbitration simulation (see `web/lib/simulation.ts`, the `/arbitration`
page, and `scripts/scrape_arbitration_progress.py`) — prefer its outputs over hand-reasoning when
analyzing real allocations.

---

## 6. Roster-spot scarcity & the cut penalty

- **20 spots, hard cap.** A roster spot is itself a scarce asset; a $1 dart only earns its keep if
  its upside beats the best available FA for that slot. Hoarding low-upside $1s wastes spots that
  could hold lottery tickets (rookies, handcuffs to elite RBs, post-hype QBs).
- **Cutting costs half-salary (rounded up) as a cap penalty**, plus a 30-day re-acquisition block.
  So a player's *true* carrying cost includes his eventual cut penalty. Cutting a $40 bust still
  burns $20 of cap — sometimes the least-bad move, but never free.
- **Exception: offseason cuts are penalty-free** (verified on the finances page, July 2026 — see
  [ottoneu-rules.md](ottoneu-rules.md)). Between season end and the keeper deadline, cutting carries
  no lasting cap hit, so the in-season carrying-cost logic above does not apply to keeper decisions:
  a non-keep frees the full salary. This drives the annual offseason cut wave — unkeepable stars
  (post-raise, post-arbitration) hit the auction pool at reset prices, and league-wide auction
  purchasing power (= $4,800 minus kept salaries, concentrated in a few teams) sets what they
  clear at, not their prior salaries.
- **IR/PUP/NFI** don't count against the 20-spot limit but **do** count against the $400 cap.
  Stashing an injured high-upside player is cheap in roster-spot terms, costly in cap terms.

---

## 7. Trades & the cap-loan mechanic

Trades can include **cap-space loans that expire at end of regular season**. This enables a
contender to "rent" cap from a rebuilder mid-season. A model evaluating a deal should treat loaned
cap as a short-term-only asset and price surplus accordingly. Trade deadline is the day before
Thanksgiving; trades need 48h approval (7 of 12 votes to veto).

---

## 8. Contending vs. rebuilding — the two coherent strategies

Because surplus compounds and is taxed, there are two internally-consistent postures:

- **Contend:** Convert future surplus into present points. Spend up to fair value on stars, use
  cap loans, accept arbitration tax as the cost of winning now. Cheap keepers exist to *fund* star
  acquisition, not to be hoarded.
- **Rebuild:** Accumulate cheap, ascending, low-arbitration-profile surplus (young QBs above all),
  punt current-year wins, lend cap for future assets. Win the offseason, not the season.

The losing posture is the **muddled middle**: fairly-priced veterans everywhere, no cheap surplus
engine, no stars — a roster that is hard to arbitrate but also can't win or rebuild. A model should
flag when a proposed set of moves drifts into the muddled middle.

---

## 9. How an AI should answer a roster-construction question (checklist)

When reasoning about any advanced question, walk this explicitly:

1. **State the posture** — is this team contending or rebuilding? Answers differ.
2. **Work in surplus dollars**, derived from current `dollar_value` vs `salary`, not raw points.
3. **Apply the treadmill** — project salary +$4/yr and ask whether value keeps pace.
4. **Apply the arbitration tax** — discount legible cheap-star surplus; note QB targets.
5. **Respect the QB premium** — never price Superflex QBs like a 1-QB league.
6. **Check the constraints** — $400 cap (≈fully committed), 20 spots, cut penalties.
7. **Ground in the live market** — pull actual salaries/surplus/cap space for the 12 teams before
   asserting what's "cheap" or "fair" (see the data-context step / `/ottoneu-roster-question`).
8. **Name the trade-off and the second-order effects**, not just the first-order point gain.

---

## 10. Common cross-contamination errors to avoid

These are the mistakes that come from standard-dynasty training data. Explicitly avoid them:

- Pricing QBs as if only one starts (ignoring Superflex).
- Treating the draft as a snake (it's a blind Vickrey auction; bid = 2nd price + $1).
- Ignoring the cap entirely / valuing players in points instead of dollars.
- Forgetting the +$4 raise, so "keep everyone good" — the treadmill makes that cap-infeasible.
- Ignoring arbitration, so over-valuing legible cheap stars at face surplus.
- Hoarding $1 players with no upside instead of treating roster spots as scarce.
- Recommending cuts as if they're free (they carry a half-salary cap penalty).

---

## See also

- [ottoneu-rules.md](ottoneu-rules.md) — exact mechanics, scoring, dates, constants.
- `web/lib/vorp.ts`, `web/lib/surplus.ts`, `web/lib/arb-logic.ts` — the live formulas.
- `docs/generated/db-schema.md` — where salaries, projections, and arbitration data live.
- `.claude/commands/ottoneu-roster-question.md` — the skill that operationalizes §9.
