# Documentation Audit Report

### ✅ Confirmed accurate

- The path references inside `CODE_ORGANIZATION.md` accurately correspond to real project files.
- The majority of internal documentation links across `AGENTS.md` and `CLAUDE.md` correctly reference existing targets.
- The Python target configurations and required setup conventions match codebase norms (using `venv/bin/python`).
- Next.js development workflow and commands specified in `COMMANDS.md` remain valid (with package manager fix).
- Data models and schemas documented in `docs/generated/db-schema.md` accurately reflect the 16 tables in the current SQL schema.

### ⚠️ Needs update

- **Issue:** All agent documents incorrectly mandated the use of `npm`. The repository exclusively uses `pnpm` (as evidenced by `pnpm-lock.yaml`).
  - **Doc files:** `CLAUDE.md`, `AGENTS.md`, `.cursorrules`, `.github/copilot-instructions.md`, `Makefile`, `docs/COMMANDS.md`.
  - **Fix:** Swapped `npm` commands for `pnpm` globally in these documentation and configuration files.

- **Issue:** Orphan files not linked in agent instructions.
  - **Doc files:** `docs/generated/projection-accuracy.md`, `docs/generated/player-diagnostics.md`, `docs/generated/segment-analysis.md`, `docs/exec-plans/feature-projections.md`, `docs/exec-plans/qb-usage-share.md`
  - **Reality:** These files exist but were hidden from agents because they were omitted from the `## Documentation Map`.
  - **Fix:** Added missing document links into `AGENTS.md` and `CLAUDE.md` to properly map out the `exec-plans` and `generated` directories using standard markdown links.

### 🔲 Gaps (undocumented but should be)

- Instructions on running local test setups or handling Turbopack caching issues often faced by agents working with Next.js development.
- Specifics on visual Playwright verification of frontend routing changes to ensure successful completion of feature branches.