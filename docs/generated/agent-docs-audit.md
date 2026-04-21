
### ✅ Confirmed accurate
- `AGENTS.md` and `CLAUDE.md` link targets are fully valid.
- Table schemas listed in `docs/generated/db-schema.md` accurately match the tables in `schema.sql`.
- Python testing commands (`pytest`) and typescript checks (`npm run lint`, `npx tsc`) exist and correctly correspond to `package.json` scripts and `Justfile` tasks.
- Frontend directory structure in `docs/CODE_ORGANIZATION.md` accurately reflects reality.
- `docs/COMMANDS.md` and `Justfile` are synced correctly.

### ⚠️ Needs update
- **Issue**: `docs/CODE_ORGANIZATION.md` referenced `data.ts`, `config.ts`, and `config.py` using short un-pathed filenames but they have been moved or always had different paths.
  **Reality**: `web/lib/data.ts`, `web/lib/config.ts`, and `scripts/config.py` are the correct paths.
  **Suggested Fix**: Update `docs/CODE_ORGANIZATION.md` with the full paths (Already fixed).
- **Issue**: Orphan documentation files in `docs/superpowers` (`docs/superpowers/plans/2026-04-19-build-system-just.md`, `docs/superpowers/specs/2026-04-19-build-system-design.md`) were undocumented and not referenced anywhere.
  **Reality**: They are out-of-date and no longer needed.
  **Suggested Fix**: Delete these files (flagged for review).

### 🔲 Gaps (undocumented but should be)
- No major gaps were found. The documentation covers all essential agent instructions.
