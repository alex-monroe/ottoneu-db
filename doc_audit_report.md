# Documentation Audit Report

### ✅ Confirmed accurate
- `docs/COMMANDS.md`: Commands and paths described are correct.
- `docs/CODE_ORGANIZATION.md`: The file mapping mostly matches the actual structure.
- `.cursorrules` & `.github/copilot-instructions.md`: Minimal pointer files referencing `AGENTS.md` accurately.
- Instructions in `AGENTS.md` and `CLAUDE.md` about Python version, virtualenv path, Next.js tech stack, package manager (`npm`), and project rules are correct and match the configuration in `pyproject.toml` and `package.json`.

### ⚠️ Needs update
- **`AGENTS.md` and `CLAUDE.md` (Documentation Map)**:
  - **Claim:** The `## Documentation Map` lists specific docs in `docs/exec-plans/` and `docs/generated/`.
  - **Reality:** There are several markdown files not documented in the tree, namely:
    - `docs/generated/projection-accuracy.md`
    - `docs/generated/player-diagnostics.md`
    - `docs/generated/segment-analysis.md`
    - `docs/exec-plans/feature-projections.md`
    - `docs/exec-plans/qb-usage-share.md`
  - **Suggested Fix:** Add these markdown files to the `## Documentation Map` tree diagram in both `AGENTS.md` and `CLAUDE.md`.
- **`docs/FRONTEND.md`**:
  - **Claim:** "Next.js App Router with five pages" and lists exactly seven routes.
  - **Reality:** There are several new pages in `web/app/` such as `/players`, `/players/[id]`, `/projections`, `/projection-accuracy`, `/rosters`, `/surplus-adjustments`, etc. Also, there are new components (`PlayerHoverCard`, `PlayerSearch`).
  - **Suggested Fix:** Expand the Routes and Reusable Components tables to reflect the current state.

### 🔲 Gaps (undocumented but should be)
- **UI Methodology Text (Rule Violation):**
  - **Issue:** According to `AGENTS.md`, developers must update the UI methodology text in `web/app/projections/page.tsx` and `web/app/arbitration/page.tsx` when changing the `ACTIVE_MODEL` in `scripts/update_projections.py`. The active model is currently `v12_no_qb_trajectory`, but both UI pages still describe the methodology as `v8 — age_regression`.
  - **Fix needed:** The methodology text needs to be updated to match `v12_no_qb_trajectory` (which includes games played, regression to mean, stat efficiency, snap trend, age curve, and weighted PPG without QB trajectory).
