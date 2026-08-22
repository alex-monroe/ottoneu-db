# CLAUDE.md

Guidance for Claude Code (claude.ai/code) working on this repository.

## Project Overview

Comprehensive database and analytics platform for Ottoneu Fantasy Football League 309 (12-team Superflex Half PPR). Python scripts scrape player data and NFL stats into a Supabase PostgreSQL database. A Next.js frontend provides interactive analytics and visualizations for player efficiency (PPG/PPS), VORP, surplus value, projected salaries, and arbitration targets.

**Tech stack:** Python 3.12 · Next.js 16 · React 19 · TypeScript · Tailwind CSS 4 · Supabase (PostgreSQL) · Playwright · pandas · Recharts

**Package Manager:** Always use `npm` for frontend dependencies and scripts. Do not use `pnpm`, `yarn`, or `bun`.

**Python:** Always use `venv/bin/python` (not `python` or `python3`). The virtualenv is at `venv/`, not `.venv/`.

## Quick Reference

- **Commands:** See [docs/COMMANDS.md](docs/COMMANDS.md) for all CLI commands (frontend, backend, just recipes, cron)
- **Architecture:** See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for system design, data pipeline, and analysis pipeline
- **Frontend:** See [docs/FRONTEND.md](docs/FRONTEND.md) for routes, components, types, and config
- **Code layout:** See [docs/CODE_ORGANIZATION.md](docs/CODE_ORGANIZATION.md) for key file locations and config
- **Database:** See [docs/generated/db-schema.md](docs/generated/db-schema.md) for table schemas and relationships
- **Testing:** See [docs/TESTING.md](docs/TESTING.md) for running Python and web tests
- **Git workflow:** See [docs/GIT_WORKFLOW.md](docs/GIT_WORKFLOW.md) for branch and PR requirements
- **Ottoneu rules:** See [docs/references/ottoneu-rules.md](docs/references/ottoneu-rules.md) for scoring, roster, salary cap, and arbitration rules
- **Ottoneu strategy:** See [docs/references/ottoneu-strategy.md](docs/references/ottoneu-strategy.md) for format economics (surplus value, raise treadmill, Superflex QB premium, arbitration tax) and the reasoning checklist used by the `/ottoneu-roster-question` skill. Use the `/ottoneu-roster-question` skill (which loads this + live data via `just roster-context`) to answer advanced keeper/trade/auction/arbitration questions.
- **Environment:** See [docs/references/environment-variables.md](docs/references/environment-variables.md) for `.env` setup
- **MCP Server:** See [docs/references/mcp-server.md](docs/references/mcp-server.md) for the remote MCP endpoint (`/api/mcp/mcp`) that exposes league data (rosters, projections, values, arbitration) to MCP clients/AI agents. Dual auth: shared key via `MCP_API_KEY`, or per-user OAuth 2.1 (the site is its own authorization server — `web/lib/oauth/`, gated on `has_projections_access`) for clients like Gemini Spark that require it. Tool registry in `web/lib/mcp/tools.ts`; client provisioning via `just oauth-client`
- **Roster CSV Reconciliation:** See [docs/references/roster-csv-reconciliation.md](docs/references/roster-csv-reconciliation.md) for the lighter-weight roster-state sync (`just reconcile-roster`) — ingests Ottoneu's `/csv/rosters` export into `league_prices` (+ inferred transactions) when the Playwright scrape is Cloudflare-blocked. Runs alongside the scrape via `.github/workflows/pull-roster-csv.yml` (daily/on-demand). Note: the CSV endpoint works from GitHub-hosted runners as long as an **honest User-Agent** is sent (spoofing a browser UA — not the datacenter IP — is what trips Cloudflare); `OTTONEU_COOKIE` is only an optional fallback. The CSV has no FAs/transaction history
- **Mock Draft:** See [docs/references/mock-draft.md](docs/references/mock-draft.md) for the `/mock-draft` practice auction — a real-time (English) auction against AI opponents (`web/lib/mock-draft-live.ts`) plus the original turn-by-turn sealed-bid mode, both seeded from live rosters/caps and Draft Sharks market values. A setup slider adds **manager valuation noise** (0 → ±90%): each rival gets a private, draft-stable price for every player
- **Auction Simulator:** See [docs/references/auction-simulator.md](docs/references/auction-simulator.md) for the offline Monte-Carlo keeper-auction sim (`scripts/auction_simulator.py`) — thousands of simulated drafts to price a target list. The `/mock-draft` AI opponents are a port of its heuristics
- **League Explorer:** See [docs/references/league-explorer.md](docs/references/league-explorer.md) for the cross-league survey tool (`just league-explorer`) — scrapes other public Ottoneu leagues (settings, standings history, champions, roster/salary snapshots) into a local SQLite DB at `data/league_explorer/`, separate from Supabase
- **Autonomous operation:** See [docs/references/autonomous-operation.md](docs/references/autonomous-operation.md) for the permission-friction strategy — allowlist design, prompt-rate metrics (`just permission-report`), and the `.devcontainer/` for safely running `claude --dangerously-skip-permissions`
- **Season cycle:** See [docs/exec-plans/season-cycle.md](docs/exec-plans/season-cycle.md) — the site rolls between Ottoneu seasons from the `league_calendar` table; the current season is resolved at runtime via `scripts/season.py` and `web/lib/season.ts`, not from static config
- **Projection Accuracy Plan:** See [docs/exec-plans/projection-accuracy-improvement.md](docs/exec-plans/projection-accuracy-improvement.md) for the 4-phase accuracy improvement roadmap (Issues #271-#285)
- **Projection Accuracy:** The gate for any projection change is the **leakage-free held-out harness** — `just holdout-eval` (#572/#594) + `just significance` (#573/#594), not the in-sample `just accuracy-report` (which is a secondary diagnostic only). See Projection Model Update Requirements below.
- **Projection Iteration:** Use `/experiment` to run a full experiment loop (train → project → backtest → verdict). Use `/ablation` for feature ablation studies, `/feature-importance` for learned model inspection, `/compare-models` for side-by-side comparisons, `/diagnose-segment` for segment deep-dives.
- **Market Projections:** See [docs/exec-plans/market-projections.md](docs/exec-plans/market-projections.md) for the market-based projection system (DEFERRED)
- **Experiment Log:** See [docs/generated/experiment-log.md](docs/generated/experiment-log.md) for history of all model iteration attempts.
- **Retrospective:** Use `/retro` skill after completing a task to surface friction points and open a PR with doc/skill improvements.
- **Build System Spec:** See [docs/superpowers/specs/2026-04-19-build-system-design.md](docs/superpowers/specs/2026-04-19-build-system-design.md) for the transition specification to `just` build runner
- **Build System Plan:** See [docs/superpowers/plans/2026-04-19-build-system-just.md](docs/superpowers/plans/2026-04-19-build-system-just.md) for the build system migration step-by-step plan

## Documentation Map

Skills (`.claude/commands/`): `ablation`, `compare-models`, `create-pr`, `diagnose-segment`, `experiment`, `feature-importance`, `ottoneu-roster-question`, `projection-accuracy`, `retro`, `review-permission-gates`, `run-analyses`, `run-scraper`, `run-tests`, `start-dev`

```
CLAUDE.md                              ← you are here
AGENTS.md                              ← universal agent instructions
docs/
├── ARCHITECTURE.md                    # System design, data + analysis pipelines, tech stack
├── CODE_ORGANIZATION.md               # Key file locations, Python/TS config
├── COMMANDS.md                        # All CLI commands (frontend, backend, just recipes, cron)
├── FRONTEND.md                        # Routes, components, types, analysis logic
├── GIT_WORKFLOW.md                    # Branch strategy, PR requirements
├── TESTING.md                         # Python + web test setup and CI
├── exec-plans/
│   ├── [data-acquisition-spike-651.md](docs/exec-plans/data-acquisition-spike-651.md)  # Spike #651: next data-acquisition lever — coaching change built→TIE, FA/contract next
│   ├── [feature-projections.md](docs/exec-plans/feature-projections.md)         # Feature-based player projection system
│   ├── [market-projections.md](docs/exec-plans/market-projections.md)          # Market-based projection system (DEFERRED)
│   ├── [projection-accuracy-improvement.md](docs/exec-plans/projection-accuracy-improvement.md)  # 4-phase accuracy improvement roadmap
│   ├── [projection-methodology-audit.md](docs/exec-plans/projection-methodology-audit.md)  # ML-quality audit: train/test leakage + eval findings (#571–#577)
│   ├── [projection-system-review.md](docs/exec-plans/projection-system-review-2026-06.md)  # 2026-06 expert review + implementation plan (#594–#599, waves for #587–#592)
│   ├── [structural-projection-levers-667.md](docs/exec-plans/structural-projection-levers-667.md)  # Spike #667 CLOSED: structural levers — L4 ranking gate built; L3 EB pooling (v44) SIGNIFICANT QB win (promotion deferred); L1/L5 efficiency reframes tie/negative; L2 feasible-but-deprioritized
│   ├── [python-312-upgrade-spike.md](docs/exec-plans/python-312-upgrade-spike.md)  # Spike: Py3.9→3.12 + pandas 2.x — GO verdict + nfl_data_py blocker (#627)
│   ├── [qb-usage-share.md](docs/exec-plans/qb-usage-share.md)              # QB Usage Share findings and next steps
│   └── [season-cycle.md](docs/exec-plans/season-cycle.md)                # Cross-season data & UI scheme (date-driven season-cycle resolver)
├── generated/
│   ├── [db-schema.md](docs/generated/db-schema.md)                   # Database tables, keys, relationships
│   ├── [experiment-log.md](docs/generated/experiment-log.md)              # History of all model iteration attempts
│   ├── [player-diagnostics.md](docs/generated/player-diagnostics.md)          # Per-player backtest diagnostics
│   ├── [projection-accuracy.md](docs/generated/projection-accuracy.md)         # Projection model accuracy report (in-sample; see audit caveat)
│   ├── [projection-holdout-eval.md](docs/generated/projection-holdout-eval.md)     # Held-out (leakage-free) model re-ranking — `just holdout-eval` (#572); naïve baselines (#575)
│   ├── [projection-holdout-eval-matched.md](docs/generated/projection-holdout-eval-matched.md) # Held-out re-ranking on the common player set — apples-to-apples FantasyPros — `just holdout-eval --matched` (#575)
│   ├── [projection-holdout-eval-rolling.md](docs/generated/projection-holdout-eval-rolling.md) # Held-out re-ranking, rolling-origin protocol — `just holdout-eval --protocol rolling` (#594)
│   ├── [projection-availability-eval.md](docs/generated/projection-availability-eval.md) # Availability-inclusive backtest — rate vs availability budget — `just availability-backtest` (#574)
│   ├── [coverage-analysis.md](docs/generated/coverage-analysis.md)            # Qualifying-population coverage: player_stats vs nflverse — `just coverage-report` (#599)
│   ├── [rookie-backtest.md](docs/generated/rookie-backtest.md)             # Rookie (0-history) projection backtest — draft_capital vs baselines
│   └── [segment-analysis.md](docs/generated/segment-analysis.md)            # Segmented projection accuracy analysis
├── references/
│   ├── [autonomous-operation.md](docs/references/autonomous-operation.md)        # Permission-friction strategy: allowlist, prompt metrics, devcontainer
│   ├── environment-variables.md       # .env and .env.local variable reference
│   ├── [league-explorer.md](docs/references/league-explorer.md)             # Cross-league survey: other Ottoneu leagues → local SQLite (just league-explorer)
│   ├── [roster-csv-reconciliation.md](docs/references/roster-csv-reconciliation.md)  # /csv/rosters → league_prices sync (just reconcile-roster) — Cloudflare-blocked-scrape fallback
│   ├── [auction-simulator.md](docs/references/auction-simulator.md)         # Offline Monte-Carlo keeper-auction sim (scripts/auction_simulator.py)
│   ├── [mock-draft.md](docs/references/mock-draft.md)                 # /mock-draft practice auction: live real-time mode + turn-by-turn
│   ├── [mcp-server.md](docs/references/mcp-server.md)                  # Remote MCP endpoint (/api/mcp/mcp): league-data tools for AI agents, bearer-key auth
│   ├── ottoneu-rules.md               # Scoring, roster, salary cap, arbitration rules
│   └── ottoneu-strategy.md            # Format economics + AI reasoning checklist for roster construction
└── superpowers/
    ├── plans/
    │   └── [2026-04-19-build-system-just.md](docs/superpowers/plans/2026-04-19-build-system-just.md) # Transition from Make to Just plan
    └── specs/
        └── [2026-04-19-build-system-design.md](docs/superpowers/specs/2026-04-19-build-system-design.md) # Just build system specification
```

## GitHub Repository

When using GitHub MCP tools or `gh` CLI, the repository coordinates are:
- **Owner:** `alex-monroe`
- **Repo:** `ottoneu-db` (hyphen, not underscore)

Note: The local directory is `ottoneu_db` (underscore) but the GitHub repo name uses a hyphen.

## Worktree Notes

- **Python venv:** The virtualenv lives at the main repo's `venv/`, not in worktrees. In a worktree, use the absolute path `<main-repo>/venv/bin/python` instead of `source venv/bin/activate` or relative `venv/bin/python`. The `source venv/bin/activate` command will fail in worktrees.
- **Production actions** (like `promote.py`) should run from the main repo after merging, not from a worktree, since they modify shared production data.
- **Directory creation:** Prefer `mcp__filesystem__create_directory` over `Bash(mkdir -p ...)` — the MCP tool is pre-approved and avoids a permission prompt.

## Python Style

- **Target version: Python 3.12** (upgraded from 3.9 in #627). Modern syntax is fine — `X | Y` unions, built-in generics (`list[int]`, `dict[str, X]`), etc.
- **Exception:** `.claude/hooks/*.py` run under the host's *system* `python3` (which may be older, e.g. macOS 3.9), so keep those hook scripts stdlib-only and conservative.

## Architectural Rules (Enforced by Tests)

These rules are mechanically enforced by structural tests in `scripts/tests/test_architecture.py` and `web/__tests__/lib/architecture.test.ts`. If you violate them, tests will fail with a teaching message explaining the fix.

- **No hardcoded constants:** Import league constants from `scripts.config` (Python) or `@/lib/config` (TypeScript). Never use literal values like `309`, `400`, etc.
- **Use the shared Supabase client:** Always use `get_supabase_client()` from `scripts.config` — never call `create_client()` directly.
- **Config codegen:** `config.json` is the single source of truth. After adding/changing a key, run `just gen-config` — it regenerates the marked constant blocks in `scripts/config.py` and `web/lib/config.ts` (do not hand-edit those blocks). `TestConfigCodegen` fails with "run `just gen-config`" if they're stale.
- **Dependency direction:** Analysis scripts must NOT import from `scripts/tasks/`. Query the database instead.
- **Frontend layers:** `web/lib/` must NOT import from `web/components/`. Flow: types → config → lib → components → pages.
- **Shared types:** Define interfaces in `web/lib/types.ts`, not in component files.
- **No wildcard imports:** Use explicit named imports (`from module import X, Y`).
- **Documentation exists:** All docs referenced in this file must exist and have content.

Run `just check-arch` to validate these rules locally.

## Critical Rules

- **Always use `just <recipe>`** instead of invoking Python, pytest, or npm scripts directly. This ensures the correct venv and flags are used, and keeps the agent allowlist minimal. Run `just --list` to see available recipes. Common ones: `just typecheck`, `just lint`, `just test-web`, `just test-python`, `just train MODEL`, `just project MODEL`, `just backtest MODEL`, `just promote MODEL`, `just accuracy-report`, `just diagnostics`, `just segment-analysis`, `just analyze` (runs `update_projections.py` — re-projects the active model + promotes to `player_projections` + rookie fallback), `just backfill-nfl-stats`, `just backfill-draft-capital`, `just backfill-vegas`, `just backfill-depth-charts`, `just seed-win-totals`, `just scrape-draft-sharks`, `just reconcile-roster` / `just scrape-player-cards` (Ottoneu roster + transactions over plain HTTP — no browser), `just dev` / `just dev-stop` (start/stop the Next.js dev server — use `dev-stop` instead of raw `pkill`). For ad-hoc DB inspection use `just py "<snippet>"`.
- **When something is off, run `just doctor` first.** It diagnoses the known environment traps (stale editable mapping, broken venv, missing `.env` keys, stale `web/node_modules`, stale `.cache/holdout`) offline in ~1s and prints the fix for each.
- **Editable install can run stale `scripts/` code.** If a `scripts/*.py` edit doesn't take effect via `venv/bin/python scripts/foo.py` (but works via `python -c`), the editable install is likely pinned to a stale `.claude/worktrees/` path — `just doctor` flags this; the fix is `venv/bin/pip install -e .` from the project root. See [docs/TESTING.md](docs/TESTING.md#gotcha-editable-install-can-pin-scripts-to-a-stale-worktree).
- **New DB tables need a TS type + the config contract is enforced.** After adding a table (e.g. via `mcp__supabase__apply_migration` or Supabase dashboard), hand-add its `Row`/`Insert`/`Update` block to `web/types/supabase.ts` or `npx tsc` fails — hand-add rather than fully regenerating to avoid churning the `fp_*` tables. Separately, every key in `config.json` is rendered into the generated constant blocks of `scripts/config.py` and `web/lib/config.ts` by `just gen-config`; `scripts/tests/test_architecture.py` (`TestConfigCodegen`) fails if those blocks are stale. So to add/remove a key: edit `config.json`, then run `just gen-config`.
- **Do not touch `fp_*` tables.** The Supabase project is shared with the `fantasy-pulse` app. Tables whose names start with `fp_` (currently `fp_notes`, `fp_user_integrations`, `fp_leagues`, `fp_teams`, but the prefix is the rule, not the list) are owned by that other codebase. Do not read from, write to, alter, drop, or migrate them from this repo. They will appear in `list_tables` output and in regenerated Supabase TS types — ignore them. See [docs/generated/db-schema.md](docs/generated/db-schema.md#shared-database--hands-off-fp_).
- **Update documentation:** Always try to update the agent documentation after completing a task. Update existing documents or add new documents and sections as needed to reflect architectural or contextual changes.
- **Never commit directly to `main`.** All changes go through pull requests.
- **Always create a PR.** Every task must end with `gh pr create --fill`.
- **Run `just preflight` before pushing.** It mirrors CI's pass/fail (lint + typecheck + both test suites without coverage + doc checks) in ~9s, so failures surface locally instead of in a multi-minute CI round-trip. `just install-hooks` installs it as an opt-in pre-push hook (`git push --no-verify` to skip a WIP push).
- **Start from updated main:** `git checkout main && git pull origin main` before branching.
- **Bash cwd persists between calls.** A `cd web && …` leaves the shell in `web/`, so a later repo-root-relative path (e.g. `git add web/next.config.ts`) silently fails. Prefer absolute paths, `git -C <repo-root>`, or re-`cd` explicitly rather than assuming the working directory.
- See [docs/GIT_WORKFLOW.md](docs/GIT_WORKFLOW.md) for full details.

## Projection Model Update Requirements

When any task modifies the projection system — including `scripts/feature_projections/`, `scripts/projection_methods.py`, `scripts/update_projections.py`, or `model_config.py` — you MUST validate it on the **leakage-free held-out harness**. The in-sample `accuracy-report` scores learned models on the seasons they trained on (methodology audit, Findings 1 & 2); it is a **secondary diagnostic only** and must never be the gate or the basis for a promote decision. Use `/experiment` to run this flow.

1. **Run the held-out re-rank** against production (`v33_tuned_base`) and the naïve baselines, on the rolling-origin protocol (#594). Learned models retrain out-of-sample inside the sandbox; additive/external models need their held-out projections generated first (`just project <name> 2023,2024,2025`). The cache (#597) makes re-runs fast.
   ```
   just holdout-eval --protocol rolling --eval-seasons 2023,2024,2025 --min-train-season 2021 \
     --models <name>,v33_tuned_base,naive_prior_season_ppg,position_mean_baseline
   ```
2. **Test significance vs the active model** (player-clustered paired bootstrap). This is the gate — a point-estimate MAE delta is **not** a result:
   ```
   just significance <name> v33_tuned_base --protocol rolling --eval-seasons 2023,2024,2025 --min-train-season 2021
   ```
   **Ranking gate (#667 L4):** add `--metric spearman --position <QB|RB|WR|TE>` to bootstrap the **Spearman-ρ delta** instead of the MAE delta — the within-position *ordering* gate the downstream consumers (VORP, surplus, auction, keepers) actually care about (#598). The ranking signal is larger than the MAE signal, so this gate detects ordering wins/losses the underpowered MAE bootstrap is blind to (it confirmed FP significantly out-orders v33 at QB, ρ 0.71 vs 0.81, p=0.001). For ordering-targeted changes, gate on ρ and require MAE not significantly regress; for level changes, the reverse.
   Availability-touching changes additionally run `just availability-backtest` and report **both** rate and availability MAE (#574).
3. **In the PR description**, lead with the held-out ranking + significance verdict (and the per-position Ranking-quality rows, #598). Include the in-sample `accuracy-report` table only if labelled "in-sample diagnostic — not the ranking".
4. **Promotion requires a *significant* held-out win over the active model** (CI excludes 0), never a point-estimate delta. Promote via `just promote <model>` (or `cli.py promote --model <name>`) — `update_projections.py` reads `projection_models.is_active` dynamically (no hardcoded `ACTIVE_MODEL`). Methodology copy on `/projections`, `/arbitration` (projected mode), and `/projection-accuracy` is rendered live by `<ActiveModelCard>` (`web/components/ActiveModelCard.tsx`) from `fetchActiveProjectionModel()`, so do **not** hardcode model names or feature lists in page copy.

**Confirmation discipline (#594):** iterate against the rolling folds; the final window (2025, then 2026 actuals) is confirmation-only — one look per experiment. See [docs/exec-plans/projection-methodology-audit.md](docs/exec-plans/projection-methodology-audit.md) for the protocol. This ensures every projection change is empirically validated, out-of-sample, before merge.

### Feature changes require test updates

When adding or rewriting a projection feature, check and update the corresponding tests in `scripts/tests/test_feature_projections.py`. Each feature class has a `Test<FeatureName>Feature` test class. Behavioral changes (e.g., a feature that previously required 2 seasons now works with 1) will cause existing tests to fail in CI if not updated.

### Rookie snap trajectory (weighted_ppg feature)

The `WeightedPPGFeature` applies an H2/H1 snap-per-game multiplier to first-year players (`_rookie_trajectory`). This is appropriate for skill positions (WR/RB/TE) where rising snap share signals growing role. It is **not** appropriate for:

- **QB**: A starting QB already receives all offensive snaps. A high H2/H1 ratio simply means they took over mid-season, not that they'll be better next year.
- **K**: Snap counts are irrelevant to kicker scoring.

`v12_no_qb_trajectory` and every model that inherits its base feature (e.g. `WeightedPPGNoQBTrajectoryFeature`) disable the trajectory for QB and K. Do not re-enable it for those positions in new models.

### Database migration workflow

Migration files live in `migrations/` and follow the `NNN_snake_case.sql` convention (zero-padded, contiguous sequence) documented in [migrations/README.md](migrations/README.md). The naming and sequence are linted offline by `just check-migrations` (also run under `just check-arch` and `just test-python`). The remote `supabase_migrations.schema_migrations` table — auditable via the `list_migrations` MCP tool — is the system of record for what has actually been applied.

After creating a new migration file in `migrations/` (numbered as the current highest + 1) and applying it (via `mcp__supabase__apply_migration` or the Supabase dashboard):

1. **Regenerate TypeScript types** using `mcp__supabase__generate_typescript_types` (or `npx supabase gen types typescript`).
2. **Update `web/types/supabase.ts`** with the regenerated output so the Supabase client recognizes the new table.
3. **Update `docs/generated/db-schema.md`** — add the new table to the table list and increment the table count.
4. **Verify with `just check-schema`** — a read-only, on-demand drift check that introspects the live DB and diffs it against `web/types/supabase.ts` and `docs/generated/db-schema.md` (ignoring `fp_*`). It catches a skipped step 2 or 3 (table or column missing from types/docs) immediately instead of as a later confusing `tsc` error, and exits nonzero on drift.

Skipping step 2 will cause TypeScript errors like `Argument of type '"new_table"' is not assignable to parameter of type '...'` when querying the new table.

### Supabase pagination

Supabase's Python client defaults to a **1000-row limit** on `.execute()` calls. Any query that may return more than 1000 rows must use paginated `.range(offset, offset + page_size - 1)` fetching in a loop. This has caused silent bugs in `promote.py`, `analysis_utils.fetch_multi_season_stats` (a 3-season history fetch is ~2k rows — truncation silently dropped player-season rows, corrupting weighted-PPG bases and projections), and `feature_projections/backtest.py` (a single recent season of `player_stats` now exceeds 1000 rows) — all now fixed. A single recent NFL season of `player_stats` is already >1000 rows, so even single-season fetches need pagination now. Apply the same pattern in any new bulk-fetch code.

**The web JS/TS client (`web/lib/`) has the same 1000-row default cap.** This silently broke the `/depth-charts` season selector — `depth_charts` has thousands of rows, so a plain `.select("season")` returned only the most recent ~1000 and dropped older seasons (fixed in `web/lib/depth-charts.ts` by looping `.range()`). Watch for it on any web query against a large table (`depth_charts`, `nfl_stats`, `player_stats`, `model_projections`) — distinct-value or full-table reads must paginate, and a query meant for one model/season should filter (`.eq("model_id", …)`/`.eq("season", …)`) rather than fetch-all-then-filter, or it will both truncate and mix in other rows.

**This is now mechanically enforced (#620).** `TestSupabasePagination` in `scripts/tests/test_architecture.py` and the "Supabase Pagination" suite in `web/__tests__/lib/architecture.test.ts` statically scan for non-paginated reads against the large tables (`player_stats`, `nfl_stats`, `depth_charts`, `model_projections` — the `LARGE_TABLES` list in each test, kept in sync across the two languages) and fail `just check-arch` if one is found. Read through the paginated helpers instead of a bare `.table(...).execute()` / `.from(...).select(...)`:
- **Python:** `fetch_all_rows(supabase, table, select, filters=[("eq", "season", s)])` from `scripts.config` (filters accept `eq`/`in_`/`lt`/`gte`/`lte`), or `_fetch_seasons_paginated` / `fetch_multi_season_stats` in `analysis_utils`.
- **Web:** `fetchAllRows((from, to) => supabase.from(table).select(...).eq(...).order("…").range(from, to))` from `web/lib/supabase.ts`.

The scanners accept a non-paginated query only when it is provably bounded: a write (`upsert`/`insert`/`update`/`delete`), `.single()`/`.maybeSingle()`, a head-only `count`, `.limit(n)` with n < 1000, or an explicit `# pagination-safe: <reason>` (Python) / `// pagination-safe: <reason>` (web) comment on or just above the query.
