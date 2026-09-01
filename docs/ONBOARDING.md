# Onboarding

A guided first week. It assumes you are a competent developer who knows **neither**
fantasy football **nor** this project's ML conventions — you only need one of the two to
skip ahead.

Keep [GLOSSARY.md](GLOSSARY.md) open beside this page. Three specialist vocabularies run
through this repo and guessing at them is the main way people get lost.

| | |
|---|---|
| **Day 1** | [Get it running](#day-1--get-it-running) |
| **Day 2** | [Trace one number end to end](#day-2--trace-one-number-end-to-end) |
| **Day 3** | [Ship a change](#day-3--ship-a-change) |
| **Then** | [Pick a subsystem](#then--pick-a-subsystem) |

---

## What this project actually is

Ottoneu is a fantasy football platform where rosters **persist year to year** under a
$400 salary cap. That single fact drives everything here: because you keep players and
their salaries rise annually, the interesting question is never "who is good?" but
**"who is underpriced?"**

So the system does three things in sequence:

1. **Record the truth.** Scrape what the league says (who owns whom, at what salary) and
   what happened on the field (NFL statistics).
2. **Project forward.** Train a model on statistical history to forecast each player's
   points per game next season.
3. **Price it.** Convert projected production into positional value (VORP), then into
   auction dollars, then compare against actual salary to find surplus.

The website is the interface onto step 3. The hardest engineering is in step 2.

---

## Day 1 — Get it running

### Set up

Follow [the README](../README.md#setup) — the dev container is the shortest path and
provisions everything correctly. Then:

```bash
just doctor      # environment self-diagnosis, offline, ~1s
just preflight   # lint + typecheck + both test suites + doc checks, ~12s
just dev         # http://localhost:3000
```

If `doctor` passes and `preflight` is green, your environment is correct. If something
is off later, **run `just doctor` first** — it knows the traps (stale editable install,
broken venv, missing `.env` keys, stale `node_modules`, stale eval cache) and prints the
fix for each.

### Two rules that will save you time

**Everything goes through `just`.** Not `python scripts/…`, not `npm run …`. The recipes
select the right virtualenv and flags. `just --list` shows all 53.

**The virtualenv is `venv/`, not `.venv/`,** and Python is always `venv/bin/python`.

### Click around

Open the app and visit `/players`, `/value`, `/projections`, and `/arbitration`. You
will not understand the numbers yet — that is Day 2. What you want from this is a feel
for what the system produces.

### Read, in this order

1. [GLOSSARY.md](GLOSSARY.md) — skim all three sections. Don't memorize; just learn what
   kind of word each term is.
2. [references/ottoneu-rules.md](references/ottoneu-rules.md) — the actual league rules.
   Short, and everything downstream assumes them.
3. [SUBSYSTEMS.md](SUBSYSTEMS.md) — the six subsystems and what each owns.
4. [ARCHITECTURE.md](ARCHITECTURE.md) — the detailed system design.

---

## Day 2 — Trace one number end to end

This is the exercise that makes the codebase click. Pick any player and follow their
surplus value backwards to raw NFL data. Every step below is a real file you can open.

### The path

| Stage | What happens | Where |
|---|---|---|
| **1. Source** | Raw NFL statistics are pulled from nflverse | `just backfill-nfl-stats` → `scripts/backfill_nfl_stats.py` |
| **2. Landed** | Real football stats, plus the same seasons re-scored under Ottoneu rules | tables `nfl_stats` and `player_stats` |
| **3. Featurised** | Each file turns stat history into one leakage-free signal | `scripts/feature_projections/features/` |
| **4. Combined** | A named set of features + weights = a model | `model_config.py` — `just list-models` shows which is live |
| **5. Projected** | The model runs and writes one row per player per season | `just project` → table `model_projections` |
| **6. Gated** | Out-of-sample evaluation decides whether it's better | `just holdout-eval`, `just significance` |
| **7. Promoted** | The active model's rows are copied to the table the site reads | `just promote` → table `player_projections` |
| **8. Valued** | PPG becomes value-over-replacement, then surplus vs salary | `web/lib/vorp.ts`, `web/lib/surplus.ts` |
| **9. Rendered** | The number on screen | `web/app/value/` |

### Do it yourself

Look at the same player at three stages:

```bash
# Stage 2 — what they actually did
just py "
from scripts.config import get_supabase_client
sb = get_supabase_client()
p = sb.table('players').select('id,name,position').eq('name','Josh Allen').execute().data[0]
print(p)
print(sb.table('player_stats').select('season,games_played,ppg,total_points')
        .eq('player_id', p['id']).order('season').execute().data)
"

# Stage 7 — what the active model thinks they'll do
just py "
from scripts.config import get_supabase_client
sb = get_supabase_client()
p = sb.table('players').select('id,name').eq('name','Josh Allen').execute().data[0]
print(sb.table('player_projections').select('season,projected_ppg,projection_method')
        .eq('player_id', p['id']).order('season').execute().data)
"
```

Then open `/value` in the browser and find them in the VORP table. Stage 9 is that
number; stage 7 is where it came from.

### The three things that surprise people

**The valuation maths is in TypeScript, not Python.** VORP, surplus value, dollar
values, arbitration targets — all of it lives in `web/lib/`. Python's only analysis job
is generating projections. If you go looking for `analyze_vorp.py`, it doesn't exist and
never will.

**`player_stats` is not NFL stats.** `nfl_stats` holds real football (passing yards,
snap counts). `player_stats` holds *fantasy* scoring (PPG, PPS) computed from it under
this league's rules. Both are keyed `(player_id, season)`, which makes them easy to
confuse.

**There are 55 models and only one is live.** `just list-models` shows every definition
ever tried, grouped by status. Only the one marked `production` is served to the
website, and which one that is lives in the *database* (`projection_models.is_active`),
never hardcoded in Python.

---

## Day 3 — Ship a change

### The workflow

```bash
git checkout main && git pull origin main
git checkout -b your-branch-name
# ... make changes ...
just preflight            # must pass — mirrors CI in ~12s
git push -u origin your-branch-name
gh pr create --fill
```

Never commit directly to `main`. Full details in [GIT_WORKFLOW.md](GIT_WORKFLOW.md).

### Let the tests teach you

Several conventions are enforced mechanically, and the failures are written as
explanations rather than assertions. Run `just check-arch` and read what it checks:

- **No hardcoded league constants.** `309`, `400`, and friends come from `config.json`
  via `scripts/config.py` / `web/lib/config.ts`. Change `config.json`, then run
  `just gen-config`.
- **No unpaginated Supabase reads** against large tables. Both clients silently cap at
  1000 rows — this has caused real data-corruption bugs. Use `fetch_all_rows` (Python)
  or `fetchAllRows` (web).
- **Frontend layering.** `web/lib/` must not import from `web/components/`. The flow is
  types → config → lib → components → pages.
- **Shared types** live in `web/lib/types.ts`, not in component files.

If one of these fails, read the message — it names the fix.

### A good first change

Pick something that touches one subsystem end to end. Adding a column to an existing
page, or a new stat to `/players`, will walk you through the data layer, the types, and
the component conventions without needing model context.

### Changing the projection model

If your change touches `scripts/feature_projections/`, `projection_methods.py`,
`update_projections.py`, or `model_config.py`, there is a hard extra requirement:

**A model ships only on a *significant* out-of-sample win.** Not a better point estimate
— a confidence interval that excludes zero, measured on the rolling-origin held-out
harness. The in-sample `just accuracy-report` scores models on seasons they trained on;
it is a secondary diagnostic and must never be the basis for a promotion.

The exact protocol — which commands, which baselines, what goes in the PR description —
is in [AGENTS.md](../AGENTS.md#projection-model-update-requirements). The reasoning
behind it is in
[exec-plans/projection-methodology-audit.md](exec-plans/projection-methodology-audit.md).
Read both before your first model change; the discipline is the point of the subsystem.

---

## Then — Pick a subsystem

Use [SUBSYSTEMS.md](SUBSYSTEMS.md) to choose where to go deep. Each entry lists its
tables, code, routes, and reference doc.

| If you want to work on… | Start with |
|---|---|
| Scraping and league data | [references/roster-csv-reconciliation.md](references/roster-csv-reconciliation.md) |
| NFL statistics ingestion | [ARCHITECTURE.md](ARCHITECTURE.md#data-pipeline) |
| The projection model | [exec-plans/feature-projections.md](exec-plans/feature-projections.md), then [generated/experiment-log.md](generated/experiment-log.md) |
| The website | [FRONTEND.md](FRONTEND.md) |
| Roster strategy and valuation | [references/ottoneu-strategy.md](references/ottoneu-strategy.md) |
| The MCP / agent interface | [references/mcp-server.md](references/mcp-server.md) |
| Draft practice tools | [references/mock-draft.md](references/mock-draft.md), [references/snake-draft.md](references/snake-draft.md) |

---

## Reference card

```
just doctor              # something's broken — start here
just preflight           # before every push (~12s, mirrors CI)
just dev / just dev-stop # local site on :3000
just --list              # all 53 recipes
just py "<snippet>"      # ad-hoc database query
just check-arch          # the enforced conventions
just check-schema        # DB vs types vs docs drift
just list-models         # projection models, grouped by status
just analyze             # regenerate + promote projections
```

| Gotcha | Detail |
|---|---|
| Python | `venv/bin/python`, never bare `python`. The venv is `venv/`, not `.venv/`. |
| Package manager | `npm` only — not pnpm, yarn, or bun. |
| Shell state | The Bash working directory persists between commands. A `cd web` will strand later repo-root paths; prefer absolute paths. |
| `fp_*` tables | Owned by a different app sharing this database. Never read, write, or migrate them. |
| Worktrees | The venv lives in the main checkout. Use its absolute path; `source venv/bin/activate` fails in a worktree. |
| Editable install | If a `scripts/` edit seems not to take effect, the editable install is stale. `just doctor` detects it; `venv/bin/pip install -e .` fixes it. |
