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
