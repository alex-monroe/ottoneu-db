---
description: Run all tests (Python and Web)
---
Follow these steps to run all tests:

// turbo
1. Run all tests (Python + web) via `just`
`just test`

To run a single web test file (no coverage):
`just test-web-file <path>`  # e.g. just test-web-file __tests__/lib/session.test.ts
