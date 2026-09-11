# Frontend

## Structure

Next.js App Router. Most pages are server components that fetch live data from Supabase (revalidate every hour) with client wrappers for interactivity. **"My team" comes from `getViewerTeam()`** (`web/lib/viewer-team.ts`), never from `config.MY_TEAM` — see [ARCHITECTURE.md](ARCHITECTURE.md#authentication--authorization). Server components resolve it and pass `viewerTeam` down; a client component that highlights, filters or titles by the viewer's team takes it as a prop. **Route gating is centralized in `web/lib/access.ts`** (see [ARCHITECTURE.md](ARCHITECTURE.md#authentication--authorization)) — add a new projections-gated route to `PROJECTIONS_ROUTES` there rather than checking `hasProjectionsAccess` inside the page (likewise `PODCASTER_ROUTES` for the podcast tools — but never `/podcast` itself, which is the page that explains the gate). **The nav's information architecture lives in `web/lib/nav.ts`**, not in the component — `NAV_GROUPS` is grouped by *task*, and `visibleNav(viewer, teamHref)` filters it for the current viewer. Groups: **My Team** (your team page, lineup, matchup, keep-or-cut) · **League** (scoreboard, teams, rosters, arbitration progress/plans) · **Players** (directory, season projections, weekly projections, free agents) · **Analysis** (player value, arbitration) · **Tools** (mock draft) · **Podcast** (podcaster-only production tooling) · **Data** (admin-only operator instruments: projection accuracy, vegas lines, depth charts, workflow status, users). Each destination appears **exactly once** — tabs of a page are that page's business, never nav siblings. Item `access` (`public` / `projections` / `admin` / `podcaster`) drives **menu visibility only**; route enforcement stays in `web/lib/access.ts`, so an admin-menu page is still reachable by any projections account with the URL. Add a route by editing `NAV_GROUPS` — and mirror it in the landing hub's `HUB_GROUPS`, which uses the same taxonomy. Both auth states collapse to the hamburger at the **same** `xl` breakpoint (it was `2xl` signed-in and `lg` signed-out, so access made navigation worse). The current season phase (resolved via `web/lib/season.ts`) drives an amber "featured now" accent on the most relevant nav group/links and the landing-hub featured section; `PHASE_UI.featuredGroup` must name a `NAV_GROUPS` label.

Several formerly-standalone pages were consolidated into **tabbed routes** using the shared `Tabs` component (URL-synced via `?tab=`). Old URLs redirect to the new tabs (see `web/next.config.ts` `redirects()`): `/vorp`,`/surplus-value`,`/surplus-adjustments` → `/value`; `/arbitration-simulation`,`/arbitration-planner` → `/arbitration`. The old `/vorp`, `/surplus-adjustments`, `/arbitration-simulation`, and `/arbitration-planner` directories retain only their client components (imported by the merged pages' section components); their `page.tsx` files were removed.

## Routes

| Route | Description |
|-------|-------------|
| `/` | **Landing hub** — phase-aware overview with a "Right now" banner + countdown, a league-status section (current week's scoreboard + compact standings, drawn from `league_matchups`), a featured-for-this-phase section, and grouped quick-access cards (gated groups show a sign-in card to anonymous visitors) |
| `/players` | Tabbed: **Directory** (searchable player list) + **Efficiency** (PPG/PPS-vs-salary scatter, formerly `/`) |
| `/rosters` | League-wide roster view — pick a **season** (`?season=YYYY`) and any date within it; quick-jumps for every NFL week that has been played, plus Pre-Draft/Post-Draft/Today. Rosters are replayed from the cumulative transaction log |
| `/teams` | **Team index** — every team with record and points-for; the front door for the team object. Public |
| `/teams/[name]` | **Team page** — the missing first-class object. Roster (salary, PPG), cap space, record and league rank, full schedule from that team's point of view, and — with projections access — total value, total surplus, and the players most exposed to opponents' arbitration dollars. Name segment is URL-encoded and resolved case-insensitively (`resolveTeamName`); an unknown team 404s. Statically pre-rendered per team via `generateStaticParams`. Public, degrades without access |
| `/scoreboard` | **Scoreboard** — the week's head-to-head matchups (live/final scores, playoff and consolation badges), the full standings, and the playoff picture, with week and season pickers. Standings/seeding are computed from `league_matchups` by `web/lib/standings.ts`, not scraped. Each card also shows both lineups' **live projection** once lineups are scraped. **Public — no sign-in.** See [docs/references/matchups-and-standings.md](references/matchups-and-standings.md) |
| `/scoreboard/[gameId]` | **Game** — both actual lineups slot against slot (from `matchup_lineups`), each player's original weekly projection (frozen at kickoff) beside his points and NFL game state, the benches, and each side's score, pre-game projection and live projection (finished starters' points + remaining starters' projections, derived by `web/lib/live-matchup.ts`). Linked from scoreboard cards, `/matchup`, and team schedules. **Public — no sign-in.** |
| `/lineup` | **Week-aware lineup planner** — pick an NFL week (`?week=`, defaults to the upcoming one) and a team (`?team=`), and score the lineup by that week's third-party per-game projection (the default when the week has data), our season-long projected PPG, or last-season PPG. A player with no row for the week renders a dash, not a zero and not "BYE" — the gap means bye *or* inactive *or* not carried by the source, and week 1 has no byes at all |
| `/matchup` | **Your matchup** — the viewer's team against that week's opponent, both at their optimal lineup, with the projected margin. Needs `users.team_name`; explains itself when unbound. Actual scores appear only once the game is past `scheduled` (Ottoneu's export reads 0.00–0.00 beforehand) |
| `/free-agents` | **The wire** — every unrostered player ranked by dollar value on the same scale as the players you'd drop, with the upcoming week's points, position filter, and an "upgrade" flag against the weakest player the viewer starts at that position. Gated on projections access |
| `/arb-progress` | Public arbitration progress: team completion status and allocation details |
| `/arb-planner-public` | Public (read-only) arbitration planner view |
| `/projected-salary` | Keep vs cut decisions for **the viewer's own team** (`users.team_name`); an account with no team bound gets an explanatory empty state rather than someone else's roster |
| `/projections` | Season-long player projections board (reads `player_projections` via `fetchProjectionBoard`). Industry-style layout: position tabs (ALL/QB/RB/WR/TE/K with counts), overall + positional ranks, player search, and a "rookies only" toggle. **Includes rookies/college prospects** — inclusion is driven by `player_projections` (source of truth), not `fetchPlayers` (which drops players without prior-season stats), so `rookie_draft_capital`/`college_prospect` players appear with a Rookie/College badge. The methodology card (`ActiveModelCard`) is **admin-only**. |
| `/projection-accuracy` | Model backtest accuracy explorer |
| `/value` | Tabbed: **VORP** (bar chart + table) · **Surplus** (rankings, bargains, overpaid, team summaries) · **Adjustments** (per-user manual value overrides) |
| `/arbitration` | Tabbed: **Targets** (per-opponent breakdown) · **Simulation** (Monte Carlo) · **Planner** (save budget allocations). The Targets/Simulation value-mode toggle uses `?mode=` and preserves `?tab=` via `ModeToggle`'s `extraParams`. |
| `/vegas-lines` | Preseason Vegas implied team totals review (AFC/NFC division cards, season selector) — spot-check the data feeding the `implied_team_total_raw` projection feature |
| `/depth-charts` | Opening-day NFL depth-chart review (team cards grouped by division, QB/RB/WR/TE tiers, role-change arrows, active-model projected PPG, season selector) — spot-check the data feeding the `depth_chart_position_raw` / `role_change_raw` projection features |
| `/mock-draft` | **Mock draft** — practice keeper auction against AI opponents, seeded from live rosters/caps + Draft Sharks values. Two formats: a **live real-time auction** (per-player clock, AI bid against you, clock extends on every bid, auto-bid proxy, pause/pace controls) and the turn-by-turn sealed-bid mode. Gated on projections access. See [docs/references/mock-draft.md](references/mock-draft.md) |
| `/snake-draft` | **Snake draft** — practice snake draft for *other* (non-Ottoneu) redraft leagues: pick the number of teams, your draft slot, the starting lineup and the number of rounds, then draft against AI opponents off The Athletic's published 12-team PPR 1-QB VORP board (`web/lib/data/athletic-vorp.ts`), with each position's replacement baseline shifted if you change the format. Same manager-valuation-noise slider as the mock draft. **Public — no sign-in, no database.** **Not part of The SOFA** (decision D3): it is a standalone practice tool for other leagues, so it is deliberately absent from the nav and the landing hub, and is reachable from the site footer, labelled as separate. See [docs/references/snake-draft.md](references/snake-draft.md) |
| `/access` | **Access status** for the signed-in account — public. Explains that projections access is granted by an admin, offers a "Request access" action (`POST /api/access-request`), and shows the pending date once asked. Reads live DB state rather than the session cookie, so a freshly granted user is told the truth and can re-sign their session via `POST /api/auth/refresh`. Middleware sends signed-in users without access here instead of `/login` |
| `/podcast` | **Podcast hub** — the ungated entry point to the podcast production tools. Reads `is_podcaster` live from the DB (not the cookie): explains the role to a non-host, and for a host whose 7-day session cookie predates the grant it re-signs it via `POST /api/auth/refresh` and forwards them on. Every gated `/podcast/*` route redirects here, so it must never itself require the role |
| `/podcast/power-rankings` | **Power-rankings ballot** (podcaster only) — rank all twelve teams ahead of an NFL week. Opens in standings order, reorders by drag *or* up/down buttons, autosaves as a private draft, and "lock in" is the explicit action that exposes it to consolidation. Each row carries the on-air note, a **private working note** (`prep_note`, never revealed — `fetchBallots` does not select it), this week's **optimal-lineup projection** inline, and that lineup plus the bench on hover (`web/lib/team-snapshot.ts`). See [docs/references/podcast-tools.md](references/podcast-tools.md) |
| `/podcast/power-rankings/reveal` | **Live reveal** (podcaster only) — the consolidated countdown from twelfth to first, one keypress at a time (space/→ next, ← back, r reset). Cards stack newest-on-top so the finished page reads as a normal 1–12 ranking |
| `/login` | Email/password login |
| `/admin` | User management (admin only) |
| `/admin/workflows` | Workflow status history (admin only) — GitHub-status-style grid of the scheduled GitHub Actions over the last 21 days, read live from the public GitHub Actions API (server-side; no token required, optional `GITHUB_TOKEN` for rate limit) |
| `/api/mcp/mcp` | **Remote MCP server** (Streamable HTTP, POST) — read-only league-data tools for MCP clients / AI agents. Accepts an OAuth 2.1 access token or the shared `MCP_API_KEY`, checked inside the route handler; `/api/mcp` is exempted from cookie auth in `web/middleware.ts` (`PUBLIC_API_ROUTES`). See [docs/references/mcp-server.md](references/mcp-server.md) |
| `/oauth/authorize` | **OAuth consent screen** for MCP clients. Validates the authorization request, redirects to `/login?redirect=…` when signed out, and requires live `has_projections_access`. Approval posts to `/api/oauth/authorize`. |
| `/api/oauth/{register,authorize,token}` | OAuth 2.1 authorization server — dynamic client registration, consent submission, and token exchange (PKCE S256, rotating refresh tokens) |
| `/.well-known/oauth-authorization-server`, `/.well-known/oauth-protected-resource` | OAuth discovery metadata (RFC 8414 / RFC 9728) that MCP clients read to find the authorization server |

## Design system

`web/app/globals.css` owns the visual language. It is the only place a colour is
chosen; everything else names a role. Reach for a raw Tailwind palette class
(`bg-slate-100`, `text-blue-600`) only when the thing genuinely has no role here
— and if you find yourself wanting one twice, it has a role and belongs below.

| Token | Utility | Role |
|-------|---------|------|
| `--page` | `bg-page` | The page ground. Owned by `PageShell`; pages do not set their own |
| `--raised` | `bg-raised` | Cards, panels, table bodies, the nav bar — anything reading as *above* the page |
| `--sunken` | `bg-sunken` | Table headers, inset strips, the phase banner |
| `--line` / `--line-strong` | `border-line` / `border-line-strong` | Hairlines; `strong` for dashed empty-state affordances |
| `--ink` | `text-ink` | Primary text and headings |
| `--ink-muted` | `text-ink-muted` | Body copy, descriptions, table cells |
| `--ink-subtle` | `text-ink-subtle` | Captions and labels. **The floor** — it is the lightest value clearing 4.5:1 on `--page`, and there is deliberately nothing below it |
| `--accent` | `text-accent`, `bg-accent-soft`, `border-accent` | Links and interactive emphasis |
| `--positive` / `--negative` | `text-positive` / `text-negative` | Gains and losses. One hue each: positive is emerald, never also green |
| `--warning` | `text-warning` | **Data the reader should distrust** — a stale scrape, and nothing else |
| `--phase` | `text-phase`, `bg-phase` | The season phase: the banner, the featured dot, the playoff cut line |

`--warning` and `--phase` are deliberately different hues. Amber previously meant
the phase badge, the featured-nav dot, the playoff cut line *and* "this data may
be wrong", so the one urgent signal wore the same colour as the decoration.

Both themes are defined in `:root` and under `prefers-color-scheme: dark`, and
exposed to Tailwind through `@theme inline` — so a utility resolves at paint
time and there is no `dark:` variant to remember.

**Layout** goes through `PageShell`, never a hand-written `<main>`:

```tsx
<PageShell width="wide">          {/* narrow | default | wide */}
  <PageHeader title="Free Agents" description="…" links={[…]} />
  …
</PageShell>
```

It owns the ground, responsive padding, the content measure and vertical rhythm.
`__tests__/components/design-system.test.ts` fails the build if a page
re-implements the shell or reintroduces sub-AA caption colours.

## Reusable Components

| Component | Purpose |
|-----------|---------|
| `Navigation.tsx` | Shared nav bar across all pages. Renders `visibleNav()` from `web/lib/nav.ts`; holds no route list of its own |
| `PageShell` / `PageHeader` | The page frame and the standard heading. Every route's `<main>`. See **Design system** above |
| `TableParts.tsx` | `Th` — the header cell for hand-rolled tables, with optional `explain`. Shared so it stops being copy-pasted per table |
| `SiteFooter.tsx` | Thin global footer. Exists mainly to give `/snake-draft` an entry point outside the league-scoped nav (D3) |
| `Tabs` | URL-synced (`?tab=`) tab bar. Accepts `tabs: { id, label, content }[]`; renders all panels and hides inactive ones (so client state in a panel survives switches). Panels can be server-rendered sections passed as `content`. Used by `/players`, `/value`, `/arbitration`. |
| `DataTable` | Generic sortable table with type safety and highlight rules |
| `SummaryCard` | Metric display cards with variant styles (default, positive, negative) |
| `PositionFilter` | Position selection buttons with multi-select support |
| `ScatterChart` | Player efficiency scatter plot with interactive filters |
| `PositionBadge` | Colored position pill (QB, RB, etc.) — canonical across all views |
| `PlayerName` | Player name renderer with link/hover-card/plain-text modes |
| `TeamName` | Canonical league-team renderer — the team counterpart to `PlayerName`. Links to `/teams/[name]`, renders "FA" as plain text, and weights the viewer's own team via `mine` (it keeps the link colour — emphasis must not cost the affordance). Route every team name through this rather than printing the string |
| `StatValue` | Numeric stat formatter with currency/decimal/number/null handling |
| `PlayerHoverCard` | Rich hover preview card for player context |
| `Explain` | In-product glossary popover. `<Explain term="vorp" />` renders a "?" that defines one term from `web/lib/glossary.ts`. `DataTable` renders it automatically for any column carrying `explain`, and `Th`/`SummaryCard` take the same prop, so tag the column factory rather than the page. The panel portals to `document.body` — it lives inside `overflow-x-auto` scroll containers that would otherwise clip it |
| `states.tsx` | Shared `EmptyState` / `NoAccessState` / `ErrorState` / `TableSkeleton`. `TableSkeleton` backs the root `app/loading.tsx`, which is what gives every navigation feedback while its server component runs. Use these instead of hand-rolling — a missing-data notice is an `h2` at body scale, never a page-sized heading |
| `DataFreshness` | "Rosters updated 3 hours ago" caption, from `web/lib/freshness.ts`. Turns `--warning` past `staleAfterHours` |
| `PhaseNote` | Says a tool is out of season, and when its window opens. Reads the phase from `web/lib/season.ts` and renders nothing while in window |

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
