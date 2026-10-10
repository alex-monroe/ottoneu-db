# Harness Controls

Every mechanism that steers or constrains coding agents in this repo, with the
incident that justified it, what tests it, and when it can be retired.

Why keep this list: agent harnesses grow by accretion, and a control nobody can
explain becomes dead weight after the next model upgrade. Add a row whenever you
add a hook, guard, check or rule that exists because an agent got something
wrong. Remove the row, and the control, once its retirement condition is met.
Prefer a mechanical control (test, hook, settings rule) over a prose rule in
AGENTS.md: prose is advice, a failing check is a fact.

## Checks that run in CI and `just preflight`

| Control | Incident / reason | Tested by | Retire when |
|---|---|---|---|
| Architecture tests (`scripts/tests/test_architecture.py`, `web/__tests__/lib/architecture.test.ts`) — hardcoded constants, shared Supabase client, layer direction, config codegen | Agents repeatedly hardcoded `309`/`400`, called `create_client()` directly, imported components from `web/lib/` | The tests themselves; each failure prints a teaching message | Never (structural) |
| Supabase pagination scanner (`TestSupabasePagination` + web twin, #620) | Silent 1000-row truncation corrupted projections and the `/depth-charts` selector, several times | Same suites | Supabase raises its default cap, or all large-table reads go through one helper |
| Stable pagination order (`test_range_pagination_orders_by_id` + web "Supabase stable pagination order") | Unordered `.range()` pages overlapped and dropped players — fixed on web only (#568), then the Python twin blanked the same player's weekly projection (#749) | Their detection self-tests | Every paged read goes through a helper that applies the order itself |
| Weekly ingest coverage check (`find_coverage_gaps`) | Rostered players silently unmatched from the Sleeper slate showed blank lineup slots for weeks, buried under ~2,000 irrelevant "unmatched" log lines | `TestCoverageGaps` | Never (it is the monitor) |
| `TestNoWeeklyProjectionsInModel` | Risk of third-party weekly projections leaking into the market-free seasonal model | Itself | Never (methodological) |
| Docs freshness (`scripts/check_docs_freshness.py --strict`) — links, recipes named in docs, CLAUDE.md stays a pointer, orphan docs, **skills well-formed** | AGENTS.md/CLAUDE.md drifted apart by seven subsystems; docs told agents to run recipes that no longer existed; two copies of each skill diverged, one carrying `source venv/bin/activate` and Windsurf `// turbo` lines | Running it (CI step + `just preflight`) | Never |
| `just check-migrations` | Out-of-sequence migration numbers | Itself (offline) | Never |

## Environment self-diagnosis

| Control | Incident / reason | Tested by | Retire when |
|---|---|---|---|
| `just doctor` (`scripts/doctor.py`) — editable-install pin, venv import, **venv Python ≥ requires-python**, `.env` keys, `node_modules` freshness, holdout cache age | Each check is a past multi-hour debugging session: a stale editable install silently running old code; a 3.9 venv surviving the 3.12 upgrade (#627) | `scripts/tests/test_doctor.py` | Per check, once the trap is designed out |
| Justfile venv/`PYTHONPATH` resolution | In `.claude/worktrees/*` there is no `venv/`, so every `just` Python recipe failed — "always use `just`" was impossible in exactly the sessions agents run in | `just doctor` from a worktree | Worktrees get their own venv |

## Agent configuration

| Control | Incident / reason | Tested by | Retire when |
|---|---|---|---|
| Native sandbox + PreToolUse guard hooks (fp_* SQL, commits/pushes to main, prod recipes from worktrees), SessionStart fetch, async post-edit lint | See [autonomous-operation.md — Layer 3](autonomous-operation.md#layer-3--native-sandbox-and-guard-hooks), which records the incident and retirement condition per rule (#744) | `scripts/tests/test_harness_guards.py` (must-block *and* must-allow cases) | Per rule, in that table |
| Permission-prompt logger + `just permission-report` | Approved prompts leave no trace in transcripts | Manual: run the report | The team stops working in manual/accept-edits modes — since 2026-06-16 no prompts have been logged (desktop app + auto mode) |
| Subagents with restricted tools and pinned models (`.claude/agents/`: db-reader, ci-triage, command-runner on haiku; projection-evaluator on sonnet); `run-tests` forks into `command-runner` | Long eval/SQL/CI-log output flooded the Opus main context; mechanical work doesn't need Opus. Inline skill `model:` would bust the prompt cache, hence forking | Manual — compare `/explain-usage` on similar sessions | A delegated task's results start needing Opus judgment, or delegation stops saving tokens |
| Quiet test output (`just test-python` prints result + total coverage; `just preflight` runs pytest `-q --no-header -p no:warnings`) | `test-python` printed a 155-line coverage table (23 KB) into every run that only needed pass/fail; now 2.8 KB. Preflight 7.9 KB → 3.9 KB | Run the recipes | Never — `just py-coverage` has the table on demand |
| On-demand Claude PR review (`.github/workflows/claude-code-review.yml`) | Second opinion on risky PRs; formerly auto-reviewed Jules PRs | Manual (`/claude-review` comment) | It stops catching anything the local `/code-review` misses |
