---
name: run-tests
description: Run all tests (Python and Web)
context: fork
agent: command-runner
background: false
---
Run this repository's tests through `just` and report the result. `just`
resolves the venv (including the main checkout's venv from a linked worktree)
and pins imports to this checkout.

Which commands to run (from the repository root):

- Default — the fast gate that mirrors CI pass/fail (~10s): `just preflight`
- If the request asked for coverage: `just test` (then `just py-coverage` for
  the per-file Python table, only if asked)
- If the request named a single web test file:
  `just test-web-file __tests__/lib/<file>.test.ts`

If `web/node_modules` is missing, report that `just worktree-setup` must be run
first (outside the sandbox) rather than running npm yourself.

Request: $ARGUMENTS
