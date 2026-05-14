# Frontend

## Structure

Next.js App Router. Most pages are server components that fetch live data from Supabase (revalidate every hour) with client wrappers for interactivity. Shared nav structure (see `web/components/Navigation.tsx`) groups routes into top-level pages, Projections, Value, and Arbitration menus.

## Routes

| Route | Description |
|-------|-------------|
| `/` | Player Efficiency scatter chart (PPG/PPS vs salary) |
| `/players` | Searchable player directory |
| `/players/[id]` | Per-player card: bio, salary, projections, season-by-season stats |
| `/rosters` | League-wide roster view |
| `/arb-progress` | Public arbitration progress: team completion status and allocation details |
| `/arb-planner-public` | Public (read-only) arbitration planner view |
| `/projected-salary` | Keep vs cut decisions for The Witchcraft |
| `/projections` | Player projections table (reads `player_projections`) |
| `/projection-accuracy` | Model backtest accuracy explorer |
| `/vegas-lines` | Preseason Vegas implied totals + win totals per team (reads `team_vegas_lines`) |
| `/vorp` | VORP analysis with bar chart and filterable table |
| `/surplus-value` | Surplus value rankings, bargains, overpaid, team summaries |
| `/surplus-adjustments` | Per-user manual value overrides (auth required) |
| `/arbitration` | Arbitration targets with per-opponent breakdown |
| `/arbitration-simulation` | Monte Carlo arbitration simulation |
| `/arbitration-planner` | Plan and save arbitration budget allocations (auth required) |
| `/login` | Email/password login |
| `/admin` | User management (admin only) |

## Reusable Components

| Component | Purpose |
|-----------|---------|
| `Navigation.tsx` | Shared nav bar across all pages |
| `DataTable` | Generic sortable table with type safety and highlight rules |
| `SummaryCard` | Metric display cards with variant styles (default, positive, negative) |
| `PositionFilter` | Position selection buttons with multi-select support |
| `ScatterChart` | Player efficiency scatter plot with interactive filters |
| `PositionBadge` | Colored position pill (QB, RB, etc.) — canonical across all views |
| `PlayerName` | Player name renderer with link/hover-card/plain-text modes |
| `StatValue` | Numeric stat formatter with currency/decimal/number/null handling |
| `PlayerHoverCard` | Rich hover preview card for player context |

### Column Factories (`components/columns.tsx`)

Column definitions for `DataTable` are built via **composable factory functions** to prevent drift across pages. Individual factories (`playerNameCol`, `positionCol`, `salaryCol`, etc.) inject atomic components (`PositionBadge`, `PlayerName`) via `renderCell`. Pages compose columns from these factories:

```typescript
import { corePlayerCols, salaryCol, ppgCol } from "@/components/columns";
const columns = [...corePlayerCols({ hoverDataMap }), salaryCol(), ppgCol("Proj PPG")];
```

Static column arrays (no React components) remain in `web/lib/columns.ts` for backward compatibility.

## TypeScript Types

Shared type definitions in `web/lib/types.ts`:
- Player data interfaces (`Player`, `VorpPlayer`, `SurplusPlayer`, `ChartPoint`)
- Chart component types (`TooltipProps`)
- Position constants (`Position` type, `POSITIONS` array, `POSITION_COLORS`)

## Analysis Logic

Analysis math is ported to `web/lib/analysis.ts` (TS equivalent of `scripts/analysis_utils.py`). Arbitration simulation logic lives in `web/lib/arb-logic.ts`.

## Configuration

Frontend constants in `web/lib/config.ts` — **must stay in sync with `scripts/config.py`**.
