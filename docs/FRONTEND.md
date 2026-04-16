# Frontend

## Structure

Next.js App Router with five pages. All pages are server components that fetch live data from Supabase (revalidate every hour) with client wrappers for interactivity.

## Routes

| Route | Description |
|-------|-------------|
| `/` | Player Efficiency scatter chart (PPG/PPS vs salary) |
| `/projected-salary` | Keep vs cut decisions for The Witchcraft |
| `/vorp` | VORP analysis with bar chart and filterable table |
| `/surplus-value` | Surplus value rankings, bargains, overpaid, team summaries |
| `/arbitration` | Arbitration targets with per-opponent breakdown |
| `/arbitration-planner` | Plan and save arbitration budget allocations |
| `/arb-progress` | Public arbitration progress: team completion status and allocation details |

## Reusable Components

| Component | Purpose |
|-----------|---------|
| `Navigation.tsx` | Shared nav bar across all pages |
| `DataTable` | Generic sortable table with type safety and highlight rules |
| `SummaryCard` | Metric display cards with variant styles (default, positive, negative) |
| `PositionFilter` | Position selection buttons with multi-select support |
| `ScatterChart` | Player efficiency scatter plot with interactive filters |

Column definitions live in `web/lib/columns.ts` for consistent table layouts.

## TypeScript Types

Shared type definitions in `web/lib/types.ts`:
- Player data interfaces (`Player`, `VorpPlayer`, `SurplusPlayer`, `ChartPoint`)
- Chart component types (`TooltipProps`)
- Position constants (`Position` type, `POSITIONS` array, `POSITION_COLORS`)

## Analysis Logic

Analysis math is ported to `web/lib/analysis.ts` (TS equivalent of `scripts/analysis_utils.py`). Arbitration simulation logic lives in `web/lib/arb-logic.ts`.

## Configuration

Frontend constants in `web/lib/config.ts` — **must stay in sync with `scripts/config.py`**.

## Troubleshooting

### Local Development & Playwright Verification
If running the Next.js development server (e.g., `npm run dev > npm_output.log &`) for Playwright verification, ensure previous instances are terminated to avoid port conflicts (e.g., `kill $(lsof -t -i :3000) 2>/dev/null || true`).

### Next.js Cache Errors
If `npm run dev` fails with Turbopack caching errors such as "Persisting failed..." or "Unable to acquire lock at .next/dev/lock", resolve it by explicitly clearing the cache directory (`rm -rf web/.next`) before restarting the server.
