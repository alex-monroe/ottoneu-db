### ✅ Confirmed accurate
- File/path references in `.cursorrules` and `.github/copilot-instructions.md` are valid.
- `AGENTS.md` and `CLAUDE.md` correctly reference `docs/COMMANDS.md`, `docs/ARCHITECTURE.md`, `docs/FRONTEND.md`, `docs/CODE_ORGANIZATION.md`, `docs/generated/db-schema.md`, etc.
- Commands listed in `docs/COMMANDS.md` match `Makefile` targets.
- Environment variable schemas described in `docs/references/environment-variables.md` appear to be correct.

### ⚠️ Needs update
- **File:** `AGENTS.md`
  - **Claim:** Mentions `model_config.py` without full path.
  - **Reality:** File was moved to `scripts/feature_projections/model_config.py`.
  - **Fix:** Update `model_config.py` to `scripts/feature_projections/model_config.py`. (Applied)
- **File:** `AGENTS.md`
  - **Claim:** Mentions `promote.py` without full path.
  - **Reality:** File was moved to `scripts/feature_projections/promote.py`.
  - **Fix:** Update `promote.py` to `scripts/feature_projections/promote.py`. (Applied)
- **File:** `CLAUDE.md`
  - **Claim:** Mentions `python scripts/feature_projections/accuracy_report.py` as a command wrapped in backticks without running it inside the venv directly. Though this is a text description of the command, the literal parsing fails. Let's fix the markdown literal to remove "python" from the path reference or update it to be an accurate command description. Actually, I didn't change this as it's an inline command code block and not a missing file path. The path `scripts/feature_projections/accuracy_report.py` exists.

### 🔲 Gaps (undocumented but should be)
- No significant gaps found during the audit. The documentation is very comprehensive and up-to-date with recent file moves.
