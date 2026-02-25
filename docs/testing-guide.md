# Testing Guide

## Quick Reference

```bash
make test            # Run all tests (Python + web)
make test-python     # Python tests with coverage
make test-web        # Jest tests with coverage
make ci              # Full CI suite: lint + typecheck + test + build
```

## Python Tests

**Location:** `scripts/tests/`
**Framework:** pytest (configured in `pyproject.toml`)
**Run:** `python -m pytest` from project root (venv must be active)

### Test files

| File | What it tests |
|------|--------------|
| `test_vorp.py` | `calculate_vorp()` — replacement-level calculation, position filtering, college exclusion |
| `test_analysis_utils.py` | Shared analysis helpers — merge functions, data transformations |
| `test_name_utils.py` | Player name matching and normalization |
| `test_scrape_roster.py` | Roster scraping HTML parsing |
| `test_projection_methods.py` | Projection algorithm calculations |
| `test_config_sync.py` | **Structural test** — validates `config.py` and `config.ts` constants match |

### Patterns

- Tests use mock DataFrames — no Supabase calls needed
- Fixtures defined in `scripts/conftest.py`
- Coverage reported via `pytest-cov` (configured in `pyproject.toml`)

## Web Tests

**Location:** `web/__tests__/`
**Framework:** Jest + React Testing Library (configured in `web/jest.config.ts`)
**Run:** `cd web && npx jest` or `make test-web`

### Test files

| File | What it tests |
|------|--------------|
| `components/DataTable.test.tsx` | Sortable table rendering and interaction |
| `components/ModeToggle.test.tsx` | Mode toggle component state |
| `components/SummaryCard.test.tsx` | Metric card variants |
| `lib/arb-logic.test.ts` | Arbitration simulation math |
| `lib/roster-reconstruction.test.ts` | Roster history reconstruction from transactions |

### Patterns

- Components tested with `@testing-library/react`
- Pure logic tested with direct imports
- Module aliases: `@/components/*`, `@/lib/*` (see `jest.config.ts`)

## CI Pipeline

GitHub Actions (`.github/workflows/run-tests.yml`) runs on every PR to `main`:

1. **Python lint** — `ruff check scripts/`
2. **Python tests** — `pytest` with coverage
3. **TypeScript check** — `npx tsc --noEmit`
4. **ESLint** — `npm run lint`
5. **Web tests** — `npx jest` with coverage

## Writing New Tests

- **Python:** Add `test_*.py` files in `scripts/tests/`. They're auto-discovered by pytest.
- **Web:** Add `*.test.ts` or `*.test.tsx` files in `web/__tests__/`.
- Mock external dependencies (Supabase, Playwright) — tests should not make network calls.
- Run `make ci` locally before pushing to ensure all checks pass.
