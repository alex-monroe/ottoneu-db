# Subsystem Map

Thirty database tables, ~175 Python files, and 21 web routes divide cleanly into six
subsystems. Use this page to scope a change: find the subsystem, and you have its
tables, its code, its routes, and its reference doc.

The dependency order is strictly downward — each subsystem reads from the ones above it
and never the reverse.

```
  1. League state ───┐
                     ├──> 3. Season projections ──> 4. Valuation & web analytics
  2. NFL statistics ─┘                                        │
                                                              ├──> 6. Drafting & simulation
  5. Accounts, auth & MCP ────────────────────────────────────┘
```

---

## 1. League state

**What Ottoneu says is true right now** — who owns whom, at what salary, and what
happened. Pulled over plain HTTP with an honest User-Agent; no browser.

| | |
|---|---|
| **Tables** | `players` · `league_prices` · `transactions` · `league_calendar` · `arbitration_progress` · `arbitration_progress_teams` · `arbitration_allocation_details` |
| **Ingestion** | `scripts/reconcile_roster.py` (roster CSV → salaries) · `scripts/scrape_player_cards.py` (transaction history) · `scripts/scrape_league_calendar.py` (season boundary dates) · `scripts/scrape_arbitration_progress.py` |
| **Support** | `scripts/prospect_adopt.py` (college→NFL identity merge) · `scripts/transaction_dedupe.py` · `scripts/season.py` + `web/lib/season.ts` (season-cycle resolver) |
| **Commands** | `just reconcile-roster` · `just scrape-player-cards` · `just scrape-calendar` · `just dedupe-transactions` |
| **Routes** | `/rosters` · `/arb-progress` |
| **Docs** | [references/roster-csv-reconciliation.md](references/roster-csv-reconciliation.md) · [exec-plans/season-cycle.md](exec-plans/season-cycle.md) · [references/ottoneu-rules.md](references/ottoneu-rules.md) |

**Watch out:** one human can hold several Ottoneu IDs across the college→NFL transition.
`prospect_adopt.py` reconciles this; don't create a second `players` row for a drafted
prospect. The current season is resolved at runtime from `league_calendar` — never
hardcode a year.

---

## 2. NFL statistics

**What happened on the field**, from [nflverse](https://github.com/nflverse) and a few
other public sources. Everything here is raw input to the projection model; none of it
is league-specific.

| | |
|---|---|
| **Tables** | `nfl_stats` (real NFL stats) · `player_stats` (the same seasons re-scored under Ottoneu rules) · `depth_charts` · `draft_capital` · `player_contracts` · `red_zone_usage` · `ngs_passing` · `team_vegas_lines` · `team_coaching` · `scraper_jobs` (job queue) |
| **Ingestion** | `scripts/backfill_nfl_stats.py` · `backfill_depth_charts.py` · `backfill_draft_capital.py` · `backfill_ngs_passing.py` · `backfill_red_zone.py` · `backfill_team_coaching.py` · `backfill_vegas_lines.py` · `seed_preseason_win_totals.py` |
| **Queue** | `scripts/enqueue.py` → `scripts/worker.py` → `scripts/tasks/` (`pull_nfl_stats`, `pull_player_stats`) |
| **Commands** | `just backfill-nfl-stats` · `just backfill-depth-charts` · `just backfill-draft-capital` · `just backfill-ngs` · `just backfill-red-zone` · `just backfill-vegas` · `just seed-win-totals` · `just coverage-report` |
| **Routes** | `/vegas-lines` · `/depth-charts` (both exist to spot-check the data feeding specific model features) |
| **Docs** | [ARCHITECTURE.md](ARCHITECTURE.md#data-pipeline) · [generated/db-schema.md](generated/db-schema.md) · [GLOSSARY.md](GLOSSARY.md#2-nfl-advanced-stats) |

**Watch out:** `player_stats` and `nfl_stats` are easy to confuse. `nfl_stats` is real
football (passing yards, snaps); `player_stats` is fantasy scoring (PPG, PPS) computed
from it. Every signal here must be **leakage-free** — knowable before the projected
season starts. That is why depth charts, draft capital, Vegas totals and coaching
changes qualify, and in-season results do not.

---

## 3. Season projections

**The model.** Turns statistical history into one `projected_ppg` per player per season.
This is the largest and most methodologically strict subsystem in the repo.

| | |
|---|---|
| **Tables** | `projection_models` (registry, holds `is_active`) · `model_projections` (every model's output) · `player_projections` (the active model's output, promoted) · `backtest_results` |
| **Features** | `scripts/feature_projections/features/` — one file per signal |
| **Models** | `scripts/feature_projections/model_config.py` — 55 definitions labelled `production` / `baseline` / `external` / `archived`. `just list-models --check` confirms the label against the database. |
| **Pipeline** | `train_model.py` → `runner.py` → `backtest.py` → `promote.py`, driven by `cli.py` |
| **Eval harness** | `holdout_eval.py` · `significance.py` · `availability_backtest.py` · `holdout_cache.py` |
| **Production entry** | `scripts/update_projections.py` (reads `is_active` at runtime — the model name is never hardcoded) |
| **Commands** | `just train` · `just project` · `just backtest` · `just holdout-eval` · `just significance` · `just promote` · `just analyze` · `just list-models` |
| **Routes** | `/projections` · `/projection-accuracy` |
| **Docs** | [exec-plans/feature-projections.md](exec-plans/feature-projections.md) · [exec-plans/projection-methodology-audit.md](exec-plans/projection-methodology-audit.md) · [generated/experiment-log.md](generated/experiment-log.md) · [GLOSSARY.md](GLOSSARY.md#3-projection--evaluation-methodology) |

**Watch out:** changes here have a hard gate — a *significant* out-of-sample win on the
rolling-origin held-out harness, not a point-estimate improvement, and not the in-sample
`accuracy-report`. The full protocol is in [AGENTS.md](../AGENTS.md). Weekly projections
(subsystem 4) must never feed this subsystem; a test enforces it.

---

## 4. Valuation & web analytics

**Turning projections into decisions.** All the league-economics maths lives in
TypeScript, not Python — this is the most common thing newcomers get wrong.

| | |
|---|---|
| **Tables** | `surplus_adjustments` · `arbitration_plans` · `arbitration_plan_allocations` · `draft_sharks_values` · `weekly_projections` |
| **Core logic** | `web/lib/vorp.ts` · `surplus.ts` · `analysis.ts` · `arbitration.ts` · `arb-logic.ts` · `lineup.ts` · `scoring.ts` |
| **Data access** | `web/lib/supabase.ts` (use `fetchAllRows` — the client caps at 1000 rows) · `players.ts` · `data.ts` |
| **Python side** | `scripts/scrape_draft_sharks.py` (market values) · `scripts/weekly_projections/` (in-season per-game, from Sleeper) |
| **Commands** | `just scrape-draft-sharks` · `just weekly-projections` · `just dev` |
| **Routes** | `/` · `/players` · `/value` (VORP · Surplus · Adjustments) · `/arbitration` · `/projected-salary` · `/lineup` · `/weekly` · `/arb-planner-public` |
| **Docs** | [FRONTEND.md](FRONTEND.md) · [references/ottoneu-strategy.md](references/ottoneu-strategy.md) · [references/weekly-projections.md](references/weekly-projections.md) |

**Watch out:** `weekly_projections` (per-game, third-party, market-aware) and
`player_projections` (season-long PPG, ours, market-free) are deliberately different
things that must not be mixed. Layering is enforced: `web/lib/` may not import from
`web/components/`.

---

## 5. Accounts, auth & MCP

**Who is allowed to see what**, plus the machine-readable interface onto the whole
system.

| | |
|---|---|
| **Tables** | `users` · `oauth_clients` · `oauth_authorization_codes` · `oauth_refresh_tokens` |
| **Session auth** | `web/lib/auth.ts` · `session.ts` · `web/middleware.ts` |
| **OAuth 2.1** | `web/lib/oauth/` — the site is its own authorization server (PKCE, rotating refresh tokens) |
| **MCP server** | `web/lib/mcp/tools.ts` (tool registry) served at `/api/mcp/mcp` |
| **Provisioning** | `scripts/oauth_client.py` · `just oauth-client` |
| **Routes** | `/login` · `/admin` · `/admin/workflows` · `/oauth/authorize` · `/api/auth/*` · `/api/oauth/*` · `/api/mcp/[transport]` |
| **Docs** | [references/mcp-server.md](references/mcp-server.md) |

**Watch out:** most gated features check `has_projections_access`, not merely "signed
in". Access tokens are deliberately stateless (HMAC-signed, 1-hour TTL) and are not
stored, so revocation takes up to an hour to take effect.

---

## 6. Drafting & simulation

**Practice tools.** Read-only against everything above; they never write league state.

| | |
|---|---|
| **Tables** | none of its own — reads `league_prices`, `draft_sharks_values`, `player_projections` |
| **Auction (live + sealed)** | `web/lib/mock-draft-live.ts` · `mock-draft-engine.ts` · `mock-draft.ts` |
| **Snake draft** | `web/lib/snake-draft-engine.ts` · `web/lib/data/athletic-vorp.ts` (checked-in board — no database) |
| **Shared** | `web/lib/valuation-noise.ts` (per-manager private valuations) · `simulation.ts` |
| **Offline** | `scripts/auction_simulator.py` (Monte-Carlo keeper auction) · `scripts/league_explorer/` (cross-league survey → local SQLite) |
| **Commands** | `just league-explorer` |
| **Routes** | `/mock-draft` (gated) · `/snake-draft` (public — no sign-in, no database) |
| **Docs** | [references/mock-draft.md](references/mock-draft.md) · [references/snake-draft.md](references/snake-draft.md) · [references/auction-simulator.md](references/auction-simulator.md) · [references/league-explorer.md](references/league-explorer.md) |

**Watch out:** the League Explorer writes to a local SQLite database under
`data/league_explorer/`, not Supabase. `/snake-draft` is deliberately non-Ottoneu and
touches no database at all.

---

## Cross-cutting

These belong to no single subsystem and are enforced by tests
([TESTING.md](TESTING.md)):

| Concern | Where |
|---|---|
| League constants | `config.json` → generated blocks in `scripts/config.py` + `web/lib/config.ts`. Run `just gen-config` after editing; never hand-edit the generated blocks. |
| Supabase pagination | The 1000-row cap applies in both languages. Use `fetch_all_rows` (Python) / `fetchAllRows` (web). Statically enforced for large tables. |
| Schema changes | Migration file → apply → TS types → schema doc → `just check-schema`. See [migrations/README.md](../migrations/README.md). |
| Environment | [references/environment-variables.md](references/environment-variables.md); `just doctor` diagnoses the common traps. |
| Scheduled jobs | `.github/workflows/` — twelve workflows covering scrapes, backfills, and projection updates. Status visible at `/admin/workflows`. |
| Shared database | Tables prefixed `fp_` belong to another app. Never touch them. |
