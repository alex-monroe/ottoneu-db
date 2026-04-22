### ✅ Confirmed accurate
* `AGENTS.md` and `CLAUDE.md` link targets are all valid.
* `schema.sql` and generated docs (`docs/generated/db-schema.md`) are consistent.
* The Next.js frontend structure and main dependencies (`npm`, `playwright`, `supabase`, etc.) are accurate as described in `AGENTS.md` and `CLAUDE.md`.
* Basic frontend routes (`web/app/*`) map correctly to `docs/FRONTEND.md`.
* Most architectural instructions in `AGENTS.md` (e.g. `just check-arch`, config sync, shared Supabase client) align with the codebase state and are enforced by `test_architecture.py`.

### ⚠️ Needs update
* **File:** `docs/CODE_ORGANIZATION.md`
  * **Claim:** References `data.ts`, `config.py`, and `config.ts` as standalone backtick paths.
  * **Reality:** These files exist in deeper structures: `web/lib/data.ts`, `scripts/config.py`, and `web/lib/config.ts`.
  * **Suggested fix:** Updated paths to be explicit (`web/lib/data.ts`, `scripts/config.py`, `web/lib/config.ts`). *(Already fixed in current workspace).*
* **File:** `AGENTS.md` / `CLAUDE.md`
  * **Claim:** Misses the newly created `docs/superpowers` directory files.
  * **Reality:** `docs/superpowers/plans/2026-04-19-build-system-just.md` and `docs/superpowers/specs/2026-04-19-build-system-design.md` exist but are not referenced in the top-level agent docs.
  * **Suggested fix:** Link these files from `AGENTS.md` or `CLAUDE.md` under an "Agent Plans & Specs" section, or delete them if they are stale.

### 🔲 Gaps (undocumented but should be)
* **Frontend Component State Warnings:** ESLint / React compilation throws warnings in `web/app/arbitration/ArbitrationTeams.tsx` (`ownerCol` unused) and `web/app/projections/ProjectionsClient.tsx` (`sortKey`, `sortAsc` unused). While not an architectural gap, agent instructions could benefit from a note about ignoring or fixing these known warnings.
* **Jest List Key Warnings:** Running `npm test` throws React array key warnings for `<DataTable>` and `<PlayerSearch>`. A note in `docs/TESTING.md` about expected console errors during tests might save agents debugging time.
