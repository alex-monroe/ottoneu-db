### ✅ Confirmed accurate
- `AGENTS.md` and `CLAUDE.md` link targets are all valid.
- `CODE_ORGANIZATION.md` file paths are correct (after minor `web/lib/data.ts` fix).
- `docs/generated/db-schema.md` accurately reflects the 17 tables and their structure.
- `docs/COMMANDS.md` correctly lists `npm` and `python` commands used in the project.
- No orphan documentation files exist in `docs/`.

### ⚠️ Needs update
- **File:** `docs/FRONTEND.md`
  - **Claim:** "Next.js App Router with five pages" and lists 7 routes.
  - **Reality:** There are ~15 routes in `web/app/` and the count is inaccurate.
  - **Suggested Fix:** Removed the exact count to avoid future drift, keeping it as "Next.js App Router". (Note: already applied)

### 🔲 Gaps (undocumented but should be)
- **Frontend Routes:** Several routes in `web/app/` are missing from `docs/FRONTEND.md` (e.g. `admin`, `arbitration-simulation`, `login`, `players`, `projection-accuracy`, `projections`, `rosters`, `surplus-adjustments`).
- **Frontend Components:** Several reusable components in `web/components/` are missing from `docs/FRONTEND.md` (e.g. `GlobalPlayerSearch`, `ModeToggle`, `PlayerHoverCard`, `PlayerSearch`, `PositionTierBreakdown`, `ProjectionYearSelector`).
- **API Routes:** The `web/app/api/` folder contains undocumented routes (`admin/users`, `arbitration-plans`, `auth`, `surplus-adjustments`).
- **Data Models:** New types/interfaces in `web/lib/types.ts` for added features (like `ArbitrationTarget`, `SurplusPlayer`, `PublicArbPlayer`, etc.) should be explicitly documented if they are significant enough for agent context.
