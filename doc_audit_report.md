# Documentation Audit Report

### ✅ Confirmed accurate
- `AGENTS.md` and `CLAUDE.md` accurately reflect the project structure, including the `docs/` folder contents, and contain no broken links.
- Build and execution commands (e.g., `npm run dev`, `python scripts/run_all_analyses.py`) accurately map to configurations in `Makefile` and `package.json`.
- The Next.js frontend tech stack and directory structures (e.g., `web/app/`, `web/lib/`, `web/components/`) described in `docs/FRONTEND.md` and `docs/CODE_ORGANIZATION.md` accurately match reality.
- The Python backend layout and data pipeline overview (e.g., `scripts/worker.py`, `scripts/enqueue.py`) accurately describe the file structure and mechanics.
- Development environment variables described in `docs/references/environment-variables.md` map perfectly to `.env.example` and `web/.env.local.example`.

### ⚠️ Needs update
There are no major mechanical inaccuracies across the `docs/` files or agent-facing markdowns (`AGENTS.md`, `CLAUDE.md`, `.github/pull_request_template.md`). However:
- **`docs/generated/db-schema.md`**:
  - **Claim**: "Ten tables, all with UUID primary keys."
  - **Reality**: While the file lists ten tables, there is technically an 11th table (`scraper_jobs`) that drives the job queue, which is mentioned in the "Schema Files" section but not in the tables list.
  - **Fix**: Update the intro sentence or list `scraper_jobs` in the markdown table.

### 🔲 Gaps (undocumented but should be)
- **`scraper_jobs` schema**: The `scraper_jobs` table (which drives the entire backend data pipeline) is mentioned in `docs/ARCHITECTURE.md` and `docs/generated/db-schema.md`, but its schema (e.g., fields like `status`, `task_type`, `depends_on`, `error_message`) is not fully documented in `docs/generated/db-schema.md`.
- **`.cursorrules` / `.github/copilot-instructions.md`**: These files do not exist. While `AGENTS.md` and `CLAUDE.md` exist and serve AI agents, standardizing across tools by adding a `.cursorrules` that points to `AGENTS.md` could be beneficial.
- **`package-lock.json`**: There is no explicit instruction to agents to avoid running `npm install` without care or forbidding `npm` usage over a specific package manager, although `npm` seems to be the default based on `Makefile` and `package-lock.json`. (Memory states "Never modify `package.json` or `tsconfig.json` without explicit user instruction.")
