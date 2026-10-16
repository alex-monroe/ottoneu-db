---
name: verify
description: Pre-commit check — run the local gate (`just preflight`) on the working tree and report pass/fail. Claude Code runs this skill automatically before a commit (except docs-only and tests-only commits); run it by hand any time before committing or pushing.
context: fork
agent: command-runner
background: false
---
Verify this checkout before a commit by running the same gate CI enforces.
`just` resolves the venv (including the main checkout's venv from a linked
worktree) and pins imports to this checkout.

From the repository root, run: `just preflight`

It runs ESLint, `tsc --noEmit`, pytest and jest (no coverage) and the strict
docs-freshness check, in about 10 seconds. It stops at the first failing step,
so report which step failed.

- If `web/node_modules` is missing (lint fails with `eslint: command not
  found`), report that `just worktree-setup` must be run first, rather than
  running npm yourself.
- On failure, report the step, the failing test(s) or error with a few lines
  quoted, and the file:line. Do not fix anything: the session that is
  committing fixes it and runs this again.
- On success, one line: `preflight passed`.

Context from the caller (may be empty): $ARGUMENTS
