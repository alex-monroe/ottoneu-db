# Stat-model ledger: naming, iteration protocol and experiment record

Started 2026-11-06. The single record of every stat-level model (`stat_*`) we try,
the rules for naming and evaluating them, and which one is the current champion.
Design: [00-synthesis.md](00-synthesis.md); parameters: [08-stability-study.md](08-stability-study.md).

**Current stat champion: `stat_a02_age`** (since 2026-11-07). Production (active) model:
`v44_eb_pooling_perpos`. Always confirm with `just list-models --check`.

## 1. Naming

`stat_<stage><NN>_<slug>`, e.g. `stat_a01_marcel`, `stat_a02_age`, `stat_b01_shares`.

- **`stat_`** marks the stat-level family. It is separate from the `vNN_` PPG
  lineage (v14…v44), so a stat model is never called "v45".
- **Stage letter** is the design layer from 00-synthesis §4:
  - **A**: per-stat shrinkage baseline (Marcel-plus), with no covariates beyond
    the player's own history, age and the position.
  - **B**: covariates on the volume layer (shares of team volume, depth chart,
    draft capital, Vegas totals).
  - **C**: hierarchical GLM.
- **`NN`** counts every variant tried in that stage, failures included. Numbers
  are never reused. A later stage starts from the current champion at `01`.
- **Slug** names what changed relative to the parent, not the whole model.
- The model's status in `model_config.py` is `baseline`, and stays so unless it
  is promoted to `production`.

## 2. Iterations are frozen configs

Each `stat_*` model has a `StatModelConfig` in `STAT_MODEL_CONFIGS`
(`scripts/feature_projections/stat_baseline.py`) and a `ModelDefinition` with
`features=["stat_model"]`. The runner looks up the config by model name.

- A new idea is a **new config field whose default reproduces the existing
  behaviour**, switched on only in the new model's config. Never change what an
  existing config does.
- `scripts/tests/test_stat_baseline.py::TestFrozenConfigs` pins `stat_a01_marcel`
  (config values plus golden projections) and checks that every `stat_*` model
  has a config. A failure there means an old experiment would no longer reproduce.
- Shared machinery (data prep, scoring) can be refactored freely as long as the
  pins hold.

## 3. Iteration protocol: two windows

The 2025 season is confirmation-only (#594): one look per candidate.
`stat_a01_marcel` has used its look. Everything else iterates on the
**iteration window** below.

| Step | Data | Commands | Decides |
|---|---|---|---|
| **Iterate** | 2023–2024 folds of the PPG harness + `stat-eval` on 2019–2024 | see §3.1 | champion / parked / rejected, against the **parent** |
| **Confirm** | full rolling 2023–2025 against the active model | the standard gate (`/experiment`) | promotion; once per candidate |

### 3.1 Iterate (per variant)

```bash
just project stat_aNN_slug 2023,2024          # never 2025 at this step
just stat-eval --model stat_aNN_slug --parent <parent>      # per-stat diagnostic, 2019-2024
just holdout-eval --protocol rolling --eval-seasons 2023,2024 --min-train-season 2021 \
  --models stat_aNN_slug,<parent>,<active>,naive_prior_season_ppg
just significance stat_aNN_slug <parent> --protocol rolling --eval-seasons 2023,2024 --min-train-season 2021
# plus --metric spearman --position <P> for QB/RB/WR/TE
```

`holdout-eval` rewrites `docs/generated/projection-holdout-eval-rolling.md`.
Restore it (`git checkout -- docs/generated/projection-holdout-eval-rolling.md`)
unless the run is a confirmation meant for the record.

**Verdicts** (each one gets a ledger row):

- **champion**: significant win over the parent on the iteration window (pooled
  MAE, or a position's ρ with pooled MAE not significantly worse). It becomes the
  parent for the next variant.
- **parked**: better point estimate, no significant regression anywhere, but not
  significant on its own. Several parked changes may be stacked into one new
  variant and tested together.
- **rejected**: worse, or a significant regression at some position.

Write the hypothesis in the row **before** running, so the ledger also counts
how many variants we tried (a guard against forking paths).

### 3.2 Confirm (per promotion candidate)

When the champion is competitive with the active model on the iteration window
(the CI of its MAE gap to the active model includes 0, or it is better), project
2025 and run the standard `/experiment` gate once against the active model. Log
that run here **and** as a row in [experiment-log.md](../../generated/experiment-log.md),
which stays the repo-wide record of promotion decisions. A significant win goes
live with `just promote stat_…` under its own name.

## 4. Ledger

Δ = model − comparator; MAE in PPG; ρ = within-position Spearman. "Iter" =
2023–2024 folds, "Conf" = full rolling 2023–2025.

| Model | Date | Parent | Change / hypothesis | Window | Pooled MAE (vs parent / vs active) | Per-position notes | Verdict | PR |
|---|---|---|---|---|---|---|---|---|
| `stat_a01_marcel` | 2026-11-06 | — | Stage A floor: per-stat recency-weighted rates (volume .65/.20/.15, rates .45/.32/.23), shrunk toward the 3-season position pooled rate with k fitted in-fold by next-season predictive loss; scored into PPG | Conf | 2.388 vs v44 2.152: Δ +0.216, CI [+0.139, +0.292], p<0.001. vs naive Δ −0.054, n.s. Iter (2023 / 2024 ALL MAE): 2.454 / 2.466 vs v44 2.207 / 2.221 | WR ρ significantly worse (−0.031); QB/RB/TE ρ n.s.; K better (1.34 vs 1.60). Over-projects on the gate population: QB +1.69, WR +0.90, RB +0.65, TE +0.46; removing that bias in-sample → ~2.24 | champion (Stage A floor); not promoted | #824 |
| `stat_a02_age` | 2026-11-07 | `stat_a01_marcel` | Hypothesis: an in-fold age adjustment per stat (fit on seasons before the target) removes most of a01's over-projection on the veteran-heavy gate population, closing ~2/3 of the gap to v44. Implementation: each shrunk stat × (1 + b1·x + b2·x²), x = clipped age − 27, (b1, b2) by weighted LS on a01 residuals in-fold; ages from new `players.nflverse_birth_date` (migration 064, 99%+ coverage) | Iter | 2.416 vs parent 2.460: Δ −0.044, CI [−0.076, −0.012], p=0.009 (**significant**). vs v44 2.214: Δ +0.184, CI [+0.088, +0.282] (v44 significantly better) | vs parent: WR ρ +0.013 (sig.); QB/RB/TE ρ n.s. vs v44 MAE: RB +0.25 and WR +0.25 sig.; QB +0.35 and TE +0.06 n.s. stat-eval PPG MAE vs parent: WR 2.318→2.238, RB 2.635→2.601. Fitted curves: RB carries ×0.82 at 32, WR targets ×0.87 at 32, QB volume flat. **Hypothesis only partly right:** ALL bias barely moved (−0.76 → −0.74; QB −1.70 → −1.72). The over-projection is concentrated in players with few prior-season games (QB 1–6 prior games: +3.1 PPG; 13–17: +0.6) | **champion** | #TBD |
| `stat_a03_role_prior` | planned | `stat_a02_age` | Hypothesis: shrinking every player toward one position-wide pooled mean over-projects part-time players (backups, spot starters), whose few games get pulled toward a starter-heavy average; this is the bulk of the remaining bias (study §2: a volume-tier prior mean helps QB/volume stats). Change: make the volume stats' prior mean depend on the player's role, e.g. weighted games played in the history window, fitted in-fold. Expect QB/RB MAE and bias to improve most | Iter | | | | |
