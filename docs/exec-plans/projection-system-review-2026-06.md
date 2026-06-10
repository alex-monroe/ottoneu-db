# Projection System Review (2026-06-10)

## Status: Active — implementation plan open

An expert review of four things: the projection methodology, the model
*evaluation* methodology, the software tooling for model development, and the
open-issue backlog. It builds on (and assumes) the
[methodology audit](projection-methodology-audit.md) and the #579 negative
result / backlog re-plan (PR
[#600](https://github.com/alex-monroe/ottoneu-db/pull/600)).

**Verdict in one paragraph.** The 2026-06 audit fixed the worst problem
(train/test leakage) and built a genuinely good honest harness (`holdout-eval`,
`significance`, `availability-backtest`, naïve baselines, matched mode,
balanced MAE). The remaining risk is that the *practices around* the harness
haven't caught up: the additive models' hyperparameters were themselves tuned
with sight of the holdout window, the single fixed holdout will decay as the
new experiment backlog iterates against it, the agent skills and CLAUDE.md
gates still describe the leaked workflow, and model selection runs entirely on
PPG-level MAE even though the downstream decisions (VORP, auction values,
keepers) depend on *ordering*. Each of these has a tracked issue and an
assignable work item below.

---

## Part 1 — Projection methodology

**Sound, keep:**

- The additive base-plus-adjustments design anchored to each player's own
  recency-weighted PPG. This is *why* `v14` survives out-of-sample while the
  ridge models drown in level drift: the level is carried per-player, only
  small corrections are modeled. The #590 delta-anchored experiment correctly
  generalizes this insight to the learned family.
- The two-stage residual pattern (`v25`) and the dense-feature/full-refit
  nuance (`v27` lesson) — correct ML reasoning, well documented.
- Feature-level leakage hygiene (e.g. `vegas_team_total` resolves the player's
  team from seasons strictly before the target; advanced receiving uses
  prior-season shares).
- Keeping `v14_qb_starter` in production after the #579 negative result.

**Gaps / opportunities (in value order):**

1. **Availability is the only large unmodeled error source** (+0.633 MAE /
   ~20% of `v14`'s availability-inclusive error; Finding 3). Rate accuracy is
   near a ceiling — persistence is within ~0.3 MAE of the best model and
   oracle-debiased learned models only tie `v14`. #587 is correctly the top
   experiment. Recommended staging inside #587: (a) a *constant
   expected-games haircut* first (project `ppg × E[games]/17` with a single
   per-position expected-games constant — this alone removes most of the −1.7
   avail bias and sets the bar), (b) then age/position/depth-role expected-games
   model, (c) injury-history features only if (b) leaves budget on the table.
2. **The eval/training population itself drifts** (qualifying N 154→398 across
   2022→2025, mean PPG 9.7→7.0 "largely coverage"). Nobody has root-caused
   whether that is ingestion completeness or reality; it contaminates
   positional means, learned intercepts, and cross-season comparability, and
   it directly conditions #591's premise. Tracked as
   [#599](https://github.com/alex-monroe/ottoneu-db/issues/599).
3. **QB-specific learned signal is real** (the one position where learned beats
   additive out-of-sample) — #592 is a sensible bounded bet.

## Part 2 — Evaluation methodology

**Sound, keep:** the audit's whole remediation stack — held-out re-ranking in a
sandboxed temp dir with identical filters for every model family; paired
bootstrap significance; availability-inclusive backtest with the rate/avail
split; persistence + position-mean floors; matched-sample mode; pooled-R²
discipline; balanced MAE. Negative results are documented rather than buried.
This is well above hobby-project standard.

**New findings from this review (not in the audit):**

- **Finding A — additive hyperparameter leakage.** `tune_age_curve.py` and
  `sweep_recency_weights.py` default to tuning on `2022,2023,2024,2025` — the
  age-curve params (#272), recency weights (#271), regression factor and
  backup-QB penalty embedded in `v14` were selected with sight of the
  2024–2025 holdout. The headline conclusion (v14 ≫ learned, Δ=0.263,
  significant) is structural and survives this; the *within-additive* ranking
  (v14 vs v19, Δ=0.006) does not. Worse, #589 as written ("tune the base
  against the held-out harness") would burn the holdout at the hyperparameter
  level — the exact mechanism of Finding 1, one floor up. Tracked as
  [#595](https://github.com/alex-monroe/ottoneu-db/issues/595); #589 should be
  blocked on it.
- **Finding B — the fixed holdout will decay.** Six planned experiments
  (#587–#592), each making accept/reject decisions against the same 2024–2025
  window, recreates the Finding 2 multiple-comparisons problem on the "honest"
  numbers. Remedy: rolling-origin (expanding-window) evaluation with the final
  window reserved for one confirmation look per experiment — also fixes the
  acknowledged 3-vs-5-training-season capacity handicap for learned models.
  Tracked as [#594](https://github.com/alex-monroe/ottoneu-db/issues/594).
- **Finding C — the bootstrap treats player-seasons as independent.** The same
  player appears in 2024 and 2025 as two "independent" paired errors, narrowing
  the CI. Cluster-resample by player (folded into #594).
- **Finding D — no decision-relevant metric.** Everything is PPG-level
  MAE/RMSE/bias, but the consumers (VORP, surplus, auction pricing) depend on
  within-position *ordering* and on the top tiers. #579 proved level and
  ranking dissociate in this system; no rank metric is reported anywhere.
  Add per-position Spearman ρ and top-N hit rate to the held-out report —
  tracked as [#598](https://github.com/alex-monroe/ottoneu-db/issues/598).

## Part 3 — Tooling

**Sound, keep:** the `just` recipe surface; the model registry +
feature registry; `holdout_eval`'s sandboxing (temp dir + monkeypatched
`TRAINED_MODELS_DIR`, dependency-ordered residual chains, train/eval overlap
guards); `significance` reusing `gather_predictions` so the two tools can't
disagree; generated-docs discipline; the experiment log as an institution.

**Gaps:**

1. **The agent skills still encode the leaked workflow** —
   `/experiment` trains on 2022–2024, backtests in-sample on 2022–2025, and
   issues IMPROVEMENT/REGRESSION verdicts vs `v20_learned_usage` ("current
   best"; actually rank ~22 held-out) on the ±0.01 band Finding 2 condemned.
   `/ablation` uses in-sample `hypothesis_test.py` with arbitrary thresholds.
   CLAUDE.md's "Projection Model Update Requirements" still gates PRs on the
   in-sample accuracy report, and the experiment-log format has no held-out or
   significance columns. Any implementation agent following the documented
   workflow will faithfully reproduce the leakage. This is the single
   highest-priority tooling fix — tracked as
   [#596](https://github.com/alex-monroe/ottoneu-db/issues/596).
2. **The honest harness is slow** — every `holdout-eval`/`significance` run
   retrains all learned models from scratch; friction pushes iteration back
   toward the fast leaked flow. A prediction cache keyed on
   (model, train window, eval window, model-def fingerprint) fixes it —
   tracked as [#597](https://github.com/alex-monroe/ottoneu-db/issues/597).
3. **Process hygiene** — the #579 re-plan commit sat unmerged on a branch with
   no PR (now PR [#600](https://github.com/alex-monroe/ottoneu-db/pull/600));
   until it merges, `main`'s experiment log lacks its in-sample warning header.

## Part 4 — Open-issue backlog (#587–#592)

The re-planned backlog is well grounded in the honest evidence; all six issues
have clear DoDs and the priority order (availability ≫ re-validation ≫ bounded
recalibration bets) matches the error-budget arithmetic. Two corrections:

- **#589 is currently a trap**: tuning the base against the held-out harness
  without an inner/outer split burns the holdout (Finding A). Block on #595.
- **#588/#590/#591/#592 should run on the rolling protocol** (#594) rather than
  hammering the single window, and **#591 should wait for #599** — if the
  2018–2020 "level match" is mostly a coverage artifact, its premise changes.

---

## Implementation plan

Assignable work items, in dependency order. Each wave's items are independent
and can go to separate implementation agents; every PR follows the standard
repo rules (branch off main, `gh pr create`).

### Wave 0 — housekeeping (no code)

| Item | Issue/PR | Size |
|---|---|---|
| Merge the #579 re-plan docs | [PR #600](https://github.com/alex-monroe/ottoneu-db/pull/600) (open, ready) | review-only |

### Wave 1 — harden the harness *before* running experiments (parallelizable)

| Item | Issue | Size | Key files |
|---|---|---|---|
| Rolling-origin protocol + player-clustered bootstrap | [#594](https://github.com/alex-monroe/ottoneu-db/issues/594) | M | `holdout_eval.py`, `significance.py` |
| Honest tuning protocol for additive hyperparameters | [#595](https://github.com/alex-monroe/ottoneu-db/issues/595) | S | `tune_age_curve.py`, `sweep_recency_weights.py`, `sweep_feature_combos.py` |
| Skill + CLAUDE.md + experiment-log refresh to the honest workflow | [#596](https://github.com/alex-monroe/ottoneu-db/issues/596) | S–M | `.claude/commands/*.md`, `CLAUDE.md`, `experiment-log.md` |
| Held-out prediction cache | [#597](https://github.com/alex-monroe/ottoneu-db/issues/597) | M | `holdout_eval.py`, `significance.py` |
| Rank-correlation + top-N hit-rate metrics | [#598](https://github.com/alex-monroe/ottoneu-db/issues/598) | S | `holdout_eval.py`, `availability_backtest.py` |

Recommended agent batching: (#594 + #597) together (both rework
`gather_predictions`); (#595, #596, #598) as three independent small tasks.

### Wave 2 — data investigation (parallel with Wave 1)

| Item | Issue | Size |
|---|---|---|
| Coverage-drift root cause + harmonized eval population | [#599](https://github.com/alex-monroe/ottoneu-db/issues/599) | M |

### Wave 3 — experiments (after Wave 1; use `/experiment` post-#596)

| Order | Item | Issue | Gate |
|---|---|---|---|
| 1 | Availability / expected-games model (staged: constant haircut → age/position model → injury history) | [#587](https://github.com/alex-monroe/ottoneu-db/issues/587) | `just availability-backtest` budget reduction + `just significance` |
| 2 | Honest feature ablation (keep/prune list) | [#588](https://github.com/alex-monroe/ottoneu-db/issues/588) | rolling holdout + significance |
| 3 | Tune base `weighted_ppg` | [#589](https://github.com/alex-monroe/ottoneu-db/issues/589) | **blocked on #595** |
| 4 | Level-matched training window 2018–2020 | [#591](https://github.com/alex-monroe/ottoneu-db/issues/591) | re-scope after #599 |
| 5 | Delta-anchored learned model | [#590](https://github.com/alex-monroe/ottoneu-db/issues/590) | bounded; stop on tie |
| 6 | QB-specific anchored model | [#592](https://github.com/alex-monroe/ottoneu-db/issues/592) | per-position significance |

### Standing rules for every experiment (post-review)

1. Iterate against the **rolling folds** (#594); the final window (2025, then
   2026 actuals) gets **one** confirmation look per experiment.
2. Promotion requires a **significant** held-out win over the active model
   (`just significance`), never a point-estimate delta.
3. Availability-touching work reports **both** rate and availability MAE.
4. Log held-out MAE + CI in the experiment log (format lands with #596).
