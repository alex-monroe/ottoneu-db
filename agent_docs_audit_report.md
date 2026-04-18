# Agent Documentation Audit Report

### ✅ Confirmed accurate
- `AGENTS.md` and `CLAUDE.md`: All file links correctly resolve to existing paths.
- `docs/COMMANDS.md`: Commands align with scripts present in `scripts/` (e.g. `ottoneu_scraper.py`, `enqueue.py`, `worker.py`, `run_all_analyses.py`), `Makefile`, and `web/package.json` configurations.
- `docs/FRONTEND.md`: React/Next.js routes align with the `web/app/` directory paths correctly (e.g. `web/app/vorp`, `web/app/surplus-value`).
- `docs/TESTING.md`: Test scripts (`pytest` for Python and `jest` for TS) align with the `Makefile` and `web/package.json`.
- `docs/CODE_ORGANIZATION.md`: Core paths generally reflect reality (except the one `data.ts` fix).
- `.cursorrules` and `.github/copilot-instructions.md`: High-level directives correctly point to existing agent-facing documents like `docs/COMMANDS.md` and `docs/generated/db-schema.md`.

### ⚠️ Needs update
- **File:** `docs/CODE_ORGANIZATION.md`
- **Claim:** The "Analysis math" table row states it builds on `data.ts`.
- **Reality:** The file `data.ts` exists inside `web/lib/data.ts`, but the check script reads `data.ts` as a relative root path which fails.
- **Suggested Fix:** Change the reference to `web/lib/data.ts`. *(Applied)*

### 🔲 Gaps (undocumented but should be)
- *None identified:* The codebase provides a rigorous suite of agent documentation files mapped logically in `AGENTS.md` and enforced by architectural checks (`scripts/tests/test_architecture.py`, `scripts/check_docs_freshness.py`).
