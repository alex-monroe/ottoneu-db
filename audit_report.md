### ✅ Confirmed accurate
- Commands: Instructions in AGENTS.md, CLAUDE.md, and `.cursorrules` regarding using `npm` and Python `venv/bin/python` remain correct.
- Path dependencies: Most referenced directories, scripts, and documentation like `ARCHITECTURE.md` and `FRONTEND.md` are correctly mapped to existing files.
- Database references: Links to `schema.sql` and migration locations in `CODE_ORGANIZATION.md` are accurately documented.

### ⚠️ Needs update
- **Issue 1:** `docs/CODE_ORGANIZATION.md` referenced files like `data.ts`, `config.py`, and `config.ts` by relative names without their full paths.
  - *Reality:* The actual paths are `web/lib/data.ts`, `scripts/config.py`, and `web/lib/config.ts`.
  - *Fix Applied:* Updated the paths in the Markdown file directly.
- **Issue 2:** The `docs/superpowers/plans/2026-04-19-build-system-just.md` and `docs/superpowers/specs/2026-04-19-build-system-design.md` files were orphaned and lacked references in `AGENTS.md` and `CLAUDE.md`.
  - *Reality:* Files in the `superpowers/` directory should be mapped in the root docs per the freshness checker's strict rule.
  - *Fix Applied:* Modified the Documentation Map in `AGENTS.md` and `CLAUDE.md` to formally list these historical plan and spec files.

### 🔲 Gaps (undocumented but should be)
- No major documentation gaps identified that hinder agent workflows. The architecture and code mappings appear robust.
