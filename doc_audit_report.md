# Documentation Audit Report

### ✅ Confirmed accurate
- **Commands:** Commands listed in `docs/COMMANDS.md` correspond to real Makefile targets and `web/package.json` scripts.
- **Testing:** The testing methodology in `docs/TESTING.md` accurately describes `python -m pytest` and `npm test` setup.
- **Tech Stack:** The tech stack described in `docs/ARCHITECTURE.md` perfectly matches `pyproject.toml` and `web/package.json` (Python 3.9+, Next.js 16, React 19).
- **Code Organization:** File paths mapped in `docs/CODE_ORGANIZATION.md` are up to date and correctly match actual files like `scripts/config.py` and `web/lib/config.ts`.
- **Database Schema:** `schema.sql` and the migrations accurately reflect the described tables and architecture.

### ⚠️ Needs update
- **File:** `CLAUDE.md` and `AGENTS.md`
  - **Claim:** Pointed to `docs/exec-plans/market-projections.md` for the "market-based projection system implementation plan".
  - **Reality:** The market-based projection system was never built (`scripts/projections/` does not exist). Instead, a feature-based projection system was built in `scripts/feature_projections/` and documented in `docs/exec-plans/feature-projections.md` which was orphaned.
  - **Suggested/Applied Fix:** Replaced all references to `docs/exec-plans/market-projections.md` with `docs/exec-plans/feature-projections.md` in `CLAUDE.md` and `AGENTS.md`. `docs/exec-plans/market-projections.md` is now flagged as an orphan file and should be deleted since its contents refer to an unbuilt feature.

### 🔲 Gaps (undocumented but should be)
- **File:** `PROJECTIONS_IMPROVEMENTS.md`
  - **Issue:** It's in the repo root but not referenced in `AGENTS.md` or `CLAUDE.md` documentation map or anywhere else.
- **File:** `.claude/commands/`
  - **Issue:** There are multiple custom Claude commands (e.g. `run-analyses.md`, `projection-accuracy.md`, `run-tests.md`) and `.claude/skills/` built for this project. They are not explicitly listed in the main documentation map in `CLAUDE.md`.
- **File:** `.cursorrules` and `.github/copilot-instructions.md`
  - **Issue:** They exist and are accurate but are not mentioned in the overarching documentation map of `AGENTS.md` or `CLAUDE.md`.