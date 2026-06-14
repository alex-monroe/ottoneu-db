# Testing

## Python Tests

- **Location:** `scripts/tests/`
- **Config:** `pyproject.toml` (or `scripts/pytest.ini`)
- **Venv path:** `venv/` (not `.venv/`) — activate with `source venv/bin/activate`
- **Run:** `just test-python` (preferred) or `venv/bin/pytest` from project root
- **Coverage flags:** `pyproject.toml` sets `addopts = "--cov=scripts --cov-report=term-missing"`. Do not pass `--cov` flags explicitly — they conflict with and override the configured scope.

### First step: `just doctor`

When a `scripts/` change isn't behaving, or anything about the environment seems off, run `just doctor` before deep-diving. It checks the known traps offline in ~1s — stale editable mapping, broken venv / `import scripts.config`, missing `.env` keys, stale `web/node_modules`, stale `.cache/holdout` — and prints the fix command for each. It exits nonzero only on hard failures (broken venv, stale/missing editable mapping). The stale-worktree gotcha below is the first thing it catches.

### Gotcha: editable install can pin `scripts` to a stale worktree

The repo is installed as an editable package (`pip install -e .`). The import finder at `venv/lib/python3.9/site-packages/__editable___ottoneu_db_0_1_0_finder.py` hard-codes a `MAPPING` dict with the on-disk path of the `scripts` package. If `pip install -e .` was last run from inside a git worktree (e.g. `.claude/worktrees/agent-*/`), that mapping points at the **worktree**, not your main checkout.

**Symptom:** edits to `scripts/*.py` silently don't take effect when run via `venv/bin/python scripts/foo.py` (it imports the stale worktree copy). Confusingly, `venv/bin/python -c "from scripts.x import ..."` *does* pick up your edit, because `-c` puts the project root first on `sys.path`, shadowing the editable finder. So isolated tests pass while the real script runs old code.

**Diagnose:** `just doctor` (reports the editable mapping target), or `grep MAPPING venv/lib/python3.9/site-packages/__editable___ottoneu_db_0_1_0_finder.py` — if it points at a worktree path, that's the bug.

**Fix:** run `venv/bin/pip install -e .` from the project root to repoint the mapping.

## Web Tests

- **Location:** `web/__tests__/`
- **Config:** `web/jest.config.ts`
- **Run all:** `just test-web` (runs the full suite with coverage)
- **Run one file:** `just test-web-file <path>` — e.g. `just test-web-file __tests__/lib/session.test.ts`. Prefer this over raw `npx jest <file>` so the call is covered by the `Bash(just:*)` allowlist.

### Web verification: `just typecheck` vs `just build`

Two levels of local verification for web changes:

- **`just typecheck`** (`tsc --noEmit`) — fast, fully offline. The default check while iterating.
  ```bash
  just typecheck      # or: cd web && ./node_modules/.bin/tsc --noEmit
  ```
- **`just build`** (`next build`) — highest fidelity: full type check **plus** prerender of every route. Run this before pushing web changes. `config.json` is committed at the repo root (league constants only, no secrets), so the build resolves it without any manual copy step.
  ```bash
  just build
  ```

> **Offline caveat:** `next build` prerenders `app/layout.tsx`, which uses `next/font/google` (Geist) — that fetches the font from Google Fonts at build time, so the build needs network access. In a fully network-isolated sandbox `just build` fails on the font fetch (not on `config.json`); use `just typecheck` there instead.

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

- **Python:** `scripts/tests/test_architecture.py` — config sync, dependency direction, import rules, doc existence, Supabase pagination (no raw `.execute()` on large tables)
- **TypeScript:** `web/__tests__/lib/architecture.test.ts` — layer boundaries, type locations, config sync, Supabase pagination (no raw `.select()` on large tables)

The Supabase pagination rule (#620) statically flags any non-paginated read against `player_stats` / `nfl_stats` / `depth_charts` / `model_projections` (the `LARGE_TABLES` list in each test). Route large reads through `fetch_all_rows` (Python) / `fetchAllRows` (web), or annotate a provably-bounded query with a `pagination-safe` comment. See the "Supabase pagination" section of CLAUDE.md.

```bash
just check-arch    # Run architectural tests only
```

## Documentation Freshness Check

Scans for stale docs, broken links in AGENTS.md/CLAUDE.md, and orphan files.

```bash
just check-docs    # Informational (warnings only)
python scripts/check_docs_freshness.py --strict   # Fail on any issue
```

## CI

GitHub Actions runs both test suites plus documentation checks on every PR (`.github/workflows/run-tests.yml`).

## Running All Tests

```bash
just test    # Runs both Python and web tests
just ci      # Full CI suite: lint + typecheck + tests + doc checks
```
