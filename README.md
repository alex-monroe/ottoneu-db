# Ottoneu Fantasy Football Database & Analytics Platform

A database and analytics platform for Ottoneu Fantasy Football **League 309** (12-team
Superflex Half PPR). Python jobs pull Ottoneu league state and NFL statistics into a
Supabase PostgreSQL database; a season-long projection model turns that history into a
per-player points-per-game forecast; a Next.js app converts those projections into the
valuation metrics the league actually plays with — VORP, surplus value, projected
salaries, and arbitration targets.

**Stack:** Python 3.12 · Next.js 16 · React 19 · TypeScript · Tailwind CSS 4 ·
Supabase (PostgreSQL) · pandas · Recharts

---

## New here?

Read **[docs/ONBOARDING.md](docs/ONBOARDING.md)** — a guided first week that gets the
project running, traces one number from raw NFL data to the screen, and walks you
through shipping a first change. Keep **[docs/GLOSSARY.md](docs/GLOSSARY.md)** open
beside it; this repo mixes three specialist vocabularies and the glossary defines all
of them.

---

## Setup

### Option A — Dev container (recommended)

The repo ships a dev container that provisions everything correctly: the Python
virtualenv, the editable install, Playwright, npm packages, and the MCP servers.

1. Open the repo in VS Code and choose **Reopen in Container** (or launch a GitHub
   Codespace).
2. Copy the environment templates and fill in your Supabase credentials:
   ```bash
   cp .env.example .env
   cp web/.env.local.example web/.env.local
   ```
3. Verify:
   ```bash
   just doctor
   ```

See [.devcontainer/](.devcontainer/) for what it installs, and
[docs/references/autonomous-operation.md](docs/references/autonomous-operation.md) for
why it exists (it is also the sandbox for running agents without permission prompts).

### Option B — Local install

Requires Python 3.12, Node.js 18+, and [`just`](https://just.systems).

```bash
just install          # venv + pinned deps + editable install + Playwright + npm
cp .env.example .env                       # Supabase creds for Python
cp web/.env.local.example web/.env.local   # Supabase creds + session/MCP keys for Next.js
just doctor           # confirm the environment is sane
```

Every environment variable is documented in
[docs/references/environment-variables.md](docs/references/environment-variables.md).

### Database

The schema is defined by the numbered files in [migrations/](migrations/), applied in
order. See [migrations/README.md](migrations/README.md) for the workflow and
[docs/generated/db-schema.md](docs/generated/db-schema.md) for the current schema.

> **Note:** the Supabase project is shared with a separate app. Tables prefixed `fp_`
> belong to that codebase — never read, write, or migrate them from here.

---

## Everyday commands

All work goes through [`just`](https://just.systems) recipes, which select the right
virtualenv and flags for you. Run `just --list` to see all 53.

| Command | What it does |
|---|---|
| `just doctor` | Diagnoses known environment traps offline in ~1s and prints the fix for each. **Run this first when anything is off.** |
| `just dev` | Starts the Next.js dev server on `localhost:3000` (`just dev-stop` to stop it) |
| `just preflight` | Mirrors CI's pass/fail — lint, typecheck, both test suites, doc checks — in about 12 seconds. **Run before every push.** |
| `just test` | Full test suites with coverage (Python + web) |
| `just analyze` | Regenerates player projections from the active model and promotes them |
| `just py "<snippet>"` | Ad-hoc database inspection |

`just install-hooks` wires `preflight` into a pre-push hook.

The full command catalogue — scrapers, backfills, the projection workflow, and the
scheduled GitHub Actions — lives in [docs/COMMANDS.md](docs/COMMANDS.md).

---

## Where to go next

| Question | Document |
|---|---|
| How do I get productive in this repo? | [docs/ONBOARDING.md](docs/ONBOARDING.md) |
| What does *VORP* / *WOPR* / *rolling-origin* mean? | [docs/GLOSSARY.md](docs/GLOSSARY.md) |
| How does the whole system fit together? | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) |
| Which subsystem owns this table / script / route? | [docs/SUBSYSTEMS.md](docs/SUBSYSTEMS.md) |
| Where does this code live? | [docs/CODE_ORGANIZATION.md](docs/CODE_ORGANIZATION.md) |
| What are all the commands? | [docs/COMMANDS.md](docs/COMMANDS.md) |
| What's in the database? | [docs/generated/db-schema.md](docs/generated/db-schema.md) |
| What do the frontend routes do? | [docs/FRONTEND.md](docs/FRONTEND.md) |
| How do I run and write tests? | [docs/TESTING.md](docs/TESTING.md) |
| How do I branch, commit, and open a PR? | [docs/GIT_WORKFLOW.md](docs/GIT_WORKFLOW.md) |
| What are the league's rules? | [docs/references/ottoneu-rules.md](docs/references/ottoneu-rules.md) |
| How should I reason about roster strategy? | [docs/references/ottoneu-strategy.md](docs/references/ottoneu-strategy.md) |
| How do I change the projection model? | [docs/exec-plans/feature-projections.md](docs/exec-plans/feature-projections.md) |

Instructions for AI coding agents are in [AGENTS.md](AGENTS.md).

---

## Repository layout

```
ottoneu_db/
├── scripts/                  # Python: ingestion, projections, tooling
│   ├── feature_projections/  # The season-long projection model + eval harness
│   ├── weekly_projections/   # In-season per-game projections (Sleeper)
│   ├── league_explorer/      # Cross-league survey tool (local SQLite)
│   ├── tasks/                # Worker task modules for the job queue
│   └── tests/                # Python test suite
├── web/                      # Next.js frontend
│   ├── app/                  # App Router pages + API routes
│   ├── components/           # Shared React components
│   ├── lib/                  # Valuation logic, data access, MCP server, OAuth
│   └── __tests__/            # Jest test suite
├── migrations/               # Numbered SQL migrations
├── docs/                     # All documentation (start with ONBOARDING.md)
├── config.json               # Single source of truth for league constants
└── Justfile                  # Every command in the project
```

---

## Contributing

Never commit directly to `main` — all changes go through pull requests.

```bash
git checkout main && git pull origin main
git checkout -b your-branch-name
# ... make changes ...
just preflight          # must pass
git push -u origin your-branch-name
gh pr create --fill
```

Some rules are enforced mechanically by structural tests (no hardcoded league
constants, no unpaginated Supabase reads, frontend layering, config codegen). They fail
with a message explaining the fix — run `just check-arch` to check locally. Details in
[docs/GIT_WORKFLOW.md](docs/GIT_WORKFLOW.md) and [AGENTS.md](AGENTS.md).

Changes to the projection model have an additional requirement: they must show a
*significant* out-of-sample win on the held-out harness before promotion. See
[docs/ONBOARDING.md](docs/ONBOARDING.md#changing-the-projection-model) for why, and
[AGENTS.md](AGENTS.md) for the exact protocol.

---

## License

For personal use in Ottoneu League 309.

## Acknowledgments

- [Ottoneu](https://ottoneu.fangraphs.com/) — the fantasy platform
- [nflverse](https://github.com/nflverse) — NFL statistics
- [Supabase](https://supabase.com/) — database hosting
