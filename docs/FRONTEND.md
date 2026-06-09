# Frontend

## Structure

Next.js App Router. Most pages are server components that fetch live data from Supabase (revalidate every hour) with client wrappers for interactivity. Shared nav structure (see `web/components/Navigation.tsx`) groups routes into top-level public pages (Home, Players, Rosters), an authed Lineup link, and three projections-gated dropdowns: **Projections**, **Value**, and **Offseason** (arbitration). The current season phase (resolved via `web/lib/season.ts`) drives an amber "featured now" accent on the most relevant nav group/links and the landing-hub featured section.

Several formerly-standalone pages were consolidated into **tabbed routes** using the shared `Tabs` component (URL-synced via `?tab=`). Old URLs redirect to the new tabs (see `web/next.config.ts` `redirects()`): `/vorp`,`/surplus-value`,`/surplus-adjustments` → `/value`; `/arbitration-simulation`,`/arbitration-planner` → `/arbitration`. The old `/vorp`, `/surplus-adjustments`, `/arbitration-simulation`, and `/arbitration-planner` directories retain only their client components (imported by the merged pages' section components); their `page.tsx` files were removed.

## Routes

| Route | Description |
|-------|-------------|
| `/` | **Landing hub** — phase-aware overview with a "Right now" banner + countdown, a featured-for-this-phase section, and grouped quick-access cards (gated groups show a sign-in card to anonymous visitors) |
| `/players` | Tabbed: **Directory** (searchable player list) + **Efficiency** (PPG/PPS-vs-salary scatter, formerly `/`) |
| `/rosters` | League-wide roster view |
| `/lineup` | Lineup planner: build a starting lineup from any team's current roster and see the projected total (by projected PPG or last-season PPG) |
| `/arb-progress` | Public arbitration progress: team completion status and allocation details |
| `/arb-planner-public` | Public (read-only) arbitration planner view |
| `/projected-salary` | Keep vs cut decisions for The Witchcraft |
| `/projections` | Season-long player projections board (reads `player_projections` via `fetchProjectionBoard`). Industry-style layout: position tabs (ALL/QB/RB/WR/TE/K with counts), overall + positional ranks, player search, and a "rookies only" toggle. **Includes rookies/college prospects** — inclusion is driven by `player_projections` (source of truth), not `fetchPlayers` (which drops players without prior-season stats), so `rookie_draft_capital`/`college_prospect` players appear with a Rookie/College badge. The methodology card (`ActiveModelCard`) is **admin-only**. |
| `/projection-accuracy` | Model backtest accuracy explorer |
| `/value` | Tabbed: **VORP** (bar chart + table) · **Surplus** (rankings, bargains, overpaid, team summaries) · **Adjustments** (per-user manual value overrides) |
| `/arbitration` | Tabbed: **Targets** (per-opponent breakdown) · **Simulation** (Monte Carlo) · **Planner** (save budget allocations). The Targets/Simulation value-mode toggle uses `?mode=` and preserves `?tab=` via `ModeToggle`'s `extraParams`. |
| `/vegas-lines` | Preseason Vegas implied team totals review (AFC/NFC division cards, season selector) — spot-check the data feeding the `implied_team_total_raw` projection feature |
| `/depth-charts` | Opening-day NFL depth-chart review (team cards grouped by division, QB/RB/WR/TE tiers, role-change arrows, active-model projected PPG, season selector) — spot-check the data feeding the `depth_chart_position_raw` / `role_change_raw` projection features |
| `/login` | Email/password login |
| `/admin` | User management (admin only) |
| `/admin/workflows` | Workflow status history (admin only) — GitHub-status-style grid of the scheduled GitHub Actions over the last 21 days, read live from the public GitHub Actions API (server-side; no token required, optional `GITHUB_TOKEN` for rate limit) |

## Reusable Components

| Component | Purpose |
|-----------|---------|
| `Navigation.tsx` | Shared nav bar across all pages |
| `Tabs` | URL-synced (`?tab=`) tab bar. Accepts `tabs: { id, label, content }[]`; renders all panels and hides inactive ones (so client state in a panel survives switches). Panels can be server-rendered sections passed as `content`. Used by `/players`, `/value`, `/arbitration`. |
| `DataTable` | Generic sortable table with type safety and highlight rules |
| `SummaryCard` | Metric display cards with variant styles (default, positive, negative) |
| `PositionFilter` | Position selection buttons with multi-select support |
| `ScatterChart` | Player efficiency scatter plot with interactive filters |
| `PositionBadge` | Colored position pill (QB, RB, etc.) — canonical across all views |
| `PlayerName` | Player name renderer with link/hover-card/plain-text modes |
| `StatValue` | Numeric stat formatter with currency/decimal/number/null handling |
| `PlayerHoverCard` | Rich hover preview card for player context |

### Arbitration Planner (`components/arb-planner/`)

The authed `/arbitration-planner` and public `/arb-planner-public` routes share a single, generic component tree under `web/components/arb-planner/` instead of duplicating it per route:

| Component | Purpose |
|-----------|---------|
| `ArbPlannerCore` | Shared client: tabs, plan CRUD, validation, budget tracking, roster + comparison rendering. Generic over `T extends ArbPlannerPlayer`. |
| `TeamRosterSection` | Collapsible per-team roster table. Prop-driven extras: `showSurplus` (Value/Surplus cols), `adjustedSurplus` (Adj. Surplus col), `hoverDataMap` + `nameMode` (player-name rendering). |
| `PlanComparison` | Side-by-side plan comparison. The middle metric column is configured via a `metricColumn` prop (authed = colored Surplus, public = season PPG). |
| `types.ts` | `ArbPlannerPlayer` base type that both `ArbitrationTarget` (authed) and `PublicArbPlayer` (public) satisfy. |

The two route directories keep only thin client wrappers (`ArbPlannerClient`, `PublicArbPlannerClient`) that pass the appropriate props. `PlanManager` and `BudgetTracker` continue to live in `app/arbitration-planner/` and are imported by the shared core. Defaults are read-only/public-safe — the authed view opts into surplus/hover/suggested-allocation features via props.

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

`web/lib/config.ts` imports the shared `config.json` from the **repo root**
(`../../config.json`), which is outside the `web/` app dir. Next 16 uses
Turbopack by default, and Turbopack infers the workspace root from the nearest
lockfile (`web/`) and refuses to resolve files outside it — which 500s every
SSR page in dev. `web/next.config.ts` sets `turbopack.root` to the repo root to
fix this; **don't remove it**, and keep `config.json` at the repo root (it's
shared with the Python side).

## Local dev & verification

- **Run:** `just dev` (foreground) starts the server on `localhost:3000`.
- **Stop:** `just dev-stop` kills the dev server plus stray Turbopack/postcss
  workers (a plain Ctrl-C sometimes leaves `.next/dev/build/postcss.js`
  processes behind).
- **Headless verify loop** (for confirming a change actually renders): start the
  server in the background, poll its log for `Ready in`, then hit pages with
  `curl -s -o /dev/null -w '%{http_code}'` or drive them with the puppeteer MCP
  tools (navigate → click → screenshot), then `just dev-stop`. Auth-gated routes
  redirect (307) for anonymous requests — that's expected, not a failure.
- **Verifying responsive / auth-conditional UI** (e.g. the nav): check it at
  multiple viewport widths *and* both auth states — logged-out and authenticated
  render different item sets and collapse at different breakpoints.

### Lint gotcha: `react-hooks/set-state-in-effect`

ESLint errors on calling `setState` synchronously in a `useEffect` body (e.g.
closing a menu on route change via `useEffect(() => setOpen(false), [pathname])`).
Close UI state from event handlers instead — an `onClick` on each link, or a
document `mousedown` / `Escape` listener registered inside the effect (calling
`setState` from the listener callback is fine; calling it directly in the effect
body is not).
