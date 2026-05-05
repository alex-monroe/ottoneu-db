## Audit Report for Agent/AI Documentation Files

### ✅ Confirmed accurate
- `AGENTS.md` - Target links all resolve correctly. The general rules, architectural rules, and project setup instructions appear accurate.
- `CLAUDE.md` - Target links all resolve correctly.
- `.github/copilot-instructions.md` - Rules reflect instructions from `AGENTS.md`.
- `.cursorrules` - Rules reflect instructions from `AGENTS.md`.

### ⚠️ Needs update
- **Issue 1:** `CODE_ORGANIZATION.md` references the files `data.ts`, `config.py`, and `config.ts` without their full directory path leading the checking script to falsely flag them as non-existent files.
  - **Doc File:** `docs/CODE_ORGANIZATION.md`
  - **Reality:** Files exist in sub-directories (`web/lib/data.ts`, `scripts/config.py`, `web/lib/config.ts`).
  - **Suggested Fix:** Provide the full repository-relative path in the code block (`web/lib/data.ts`, `scripts/config.py`, `web/lib/config.ts`).
  - **Status:** **Fixed**
- **Issue 2:** Superpowers specifications and plans were added but missing from the docmap in the AI instruction files.
  - **Doc File:** `AGENTS.md` and `CLAUDE.md`
  - **Reality:** The files `docs/superpowers/plans/2026-04-19-build-system-just.md` and `docs/superpowers/specs/2026-04-19-build-system-design.md` existed but weren't in the table of contents mappings.
  - **Suggested Fix:** Added the `superpowers/` directory block containing the new spec and plan references to both `AGENTS.md` and `CLAUDE.md`.
  - **Status:** **Fixed**

### 🔲 Gaps (undocumented but should be)
None identified.
