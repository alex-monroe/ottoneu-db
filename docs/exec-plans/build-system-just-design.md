# Build System: Replace Make with Just

**Date:** 2026-04-19  
**Status:** Approved

## Problem

The current `Makefile` has ~15 targets, but agents invoke Python, pytest, and npm commands directly in inconsistent ways. This has caused `settings.local.json` to accumulate ~150 specific `Bash(...)` allowlist entries — many duplicating the same logical command in slightly different forms. There is no single consistent entrypoint for agents to use.

## Solution

Replace the `Makefile` with a `Justfile` using [`just`](https://github.com/casey/just), a modern command runner with a clean DSL syntax. All agent-facing commands route through `just <recipe>`, reducing the allowlist to a single `Bash(just:*)` entry.

## Justfile Design

### Variables

```just
python := "venv/bin/python"
pytest := "venv/bin/pytest"
```

Pinned at the top so every recipe uses `venv/bin/python` consistently — no drift to bare `python` or `python3`.

### Default

```just
default:
    @just --list
```

Running `just` with no args prints all available recipes.

### Recipe Groups

**Setup**
- `install` — create venv, pip install, playwright install, npm install

**Frontend**
- `dev` — start Next.js dev server on localhost:3000
- `build` — production build
- `lint` — ESLint
- `typecheck` — TypeScript type check

**Testing**
- `test` — run test-python and test-web
- `test-python` — pytest with coverage
- `test-web` — Jest with coverage

**Backend**
- `scrape` — full scrape pipeline
- `analyze` — run all analysis scripts
- `check-db` — verify database contents

**CI / Harness**
- `check-arch` — architectural/structural tests only
- `check-docs` — documentation freshness check
- `ci` — full suite: lint + typecheck + test + check-docs

**Projection CLI — fixed args**

Recipes with required `model` arg and optional `seasons` (defaults to `2022,2023,2024,2025`):
```
just project <model> [seasons]
just backtest <model> [seasons]
just train <model> [seasons]
just promote <model>
just compare <models> [season]
just list-models
```

**Projection CLI — variadic passthrough**

Recipes that accept arbitrary flags via `*args`, for commands with many optional parameters:
```
just diagnostics [--model <m>] [--season <s>] [--top <n>]
just segment-analysis [--segments <s>] [--models <m>] [--seasons <s>]
just accuracy-report [--run-backtest] [--seasons <s>] [--output <path>]
```

### Example invocations

```bash
just test
just project v24_learned_elite
just project v24_learned_elite 2022,2023,2024,2025
just backtest v24_learned_elite
just train v24_learned_elite 2022,2023,2024
just promote v24_learned_elite
just diagnostics --model v24_learned_elite --season 2025 --top 20
just segment-analysis --segments experience,age_bucket
just accuracy-report --run-backtest
just compare v23_baseline,v24_learned_elite 2024
just list-models
```

## Permissions Allowlist Changes

**Remove** the large block of Python/pytest/npm-specific `Bash(...)` entries, including:
- `Bash(python:*)`, `Bash(python3:*)`, `Bash(venv/bin/python:*)`, `Bash(venv/bin/pytest:*)`
- All one-off `Bash(./venv/bin/pytest scripts/tests/...)` entries
- `Bash(npm run build:*)`, `Bash(npm run lint:*)`, `Bash(npm run dev:*)`, `Bash(source:*)`
- Any other entries superseded by `just`

**Add** one entry:
```json
"Bash(just:*)"
```

**Keep** as-is:
- All `git` and `gh` entries
- All MCP tool entries (`mcp__filesystem__*`, `mcp__github__*`, `mcp__supabase__*`)
- `WebFetch` and `WebSearch` entries

## File Changes

| File | Action |
|------|--------|
| `Makefile` | Delete |
| `Justfile` | Create (new, at repo root) |
| `.claude/settings.local.json` | Remove superseded Bash entries, add `Bash(just:*)` |
| `docs/COMMANDS.md` | Replace "Makefile Shortcuts" section with "just Recipes"; add note to Backend section recommending `just` |
| `AGENTS.md` | Add rule: always use `just <recipe>` instead of invoking Python, pytest, or npm directly |

## Installation

`just` is installed via Homebrew: `brew install just`. It should be added to the project's setup documentation.

## Agent Enforcement

`AGENTS.md` will contain an explicit rule:

> Always use `just <recipe>` instead of invoking Python, pytest, or npm scripts directly. This ensures commands run with the correct venv and flags, and keeps the allowlist minimal.
