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

### ✅ Confirmed accurate (New Findings)
- Code layout references and shared configurations (`config.json`, `scripts/config.py`, `web/lib/config.ts`) are structurally aligned.
- `CLAUDE.md`, `.cursorrules`, and `docs/COMMANDS.md` mention `venv/bin/python`, `make check-arch`, `npm run dev` and `npm test` reliably matching project configurations and `Makefile` entries.
- The `make check-arch` architectural tests exist in Next.js (`web/__tests__/lib/architecture.test.ts`) and Python (`scripts/tests/test_architecture.py`).
- Link freshness check `python scripts/check_docs_freshness.py --strict` executes without failing.

### ⚠️ Needs update (New Findings)
- **File:** `AGENTS.md`, `CLAUDE.md`, `.cursorrules` vs `web/pnpm-lock.yaml`
- **Claim:** "Strictly use `npm` for all frontend tasks (do not use `yarn`, `pnpm`, or `bun`)."
- **Reality:** We have a `pnpm-lock.yaml` file in the `web` folder alongside `package-lock.json`.
- **Fix:** (Flagged for human review) Remove `web/pnpm-lock.yaml` to enforce the rule explicitly stated in the documentation, or update the documentation if `pnpm` is intended.

### 🔲 Gaps (undocumented but should be) (New Findings)
- The methodology descriptions in `web/app/projections/page.tsx` and `web/app/arbitration/page.tsx` are hardcoded and must reflect the active model's feature set (`ACTIVE_MODEL` in `update_projections.py`), but there is no documentation linking these or outlining a process to update the UI when changing the model. `web/app/projections/page.tsx` is currently stale (shows `v8 — age_regression` instead of `v12_no_qb_trajectory`).
