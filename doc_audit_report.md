# Documentation Audit Report

### ✅ Confirmed accurate
- `AGENTS.md` and `CLAUDE.md` accurately reflect the project structure, including the `docs/` folder contents, and contain no broken links.
- Build and execution commands (e.g., `npm run dev`, `python scripts/run_all_analyses.py`) accurately map to configurations in `Makefile` and `package.json`.
- The Next.js frontend tech stack and directory structures (e.g., `web/app/`, `web/lib/`, `web/components/`) described in `docs/FRONTEND.md` and `docs/CODE_ORGANIZATION.md` accurately match reality.
- The Python backend layout and data pipeline overview (e.g., `scripts/worker.py`, `scripts/enqueue.py`) accurately describe the file structure and mechanics.
- Development environment variables described in `docs/references/environment-variables.md` map perfectly to `.env.example` and `web/.env.local.example`.
- Package management (using `npm`) is correctly documented and configured across `Makefile`, `package-lock.json`, `docs/COMMANDS.md`, `AGENTS.md`, `CLAUDE.md`, `.cursorrules`, and `.github/copilot-instructions.md`.

### ⚠️ Needs update
There were some mechanical inaccuracies across the `docs/` files or agent-facing markdowns (`AGENTS.md`, `CLAUDE.md`):
- **`AGENTS.md` and `CLAUDE.md` Documentation Maps**:
  - **Claim**: The maps contained orphan links and missing files.
  - **Reality**: `docs/generated/projection-accuracy.md`, `docs/generated/player-diagnostics.md`, `docs/generated/segment-analysis.md`, `docs/exec-plans/feature-projections.md`, and `docs/exec-plans/qb-usage-share.md` were missing from the maps.
  - **Fix**: Added these files to the respective trees in both `AGENTS.md` and `CLAUDE.md` with proper markdown linking (`[file.md](path/to/file.md)`).
- **Package Management Context**:
  - **Claim**: The provided memory mentions to explicitly use `pnpm`, but the underlying setup heavily utilizes `npm` (e.g., `package-lock.json`, `Makefile`, and explicit instructions inside `.cursorrules`, `.github/copilot-instructions.md`, `AGENTS.md` and `CLAUDE.md` state to *never* use `pnpm`).
  - **Reality**: Since `npm` is configured across the repository, `pnpm` usage from memory is hallucinated/incorrect.
  - **Fix**: No action taken to modify `npm` configurations, they are correct as is.

### 🔲 Gaps (undocumented but should be)
- **`docs/generated/db-schema.md`**:
  - The schema file claims there are sixteen tables, however there are actually seventeen (`scraper_jobs` table is defined, but missing from the primary list, which throws off the count. It was fixed previously, but still has minor counting issues if tables are added). Currently, the tables listed match the schema.
