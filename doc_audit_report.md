# Documentation Maintenance Audit Report

## ✅ Confirmed accurate
- `AGENTS.md` and `CLAUDE.md` link targets are all valid.
- `docs/CODE_ORGANIZATION.md` file paths are correct.
- `docs/COMMANDS.md` correctly lists commands in `Makefile` and `package.json`.

## ⚠️ Needs update
- **File**: `docs/ARCHITECTURE.md`
  - **Claim**: "The active production model (`v8_age_regression`) uses a surgical combination of features..."
  - **Reality**: The active model in `scripts/update_projections.py` is `v12_no_qb_trajectory`.
  - **Fix**: Update the reference to the active model and explain `v12_no_qb_trajectory` logic (which is based on `v8_age_regression` but disables snap trajectory for QB and K).

- **File**: `docs/COMMANDS.md`
  - **Claim**: Mentions `v1_baseline_weighted_ppg`, `v2_age_adjusted`, `v6_usage_share`, and `v8_age_regression` as examples.
  - **Reality**: Still functionally correct as examples, but `v12_no_qb_trajectory` is the current production model.
  - **Fix**: Update examples to refer to `v12_no_qb_trajectory` to be more relevant to the current state.

- **File**: `docs/generated/projection-accuracy.md` & `docs/generated/segment-analysis.md` & `docs/generated/player-diagnostics.md`
  - **Claim**: Contains data generated for previous models up to `v8_age_regression`.
  - **Reality**: Since `v12_no_qb_trajectory` is now active, these files likely need to be regenerated or updated to reflect the new model's performance.
  - **Fix**: These files should be regenerated. The command `python scripts/feature_projections/accuracy_report.py --run-backtest` and `python scripts/feature_projections/cli.py segment-analysis` should be run and the output committed.

## 🔲 Gaps (undocumented but should be)
- **Orphaned documentation files**
  - The script `scripts/check_docs_freshness.py` identifies several files that are not referenced in `AGENTS.md` or `CLAUDE.md`:
    - `docs/generated/projection-accuracy.md`
    - `docs/generated/player-diagnostics.md`
    - `docs/generated/segment-analysis.md`
    - `docs/exec-plans/feature-projections.md`
    - `docs/exec-plans/qb-usage-share.md`
  - **Fix**: Add links to these generated reports and execution plans in `AGENTS.md` or `CLAUDE.md` under the Documentation Map section, or delete them if they are obsolete. Given they represent output and historical plan/findings, linking them in the `docs/generated/` and `docs/exec-plans/` section of the Documentation Map in `AGENTS.md` and `CLAUDE.md` is recommended.