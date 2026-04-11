# Documentation Audit Report

### ✅ Confirmed accurate
- `CLAUDE.md`, `AGENTS.md`, `.cursorrules`, and `.github/copilot-instructions.md` all successfully point to valid existing documentation files.
- The `AGENTS.md` structural tests explicitly enforced by `scripts/tests/test_architecture.py` accurately reflect the project structure.
- Mentioned environment setups (`venv`) are correct and accurate according to latest usages.

### ⚠️ Needs update
- **File:** `docs/CODE_ORGANIZATION.md`
  - **Claim:** Referenced `data.ts` in the table under `Data layer` and `Analysis math`.
  - **Reality:** `data.ts` does not exist in `web/lib/`, it was renamed to `players.ts`.
  - **Fix:** Fixed inline by changing `web/lib/data.ts` and `data.ts` references to `web/lib/players.ts` and `players.ts`.

### 🔲 Gaps (undocumented but should be)
- The need to install test coverage plugin dependencies (like `pytest-cov`) for tests is undocumented.
