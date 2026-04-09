# Documentation Maintenance Agent Report

### ✅ Confirmed accurate
- `CLAUDE.md`, `AGENTS.md`, `.cursorrules`, and `.github/copilot-instructions.md` all successfully point to valid existing documentation files.
- The `AGENTS.md` structural tests explicitly enforced by `scripts/tests/test_architecture.py` accurately reflect the project structure.
- Mentioned environment setups (`venv`) are correct and accurate according to latest usages.
- Project core logic commands mentioned in `docs/COMMANDS.md` correspond to existing files (`scripts/check_db.py`, `scripts/visualize_app.py`, `scripts/ottoneu_scraper.py`, etc).

### ⚠️ Needs update
- **File:** `docs/ARCHITECTURE.md`
  - **Claim:** States the active production model is `v14_qb_starter`.
  - **Reality:** `scripts/update_projections.py` defines `ACTIVE_MODEL = "v12_no_qb_trajectory"`.
  - **Fix:** Update `docs/ARCHITECTURE.md` to state the active production model is `v12_no_qb_trajectory`.
- **File:** `web/app/projections/page.tsx` and `web/app/arbitration/page.tsx`
  - **Claim:** Hardcoded methodology texts describe the model as `v8 — age_regression`.
  - **Reality:** `scripts/update_projections.py` defines `ACTIVE_MODEL = "v12_no_qb_trajectory"`.
  - **Fix:** (Flagged for human review) Update the UI to reflect `v12_no_qb_trajectory` since these are application files, not documentation files.
- **File:** `.claude/commands/experiment.md`
  - **Claim:** Hardcodes `v20_learned_usage` as the "current best" model for comparisons.
  - **Reality:** The active model is `v12_no_qb_trajectory`, and it is not clear if `v20_learned_usage` should be hardcoded as best or updated.
  - **Fix:** (Flagged for human review) Consider updating the experiment command to reference the active or truly best model consistently.

### 🔲 Gaps (undocumented but should be)
- Explicit instruction on how to update frontend hardcoded methodology texts (`web/app/projections/page.tsx` and `web/app/arbitration/page.tsx`) when the `ACTIVE_MODEL` changes in backend configuration.
- Explicit documentation for Playwright frontend verification (`npm run dev > npm_output.log &`) and the local Next.js caching strategy.
