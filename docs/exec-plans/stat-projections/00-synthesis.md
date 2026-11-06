# Stat-level projection model: research synthesis and v1 design

Date: 2026-11-05. Status: research complete; nothing built yet.
Inputs (same folder):
- [01-football-analytics.md](01-football-analytics.md): public systems, stat stability, aging, TDs, games played
- [02-methodology.md](02-methodology.md): Marcel and sports-projection lineage, hierarchical Bayes, likelihoods, coherence, probabilistic scoring, tooling
- [03-weight-space.md](03-weight-space.md): weight-space programming, weight-space learning and merging, and the Bayesian weight-space view
- [04-internal-audit.md](04-internal-audit.md): data inventory, harness integration, lessons from 40+ experiments, baselines
- [05](05-information-calendar-external.md) / [06](06-vintages-and-internal-calendar.md) / [07](07-projection-calendar.md): information calendar, vintages, as-of data audit
- [08-stability-study.md](08-stability-study.md): our own YoY / split-half reliability, fitted EB pseudo-counts per stat, lag weights, team-share carry-over (sets Stage A parameters)

Each report tags claims as verified, from memory, or opinion. This synthesis inherits those caveats.

## 1. The core idea

Project each player's season as a **chain of stats** instead of a single PPG number:

```
games played  x  per-game opportunity            x  per-opportunity efficiency  ->  stat line  ->  scoring.py  ->  PPG
(own model)      (team volume x player share,       (catch rate, Y/T, Y/C, Y/A,
                  or QB attempts directly)           TD rate, INT rate, FG%)
```

Each link gets **its own amount of shrinkage**, set by how well that stat carries over from season to season. Simulating the chain gives a full stat-line *distribution*, not just a point estimate.

## 2. What the evidence agrees on

| Finding | External evidence | Internal evidence |
|---|---|---|
| Volume and role persist; efficiency and TDs are noisy | YoY r: targets/g ~0.69, QB rush att/g 0.89, YPRR ~0.58; TD rate 0.11-0.19, yards/target ~0.22, FG% ~0.05 (01 §2) | Role features (depth chart, regression, advanced receiving) were the only load-bearing ones in the #588 ablation (04 §3.2) |
| Shrinkage scaled by sample size is the main lever | Marcel; empirical-Bayes / hierarchical pooling (02 §1-2) | v44 EB pooling: the **only significant win** in 40+ experiments (04 §3.2) |
| Games played is its own low-signal model | Clay never projects 17/17; mortality tables (01 §4-5) | History haircut beat the structural games model (#587b) |
| Team totals must be coherent | Summing independent players inflates the league (01 §1.4) | Team denominators are fragile (#814 NULL `recent_team`); qb-usage-share v6 blew up (04 §3.3) |
| Data quality beats modeling | — | The #599 coverage backfill was worth more than any model change |

## 3. The tension, and how the design resolves it

The internal record contains a warning. Two decompositions that stripped out efficiency **lost**:
- **v42 xFP:** a tie.
- **v45 QB volume x regressed efficiency:** worse. *Fully* shrinking YPA, TD rate and INT rate removed real QB skill.

"Every same-data feature ties within ±0.02 MAE": PPG MAE is saturated and underpowered, with about 1.2k eval rows and about 62 QB clusters.

Implications for the new model:
1. **Fit shrinkage per stat and position from data; don't hand-set it.** Estimate each one by empirical Bayes inside each fold, the same method that made v44 win. This is what L5 lacked: it hand-set shrinkage to "fully regress" when it should have estimated partial shrinkage.
2. **Don't expect a big PPG MAE win from decomposition alone.** A model that matches v44 on PPG and adds the following is already a success:
   - per-stat projections
   - calibrated ranges
3. **Success criteria are multi-part** (§6): no significant PPG regression; a significant per-stat win over the naive baselines; and calibrated intervals. (Kicker accuracy is explicitly out of scope per the owner, 2026-11-05: K stays on a simple position-mean / team-context projection.)

## 4. The v1 model (recommended)

**Stage A: the Marcel-plus baseline.** This is the floor every later stage must beat. Build it first.
- Use `nfl_stats` from 2010+ and compute per-game and per-opportunity rates.
- Weight recent seasons [0.65, 0.20, 0.15], the weights tuned internally for v44. Marcel's 5/4/3 is the alternative to test.
- Shrink each stat toward the position mean with a **per-stat, per-position pseudo-count k**, estimated by method of moments or marginal likelihood inside each fold.
- Model games played separately, starting from the existing `expected_games.py` haircut.
- Scale rates to the league-season environment to absorb era drift: PPG fell from 6.67 to 5.46 between 2010 and 2025.
- Score through `scripts/scoring.py` into PPG and run the existing rolling harness.

**Stage B: covariates on the volume layer only.**
- Inputs: depth-chart tier, draft capital for players in years 1-3, Vegas implied total, prior team volume.
- Pass-catchers and RBs: target and carry *shares* of team volume.
- QBs: attempts modeled **directly**, never as a share. The QB attempt share is about 0.95, which is why v6 failed.
- TDs: shrunk rates with red-zone opportunity as the prior (`red_zone_usage`).
- Kickers: out of scope. Keep a simple position-mean or team-context projection.

**Stage C: a hierarchical GLM in PyMC/bambi or NumPyro.** This is the Bayesian weight-space view.
- Likelihoods:
  - counts: negative binomial with exposure offsets
  - rates: beta-binomial
  - yards per event: gamma
- Effects: player random effects, a team-season effect, a position hierarchy, and a spline age curve. Use years-in-league rather than age where birth-date coverage is survivorship-biased (18% in 2021).
- Team coherence: proportional scaling to team pools first, then a multinomial-logit share model.
- Output: posterior predictive draws, simulated jointly into fantasy-point distributions.
- Cost: full NUTS refits per fold are slow, so use empirical-Bayes closed forms or approximate inference for the iteration loop.

**Stage D (optional): a LightGBM residual** on the Stage C prediction (`init_score`). Accept it only on a significant held-out gain.

## 5. Experiment backlog, ranked by expected value per cost

| # | Experiment | Family | Why |
|---|---|---|---|
| 1 | Per-stat EB shrinkage baseline (Stage A) | Classical | Extends the one proven internal win to the stat level; cheap |
| 2 | Volume-layer covariates + team-share coherence (Stage B) | Structural | Role is the stable signal and the internal ablation agrees |
| 3 | Hierarchical Bayesian multi-output GLM (Stage C) | **Weight-space (Bayesian view)** | Partial pooling across positions and the stat chain; calibrated ranges for keeper/auction value |
| 4 | Shared global weights + per-position deltas, lambda tuned on an inner split | **Weight-space (task-vector view)** | Cheap structured pooling; equivalent to a low-rank linear hypernetwork |
| 5 | Weights written by an LLM from football knowledge alone, with no data fitting | **Weight-space programming** | A "prior-only" baseline: if fitted models barely beat it, they are overfitting. Novel and cheap |
| 6 | An LLM edits a fitted model's weights given its residual diagnostics | **Weight-space programming** | Direct test of the MIT idea on a small, readable model. Edits are chosen on an inner split (≤ t-2 → t-1), then scored once on the rolling folds |
| 7 | Time-varying coefficients (random walk / dynamic linear model) vs decay weights | Weight-space (time) | Tests whether league drift handling matters |
| 8 | TabPFN challenger per position | Weight-space (hypernetwork-like) | Possible upside on small positions. Licence and compute unverified |
| 9 | Comparable-player (PECOTA-style kNN) distributions | Classical | Captures tail risk, e.g. RB cliffs (RB "death rate" 33% at age 30) |
| — | Skip: neural functionals, re-basin, TIES/DARE, deep multi-task nets | | No model zoo; data too small |

Weight-space programming: "Sparks of Weight-Space Programming" (Takehi, Teoh, Zhang, Khattab, MIT CSAIL, blog post, 2026-11-02, not peer reviewed). In it, a frontier LLM reads and edits network weights directly, with no optimizer. Critics note the reading-side claims rest on toy problems. Experiments 5-6 are the faithful tests here. Their value is mostly scientific and diagnostic, and they are unlikely to beat fitted shrinkage.

## 6. Definition of done for v1 (runnable checks)

1. **Scoring parity:** a unit test comparing `scoring.py` on stored `nfl_stats` core columns with stored `total_points`, reporting the gap per position. `nfl_stats` has no fumbles, 2-pt conversions or FG/PAT misses, so decide whether to add them by migration or measure and accept the gap.
2. **Per-stat eval table** (a new harness diagnostic): MAE, bias and ρ per stat per position, against the naive prior-season rate and the shrink-to-position-mean baseline.
3. **PPG gate** (unchanged protocol):
   - `just holdout-eval --protocol rolling` + `just significance` vs the active model (`just list-models --check`; currently `v44_eb_pooling_perpos`, ALL MAE about 2.24, QB ρ 0.697).
   - Pass condition: no significant regression for v1; a significant win to promote.
4. **Calibration:** P10/P50/P90 coverage and CRPS per position, reusing the `keeper_value` CRPS code.
5. **Confirmation discipline:** iterate on the 2023-24 folds; look at 2025 once per experiment.

## 7. Data work needed first

- **Extras columns:** done in migration 060 (fumbles lost, 2-pt conversions, FG/PAT misses, plus sacks, air yards vs YAC, first downs, EPA). Backfill after merge.
- **Team-season volume table:** pass attempts, rush attempts, plays and dropbacks per team-season from nflverse play-by-play. Required for share coherence.
- **Own stability study (done 2026-11-06, see [08](08-stability-study.md)):** split-half and YoY reliability per stat per position from our data, plus target-share carry-over for players who change teams. This fills gaps that public research leaves (01 §8) and directly sets the shrinkage priors.
- Optional: weekly game logs (nflverse weekly; reachable but not persisted) for split-half reliability and in-season use. Routes run is unavailable from current sources.
- Refresh `docs/generated/projection-holdout-eval-rolling.md`, which is a stale June/v31 snapshot, before quoting per-position v44 numbers.

## 7b. Vintages: publish early, improve progressively

Owner requirement (2026-11-05): publish 2027 projections now and refresh them as information lands. The model is therefore **vintage-aware**: a projection of season T at date D uses only what was known by D. Canonical vintages:
- V0: in-season of T-1, weekly
- V1: Feb 15
- V2: Mar 31 (post-FA)
- V3: May 1 (post-draft)
- V4: Jun 15
- V4b: Aug 15 (camp; before the keeper deadline and auction)
- V5: Sep 8

The harness scores each vintage, and the deltas between adjacent vintages measure the value of each information window. Full calendar, data needs and storage design: [07-projection-calendar.md](07-projection-calendar.md).

## 8. Integration plan (keeps the downstream site unchanged)

- Store the stat line in a new table (e.g. `model_stat_projections`) or a jsonb column.
- Keep `model_projections.projected_ppg` filled with the **scored rate**, and `projected_games` separate. Don't double-count availability.
- Plug into `holdout_eval` as PPG predictions, so significance, balanced MAE, the Spearman gate and the cache work unchanged.
- Add the new modules to the `holdout_cache` fingerprint.

## 9. Proposed first three PRs

1. **Data:** a team-season volume table + extras-column decision + scoring-parity test + stability study notebook/report.
2. **Stage A:** a Marcel-plus stat baseline + per-stat eval diagnostic, run through the rolling harness vs naive and v44.
3. **Games-played wiring**, then Stage B.
