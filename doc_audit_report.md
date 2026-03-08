### ✅ Confirmed accurate
- All file paths and links in `AGENTS.md` and `CLAUDE.md` accurately reflect existing files, and `schema.sql` matches the structure in `docs/generated/db-schema.md` (implicitly checked by freshness script).
- Key test configurations (`pyproject.toml`, `web/jest.config.ts`), dependencies (`requirements.txt`, `web/package.json`), and CI scripts (`.github/workflows/run-tests.yml`, `Makefile`) correctly match the testing and build setup described in `docs/TESTING.md`.
- `docs/references/environment-variables.md` aligns with `.env.example` and the variables used in `web/lib/auth.ts` and `web/lib/session.ts` (e.g. `ACCESS_PASSWORD`).
- Core python tests and `make` commands work as advertised.

### ⚠️ Needs update
- **`docs/CODE_ORGANIZATION.md`**
  - **Claim**: Line 27 refers directly to `` `config.py` ``.
  - **Reality**: While the file implies the config is in `scripts/config.py`, the backtick reference causes the doc freshness check (`scripts/check_docs_freshness.py`) to search for `config.py` at the project root, resulting in a false-positive path warning.
  - **Fix**: Update the reference to read `` `scripts/config.py` ``.

- **`AGENTS.md` & `CLAUDE.md`**
  - **Claim**: Neither file contains an explicit markdown link to `docs/exec-plans/market-projections.md` outside of raw code blocks.
  - **Reality**: `scripts/check_docs_freshness.py` flags `docs/exec-plans/market-projections.md` as an "Orphan documentation file". The script's regex fails to match the tree output in the map.
  - **Fix**: Add a markdown link like `[docs/exec-plans/market-projections.md](docs/exec-plans/market-projections.md)` to the "Quick Reference" sections of both files.

- **`docs/ARCHITECTURE.md`**
  - **Claim**: The analysis pipeline runs: `projected salary → VORP → surplus value → arbitration → arbitration simulation`.
  - **Reality**: The orchestrator (`scripts/run_all_analyses.py`) currently executes `update projections` as Step 0 and has added `projected arbitration` as Step 7.
  - **Fix**: Update the pipeline diagram to: `update projections → projected salary → VORP → surplus value → arbitration → arbitration simulation → projected arbitration`.

- **`docs/COMMANDS.md`**
  - **Claim**: Only lists `analyze_efficiency.py`, `run_all_analyses.py`, `analyze_projected_salary.py`, `analyze_vorp.py`, `analyze_surplus_value.py`, `analyze_arbitration.py`, `analyze_arbitration_simulation.py` under Analysis.
  - **Reality**: Misses `update_projections.py` and `analyze_projected_arbitration.py` which are actively run in `scripts/run_all_analyses.py`.
  - **Fix**: Add `python scripts/update_projections.py` and `python scripts/analyze_projected_arbitration.py` to the Analysis section of `docs/COMMANDS.md`.

### 🔲 Gaps (undocumented but should be)
- The orchestrator (`scripts/run_all_analyses.py`) has shifted to executing `update_projections.py` inline at the beginning (Step 0), making it a prerequisite step to generating other reports.
- While `docs/exec-plans/market-projections.md` exists, its role within the main analysis pipeline and frontend surface areas is not completely clear from the main documentation.
