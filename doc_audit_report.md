# Documentation Audit Report

### ✅ Confirmed accurate
- `docs/COMMANDS.md` NPM commands (`dev`, `build`, `start`, `test`, `lint`) exactly match `web/package.json` scripts.
- Python virtual environment path logic in `AGENTS.md` and `CLAUDE.md` accurately directs to the `venv/bin/python` environment.
- Link tests run using `python scripts/check_docs_freshness.py --strict` are fully passing.
- Path descriptions (`CODE_ORGANIZATION.md`) match the project repository roots.

### ⚠️ Needs update
- **File:** `web/pnpm-lock.yaml` (Codebase reality vs `AGENTS.md` / `CLAUDE.md` instructions)
  - **Claim:** Both `AGENTS.md` and `CLAUDE.md` explicitly forbid the use of `pnpm`, stating "Strictly use `npm` for all frontend tasks (do not use `yarn`, `pnpm`, or `bun`)."
  - **Reality:** A `web/pnpm-lock.yaml` file exists in the repository alongside `package-lock.json`.
  - **Suggested Fix:** Delete `web/pnpm-lock.yaml` from the repository to enforce the NPM-only rule and prevent confusion.

### 🔲 Gaps (undocumented but should be)
- The command `npx tsc --noEmit` is listed in `docs/COMMANDS.md` under "Frontend", but there is no corresponding `typecheck` script defined within `web/package.json`'s `scripts` block to unify it, unlike `lint` and `test`. Consider adding `"typecheck": "tsc --noEmit"` to `web/package.json`.
- No significant undocumented areas discovered during this review cycle. All models, database connections, and command references seem to be appropriately mapped in the provided `.md` files.
