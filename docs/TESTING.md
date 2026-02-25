# Testing

## Python Tests

- **Location:** `scripts/tests/`
- **Config:** `pyproject.toml` (or `scripts/pytest.ini`)
- **Run:** `python -m pytest` from project root

## Web Tests

- **Location:** `web/__tests__/`
- **Config:** `web/jest.config.ts`
- **Run:** `npm test` from `web/`

## Structural / Architectural Tests

Harness engineering tests that enforce architectural rules mechanically. Each test failure includes a teaching message with the fix.

- **Python:** `scripts/tests/test_architecture.py` — config sync, dependency direction, import rules, doc existence
- **TypeScript:** `web/__tests__/lib/architecture.test.ts` — layer boundaries, type locations, config sync

```bash
make check-arch    # Run architectural tests only
```

## Documentation Freshness Check

Scans for stale docs, broken links in AGENTS.md/CLAUDE.md, and orphan files.

```bash
make check-docs    # Informational (warnings only)
python scripts/check_docs_freshness.py --strict   # Fail on any issue
```

## CI

GitHub Actions runs both test suites plus documentation checks on every PR (`.github/workflows/run-tests.yml`).

## Running All Tests

```bash
make test    # Runs both Python and web tests
make ci      # Full CI suite: lint + typecheck + tests + doc checks
```
