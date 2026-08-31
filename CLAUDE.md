# CLAUDE.md

**The canonical agent instructions for this repository are in [AGENTS.md](AGENTS.md). Read that file.**

It covers the project overview, the documentation map, the architectural rules enforced
by tests, the critical `just`-first workflow rules, and the projection-model update
protocol. Everything an agent needs is there.

This file exists only so Claude Code auto-loads that pointer, plus the handful of notes
below that are specific to Claude Code itself. **Do not copy content from `AGENTS.md`
into this file** — the two were previously ~95% duplicated and silently drifted apart by
seven whole subsystems, which is why the split is now enforced by
`scripts/check_docs_freshness.py` (run under `just check-docs` and `just preflight`).

## Human entry point

If you are orienting a person rather than an agent, point them at
[README.md](README.md) and [docs/ONBOARDING.md](docs/ONBOARDING.md), not at this file.

## Claude Code specifics

- **Skills** (`.claude/commands/`): `ablation`, `compare-models`, `create-pr`,
  `diagnose-segment`, `experiment`, `feature-importance`, `ottoneu-roster-question`,
  `projection-accuracy`, `retro`, `review-permission-gates`, `run-analyses`,
  `run-scraper`, `run-tests`, `start-dev`.
- **Directory creation:** prefer `mcp__filesystem__create_directory` over
  `Bash(mkdir -p ...)` — the MCP tool is pre-approved and avoids a permission prompt.
- **Hook scripts** (`.claude/hooks/*.py`) run under the host's *system* `python3`, which
  may be older than the project's Python 3.12. Keep them stdlib-only and conservative.
- **Permission friction:** the allowlist design, prompt-rate metrics
  (`just permission-report`), and the `.devcontainer/` used for running
  `claude --dangerously-skip-permissions` are documented in
  [docs/references/autonomous-operation.md](docs/references/autonomous-operation.md).
