### ✅ Confirmed accurate
- All top-level references in CLAUDE.md and AGENTS.md map to existing files.
- Frontend documentation accurately reflects the Next.js routes, UI components, and TypeScript files.
- Command documentation in docs/COMMANDS.md accurately reflects Makefile targets and Python script names.
- Database schema documentation accurately reflects the tables defined in schema.sql.

### ⚠️ Needs update
- **File:** `scripts/update_projections.py`
  - **Claim:** Doc comment says it uses `v8_age_regression`.
  - **Reality:** Code uses `v12_no_qb_trajectory` as `ACTIVE_MODEL`.
  - **Fix:** Update doc comment to state `v12_no_qb_trajectory`.
- **File:** `AGENTS.md` and `CLAUDE.md`
  - **Claim:** Text tree maps missing recently generated diagnostic markdown files or formatting is incompatible with freshness checker.
  - **Reality:** Files like `player-diagnostics.md` and `feature-projections.md` exist but are unlinked or orphaned.
  - **Fix:** Refactored tree maps to use full markdown links (e.g., `[file.md](path)`).
- **File:** `docs/CODE_ORGANIZATION.md`
  - **Claim:** References \`sys.path\` and \`cli.py\` with backticks.
  - **Reality:** Breaks the automated path freshness checker regex.
  - **Fix:** Removed backticks and updated path to \`scripts/feature_projections/cli.py\`.

### 🔲 Gaps (undocumented but should be)
- None identified during this audit. Existing documentation adequately covers architecture, frontend, commands, and db schema.
