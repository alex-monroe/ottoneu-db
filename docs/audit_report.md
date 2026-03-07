# Documentation Audit Report

## ✅ Confirmed accurate
* All basic system commands and Makefile targets listed in `docs/COMMANDS.md` exist and are configured properly (e.g. `npm run dev`, `python scripts/ottoneu_scraper.py`, `make check-arch`).
* Core architecture, system models, and testing guidelines in `docs/ARCHITECTURE.md`, `docs/TESTING.md` and `docs/GIT_WORKFLOW.md` accurately reflect current constraints and setup logic.
* Database relationships and basic schema structure reflect actual Supabase constraints.
* Agent instructions correctly point to project specific structures like `docs/` and valid `.env` paths for reference.
* Most of the frontend routes and configurations listed in `docs/FRONTEND.md` are accurately matching the existing Next.js App directory layout.

## ⚠️ Needs update
* **`docs/CODE_ORGANIZATION.md`**: Path references
  * *Claim:* Python config is at `config.py` and TS config syncs with `config.py`.
  * *Reality:* The file is at `scripts/config.py`.
  * *Fix:* Updated path references in the table and text to use `scripts/config.py`.
* **`docs/FRONTEND.md`**: Missing routes
  * *Claim:* Lists 6 main routes (`/`, `/projected-salary`, `/vorp`, `/surplus-value`, `/arbitration`, `/arbitration-planner`).
  * *Reality:* The `web/app/` directory contains more pages: `/api`, `/arbitration-simulation`, `/login`, `/players`, `/projection-accuracy`, `/projections`, `/rosters`, `/surplus-adjustments`.
  * *Fix:* Added all 8 missing routes to the routing table.
* **`docs/COMMANDS.md`**: Missing analysis commands
  * *Claim:* Lists all analysis scripts under the Backend section.
  * *Reality:* `scripts/update_projections.py` exists but was missing from the list.
  * *Fix:* Added `scripts/update_projections.py` to the command documentation.
* **`AGENTS.md` and `CLAUDE.md`**: Missing markdown links
  * *Claim:* All reference files are tracked.
  * *Reality:* `docs/exec-plans/market-projections.md` was an orphan documentation file without proper references.
  * *Fix:* Appended explicit markdown links to the file in both `.md` files under the Quick Reference section.

## 🔲 Gaps (undocumented but should be)
* **`docs/generated/db-schema.md`**: Outdated schema
  * *Claim:* Documents `arbitration_plans` and `arbitration_plan_allocations` tables.
  * *Reality:* These tables do not exist in the current `schema.sql`.
  * *Fix (Flagged for Review):* The tables should be removed from the schema documentation file, but as a low-risk documentation agent, I am flagging this rather than deleting documentation content directly.
* **Frontend local environment file:** The environment variable reference documentation mentions `web/.env.local` configuration needs to be set up, but there was no template or example file (`web/.env.local.example`) provided in the repository to guide new setups.
  * *Fix:* Created `web/.env.local.example` with the expected keys based on the instructions.
* **Missing documentation for `worker.py` continuous scheduling behavior:** The worker processing details (`worker.py`) should be better documented concerning how Playwright contexts are shared across job loops, especially for edge cases where the browser might crash.
