# Frontend

## Structure

Next.js App Router. Pages are server components that fetch live data from Supabase (typically revalidate every hour) with client wrappers for interactivity.

## Routes

| Route | Description |
|-------|-------------|
| `/` | Player Efficiency scatter chart (PPG/PPS vs salary) |
| `/players` | Player directory and search |
| `/players/[id]` | Individual player detail card |
| `/projections` | Projection system methodology and outputs |
| `/projection-accuracy` | Backtest accuracy and feature performance |
| `/projected-salary` | Keep vs cut decisions based on projected metrics |
| `/vorp` | VORP analysis with bar chart and filterable table |
| `/surplus-value` | Surplus value rankings, bargains, overpaid, team summaries |
| `/surplus-adjustments` | Admin panel for manual player adjustments |
| `/rosters` | Complete team rosters viewer |
| `/arbitration` | Arbitration targets with per-opponent breakdown |
| `/arbitration-planner` | Plan and save arbitration budget allocations |
| `/arbitration-simulation` | Simulate and analyze arbitration scenarios |
| `/arb-progress` | Public arbitration progress: team completion status and allocation details |
| `/admin` | Administrative tools and configurations |

## Reusable Components

| Component | Purpose |
|-----------|---------|
| `Navigation.tsx` | Shared nav bar across all pages |
| `DataTable` | Generic sortable table with type safety and highlight rules |
| `SummaryCard` | Metric display cards with variant styles (default, positive, negative) |
| `PositionFilter` | Position selection buttons with multi-select support |
| `ScatterChart` | Player efficiency scatter plot with interactive filters |
| `PlayerHoverCard` | Quick preview card on hover in data tables |
| `PlayerSearch` | Interactive fuzzy search component |

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
