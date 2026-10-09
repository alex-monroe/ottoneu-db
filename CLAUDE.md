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

- **Skills** (`.claude/skills/`): `ablation`, `compare-models`, `create-pr`, `db-schema`,
  `diagnose-segment`, `experiment`, `feature-importance`, `ottoneu-roster-question`,
  `projection-accuracy`, `retro`, `review-permission-gates`, `run-analyses`,
  `run-scraper`, `run-tests`, `scraper-logic`, `start-dev`.
- **Subagents** (`.claude/agents/`), each with a restricted tool list and a pinned
  model: `db-reader` (haiku — read-only SQL lookups), `ci-triage` (haiku — why a
  GitHub Actions run failed), `command-runner` (haiku — runs forked skills such as
  `run-tests`), `projection-evaluator` (sonnet — runs the held-out gate).
- **Model routing:** the main session runs Opus; delegate work that needs little
  context but produces a lot of output (logs, CI runs, SQL, evals, broad
  searches) to a subagent, so only its summary reaches the main context. Don't
  switch the main model mid-session or set `model:` on an inline skill — either
  throws away the prompt cache. A skill changes model by forking
  (`context: fork` + `agent:`), as `run-tests` does.
- **Hook scripts** (`.claude/hooks/*.py`) run under the host's *system* `python3`, which
  may be older than the project's Python 3.12. Keep them stdlib-only and conservative.
- **Permission friction:** the allowlist design, prompt-rate metrics
  (`just permission-report`), and the `.devcontainer/` used for running
  `claude --dangerously-skip-permissions` are documented in
  [docs/references/autonomous-operation.md](docs/references/autonomous-operation.md).
