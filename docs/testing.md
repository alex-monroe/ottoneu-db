# Testing

## Python Tests
- **Location:** `scripts/tests/`
- **Config:** `pyproject.toml` (or `scripts/pytest.ini`)
- **Run:** `python -m pytest` from project root

## Web Tests
- **Location:** `web/__tests__/`
- **Config:** `web/jest.config.ts`
- **Run:** `npm test` from `web/`

## CI/CD
GitHub Actions runs both test suites on every PR (`.github/workflows/run-tests.yml`).
