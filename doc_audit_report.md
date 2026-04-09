# Documentation Audit Report

### ✅ Confirmed accurate
- `CLAUDE.md`, `AGENTS.md`, `.cursorrules`, and `.github/copilot-instructions.md` correctly reference existing documentation files and directories (verified via `scripts/check_docs_freshness.py`).
- The `npm` requirement for package management is correct and matches actual repository configuration (no `yarn.lock` or `pnpm-lock.yaml` in use for the `web` frontend originally, though `pnpm-lock.yaml` exists, the directives clearly state to avoid it to prevent CI issues).
- Architectural rules described in `AGENTS.md` accurately match test constraints (e.g., `make check-arch` works as expected).
- The list of skills in `CLAUDE.md` correctly maps to the `.claude/commands` present in the repository (`ablation`, `compare-models`, `create-pr`, `diagnose-segment`, `experiment`, `feature-importance`, `projection-accuracy`, `retro`, `run-analyses`, `run-scraper`, `run-tests`, `start-dev`).

### ⚠️ Needs update
- **Python Version in `AGENTS.md`**: Mentions `Python 3.9+` in the tech stack but the current environment runs `Python 3.12`. While technically `3.12` falls under `3.9+`, the explicit targeting of `3.9` syntax rules might be getting outdated depending on when the system was last upgraded. (Note: No direct fix required as it functions accurately).

### 🔲 Gaps (undocumented but should be)
- **Undocumented Frontend Routes**: The `docs/FRONTEND.md` file has a `## Routes` section that is missing several active routes present in the `web/app` directory. Unlisted routes include:
  - `/admin`
  - `/arb-planner-public`
  - `/arbitration-simulation`
  - `/login`
  - `/players`
  - `/projection-accuracy`
  - `/projections`
  - `/rosters`
  - `/surplus-adjustments`
