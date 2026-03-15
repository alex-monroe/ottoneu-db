# Documentation Audit Report

### ✅ Confirmed accurate
- `AGENTS.md` and `CLAUDE.md` correctly reference available architecture and domain logic files.
- `docs/COMMANDS.md` correctly lists working CLI commands for frontend dev, testing, linting and building.
- `.cursorrules` and `.github/copilot-instructions.md` accurately refer to `AGENTS.md`.
- `docs/ARCHITECTURE.md`, `docs/FRONTEND.md` correctly outline Next.js app structure, Tailwind configurations, and Supabase interaction.

### ⚠️ Needs update
- **File**: `schema.sql`
  - **Claim**: `docs/generated/db-schema.md` states the DB schema has "Eleven tables" and includes `arbitration_plans` and `arbitration_plan_allocations`.
  - **Reality**: `schema.sql` only contains 8 tables. `scraper_jobs` is created in `migrations/002_add_scraper_jobs.sql` but not replicated in `schema.sql`. `arbitration_plans` and `arbitration_plan_allocations` exist in `db-schema.md` and are referenced in migrations (like `012_add_users.sql` and `015_tighten_rls_policies.sql`) but their `CREATE TABLE` definitions are completely missing from `schema.sql`.
  - **Fix Suggestion**: Add the `CREATE TABLE` statements for `arbitration_plans` and `arbitration_plan_allocations`, and `scraper_jobs` to `schema.sql`.

### 🔲 Gaps (undocumented but should be)
- **File**: `docs/CODE_ORGANIZATION.md`
  - **Missing**: The `web/__tests__/` directory and its inner structures (e.g., `web/__tests__/lib/arb-logic.test.ts`, `roster-reconstruction.test.ts`) are not mapped in the *Key File Locations* table. Since frontend tests are crucial, pointing agents to where frontend testing files are located is necessary.
