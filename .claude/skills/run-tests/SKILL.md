---
name: run-tests
description: Run all tests (Python and Web)
---
Run the test suites through `just` (it resolves the venv — including the main
checkout's venv from a linked worktree — and pins imports to this checkout):

1. Fast gate, mirrors CI pass/fail (~10s): `just preflight`
2. Full suites with coverage, when coverage matters: `just test`
3. A single web test file: `just test-web-file __tests__/lib/<file>.test.ts`

In a fresh worktree, run `just worktree-setup` first if `web/node_modules` is
missing (`just doctor` tells you).
