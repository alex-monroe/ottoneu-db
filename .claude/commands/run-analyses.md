---
description: Update player projections
---
The VORP / surplus / arbitration / projected-salary calculations now live
canonically in the TypeScript web UI (`web/lib/`). The only remaining backend
analysis step is regenerating player projections.

// turbo
1. Update player projections
`venv/bin/python scripts/update_projections.py`
