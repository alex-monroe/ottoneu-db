# Database migrations

This directory holds the hand-authored SQL for every schema change, in
apply-order. It is the **source of intent**; the **system of record** for what
has actually been applied is the remote Supabase database
(`supabase_migrations.schema_migrations`).

## Naming convention

Each file is named:

```
NNN_snake_case_description.sql
```

- `NNN` — a 3-digit, zero-padded sequence number (`001`, `002`, … `027`).
- The sequence must be **contiguous** (no gaps) and **unique** (no duplicate
  numbers).
- The slug is lowercase `snake_case` describing the change
  (e.g. `023_create_draft_capital.sql`).

This convention is enforced offline by `scripts/tests/test_migrations.py`
(run via `just check-migrations`, `just check-arch`, or the full
`just test-python`), so a misnamed file, a gap, or a duplicate number fails CI.

## Workflow

1. Create the next file: `migrations/NNN_short_description.sql` (NNN = current
   highest + 1).
2. Apply it to the remote database via the Supabase MCP `apply_migration` tool
   (or the Supabase dashboard). `apply_migration` records the change in
   `supabase_migrations.schema_migrations`, which is the canonical audit trail.
3. Follow the post-migration steps in
   [CLAUDE.md → Database migration workflow](../CLAUDE.md): regenerate the
   TypeScript types, update `web/types/supabase.ts`, and update
   `docs/generated/db-schema.md`.

## Local ↔ remote reconciliation

The local files (`NNN_*.sql`) and the remote `schema_migrations` entries
(Supabase stores them with `YYYYMMDDHHMMSS` version stamps) do **not** map 1:1
by name — historically some remote entries carry the `NNN_` prefix and some
don't. The local sequence is what we lint mechanically; the remote list is the
source of truth for *applied* state.

To audit the remote side, list the applied migrations with the Supabase MCP
`list_migrations` tool and compare against this directory. There is no automated
CI check for this because CI has no direct connection to the
`supabase_migrations` schema (the PostgREST client only exposes the `public`
schema).
