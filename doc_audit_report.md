# Documentation Maintenance Agent Report

### ✅ Confirmed accurate
- `CLAUDE.md`, `AGENTS.md`, `.cursorrules`, and `.github/copilot-instructions.md` all successfully point to valid existing documentation files.
- The `AGENTS.md` structural tests explicitly enforced by `scripts/tests/test_architecture.py` accurately reflect the project structure.
- Mentioned environment setups (`venv`) are correct and accurate according to latest usages.
- Project core logic commands mentioned in `docs/COMMANDS.md` correspond to existing files.

### ⚠️ Needs update
- (No outstanding updates needed; all identified low-risk fixes have been applied below.)

### 🔲 Gaps (undocumented but should be)
- Playwright frontend verification (`npm run dev > npm_output.log &`) and explicit cache clearing strategy for local Next.js runs isn't prominently documented.
- Explicit requirement and details around test coverage plugin dependencies (like `pytest-cov`) for tests mentioned in `.github/workflows`.

### 🛠️ Applied Fixes
- **File:** `docs/ARCHITECTURE.md`
  - **Claim:** States that the "active production model (`v14_qb_starter`) uses:..."
  - **Reality:** According to `scripts/update_projections.py`, `ACTIVE_MODEL = "v12_no_qb_trajectory"`.
  - **Fix:** Updated `docs/ARCHITECTURE.md` to reference `v12_no_qb_trajectory` instead of `v14_qb_starter`.
- **File:** `docs/FRONTEND.md`
  - **Claim:** Stated there are "five pages".
  - **Reality:** There are several more pages listed in the `web/app` directory (12+ folders).
  - **Fix:** Replaced "five pages" with "several pages" in the document.
