# Testing

## Python Tests

- **Location:** `scripts/tests/`
- **Config:** `pyproject.toml` (or `scripts/pytest.ini`)
- **Venv path:** `venv/` (not `.venv/`) — activate with `source venv/bin/activate`
- **Run:** `python -m pytest` from project root (venv must be active), or directly via `venv/bin/pytest`

## Web Tests

- **Location:** `web/__tests__/`
- **Config:** `web/jest.config.ts`
- **Run:** `npm test` from `web/`

### TypeScript type-checking

Use `tsc --noEmit` for local type-checking — **do not use `npm run build`** for this purpose:

```bash
cd web && ./node_modules/.bin/tsc --noEmit
```

`npm run build` requires `config.json` (present in CI/production, absent in local dev) and will fail with a "Module not found" error unrelated to your changes.

## Key Test Files

- **`scripts/tests/test_feature_projections.py`** — Tests for all projection features (`TestWeightedPPGFeature`, `TestAgeCurveFeature`, `TestUsageShareFeature`, etc.), the combiner, and model config
- **`scripts/tests/test_projection_regression.py`** — Regression tests: monotonicity, symmetry, bounds, feature direction, combiner additivity
- **`scripts/tests/test_feature_contracts.py`** — Contract tests: every feature's `compute()` must return None or float, handle edge cases, stay within range bounds
- **`scripts/tests/test_learned_model_validation.py`** — Validates trained model JSON artifacts: structure, dimensions, coefficient reasonableness, overfitting detection
- **`scripts/tests/test_cross_model_consistency.py`** — Cross-model checks: feature registry coverage, baseline existence, learned model files, no duplicates, known equivalences
- **`scripts/tests/test_architecture.py`** — Structural/architectural enforcement tests
- **`scripts/tests/test_projection_methods.py`** — Legacy projection method tests

## Coupled Test Data

Some tests have hardcoded expected values tied to configuration constants. When updating these constants, the corresponding tests must be updated too:

- **`POSITION_AGE_CURVES`** in `features/age_curve.py` → `test_feature_projections.py::TestAgeCurveFeature` (test_qb_at_peak, test_qb_past_peak, test_rb_young)
- **Feature behavior changes** (e.g., minimum data requirements, scaling factors) → corresponding `Test<FeatureName>Feature` class in `test_feature_projections.py`

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
