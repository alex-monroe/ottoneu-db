---
name: run-analyses
description: Update player projections
---
The VORP / surplus / arbitration / projected-salary calculations live
canonically in the TypeScript web UI (`web/lib/`). The only backend analysis
step is regenerating player projections for the active model:

1. Confirm which model is active: `just list-models --check`
2. Re-project + promote to `player_projections` + rookie fallback: `just analyze`

This writes production data — run it from the main checkout after merging, not
from a worktree (see AGENTS.md "Worktree Notes").
