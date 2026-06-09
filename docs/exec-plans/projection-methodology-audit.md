# Projection Methodology Audit (2026-06-08)

## Status: Active — remediation in progress

A data-science / ML-quality audit of the projection system: the feature
pipeline, the learned/residual combiners, the backtest harness, and the
experiment history recorded in
[experiment-log.md](../generated/experiment-log.md) and
[projection-accuracy.md](../generated/projection-accuracy.md).

The *engineering* is strong (composable features, a model registry, an
experiment log that records failures, pagination-correctness discipline, and a
genuinely sound two-stage residual design). The **evaluation methodology**,
however, has one structural flaw that undermines most model-selection
conclusions from `v20` onward, plus several secondary issues that make reported
gains look larger and more certain than they are.

This document is the system of record for the findings. Each finding has a
GitHub issue (linked below) for tracking remediation.

---

## 🔴 Finding 1 (Critical): train/test leakage in the headline accuracy numbers

**The headline `ALL MAE` for every learned/residual model (`v20`–`v31`) is
in-sample fit quality, not held-out accuracy.**

- `just train` defaults to `seasons="2021,2022,2023,2024,2025"`
  (`Justfile:122`).
- `just backtest` / `accuracy-report` default to
  `seasons="2022,2023,2024,2025"` (`Justfile:110,114`).
- The backtest (`scripts/feature_projections/backtest.py:62`) scores
  `model_projections` against actuals. For a learned model those projections
  come from coefficients fit on the **same** seasons being scored — the final
  fit in `train_ridge_loso` uses *all* data (`train_model.py:294-299`), and the
  saved coefficients then project every backtest season.

So the comparison table mixes in-sample scores (learned models `v20`–`v31`) and
genuinely out-of-sample scores (additive models `v1`–`v19`, which have no
learned parameters, and `external_fantasypros_v1`) in the same column and picks
winners from it.

**This is quantified in the log itself.** `v22` LOSO CV is `2.406` but its
reported backtest MAE is `2.380`; `v23` LOSO is `2.428`
([experiment-log.md](../generated/experiment-log.md), v23 row). That
~0.03–0.05 in-sample optimism is the *same order of magnitude as the entire
`v20`→`v31` "improvement" journey* (2.412 → 2.358 ≈ 0.054). The optimism grows
with model capacity (more features + interaction terms), so the leakage is
**correlated with the quantity being optimized** — it can reorder the ranking,
not just inflate it uniformly.

There is also an inconsistency in how the leakage was applied: the `/experiment`
skill trains on `2022,2023,2024` (leaving 2025 as a clean-ish holdout), while
the `Justfile` default and the `v31` retrain trained on all of 2021–2025. So
different experiment-log rows had different amounts of contamination.

**Remediation (this plan):**
1. **(shipped here)** Make the accuracy report honest: detect train/eval season
   overlap from each trained model's JSON, flag leaked models in the tables, and
   surface the out-of-sample **LOSO CV MAE** next to the in-sample backtest MAE
   so the optimism gap is visible. See `accuracy_report.py`
   `generate_leakage_section` / `--no-leakage-section`.
2. **(follow-up, Finding 1b)** Adopt a fixed held-out window — train on ≤2023,
   evaluate 2024–2025 for *all* models (additive, learned, external) — so every
   model is judged on the same untouched data. Re-rank everything; expect the
   ranking to compress.

---

## 🟠 Finding 2: backtest overfitting / multiple comparisons

31 model variants have been evaluated against the same four seasons (n≈154–274
each), and promote/verdict decisions are made on differences as small as 0.01
MAE (the `/experiment` `NEUTRAL` band is literally ±0.01). With that many looks
at one small dataset, some "winners" are sampling noise. No promotion decision
has been tested for significance.

**Remediation:** add a paired bootstrap over players for the MAE *difference*
between two models, and require a model to clear a significance/effect-size bar
(not just a point-estimate delta) before it is promoted.

---

## 🟠 Finding 3: survivorship/selection bias in the actuals (and it's circular)

The backtest only scores players with `games_played ≥ MIN_GAMES` (=4) in the
*target* season (`backtest.py:144`). Anyone who got hurt, benched, or busted out
of a role is dropped from the actuals. This (a) inflates every model's apparent
accuracy by removing the hardest cases, and (b) is self-defeating relative to
the roadmap: issue #384 (injury/availability, "24% of error budget") targets
exactly the population the evaluation filters out. You cannot measure progress
on availability while deleting unavailable players from the test set.

**Remediation:** add an availability-inclusive evaluation track (e.g. score
total season points, or PPG×games, with DNP/low-games seasons retained as
low-scoring outcomes) as a parallel metric.

---

## 🟠 Finding 4: single benchmark, unfairly compared, missing naïve baselines

`external_fantasypros_v1` is the only external yardstick, it is evaluated
out-of-sample against in-sample internal models (Finding 1), and it is matched
on fewer players (n=103–187 vs 154–274) so the `ALL` rows are not even the same
sample. Cheap honest baselines are missing: prior-season PPG (naïve persistence)
and a per-position mean. Notably, `v1_baseline` is already within ~0.05 MAE of
the best "improved" model on most positions — the most under-discussed result in
the log.

**Remediation:** add `naive_prior_season_ppg` and `position_mean` baseline
models; restrict cross-model `ALL` aggregates to the common matched-player set
when comparing against FantasyPros.

---

## 🟡 Finding 5: R² used as a cross-position / cross-season headline

R² depends on the variance of actuals within each slice, so comparing or
averaging it across positions and seasons conflates model skill with how
spread-out each group happened to be. K is correctly noted as "essentially
random" (R² ≈ −1) yet is still folded into `ALL R²`, and the combined report
already concedes R² is "indicative only" (`accuracy_report.py:190`).

**Remediation:** treat MAE/RMSE as the cross-cut headline; keep R² per-slice and
never weight-average it across heterogeneous groups in decision-making.

---

## 🟡 Finding 6: `ALL MAE` mixes positions of very different scale with a drifting mix

`ALL` pools QB (~3.7 MAE) with K (~1.0 MAE), implicitly weighting by how many of
each position cleared the games filter that year — a mix that drifts season to
season (2022 n=154 vs 2024 n=274). A model that merely changes the position mix
of qualifiers can look like an accuracy gain.

**Remediation:** report a position-balanced headline (per-position MAE then
averaged) alongside the pooled number.

---

## What the audit found to be sound (keep doing)

- **Two-stage residual design (`v25`)** — freezing the base, `fit_intercept=False`
  on a sparse feature so zero-feature samples get a provably zero correction,
  with the v23 coefficient-drift diagnosis as motivation. Correct ML reasoning.
- **"When a full refit wins" follow-up (`v27`)** — dense feature + more data lets
  a joint fit recover trapped bias. Right nuance, evidence-driven.
- **Rookie exclusion** from cross-model comparison (`backtest.py:123-149`).
- **Honest negative results** logged (v3–v6, v13, v24 null, v30).
- **Pagination-correctness audits** (the systemic 1000-row cap work).
- **LOSO CV already exists** — Finding 1's reporting fix is a surfacing change,
  not new infrastructure.

---

## Remediation tracking

| Finding | Severity | Issue | Status |
|---|---|---|---|
| 1 — train/test leakage (report honesty) | 🔴 | [#571](https://github.com/alex-monroe/ottoneu-db/issues/571) | shipped in this PR |
| 1b — held-out evaluation window | 🔴 | [#572](https://github.com/alex-monroe/ottoneu-db/issues/572) | open |
| 2 — bootstrap significance on MAE deltas | 🟠 | [#573](https://github.com/alex-monroe/ottoneu-db/issues/573) | open |
| 3 — availability-inclusive evaluation | 🟠 | [#574](https://github.com/alex-monroe/ottoneu-db/issues/574) | open |
| 4 — naïve baselines + matched-sample FP | 🟠 | [#575](https://github.com/alex-monroe/ottoneu-db/issues/575) | open |
| 5 — R² aggregation discipline | 🟡 | [#576](https://github.com/alex-monroe/ottoneu-db/issues/576) | open |
| 6 — position-balanced headline MAE | 🟡 | [#577](https://github.com/alex-monroe/ottoneu-db/issues/577) | open |
</content>
</invoke>
