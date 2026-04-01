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
  - **Fix:** Changed `` `sys.path` `` to `sys.path` without code block backticks to comply with documentation freshness checker.
- **File:** `docs/CODE_ORGANIZATION.md`
  - **Claim:** Mentions `cli.py` in the root description for Python CLI layout mapping.
  - **Reality:** File has been moved or refers to `scripts/feature_projections/cli.py`. The freshness checker flagged it as missing.
  - **Fix:** Updated the reference to the actual file location `scripts/feature_projections/cli.py` to keep it correctly resolvable.
- **File:** `AGENTS.md` and `CLAUDE.md`
  - **Claim:** Mentions multiple files in the documentation tree without standard markdown explicit paths: `projection-accuracy.md`, `player-diagnostics.md`, `segment-analysis.md`, `feature-projections.md`, `qb-usage-share.md`, `market-projections.md`, `db-schema.md`, `experiment-log.md`, `projection-accuracy-improvement.md`.
  - **Reality:** Since these files were listed in tree format (e.g., `│   ├── projection-accuracy.md`), the `check_docs_freshness.py` script considered them "Orphan documentation files" missing from the explicit link map, though they were physically present in their respective `docs/` directories.
  - **Fix:** Updated `AGENTS.md` and `CLAUDE.md` to use proper markdown inline linking syntax for all nested documentation files in the tree view (e.g. `[projection-accuracy.md](docs/generated/projection-accuracy.md)`), fully resolving the orphan errors.

### 🔲 Gaps (undocumented but should be)
- Playwright frontend verification (`npm run dev > npm_output.log &`) and explicit cache clearing strategy for local Next.js runs isn't prominently documented.
- Explicit requirement and details around test coverage plugin dependencies (like `pytest-cov`) for tests mentioned in `.github/workflows`.
