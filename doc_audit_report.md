# Documentation Audit Report

### ✅ Confirmed accurate
- `docs/COMMANDS.md`, `Makefile`, and `package.json` accurately reflect the frontend package manager as `npm`.
- `docs/FRONTEND.md` and `docs/CODE_ORGANIZATION.md` accurately match the Next.js directory structure.
- Python data pipelines described in `docs/ARCHITECTURE.md` accurately match `scripts/worker.py` and `scripts/enqueue.py`.
- `docs/references/environment-variables.md` accurately maps to `.env.example` and `web/.env.local.example`.

### ⚠️ Needs update
- **`AGENTS.md` and `CLAUDE.md`**:
  - **Claim**: The `docs/` folder contents listed under "Documentation Map" are complete.
  - **Reality**: Several markdown files exist in `docs/` but are omitted from the map, causing `scripts/check_docs_freshness.py` to fail.
  - **Fix**: Add links to the orphan files (`docs/generated/projection-accuracy.md`, `docs/generated/player-diagnostics.md`, `docs/generated/segment-analysis.md`, `docs/exec-plans/feature-projections.md`, `docs/exec-plans/qb-usage-share.md`) in both `AGENTS.md` and `CLAUDE.md`.

- **`docs/generated/db-schema.md`**:
  - **Claim**: "Sixteen tables, all with UUID primary keys."
  - **Reality**: The file lists sixteen tables but the `scraper_jobs` table's schema fields (status, task_type, etc.) are entirely missing from the "Tables" table and the "Schema details" section despite it existing in `migrations/002_add_scraper_jobs.sql`.
  - **Fix**: Document the schema details of `scraper_jobs` in `docs/generated/db-schema.md`.

### 🔲 Gaps (undocumented but should be)
- The exact package manager directive (use `npm` only, never `yarn`/`pnpm`/`bun`) is clearly laid out in `.cursorrules`, `.github/copilot-instructions.md`, `AGENTS.md`, and `CLAUDE.md`, but there's a stray `pnpm-lock.yaml` in `web/` that could confuse agents or developers. It should probably be deleted, but as a documentation gap, agents could benefit from knowing *why* `npm` is strictly enforced despite the lockfile's presence, or the lockfile itself should just be removed to align codebase reality with documentation.
