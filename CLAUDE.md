# CLAUDE.md

Guidance for Claude Code (claude.ai/code) working on this repository.

## Project Overview

Comprehensive database and analytics platform for Ottoneu Fantasy Football League 309 (12-team Superflex Half PPR). Python scripts scrape player data and NFL stats into a Supabase PostgreSQL database. A Next.js frontend provides interactive analytics and visualizations for player efficiency (PPG/PPS), VORP, surplus value, projected salaries, and arbitration targets.

**Package Manager:** Always use `npm` for frontend dependencies and scripts. Do not use `pnpm`, `yarn`, or `bun`.

## Quick Reference

- **Commands:** See [docs/COMMANDS.md](docs/COMMANDS.md) for all CLI commands (frontend, backend, make, cron)
- **Architecture:** See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for system design, data pipeline, and analysis pipeline
- **Frontend:** See [docs/FRONTEND.md](docs/FRONTEND.md) for routes, components, types, and config
- **Code layout:** See [docs/CODE_ORGANIZATION.md](docs/CODE_ORGANIZATION.md) for key file locations and config
- **Database:** See [docs/generated/db-schema.md](docs/generated/db-schema.md) for table schemas and relationships
- **Testing:** See [docs/TESTING.md](docs/TESTING.md) for running Python and web tests
- **Git workflow:** See [docs/GIT_WORKFLOW.md](docs/GIT_WORKFLOW.md) for branch and PR requirements
- **Ottoneu rules:** See [docs/references/ottoneu-rules.md](docs/references/ottoneu-rules.md) for scoring, roster, salary cap, and arbitration rules
- **Environment:** See [docs/references/environment-variables.md](docs/references/environment-variables.md) for `.env` setup
- **Market Projections:** See [docs/exec-plans/market-projections.md](docs/exec-plans/market-projections.md) for the market-based projection system implementation plan
- **Projection Accuracy:** Use `/projection-accuracy` skill (or run `python scripts/feature_projections/accuracy_report.py`) to generate a model comparison table. **Required when updating any projection code** — see Projection Model Update Requirements in [AGENTS.md](AGENTS.md).
- **Retrospective:** Use `/retro` skill after completing a task to surface friction points and open a PR with doc/skill improvements.

## Documentation Map

Skills (`.claude/commands/`): `create-pr`, `projection-accuracy`, `retro`, `run-analyses`, `run-scraper`, `run-tests`, `start-dev`

- [CLAUDE.md](CLAUDE.md) ← you are here
- [AGENTS.md](AGENTS.md) ← universal agent instructions
- `docs/`
  - [ARCHITECTURE.md](docs/ARCHITECTURE.md) - System design, data + analysis pipelines, tech stack
  - [CODE_ORGANIZATION.md](docs/CODE_ORGANIZATION.md) - Key file locations, Python/TS config
  - [COMMANDS.md](docs/COMMANDS.md) - All CLI commands (frontend, backend, make, cron)
  - [FRONTEND.md](docs/FRONTEND.md) - Routes, components, types, analysis logic
  - [GIT_WORKFLOW.md](docs/GIT_WORKFLOW.md) - Branch strategy, PR requirements
  - [TESTING.md](docs/TESTING.md) - Python + web test setup and CI
  - `exec-plans/`
    - [feature-projections.md](docs/exec-plans/feature-projections.md) - Feature-based projection system
    - [market-projections.md](docs/exec-plans/market-projections.md) - Market-based projection system implementation plan
  - `generated/`
    - [db-schema.md](docs/generated/db-schema.md) - Database tables, keys, relationships
    - [projection-accuracy.md](docs/generated/projection-accuracy.md) - Generated backtest accuracy metrics
  - `references/`
    - [environment-variables.md](docs/references/environment-variables.md) - .env and .env.local variable reference
    - [ottoneu-rules.md](docs/references/ottoneu-rules.md) - Scoring, roster, salary cap, arbitration rules

## Critical Rules

- **Update documentation:** Always try to update the agent documentation after completing a task. Update existing documents or add new documents and sections as needed to reflect architectural or contextual changes.
- **Never commit directly to `main`.** All changes go through pull requests.
- **Always create a PR.** Every task must end with `gh pr create --fill`.
- **Start from updated main:** `git checkout main && git pull origin main` before branching.
- See [docs/GIT_WORKFLOW.md](docs/GIT_WORKFLOW.md) for full details.
