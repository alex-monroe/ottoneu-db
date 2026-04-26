# Documentation Audit Report

### ✅ Confirmed accurate
- `AGENTS.md` and `CLAUDE.md` exist and their internal links have been checked using `check_docs_freshness.py`.
- `docs/COMMANDS.md` correctly references `requirements.txt` and python packages are up-to-date for scraping/analysis tasks.
- Web commands (`npm run dev`, `npm run build`, etc.) match `web/package.json` scripts.
- The shared configuration approach using `config.json` as the source of truth for both `scripts/config.py` and `web/lib/config.ts` is mechanically enforced via tests.
- `.env.local.example` in the `web` directory contains the correct environment variables for the frontend to authenticate with Supabase (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SESSION_SECRET`).

### ⚠️ Needs update
- **File:** `docs/CODE_ORGANIZATION.md`
  - **Claim:** Paths like `data.ts`, `config.py`, `config.ts`, `types.ts`, `scoring.ts`, `analysis.ts`, `arb-logic.ts` were listed without their parent directories.
  - **Reality:** Files are located in `web/lib/` or `scripts/`.
  - **Fix:** Added proper path prefixes (e.g., `web/lib/data.ts`, `scripts/config.py`). Applied directly.
- **File:** `AGENTS.md`
  - **Claim:** Did not mention historical plans/specs.
  - **Reality:** `docs/superpowers/plans/2026-04-19-build-system-just.md` and `docs/superpowers/specs/2026-04-19-build-system-design.md` existed but were orphaned.
  - **Fix:** Added a new section `Historical Plans & Specs` in `AGENTS.md` linking to these files. Applied directly.

### 🔲 Gaps (undocumented but should be)
- `check_db.py` relies on `league_prices` which seems to assume a single league or defaults to `LEAGUE_ID` from config, but `players` is queried directly.
- The migration flow instructions in `AGENTS.md` are detailed but do not explicitly mention how to revert or rollback a migration if something goes wrong.
