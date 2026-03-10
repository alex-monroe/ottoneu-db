# Documentation Audit Report

## ✅ Confirmed accurate
- `AGENTS.md` and `CLAUDE.md` correctly reference `docs/COMMANDS.md`, `docs/FRONTEND.md`, and other existing architecture files. No orphaned or dead links exist.
- Build and run commands (`npm test`, `npm run dev`, `python scripts/run_all_analyses.py`) accurately map to configurations in `Makefile` and `package.json`. The package manager is `npm`.
- `docs/CODE_ORGANIZATION.md` accurately points to existing files and directories.
- Descriptions of the scraping pipeline (`run-scraper/SKILL.md`) correctly reflect `scripts/ottoneu_scraper.py` and job queue patterns in `scripts/worker.py`.
- Authentication flow descriptions in `docs/ARCHITECTURE.md` are aligned with actual implementations.

## ⚠️ Needs update

1. **`docs/generated/db-schema.md`**
   - **Claim:** "Nine tables, all with UUID primary keys."
   - **Reality:** There are exactly 10 tables explicitly listed in the markdown table, and all 10 have UUID primary keys (plus `scraper_jobs` which also has a UUID primary key, totaling 11 tables with UUID PKs).
   - **Fix:** Update text to "Ten tables, all with UUID primary keys" (or Eleven). Specifically, the document lists 10. I will update the text to "Ten tables, all with UUID primary keys."

2. **`.claude/skills/db-schema/SKILL.md`**
   - **Claim:** "The database ... contains six main tables... 1. players, 2. player_stats, 3. league_prices, 4. transactions, 5. surplus_adjustments, 6. player_projections"
   - **Reality:** There are 10 main tables in the application logic (`users`, `arbitration_plans`, `arbitration_plan_allocations`, and `nfl_stats` are missing from the numbered list).
   - **Fix:** Add the missing 4 tables (`users`, `nfl_stats`, `arbitration_plans`, `arbitration_plan_allocations`) and update the intro sentence to say "ten main tables".

## 🔲 Gaps (undocumented but should be)
- The existence of the `scraper_jobs` table (which drives the scraping pipeline) is barely mentioned in `.claude/skills/scraper-logic/SKILL.md` and `docs/generated/db-schema.md`, but its schema (with fields like `status`, `task_type`, `depends_on`) is not documented anywhere agents would easily see it.
- **Testing environment requirements**: The agent memory notes that testing Next.js UI components with `bun test` requires `jsdom` or an equivalent DOM environment setup. This is absent from `docs/TESTING.md`. (Note: Jest is used via `npm test` now, so `bun test` might not be standard anymore, but the `.env.local` vs `.env` test configurations could use clarification).

