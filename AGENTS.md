# AGENTS.md

Canonical instructions for AI coding agents working on this repository.
`CLAUDE.md` is a thin pointer at this file — put shared guidance here, not there.
This file holds only what every task needs; everything else is one link away in
[docs/INDEX.md](docs/INDEX.md). Keep it that way — it is loaded into every session.

## Project Overview

Database and analytics platform for Ottoneu Fantasy Football League 309 (12-team Superflex Half PPR). Python scripts scrape player data and NFL stats into Supabase (PostgreSQL); a Next.js frontend serves player efficiency, VORP, surplus value, projected salaries, arbitration, and in-season tools (matchups, pick'em, power rankings).

**Tech stack:** Python 3.12 · Next.js 16 · React 19 · TypeScript · Tailwind CSS 4 · Supabase (PostgreSQL) · Playwright · pandas · Recharts

**Package Manager:** Always use `npm` for frontend dependencies and scripts. Do not use `pnpm`, `yarn`, or `bun`.

**Python:** Go through `just` (below). The virtualenv is the main checkout's `venv/`, not `.venv/`.

## Where to look

- **First time here:** [docs/ONBOARDING.md](docs/ONBOARDING.md) (setup → end-to-end trace → first change) and [docs/GLOSSARY.md](docs/GLOSSARY.md) (fantasy economics, NFL stats, ML methodology — look terms up rather than guessing).
- **Scoping a change:** [docs/SUBSYSTEMS.md](docs/SUBSYSTEMS.md) says which subsystem owns a table, script or route; [docs/INDEX.md](docs/INDEX.md) has a summary of every subsystem reference and the full doc map. Read the entry for the area you are touching before editing it.
- **Core references:** [ARCHITECTURE](docs/ARCHITECTURE.md) · [CODE_ORGANIZATION](docs/CODE_ORGANIZATION.md) · [COMMANDS](docs/COMMANDS.md) · [FRONTEND](docs/FRONTEND.md) · [TESTING](docs/TESTING.md) · [GIT_WORKFLOW](docs/GIT_WORKFLOW.md) · [db-schema](docs/generated/db-schema.md) · [environment variables](docs/references/environment-variables.md) · [Ottoneu rules](docs/references/ottoneu-rules.md)
- **Projection work:** [docs/references/projection-model-changes.md](docs/references/projection-model-changes.md), and the `/experiment`, `/ablation`, `/feature-importance`, `/compare-models`, `/diagnose-segment`, `/projection-accuracy` skills.
- **Roster/strategy questions:** the `/ottoneu-roster-question` skill (loads [ottoneu-strategy.md](docs/references/ottoneu-strategy.md) + live data).
- **Agent harness:** [docs/references/autonomous-operation.md](docs/references/autonomous-operation.md) (permissions, sandbox, devcontainer) and [docs/references/harness-controls.md](docs/references/harness-controls.md) (every hook/guard and why it exists). After a task, `/retro` turns friction into doc/skill fixes.

## GitHub Repository

Owner `alex-monroe`, repo `ottoneu-db` (hyphen — the local directory is `ottoneu_db`, underscore). Use the `gh` CLI.

## Worktree Notes

- **Python works unchanged in a worktree via `just`:** the Justfile falls back to the main checkout's `venv/` and sets `PYTHONPATH` to the worktree, so your edits (not main's code) run. `.env` is found by searching upward. `web/node_modules` is per-checkout — run `just worktree-setup` once if it is missing (`just doctor` says so).
- **Production actions** (like `just promote` or `just analyze`) should run from the main checkout after merging, not from a worktree, since they modify shared production data.

## Python Style

- **Target version: Python 3.12** (upgraded from 3.9 in #627). Modern syntax is fine — `X | Y` unions, built-in generics (`list[int]`, `dict[str, X]`), etc.
- **Exception:** `.claude/hooks/*.py` run under the host's *system* `python3` (which may be older, e.g. macOS 3.9), so keep those hook scripts stdlib-only and conservative.

## Architectural Rules (Enforced by Tests)

These rules are mechanically enforced by structural tests in `scripts/tests/test_architecture.py` and `web/__tests__/lib/architecture.test.ts`. If you violate them, tests will fail with a teaching message explaining the fix.

- **No hardcoded constants:** Import league constants from `scripts.config` (Python) or `@/lib/config` (TypeScript). Never use literal values like `309`, `400`, etc.
- **Use the shared Supabase client:** Always use `get_supabase_client()` from `scripts.config` — never call `create_client()` directly.
- **Config codegen:** `config.json` is the single source of truth. After adding/changing a key, run `just gen-config` — it regenerates the marked constant blocks in `scripts/config.py` and `web/lib/config.ts` (do not hand-edit those blocks). `TestConfigCodegen` fails with "run `just gen-config`" if they're stale.
- **Dependency direction:** Analysis scripts must NOT import from `scripts/tasks/`. Query the database instead.
- **Frontend layers:** `web/lib/` must NOT import from `web/components/`. Flow: types → config → lib → components → pages.
- **Shared types:** Define interfaces in `web/lib/types.ts`, not in component files.
- **No wildcard imports:** Use explicit named imports (`from module import X, Y`).
- **Documentation exists:** All docs referenced in this file must exist and have content.

Run `just check-arch` to validate these rules locally.

## Critical Rules

- **Always use `just <recipe>`** instead of invoking Python, pytest, or npm scripts directly. It picks the right venv (the main checkout's, from a worktree), pins imports to the current checkout, and keeps the allowlist small. `just --list` shows every recipe; [docs/COMMANDS.md](docs/COMMANDS.md) explains them. Everyday ones: `just preflight`, `just test`, `just dev` / `just dev-stop` (never raw `pkill`), and `just py "<snippet>"` for ad-hoc DB inspection.
- **When something is off, run `just doctor` first.** It diagnoses the known environment traps (stale editable mapping, broken venv, missing `.env` keys, stale `web/node_modules`, stale `.cache/holdout`) offline in ~1s and prints the fix for each.
- **Editable install can run stale `scripts/` code.** If a `scripts/*.py` edit doesn't take effect via `venv/bin/python scripts/foo.py` (but works via `python -c`), the editable install is likely pinned to a stale `.claude/worktrees/` path — `just doctor` flags this; the fix is `venv/bin/pip install -e .` from the project root. See [docs/TESTING.md](docs/TESTING.md#gotcha-editable-install-can-pin-scripts-to-a-stale-worktree).
- **New DB tables need a TS type; config is codegen'd.** Hand-add the table's `Row`/`Insert`/`Update` block to `web/types/supabase.ts` (don't fully regenerate — it churns `fp_*`), then `just check-schema`. Full migration steps: [docs/references/database-workflow.md](docs/references/database-workflow.md).
- **Do not touch `fp_*` tables.** The Supabase project is shared with the `fantasy-pulse` app, which owns every table prefixed `fp_` (the prefix is the rule, not any list). Never read, write, alter, drop or migrate them from this repo; ignore them in `list_tables` and generated types. See [docs/generated/db-schema.md](docs/generated/db-schema.md#shared-database--hands-off-fp_).
- **Update documentation:** Always try to update the agent documentation after completing a task. Update existing documents or add new documents and sections as needed to reflect architectural or contextual changes.
- **Never commit directly to `main`.** All changes go through pull requests.
- **Always create a PR.** Every task must end with `gh pr create --fill`.
- **Run `just preflight` before pushing.** It mirrors CI's pass/fail (lint + typecheck + both test suites without coverage + doc checks) in ~9s, so failures surface locally instead of in a multi-minute CI round-trip. `just install-hooks` installs it as an opt-in pre-push hook (`git push --no-verify` to skip a WIP push).
- **Start from the latest main without switching shared checkouts:** `git fetch origin main && git checkout -b <branch> origin/main`. Other sessions may be using the main checkout — never `git checkout main` there.
- **Bash cwd persists between calls.** A `cd web && …` leaves the shell in `web/`, so a later repo-root-relative path (e.g. `git add web/next.config.ts`) silently fails. Prefer absolute paths, `git -C <repo-root>`, or re-`cd` explicitly rather than assuming the working directory.
- See [docs/GIT_WORKFLOW.md](docs/GIT_WORKFLOW.md) for full details.

## Projection Model Update Requirements

Any change to `scripts/feature_projections/`, `scripts/projection_methods.py`, `scripts/update_projections.py` or `model_config.py` must be validated on the **leakage-free held-out harness**. Full protocol, commands and rationale: [docs/references/projection-model-changes.md](docs/references/projection-model-changes.md) — read it before starting. The non-negotiables:

- **Gate on `just holdout-eval --protocol rolling` + `just significance` against the active model** (`just list-models --check`; never assume a name). The in-sample `just accuracy-report` is a diagnostic only, never the gate.
- **Promote only on a *significant* held-out win** (CI excludes 0) — never a point-estimate delta. Lead the PR description with the held-out verdict.
- **The final window (2025, then 2026 actuals) is confirmation-only** — one look per experiment.
- **Feature changes update `scripts/tests/test_feature_projections.py`** (one `Test<FeatureName>Feature` class per feature).

## Database

- **Migrations:** `migrations/NNN_snake_case.sql`, linted by `just check-migrations`. After applying one: update `web/types/supabase.ts` and `docs/generated/db-schema.md`, then `just check-schema`. Details: [docs/references/database-workflow.md](docs/references/database-workflow.md).
- **Supabase reads cap at 1000 rows** (Python *and* web clients). Read large tables through `fetch_all_rows` (Python, `scripts.config`) or `fetchAllRows` (web, `web/lib/supabase.ts`); `just check-arch` fails on a non-paginated read of a large table.
