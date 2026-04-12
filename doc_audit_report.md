# Documentation Maintenance Agent Report

### ✅ Confirmed accurate
- `CLAUDE.md`, `AGENTS.md`, `.cursorrules`, and `.github/copilot-instructions.md` all successfully point to valid existing documentation files.
- The `AGENTS.md` structural tests explicitly enforced by `scripts/tests/test_architecture.py` accurately reflect the project structure.
- Mentioned environment setups (`venv`) are correct and accurate according to latest usages.
- Project core logic commands mentioned in `docs/COMMANDS.md` correspond to existing files (`scripts/check_db.py`, `scripts/visualize_app.py`, `scripts/ottoneu_scraper.py`, etc).

### ⚠️ Needs update
- **File:** `docs/CODE_ORGANIZATION.md`
  - **Claim:** Referenced Python system path as `` `sys.path` `` inside the paths checker context.
  - **Reality:** Because of markdown backticks, `scripts/check_docs_freshness.py` mistakenly tracked it as a missing file requirement.
  - **Fix:** Changed `` `sys.path` `` to `sys.path` without code block backticks to comply with documentation freshness checker. (FIX APPLIED)
- **File:** `docs/CODE_ORGANIZATION.md`
  - **Claim:** Mentions `cli.py` in the root description for Python CLI layout mapping.
  - **Reality:** File has been moved or refers to `scripts/feature_projections/cli.py`. The freshness checker flagged it as missing.
  - **Fix:** Updated the reference to the actual file location `scripts/feature_projections/cli.py` to keep it correctly resolvable. (FIX APPLIED PREVIOUSLY)
- **File:** `docs/CODE_ORGANIZATION.md`
  - **Claim:** Mentions `` `data.ts` `` in analysis math.
  - **Reality:** The file path was not accurately captured for the check script.
  - **Fix:** Updated to `` `web/lib/data.ts` ``. (FIX APPLIED)
- **File:** `AGENTS.md` and `CLAUDE.md`
  - **Claim:** Mentions multiple files in the documentation tree without standard markdown explicit paths.
  - **Reality:** Since these files were listed in tree format, the `check_docs_freshness.py` script considered them "Orphan documentation files".
  - **Fix:** Updated `AGENTS.md` and `CLAUDE.md` to use proper markdown inline linking syntax for all nested documentation files in the tree view. (FIX APPLIED PREVIOUSLY)

### 🔲 Gaps (undocumented but should be)
- Playwright frontend verification (`npm run dev > npm_output.log &`) and explicit cache clearing strategy for local Next.js runs isn't prominently documented.
- Explicit requirement and details around test coverage plugin dependencies (like `pytest-cov`) for tests mentioned in `.github/workflows`.
