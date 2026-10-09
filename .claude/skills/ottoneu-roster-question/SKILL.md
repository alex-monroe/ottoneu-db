---
name: ottoneu-roster-question
description: Answer an advanced Ottoneu roster-construction question, grounded in format strategy and live league data
---
Use this skill for any non-trivial roster-construction, keeper, trade, auction, or arbitration
question about League 309. It forces format-correct reasoning instead of generic dynasty advice.

The user's question is in the arguments. If empty, ask what they want analyzed.

Follow these steps:

1. **Load the format model.** Read `docs/references/ottoneu-strategy.md` (economics + reasoning
   checklist) and `docs/references/ottoneu-rules.md` (exact mechanics). These override any default
   dynasty/redraft assumptions. Superflex QB premium, the +$4 raise treadmill, arbitration tax, and
   surplus-as-unit-of-account are all in play.

2. **Pull the live market.** Generate the current roster-economics snapshot so the answer is
   grounded in real salaries and production, not vibes:
   ```bash
   just roster-context              # e.g. just roster-context --season 2026 --source projection
   ```
   The pack follows the season phase: **in season** it shows this season's actual PPG and games
   played; **offseason** it shows this site's preseason projected PPG.
   For surplus/VORP/dollar-value or keep-cut specifics, the source-of-truth formulas live in
   `web/lib/vorp.ts` and `web/lib/surplus.ts` (`dollar_per_VORP = $4,200 / total_positive_VORP`;
   keep thresholds: surplus ≥+10 Strong Keep, ≥0 Keep, ≥−5 Borderline, <−5 Cut). For arbitration
   targeting, prefer the `/arbitration` page's Monte-Carlo sim over hand-reasoning.

3. **Pick the right production source for the time of year.** This site's projection model is
   a *preseason* product, built so arbitration and the auction have a forward-looking number when
   no public projections exist. It is not updated in season and is known to be inaccurate, so:
   - **In season (trades, keep/cut, waivers, start/sit):** do not use the preseason projections
     or the Draft Sharks auction values. Weigh, in order: this season's actual production and
     usage; `get_weekly_projections` (Sleeper, per game, via the league MCP server); and public
     rest-of-season and dynasty rankings and news (search the web). Treat surplus computed from a
     few games of PPG as noisy, not settled.
   - **Offseason (arbitration, keepers, auction):** the preseason projections are the intended
     input. Still cross-check with public rankings once they are published.
   Name the source behind every production number you cite.

4. **Walk the §9 reasoning checklist explicitly** from the strategy primer:
   - State the team's posture (contend vs. rebuild) — answers differ.
   - Reason in **surplus dollars**, not raw points.
   - Apply the **+$4/yr treadmill** to future salary.
   - Apply the **arbitration tax** — discount legible cheap-star surplus; flag QB targets.
   - Respect the **Superflex QB premium** — never price QBs like a 1-QB league.
   - Check constraints: $400 cap (≈fully committed), 20 spots, cut penalties.

5. **Answer with numbers and named trade-offs.** Cite the actual salaries, cap space, and
   production you pulled, with the source of each. State second-order effects (raises,
   arbitration, roster-spot opportunity cost), not just the first-order point gain. Flag if a
   proposed plan drifts into the "muddled middle" (§8).

6. **Avoid the §10 cross-contamination errors** (snake-draft thinking, 1-QB pricing, ignoring cap /
   raises / arbitration, free cuts, $1-hoarding). If the user's framing contains one, correct it.
