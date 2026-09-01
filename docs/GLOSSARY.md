# Glossary

This repository mixes three specialist vocabularies. Most newcomers are fluent in at
most one of them, so nothing here assumes you know the others.

- **[Ottoneu & fantasy economics](#1-ottoneu--fantasy-economics)** — how the league
  works and how player value is priced
- **[NFL advanced stats](#2-nfl-advanced-stats)** — the input signals the projection
  model is built from
- **[Projection & evaluation methodology](#3-projection--evaluation-methodology)** — how
  a model is trained, judged, and shipped

Each entry is one or two lines with a pointer to the document that goes deep.

---

## 1. Ottoneu & fantasy economics

Full rules: [references/ottoneu-rules.md](references/ottoneu-rules.md).
Strategy and format economics: [references/ottoneu-strategy.md](references/ottoneu-strategy.md).

| Term | Meaning |
|---|---|
| **Ottoneu** | The fantasy platform this project is built around, hosted by FanGraphs. Unlike redraft leagues, rosters persist year to year under a salary cap. |
| **League 309** | The specific league this repo serves: 12 teams, Superflex, Half PPR. Its constants live in `config.json` — never hardcode them. |
| **Superflex** | A flex roster slot that may be filled by a QB. Because starting a second QB is almost always optimal, QBs carry a large premium in this format. |
| **Half PPR** | Half a point per reception, on top of yardage and touchdown scoring. Full scoring table in [references/ottoneu-rules.md](references/ottoneu-rules.md). |
| **Salary cap** | $400 per team, covering a 20-player roster. Every roster decision is a cap-allocation decision. |
| **Vickrey auction** | The blind 24-hour auction format Ottoneu uses: the highest bidder wins but pays the *second*-highest bid plus $1. Bid your true valuation, not one dollar above your guess of the field. |
| **Arbitration** | The annual (Feb 15 – Mar 31) mechanism where each team distributes a $60 budget across *opponents'* players, raising their salaries. It is how the league taxes underpriced stars. |
| **Arbitration tax** | The expected salary increase a visibly underpriced player will attract. Discount "legible" cheap stars accordingly — their surplus is partly illusory. |
| **Raise treadmill** | Every kept player's salary rises annually (+$4 active, +$1 inactive). Rosters must churn, because standing still means the cap tightens every year. |
| **Cut penalty** | Half the player's salary (rounded up) stays on your cap when you release them, plus a 30-day re-acquisition block. |
| **Keeper** | A player retained from the previous season, at their raised salary, instead of returning to the auction pool. |
| **PPG** | Points per game — `total_points / games_played`. The unit the season-long model projects. |
| **PPS** | Points per snap — `total_points / snaps`. An efficiency measure independent of playing time. |
| **Replacement level** | The production a team could get for free at a position. Here it is the *median* starter-quality player at that position across the league, not a fixed rank. |
| **VORP** | Value Over Replacement Player — `ppg − replacement_ppg` at the player's position. Turns raw scoring into positional scarcity. Kickers are excluded. Implemented in `web/lib/vorp.ts`. |
| **Dollar value** | VORP converted into auction dollars, by dividing the league's total spendable cap on above-replacement production by its total VORP. |
| **Surplus value** | `dollar_value − salary`. Positive means a bargain, negative means overpaid. This is the number most roster decisions turn on. Implemented in `web/lib/surplus.ts`. |
| **The Witchcraft** | The repo owner's team. Some views (e.g. `/projected-salary`) are written from its perspective. |

---

## 2. NFL advanced stats

These are the raw and derived signals sourced from [nflverse](https://github.com/nflverse)
and stored in `nfl_stats` and its sibling tables. Schema:
[generated/db-schema.md](generated/db-schema.md).

| Term | Meaning |
|---|---|
| **nflverse** | The open-source NFL data ecosystem this project pulls all its football statistics from. There is no paid data feed. |
| **Snap share** | The fraction of a team's offensive plays a player was on the field for. The cleanest available proxy for role. |
| **Target share** | The fraction of a team's pass targets that went to a given receiver. |
| **Air yards** | Yards the ball travels in the air on a throw, measured from the line of scrimmage — credited whether or not the pass is caught. Measures *intended* usage. |
| **Air-yards share** | A receiver's share of their team's total air yards. Distinguishes deep threats from short-area volume. |
| **WOPR** | Weighted Opportunity Rating — a blend of target share and air-yards share into a single receiver-usage number. |
| **RACR** | Receiver Air Conversion Ratio — receiving yards divided by air yards. How efficiently a receiver converts intended usage into production. |
| **xFP** | Expected fantasy points — points a player "should" have scored given their opportunities (carries, targets, field position), independent of whether the ball actually went in. Separates role from luck. |
| **Red-zone / goal-line usage** | Opportunities inside the opponent's 20-yard line (red zone) or 10 (goal line). Stored in `red_zone_usage`. A goal-line back's carries predict touchdowns as *role*, not luck. |
| **NGS** | Next Gen Stats — the NFL's player-tracking metrics. Stored in `ngs_passing` for QBs. |
| **CPOE** | Completion Percentage Over Expectation — how much better a QB completes passes than a model of difficulty says they should. More stable year to year than raw completion percentage. |
| **Air yards to sticks** | Average air yards relative to the first-down marker. Negative means a QB throws short of the sticks. |
| **Aggressiveness** | The share of a QB's throws made into tight coverage. |
| **Depth chart tier** | Opening-day role, normalized to `1` (starter) / `2` (backup) / `3` (deep reserve). Stored in `depth_charts`. Set before the season, so it is a leakage-free forward signal. |
| **Draft capital** | Where a player was selected in the NFL draft. The primary signal for projecting rookies, who have no NFL history. Stored in `draft_capital`. |
| **Implied team total** | The points a sportsbook's spread and over/under imply a team will score. A forward-looking proxy for offensive quality. Stored in `team_vegas_lines`. |
| **Coaching change** | Whether a team changed head coach in the offseason. Hires complete by January–February, so it is leakage-free for the coming season. Stored in `team_coaching`. |

---

## 3. Projection & evaluation methodology

How models are built and judged. The protocol is in [AGENTS.md](../AGENTS.md); the
reasoning behind it is in
[exec-plans/projection-methodology-audit.md](exec-plans/projection-methodology-audit.md).

| Term | Meaning |
|---|---|
| **Feature** | One leakage-free signal computed from a player's history, implemented as a class in `scripts/feature_projections/features/`. Examples: `weighted_ppg`, `age_curve`, `target_share_raw`. |
| **Model** | A named set of features plus weights, defined in `scripts/feature_projections/model_config.py`. 55 are defined; exactly one is in production. |
| **Combiner** | How a model turns feature values into a projection. `additive` sums weighted features; `learned` fits Ridge coefficients; `residual` adds a learned delta on top of a fixed base model. |
| **Active model** | The one model with `is_active = true` in `projection_models`. `update_projections.py` reads this at runtime — the model name is never hardcoded. |
| **Leakage** | Letting information from the season being predicted influence the prediction. It makes a model look excellent and perform badly. Avoiding it is the central discipline here. |
| **In-sample** | Scoring a model on the same seasons it was trained on. Flattering and misleading. `just accuracy-report` is in-sample and is a **secondary diagnostic only** — never a promotion gate. |
| **Held-out / out-of-sample** | Scoring a model on seasons it never saw during training. The only honest measure. Produced by `just holdout-eval`. |
| **Rolling-origin** | The evaluation protocol: repeatedly train on all seasons up to year *N*, predict year *N+1*, then roll forward. Mirrors how the model is actually used. |
| **Fold** | One train/evaluate split within that protocol. Cached under `.cache/holdout/` so re-runs are fast. |
| **LOSO** | Leave-One-Season-Out cross-validation, used when fitting learned model coefficients. |
| **Backtest** | Comparing stored projections against what actually happened. `just backtest <model>`. |
| **MAE** | Mean Absolute Error — average size of the miss, in PPG. The main *level* accuracy metric. |
| **RMSE** | Root Mean Square Error — like MAE but punishes large misses harder. |
| **Bias** | `mean(actual − projected)`. Positive means the model systematically under-projects. |
| **Spearman ρ** | Rank correlation between projected and actual ordering within a position. The *ordering* metric, which is what VORP, surplus, and auction decisions actually consume. |
| **Ranking gate** | Gating a change on the Spearman-ρ delta rather than the MAE delta. Ordering signal is stronger than level signal, so this catches wins the MAE test is blind to. |
| **Paired bootstrap** | Resampling players (clustered, so a player's seasons move together) to put a confidence interval on the difference between two models. |
| **Significant** | The confidence interval on the difference excludes zero. A raw point-estimate improvement is **not** a result and is not grounds for promotion. `just significance A B`. |
| **Promotion** | Flipping `is_active` to a new model via `just promote <model>`, after a significant held-out win. |
| **Baseline** | A deliberately simple model kept for comparison — `naive_prior_season_ppg` (last year's PPG) and `position_mean_baseline`. A change that can't beat these isn't earning its complexity. |
| **Regression to the mean** | Pulling extreme seasons toward the population average, because outlier performance is partly luck and doesn't fully repeat. |
| **Partial pooling / empirical Bayes** | Shrinking each player's estimate toward their position's mean, by an amount that depends on how much data backs it. Small samples get pulled harder. |
| **Huber loss** | A training loss that treats large errors linearly rather than quadratically, so outlier seasons (injury, role collapse) pull the fit less than under ordinary Ridge. |
| **Availability** | Expected games played. Kept deliberately separate from the per-game rate: `projected_ppg` is a rate, `projected_games` is the availability budget. |
| **Confirmation discipline** | Iterating against the rolling folds, and looking at the final window only once per experiment — so the held-out set doesn't quietly become a training set. |

---

## Where terms live in code

| Vocabulary | Python | TypeScript |
|---|---|---|
| League constants | `scripts/config.py` | `web/lib/config.ts` |
| Scoring rules | `scripts/feature_projections/external_sources/scoring.py` | `web/lib/scoring.ts` |
| VORP / surplus | — (lives in TypeScript) | `web/lib/vorp.ts`, `web/lib/surplus.ts` |
| Features | `scripts/feature_projections/features/` | — |
| Model definitions | `scripts/feature_projections/model_config.py` | — |
| Evaluation harness | `scripts/feature_projections/holdout_eval.py`, `significance.py` | — |

Both `config.json`-derived constant blocks are generated — run `just gen-config` after
changing `config.json`, and never hand-edit the marked blocks.
