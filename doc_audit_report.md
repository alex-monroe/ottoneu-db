# Documentation Maintenance Agent Report

### ✅ Confirmed accurate
- `CLAUDE.md`, `AGENTS.md`, `.cursorrules`, and `.github/copilot-instructions.md` point to valid existing documentation files.
- Mentioned environment setups (`venv`) and frontend commands (`npm`) are correct and accurate according to latest usages.
- Project core logic commands mentioned in `docs/COMMANDS.md` correspond to existing files (`scripts/check_db.py`, `scripts/visualize_app.py`, `scripts/ottoneu_scraper.py`, etc).
- `docs/TESTING.md` accurately describes the test commands mapped in the Makefile.

### ⚠️ Needs update
- **File:** `docs/CODE_ORGANIZATION.md`
  - **Claim:** Mentions `data.ts` directly as the data layer location.
  - **Reality:** The file actually resides at `web/lib/data.ts`, and the freshness checker flagged the short name as a missing file.
  - **Fix:** Updated the path from `data.ts` to `web/lib/data.ts` to reflect the actual file location and pass the freshness checker.

### 🔲 Gaps (undocumented but should be)
- Playwright frontend verification (`npm run dev > npm_output.log &`) and explicit cache clearing strategy for local Next.js runs isn't prominently documented.
- Explicit requirement and details around test coverage plugin dependencies (like `pytest-cov`) for tests mentioned in `docs/TESTING.md` and `pyproject.toml`.
