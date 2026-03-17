# AGENTS.md

Universal instructions for AI coding agents working on this repository.

## Project Overview

Comprehensive database and analytics platform for Ottoneu Fantasy Football League 309 (12-team Superflex Half PPR). Python scripts scrape player data and NFL stats into a Supabase PostgreSQL database. A Next.js frontend provides interactive analytics and visualizations.

**Tech stack:** Python 3.9+ · Next.js 16 · React 19 · TypeScript · Tailwind CSS 4 · Supabase (PostgreSQL) · Playwright · pandas · Recharts

**Package Manager:** Always use `npm` for frontend dependencies and scripts. Do not use `pnpm`, `yarn`, or `bun`.

## Quick Reference

- **Commands:** See [docs/COMMANDS.md](docs/COMMANDS.md) for all CLI commands (frontend, backend, make, cron)
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
├── COMMANDS.md                        # All CLI commands (frontend, backend, make, cron)
├── FRONTEND.md                        # Routes, components, types, analysis logic
├── GIT_WORKFLOW.md                    # Branch strategy, PR requirements
├── TESTING.md                         # Python + web test setup and CI
├── exec-plans/
│   └── market-projections.md          # Market-based projection system implementation plan
├── generated/
│   └── db-schema.md                   # Database tables, keys, relationships
└── references/
    ├── environment-variables.md       # .env and .env.local variable reference
    └── ottoneu-rules.md               # Scoring, roster, salary cap, arbitration rules
```

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

Run `make check-arch` to validate these rules locally.

## Critical Rules

- **Update documentation:** Always try to update the agent documentation after completing a task. Update existing documents or add new documents and sections as needed to reflect architectural or contextual changes.
- **Never commit directly to `main`.** All changes go through pull requests.
- **Always create a PR.** Every task must end with `gh pr create --fill`.
- **Start from updated main:** `git checkout main && git pull origin main` before branching.
- See [docs/GIT_WORKFLOW.md](docs/GIT_WORKFLOW.md) for full details.

## Projection Model Update Requirements

When any task modifies the projection system — including `scripts/feature_projections/`, `scripts/projection_methods.py`, `scripts/update_projections.py`, or `model_config.py` — you MUST:

1. **Recompute the accuracy comparison table** by running:
   ```
   source venv/bin/activate && python scripts/feature_projections/accuracy_report.py --run-backtest --seasons 2024,2025
   ```
2. **Include the full markdown table** (from `docs/generated/projection-accuracy.md`) in:
   - The task output / conversation summary
   - The PR description body under a `## Projection Accuracy` section
3. **Highlight improvements** — call out which metrics improved vs the baseline (`v1_baseline_weighted_ppg`) in the PR description narrative above the table.

This ensures every projection change is empirically validated before merge.
