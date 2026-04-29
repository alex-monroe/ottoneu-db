# AGENTS.md

Universal instructions for AI coding agents working on this repository.

## Project Overview

Comprehensive database and analytics platform for Ottoneu Fantasy Football League 309 (12-team Superflex Half PPR). Python scripts scrape player data and NFL stats into a Supabase PostgreSQL database. A Next.js frontend provides interactive analytics and visualizations.

**Tech stack:** Python 3.9+ · Next.js 16 · React 19 · TypeScript · Tailwind CSS 4 · Supabase (PostgreSQL) · Playwright · pandas · Recharts

**Package Manager:** Always use `npm` for frontend dependencies and scripts. Do not use `pnpm`, `yarn`, or `bun`.

## Quick Reference

- **Commands:** See [docs/COMMANDS.md](docs/COMMANDS.md) for all CLI commands (frontend, backend, just recipes, cron)
- **Architecture:** See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for system design, data pipeline, and analysis pipeline
- **Frontend:** See [docs/FRONTEND.md](docs/FRONTEND.md) for routes, components, types, and config
- **Code layout:** See [docs/CODE_ORGANIZATION.md](docs/CODE_ORGANIZATION.md) for key file locations and config
- **Database:** See [docs/generated/db-schema.md](docs/generated/db-schema.md) for table schemas and relationships
- **Testing:** See [docs/TESTING.md](docs/TESTING.md) for running Python and web tests
- **Git workflow:** See [docs/GIT_WORKFLOW.md](docs/GIT_WORKFLOW.md) for branch and PR requirements
- **Domain rules:** See [docs/references/ottoneu-rules.md](docs/references/ottoneu-rules.md) for scoring, roster, salary cap, and arbitration
- **Environment:** See [docs/references/environment-variables.md](docs/references/environment-variables.md) for `.env` setup
- **Market Projections:** See [docs/exec-plans/market-projections.md](docs/exec-plans/market-projections.md) for the market-based projection system implementation plan

## Documentation Map

```
AGENTS.md                              ← you are here
CLAUDE.md                              ← Claude Code specific instructions
docs/
├── ARCHITECTURE.md                    # System design, data + analysis pipelines, tech stack
├── CODE_ORGANIZATION.md               # Key file locations, Python/TS config
├── COMMANDS.md                        # All CLI commands (frontend, backend, just recipes, cron)
├── FRONTEND.md                        # Routes, components, types, analysis logic
├── GIT_WORKFLOW.md                    # Branch strategy, PR requirements
├── TESTING.md                         # Python + web test setup and CI
├── exec-plans/
│   ├── [feature-projections.md](docs/exec-plans/feature-projections.md)         # Feature-based player projection system
│   ├── [market-projections.md](docs/exec-plans/market-projections.md)          # Market-based projection system implementation plan
│   ├── [projection-accuracy-improvement.md](docs/exec-plans/projection-accuracy-improvement.md)  # 4-phase accuracy improvement roadmap
│   └── [qb-usage-share.md](docs/exec-plans/qb-usage-share.md)              # QB Usage Share findings and next steps
├── generated/
│   ├── [db-schema.md](docs/generated/db-schema.md)                   # Database tables, keys, relationships
│   ├── [experiment-log.md](docs/generated/experiment-log.md)              # History of all model iteration attempts
│   ├── [player-diagnostics.md](docs/generated/player-diagnostics.md)          # Per-player backtest diagnostics
│   ├── [projection-accuracy.md](docs/generated/projection-accuracy.md)         # Projection model accuracy report
│   └── [segment-analysis.md](docs/generated/segment-analysis.md)            # Segmented projection accuracy analysis
├── superpowers/
│   ├── [2026-04-19-build-system-just.md](docs/superpowers/plans/2026-04-19-build-system-just.md)         # Build system just plan
│   └── [2026-04-19-build-system-design.md](docs/superpowers/specs/2026-04-19-build-system-design.md)     # Build system design spec
└── references/
    ├── environment-variables.md       # .env and .env.local variable reference
    └── ottoneu-rules.md               # Scoring, roster, salary cap, arbitration rules
```

## Worktree Notes

- **Python venv:** The virtualenv lives at the main repo's `venv/`, not in worktrees. In a worktree, use the absolute path `<main-repo>/venv/bin/python` instead of `source venv/bin/activate` or relative `venv/bin/python`. The `source venv/bin/activate` command will fail in worktrees.
- **Production actions** (like `promote.py`) should run from the main repo after merging, not from a worktree, since they modify shared production data.
- **Directory creation:** Prefer `mcp__filesystem__create_directory` over `Bash(mkdir -p ...)` — the MCP tool is pre-approved and avoids a permission prompt.

## Python Style

- **Target version: Python 3.9.** Do not use syntax that requires 3.10+.
- **Type annotations:** Use `Optional[X]` or `Union[X, Y]` from `typing`, not the `X | Y` union shorthand (requires 3.10+). `from __future__ import annotations` defers evaluation but does not make `|` safe in runtime positions (e.g. function bodies, `isinstance` calls).
- **Existing files** that already import `from __future__ import annotations` may use `X | Y` in *annotation* positions only — do not use it elsewhere.

## Architectural Rules (Enforced by Tests)

These rules are mechanically enforced by structural tests in `scripts/tests/test_architecture.py` and `web/__tests__/lib/architecture.test.ts`. If you violate them, tests will fail with a teaching message explaining the fix.

- **No hardcoded constants:** Import league constants from `scripts.config` (Python) or `@/lib/config` (TypeScript). Never use literal values like `309`, `400`, etc.
- **Use the shared Supabase client:** Always use `get_supabase_client()` from `scripts.config` — never call `create_client()` directly.
- **Config sync:** When adding a key to `config.json`, also add it to `scripts/config.py` AND `web/lib/config.ts`.
- **Dependency direction:** Analysis scripts must NOT import from `scripts/tasks/`. Query the database instead.
- **Frontend layers:** `web/lib/` must NOT import from `web/components/`. Flow: types → config → lib → components → pages.
- **Shared types:** Define interfaces in `web/lib/types.ts`, not in component files.
- **No wildcard imports:** Use explicit named imports (`from module import X, Y`).
- **Documentation exists:** All docs referenced in this file must exist and have content.

Run `just check-arch` to validate these rules locally.

## Critical Rules

- **Always use `just <recipe>`** instead of invoking Python, pytest, or npm scripts directly. This ensures the correct venv and flags are used, and keeps the agent allowlist minimal. Run `just --list` to see all available recipes.
- **Update documentation:** Always try to update the agent documentation after completing a task. Update existing documents or add new documents and sections as needed to reflect architectural or contextual changes.
- **Never commit directly to `main`.** All changes go through pull requests.
- **Always create a PR.** Every task must end with `gh pr create --fill`.
- **Start from updated main:** `git checkout main && git pull origin main` before branching.
- See [docs/GIT_WORKFLOW.md](docs/GIT_WORKFLOW.md) for full details.

## Projection Model Update Requirements

When any task modifies the projection system — including `scripts/feature_projections/`, `scripts/projection_methods.py`, `scripts/update_projections.py`, or `model_config.py` — you MUST:

1. **Run the new model for ALL backtest seasons before calling `--run-backtest`.**
   The accuracy report covers seasons 2022–2025. If a new model is missing any of those seasons in `model_projections`, that season will show `—` in the table and the combined averages will be wrong. Run:
   ```
   just project <name> 2022,2023,2024,2025
   ```
   Then run the full report:
   ```
   just accuracy-report --run-backtest --seasons 2022,2023,2024,2025
   ```
2. **Include the full markdown table** (from `docs/generated/projection-accuracy.md`) in:
   - The task output / conversation summary
   - The PR description body under a `## Projection Accuracy` section
3. **Highlight improvements** — call out which metrics improved vs the baseline (`v1_baseline_weighted_ppg`) in the PR description narrative above the table.
4. **Update UI methodology text** when changing `ACTIVE_MODEL` in `update_projections.py`. The pages `web/app/projections/page.tsx` and `web/app/arbitration/page.tsx` contain hardcoded methodology descriptions that must reflect the active model's feature set.

This ensures every projection change is empirically validated before merge.

### Feature changes require test updates

When adding or rewriting a projection feature, check and update the corresponding tests in `scripts/tests/test_feature_projections.py`. Each feature class has a `Test<FeatureName>Feature` test class. Behavioral changes (e.g., a feature that previously required 2 seasons now works with 1) will cause existing tests to fail in CI if not updated.

### Rookie snap trajectory (weighted_ppg feature)

The `WeightedPPGFeature` applies an H2/H1 snap-per-game multiplier to first-year players (`_rookie_trajectory`). This is appropriate for skill positions (WR/RB/TE) where rising snap share signals growing role. It is **not** appropriate for:

- **QB**: A starting QB already receives all offensive snaps. A high H2/H1 ratio simply means they took over mid-season, not that they'll be better next year.
- **K**: Snap counts are irrelevant to kicker scoring.

`v12_no_qb_trajectory` (current active model) disables the trajectory for QB and K via `WeightedPPGNoQBTrajectoryFeature`. Do not re-enable it for those positions.

### Database migration workflow

After creating a new migration file in `migrations/` and applying it (via `mcp__supabase__apply_migration` or the Supabase dashboard):

1. **Regenerate TypeScript types** using `mcp__supabase__generate_typescript_types` (or `npx supabase gen types typescript`).
2. **Update `web/types/supabase.ts`** with the regenerated output so the Supabase client recognizes the new table.
3. **Update `docs/generated/db-schema.md`** — add the new table to the table list and increment the table count.

Skipping step 2 will cause TypeScript errors like `Argument of type '"new_table"' is not assignable to parameter of type '...'` when querying the new table.

### Supabase pagination

Supabase's Python client defaults to a **1000-row limit** on `.execute()` calls. Any query that may return more than 1000 rows must use paginated `.range(offset, offset + page_size - 1)` fetching in a loop. This has already caused a silent bug in `promote.py` (now fixed). Apply the same pattern in any new bulk-fetch code.
