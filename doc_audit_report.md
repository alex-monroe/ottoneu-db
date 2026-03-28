# Documentation Audit Report

### ✅ Confirmed accurate
- `AGENTS.md` and `CLAUDE.md` accurately reflect the core project structure, including the `docs/` folder contents.
- Build and execution commands (e.g., `npm run dev`) accurately map to configurations in `Makefile` and `package.json`.
- Development environment variables map perfectly to `.env.example` and `web/.env.local.example`.

### ⚠️ Needs update
- **`AGENTS.md` and `CLAUDE.md`**:
  - **Claim**: The `Documentation Map` section lists all relevant files in `docs/`.
  - **Reality**: There are 5 orphan documentation files identified by `python scripts/check_docs_freshness.py`: `docs/generated/projection-accuracy.md`, `docs/generated/player-diagnostics.md`, `docs/generated/segment-analysis.md`, `docs/exec-plans/feature-projections.md`, and `docs/exec-plans/qb-usage-share.md`.
  - **Fix**: Update the `Documentation Map` section in both `AGENTS.md` and `CLAUDE.md` to include these 5 files.

### 🔲 Gaps (undocumented but should be)
- **Data Schemas**: The list of tables in `docs/generated/db-schema.md` states "Sixteen tables", but there are actually 16 tables listed below it, meaning it is technically accurate right now. There are no major gaps identified.
