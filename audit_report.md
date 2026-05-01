### ✅ Confirmed accurate
- All paths referenced in `AGENTS.md` and `CLAUDE.md` exist.
- All paths listed in `docs/CODE_ORGANIZATION.md` (after fixes) map correctly to files in the repository.
- Command lists in `docs/COMMANDS.md` use the correct `just` recipes which correlate properly with the existing `Justfile`.
- Python testing architecture mentioned in `docs/TESTING.md` corresponds correctly to tests inside `scripts/tests`.
- Environment variable descriptions in `docs/references/environment-variables.md` accurately describe the provided `.env.example`.

### ⚠️ Needs update
- **Issue:** `docs/CODE_ORGANIZATION.md` referenced outdated or improperly formatted paths for `scripts/config.py`, `web/lib/config.ts`, and `web/lib/data.ts`.
  - **Reality:** Files were either incorrectly wrapped in backticks alongside directory paths, or pointed to incorrect directories.
  - **Fix:** Direct fix applied. Updated paths and path references in `CODE_ORGANIZATION.md`.
- **Issue:** `CLAUDE.md` and `AGENTS.md` failed to reference newly added superpower specification docs: `docs/superpowers/plans/2026-04-19-build-system-just.md` and `docs/superpowers/specs/2026-04-19-build-system-design.md`.
  - **Reality:** These files were orphaned and lacked agent visibility.
  - **Fix:** Direct fix applied. Injected these paths into the directory map structures in `CLAUDE.md` and `AGENTS.md`.

### 🔲 Gaps (undocumented but should be)
- The use of `just` vs `Makefile` was implemented but not broadly explained across all conceptual docs besides `COMMANDS.md`. `Justfile` acts as the primary task runner but other files occasionally reference older concepts. (However, no explicit stale `Makefile` targets exist).
- API routes inside `web/app/api/` (such as `admin`, `arbitration-plans`, `auth`, `surplus-adjustments`) exist but are minimally described in `docs/FRONTEND.md`. They could benefit from a dedicated section specifying API endpoints and their shapes.
