# Spike: Python 3.9 → 3.12 + pandas 1.5 → 2.x (GH #627)

**Status:** Spike complete **and upgrade shipped** (2026-06-14, #627). Verdict was GO;
the upgrade (Python 3.12 + pandas 2.3.3, `nfl_data_py==0.3.2`) landed in the same issue.
Numerical equivalence confirmed: the rolling holdout MAE/bias/R²/RMSE/ranking tables for
`v33_tuned_base` + baselines were **byte-identical** on 3.9/pandas 1.5.3 vs 3.12/pandas
2.3.3 (eval 2024+2025, `--no-cache`). This document is retained as the rationale record.

## Method

Timeboxed spike in a throwaway environment, no changes to the tracked repo:

- Installed a standalone CPython **3.12.13** via `uv python install 3.12`.
- Built a fresh venv and resolved the project's dependency set **unpinned**.
- Ran the **full Python test suite** against it.
- Probed the `nfl_data_py` ↔ pandas 2.x compatibility directly (the issue's gating question).

## Findings

### 1. Gating blocker — `nfl_data_py==0.3.3` hard-pins `pandas==1.5.3`

This is the one real blocker. `nfl_data_py==0.3.3` declares an **exact** `pandas==1.5.3`
dependency. On Python 3.12 that pin fails outright: pandas 1.5.3 ships no 3.12 wheels and
its sdist build breaks (3.12 removed `distutils`/`pkg_resources` assumptions). So the
current pin and the upgrade are mutually exclusive.

Resolution options (pick in the upgrade PR):

| Option | Change | Pros | Cons |
|---|---|---|---|
| **A. Pin `nfl_data_py==0.3.2`** | one-line dep change | smallest diff; **same API** (`import_*` functions); allows modern pandas | 0.3.2 is older; verify the data it returns is unchanged vs 0.3.3 |
| **B. Migrate to `nflreadpy`** | rewrite scraper/backfill calls | actively maintained successor; future-proof | **polars-based**, different API — a real rewrite across `scripts/tasks/` + backfills |

`nfl_data_py==0.3.2` resolves cleanly with both pandas 2.3.3 and 3.0.3 and imports on
3.12 with all `import_*` functions present. **Recommended: start with Option A** (relax to
0.3.2 + pin pandas to 2.x), and treat the `nflreadpy` migration as a separate, later effort.

### 2. The rest of the stack is already 3.12-ready

With `nfl_data_py==0.3.2` and `pandas>=2.2,<3` (resolved to **pandas 2.3.3**, numpy 2.x),
the full project dependency set — `playwright`, `supabase`, `python-dotenv`,
`scikit-learn`, `requests`, `beautifulsoup4`, `lxml`, `pytest` — installed cleanly on 3.12.

### 3. Test suite is green on 3.12 + pandas 2.3.3

```
1451 passed, 67 skipped in 4.81s
```

Only two warnings, neither version-blocking:

- `DeprecationWarning: datetime.datetime.utcnow()` at `scripts/feature_projections/train_model.py:464`
  (the project has **2** `utcnow()` call sites total) — switch to
  `datetime.now(timezone.utc)` in the upgrade PR.
- A pre-existing `RankWarning` from `np.polyfit` in `projection_methods.py` — unrelated to the version bump.

### 4. Not yet verified in the spike (do in the upgrade PR)

The spike covered the gating question (deps + unit suite). Still to confirm before merge,
per the issue's acceptance criteria:

- **Numerical equivalence**: one `just backtest <active>` and one
  `just holdout-eval --protocol rolling …` on the new stack, compared against the active
  model — projection outputs must not silently change (pandas 2.x groupby/NA/dtype
  semantics differ). Rerun the holdout gate as confirmation.
- One **scraper dry-run** (`nfl_data_py` 0.3.2 fetch path) end-to-end.
- **pandas perf claim**: the issue cites 2.x speedups on backtests/holdout/sweeps — measure
  the actual wall-clock on a real backtest before/after rather than assuming.

## Recommended upgrade PR scope (when scheduled)

1. `pyproject.toml`: `requires-python = ">=3.12"`, `nfl_data_py==0.3.2`, `pandas>=2.2,<3`
   (deliberately stay on 2.x, not the brand-new 3.0), bump `numpy`. `just lock`.
2. CI: `python-version` → 3.12 across `run-tests.yml`, `update-projections.yml`,
   `offseason-data-refresh.yml`. Devcontainer base image → 3.12.
3. Fix the two `datetime.utcnow()` call sites.
4. `just doctor` resolves the editable-finder path under `venv/lib/python3.9/...` — update
   the version-specific glob (it already globs `python*`, but re-verify) and any docs that
   hardcode `python3.9` (TESTING.md gotcha section references the 3.9 finder filename).
5. **Delete the "Python Style / target 3.9 / no `X | Y`" section from CLAUDE.md** — the
   recurring agent-correction tax this issue calls out goes away.
6. Confirmation: full suite + one experiment loop green; holdout numbers vs active model
   unchanged or deltas explained; venv rebuild (`just install`) documented.

## One-line verdict

**GO.** Python 3.12 + pandas 2.x is viable with no code rewrite — the only blocker is the
`nfl_data_py==0.3.3` `pandas==1.5.3` pin; relax to `0.3.2`. The full unit suite passes on
3.12/pandas 2.3.3; remaining work is numerical-equivalence confirmation + the dep/CI/style
cleanup, sized as a normal medium PR rather than the original "high" estimate.
