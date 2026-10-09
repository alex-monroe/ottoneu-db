# Database Workflow

Migrations, generated types, and reading large tables. Summarised in
[AGENTS.md](../../AGENTS.md); this is the full version.

## Database migration workflow

Migration files live in `migrations/` and follow the `NNN_snake_case.sql` convention (zero-padded, contiguous sequence) documented in [migrations/README.md](../../migrations/README.md). The naming and sequence are linted offline by `just check-migrations` (also run under `just check-arch` and `just test-python`). The remote `supabase_migrations.schema_migrations` table — auditable via the `list_migrations` MCP tool — is the system of record for what has actually been applied.

After creating a new migration file in `migrations/` (numbered as the current highest + 1) and applying it (via `mcp__supabase__apply_migration` or the Supabase dashboard):

1. **Regenerate TypeScript types** using `mcp__supabase__generate_typescript_types` (or `npx supabase gen types typescript`).
2. **Update `web/types/supabase.ts`** with the regenerated output so the Supabase client recognizes the new table.
3. **Update `docs/generated/db-schema.md`** — add the new table to the table list and increment the table count.
4. **Verify with `just check-schema`** — a read-only, on-demand drift check that introspects the live DB and diffs it against `web/types/supabase.ts` and `docs/generated/db-schema.md` (ignoring `fp_*`). It catches a skipped step 2 or 3 (table or column missing from types/docs) immediately instead of as a later confusing `tsc` error, and exits nonzero on drift.

Skipping step 2 will cause TypeScript errors like `Argument of type '"new_table"' is not assignable to parameter of type '...'` when querying the new table.

## Supabase pagination

Supabase's Python client defaults to a **1000-row limit** on `.execute()` calls. Any query that may return more than 1000 rows must use paginated `.range(offset, offset + page_size - 1)` fetching in a loop. This has caused silent bugs in `promote.py`, `analysis_utils.fetch_multi_season_stats` (a 3-season history fetch is ~2k rows — truncation silently dropped player-season rows, corrupting weighted-PPG bases and projections), and `feature_projections/backtest.py` (a single recent season of `player_stats` now exceeds 1000 rows) — all now fixed. A single recent NFL season of `player_stats` is already >1000 rows, so even single-season fetches need pagination now. Apply the same pattern in any new bulk-fetch code.

**The web JS/TS client (`web/lib/`) has the same 1000-row default cap.** This silently broke the `/depth-charts` season selector — `depth_charts` has thousands of rows, so a plain `.select("season")` returned only the most recent ~1000 and dropped older seasons (fixed in `web/lib/depth-charts.ts` by looping `.range()`). Watch for it on any web query against a large table (`depth_charts`, `nfl_stats`, `player_stats`, `model_projections`) — distinct-value or full-table reads must paginate, and a query meant for one model/season should filter (`.eq("model_id", …)`/`.eq("season", …)`) rather than fetch-all-then-filter, or it will both truncate and mix in other rows.

**This is now mechanically enforced (#620).** `TestSupabasePagination` in `scripts/tests/test_architecture.py` and the "Supabase Pagination" suite in `web/__tests__/lib/architecture.test.ts` statically scan for non-paginated reads against the large tables (`player_stats`, `nfl_stats`, `depth_charts`, `model_projections` — the `LARGE_TABLES` list in each test, kept in sync across the two languages) and fail `just check-arch` if one is found. Read through the paginated helpers instead of a bare `.table(...).execute()` / `.from(...).select(...)`:
- **Python:** `fetch_all_rows(supabase, table, select, filters=[("eq", "season", s)])` from `scripts.config` (filters accept `eq`/`in_`/`lt`/`gte`/`lte`), or `_fetch_seasons_paginated` / `fetch_multi_season_stats` in `analysis_utils`.
- **Web:** `fetchAllRows((from, to) => supabase.from(table).select(...).eq(...).order("…").range(from, to))` from `web/lib/supabase.ts`.

The scanners accept a non-paginated query only when it is provably bounded: a write (`upsert`/`insert`/`update`/`delete`), `.single()`/`.maybeSingle()`, a head-only `count`, `.limit(n)` with n < 1000, or an explicit `# pagination-safe: <reason>` (Python) / `// pagination-safe: <reason>` (web) comment on or just above the query.
