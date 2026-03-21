# Agent Documentation Audit Report

## ✅ Confirmed accurate
- All paths listed in `AGENTS.md` and `CLAUDE.md` exist and are resolvable.
- `CODE_ORGANIZATION.md` accurately describes the key file locations.
- The `Makefile` confirms the accuracy of backend and frontend CLI commands (`make test`, `make build`, etc.).
- `package.json` confirms the node package dependencies and test execution via `jest`.
- `.env.example` correctly documents the expected Supabase URL/KEY environment variables.
- Project uses `npm` exclusively, consistent with `AGENTS.md` and `CLAUDE.md`.

## ⚠️ Needs update
- **Orphaned documentation files:** `docs/generated/projection-accuracy.md`, `docs/generated/player-diagnostics.md`, `docs/generated/segment-analysis.md`, `docs/exec-plans/feature-projections.md`, and `docs/exec-plans/qb-usage-share.md` existed but were not linked in the documentation maps.
  - **Fix:** Added direct links to these files in both `AGENTS.md` and `CLAUDE.md` under their respective sections (`exec-plans` and `generated`), ensuring agents can discover them. Also upgraded the map format in both files to use explicit markdown links (`[file.md](docs/...)`).

## 🔲 Gaps (undocumented but should be)
- None found during this audit. The previously orphaned generated reports (projection diagnostics, segment analysis, accuracy reports) are now properly documented. The `check_docs_freshness.py --strict` script confirms that there are no additional undocumented markdown files within the `docs` directory.
