# UX: Key User Journeys and Improvement Plan

Status: **in progress** — Phase 0 shipped (#711), Phase 1 shipped · Created 2026-09-06 · Owner: @alexrmonroe

The site grew subsystem by subsystem — projections, value, arbitration, matchups,
drafting — and each arrived as its own route with its own page-level conventions.
The result is a genuinely deep analytics platform whose *parts* are strong and whose
*seams* are not. This document names the journeys the site actually has to serve,
records where each one breaks today, and proposes a phased plan to make the whole
thing feel like one product.

Scope is the Next.js app in `web/` only. No projection-model or scraper changes.

---

## 1. Who uses this

Four distinct audiences share one surface today, and the site does not distinguish
between them.

| Audience | How they arrive | What they can see |
|---|---|---|
| **A1 — Anonymous visitor / leaguemate** | Link from the league, curiosity | `/`, `/scoreboard`, `/players`, `/rosters`, and (unintentionally) `/depth-charts` |
| **A2 — Signed-in leaguemate** | Registered, granted `has_projections_access` by an admin | Everything except `/admin` |
| **A3 — The operator** (you) | Runs the pipeline, owns The Witchcraft | Everything, plus the data spot-check pages and `/admin/workflows` |
| **A4 — AI agent / MCP client** | OAuth or `MCP_API_KEY` against `/api/mcp/mcp` | The read-only tool registry in `web/lib/mcp/tools.ts` |

**A2 is a confirmed audience** (decision D1, §7) and the audience the product is
currently weakest for. Leaguemates signing in is the case this plan is designed for,
which is what makes finding **F3** the central structural problem rather than a
cosmetic one: today the site cannot represent a second manager at all.

A4 is worth stating explicitly because it is already a first-class consumer with its
own auth server — an agent asking "should I keep Jacobs?" traverses the same concepts
as a human, and the MCP tool surface is currently *better factored by task* than the
web nav is.

---

## 2. The spine: the Ottoneu year

The single best structural idea already in the codebase is that the site knows what
time of year it is. `web/lib/season.ts` resolves a `phase` from the `league_calendar`
table, and `web/lib/season-ui.ts` maps each phase to a label, a blurb, and a set of
featured links.

```
pre_arb  →  pre_keeper  →  pre_draft  →  post_draft  →  in_season  →  (next season)
```

Every journey below belongs to a phase. The plan's central thesis is that **the phase
should drive far more than an amber dot** — it should decide what the homepage leads
with, what a page defaults to, and what gets deferred.

---

## 3. The journeys

### J1 — The weekly in-season loop
**Phase:** `in_season` (~5 months, the longest phase) · **Audience:** A2, A3

> "It's Tuesday. Did I win? Where am I in the standings? Who do I start Sunday, and is
> there anyone on the wire better than my WR3?"

**Path today:** `/` (scoreboard + compact standings) → `/scoreboard` → `/lineup` → `/weekly`.

**Where it breaks:**

- **`/lineup` doesn't know it's a week.** [app/lineup/page.tsx](../../web/app/lineup/page.tsx)
  builds its projected total from `projected_ppg` (the season-long model) or last
  season's `ppg`. The per-game numbers that exist in `weekly_projections`, are shown
  on `/weekly`, and appear on the player card are **not used by the one page whose
  entire purpose is setting this week's lineup.** There is no week selector, no
  opponent, no lock time, no bye/injury signal.
- **The loop is not a loop.** `/scoreboard` links to nothing. `/lineup` links to
  nothing. `/weekly` links only to `/projections`. Each step is a separate act of
  navigation through a hamburger menu.
- **No free-agent surface.** `league_prices` knows who is unrostered, and the whole
  value stack (VORP, surplus, projections) is computed over every player — but there
  is no "who's available" view anywhere in the app. The most common in-season
  decision has no page.
- **No "my matchup."** The scoreboard shows twelve teams' results; nothing shows *your*
  matchup, your opponent's roster, or what you need this week.

This is the least-served journey and the longest-running phase.

---

### J2 — Look up a player
**Phase:** all · **Audience:** A1, A2, A3

> "What is this guy worth, what am I paying, and what does the model think?"

**Path today:** `GlobalPlayerSearch` in the nav (present on every page — the site's
single best global affordance) → `/players/[id]`.

**Where it breaks:**

- **The player card is a cul-de-sac.** Its only internal link is
  `← Back to Players` ([app/players/\[id\]/page.tsx:78](../../web/app/players/[id]/page.tsx#L78)).
  From a player you cannot reach the roster he's on, his team's cap situation, his
  surplus row, his arbitration exposure, or the lineup he'd slot into.
- **His team is text, not a link.** Across the entire app, `grep team_name … href`
  returns **zero** hits. Team names are never clickable anywhere.
- **Access changes the page silently.** Without `has_projections_access` the projection
  block, Draft Sharks value, and weekly cards simply vanish — no indication that
  anything is missing or how to get it.

---

### J3 — The arbitration campaign
**Phase:** `pre_arb` · **Audience:** A2, A3

> "I have $60. Where do I spend it to do the most damage, and has everyone else
> submitted yet?"

**Path today:** `/projections` → `/value?tab=surplus` → `/arbitration?tab=targets` →
`?tab=simulation` → `?tab=planner` → `/arb-progress`.

This is **the best-served journey in the app** — three coherent tabs, a Monte Carlo
sim, saved plans with real per-user persistence (`arbitration_plans` keyed on
`user_id`), and a league-wide progress tracker. It is the model the other journeys
should be held to.

**Where it still breaks:**

- **Four destinations, one job.** The Offseason nav group lists Arbitration, Arb
  Progress, Arb Planner *and* Mock Draft; `/arbitration?tab=planner` and
  `/arb-planner-public` are two planners with different rendering of the same
  component tree. Which one am I supposed to open?
- **`?mode=raw|adjusted|projected` is unexplained.** The toggle changes every number on
  the page and nothing in the UI says what the three modes mean.
- **Targets are computed against The Witchcraft for everyone.** `analyzeArbitration()`
  excludes `MY_TEAM` ([web/lib/arbitration.ts:35](../../web/lib/arbitration.ts#L35)) — so a
  leaguemate's "targets" are Alex's targets. See **F3**.

---

### J4 — Keep or cut
**Phase:** `pre_keeper` · **Audience:** A2, A3

> "Post-raises I'm $40 over the cap. Who goes?"

**Path today:** `/projected-salary` → `/value?tab=surplus` → `/value?tab=adjustments`.

**Where it breaks:**

- **The page is titled for one team.** `/projected-salary` renders
  `Salary Analysis — The Witchcraft`
  ([app/projected-salary/page.tsx:73](../../web/app/projected-salary/page.tsx#L73)). For any
  other signed-in user this page is about somebody else's roster, with no team picker.
- **No decision state.** You can read keep/cut recommendations but not *record* one,
  so the journey ends in a screenshot or a notepad. **Persisting keep/cut decisions is
  explicitly out of scope** (decision D2, §7) — the fix here is to make the *reading*
  viewer-correct and cap-aware, not to add a write path.
- **Cap math is per-page.** `/projected-salary` computes cap space; `/lineup` and
  `/rosters` do not show it. There's no single answer to "where do I stand against the
  cap right now."

---

### J5 — Auction prep and draft day
**Phase:** `pre_draft` · **Audience:** A2, A3

**Path today:** `/projections` → `/rosters` (pre-draft snapshot) → `/mock-draft` (live
or sealed-bid, against AI seeded from real rosters and Draft Sharks values).

`/mock-draft` is a genuinely impressive piece of work. Its problems are approach
problems, not quality ones:

- **Nothing carries into or out of it.** You cannot bring a target list from
  `/projections` or `/value` into a mock, and nothing you learn from a mock is saved.
  It's a sealed room.
- **`/snake-draft` is not part of this product** (decision D3, §7). It's a public,
  DB-free practice tool for *other* redraft leagues, off a static Athletic board — and
  it currently sits in the public nav bar between "Rosters" and "The SOFA," implying it
  is league tooling. It stays deployed, but it should not appear in The SOFA's
  navigation or information architecture.
- **No target list / tier sheet anywhere.** The core auction artifact — my prices, my
  tiers, my must-haves — does not exist as a saved object.

---

### J6 — Post-auction league review
**Phase:** `post_draft` · **Audience:** A2, A3

> "What did the league pay, who overpaid, and where do I stand?"

**Path today:** `/rosters` (post-draft quick-jump) → `/value?tab=surplus` → `/players`
(efficiency tab).

`/rosters` replaying rosters from the transaction log at any date, with per-week
quick-jumps and a season picker, is the strongest data feature on the site. But the
review is manual: there's no league-wide diff view, no "biggest bargains/reaches of
this auction," no per-team cap/value summary that would answer the question in one
screen. (This is the exact gap noted in the 2026 offseason plan, still open.)

---

### J7 — First visit and getting access
**Phase:** all · **Audience:** A1 → A2

> "Someone in the league sent me a link."

**Path today:** `/` → a locked card → `/login` → register → ...nothing.

**This journey is broken, at bug level.** Registration
([app/api/auth/register/route.ts](../../web/app/api/auth/register/route.ts)) self-serves,
auto-logs-in, and sets `has_projections_access: false`. From there:

- **Confirmed infinite redirect loop.** Signed in without access, visit `/projections`
  → `middleware.ts` redirects to `/login?redirect=/projections` → `app/login/page.tsx`
  sees an authenticated session and redirects *back* to `/projections` → middleware
  again. `isValidRedirect("/projections")` is `true`, so nothing breaks the cycle.
  The browser ends at `ERR_TOO_MANY_REDIRECTS`.
- **Silent bounce from the homepage.** The locked hub cards link to bare `/login`,
  which for an authenticated user redirects to `/` — the user clicks "Sign in to access
  projections tools" and lands back where they started, with no message.
- **No way to ask.** Nothing tells a new user that access is granted by an admin, and
  nothing notifies the admin that someone registered. `/admin` must be checked manually.

---

### J8 — Operator: is the data right?
**Phase:** all · **Audience:** A3 only

**Path today:** `/admin/workflows` (21-day GitHub Actions grid) → `/vegas-lines` →
`/depth-charts` → `/projection-accuracy`.

`/vegas-lines` and `/depth-charts` exist to spot-check the raw features feeding
`implied_team_total_raw` and `depth_chart_position_raw`. They are **developer
instruments filed in the nav next to decision tools**, and they carry the two gating
inconsistencies in **F2**.

There is also no in-product freshness signal: no page says when its data was last
scraped. A stale roster and a fresh one look identical.

---

### J9 — Agent access (MCP)
**Phase:** all · **Audience:** A4

Worth recording because it constrains the plan: `web/lib/mcp/tools.ts` exposes
rosters, projections, values, arbitration, scoreboard and standings to agents, gated
on the same `has_projections_access` flag via a full OAuth 2.1 server. **Any per-user
team binding introduced in Phase 1 has to reach the MCP layer too**, or `get_rosters`
will keep meaning "Alex's league view" for every token.

---

## 4. Cross-cutting findings

### F1 — The site is a set of pages, not a graph
Of ~40 files under `web/app`, **nine contain a single internal link**, and most are
one-way pointers (`← Back to Players`, `→ /projections`). There is no navigation
between related views: roster → player, player → team, standings → matchup, surplus →
arbitration target. Every lateral move goes back through the nav menu.

### F2 — Gating is enforced in four places and disagrees with itself
1. `middleware.ts` `PROTECTED_ROUTES` — 6 route prefixes
2. Page-level `if (!user?.hasProjectionsAccess)` — `/mock-draft`, `/weekly`
3. Prop-level degradation — `/lineup`, `/rosters`, `/players/[id]` quietly drop data
4. Nothing at all — `/depth-charts`

**Confirmed leak:** `/depth-charts` renders active-model projected PPG
([app/depth-charts/page.tsx:209](../../web/app/depth-charts/page.tsx#L209)) with **no auth
check and no middleware entry**, while its sibling spot-check page `/vegas-lines` *is*
protected. The homepage advertises Depth Charts inside the locked "Projections" group,
so the card is hidden from anonymous users but the URL is wide open.

### F3 — "My team" is a global constant, not a user attribute
`MY_TEAM = "The Witchcraft"` lives in `config.json` and is referenced in **12
components**: `/projected-salary`'s title, surplus highlight rules, the lineup default,
the standings bold row, arbitration target exclusion, roster auto-expand. The `users`
table carries only `is_admin` and `has_projections_access` — **no team column.**

So every signed-in leaguemate sees Alex's team as their own. Meanwhile
`arbitration_plans` and `surplus_adjustments` *are* correctly keyed on `user_id`. The
personalization pattern is half-built, and this single constant is what keeps the site
a personal tool rather than a league one. **It is the highest-leverage fix in this
document.**

### F4 — Nav is organized by data source, and gets worse the more access you have
The "Projections" group mixes a season-long model (`/projections`), a third-party
weekly feed (`/weekly`), a model diagnostic (`/projection-accuracy`), and two operator
spot-check pages (`/vegas-lines`, `/depth-charts`) — four different kinds of thing.
"Value" lists the parent page *and* its three tabs as four sibling entries.

Worse, the inline bar collapses to a hamburger at `2xl` (1536px) when authenticated
versus `lg` (1024px) when not
([components/Navigation.tsx](../../web/components/Navigation.tsx)) — because auth adds three
dropdowns. **An anonymous visitor on a 1280px laptop gets a full nav bar; a signed-in
member on the same laptop gets a hamburger.** Access degrades navigation.

### F5 — Phase awareness is announced but never acted on
`PhaseBanner`, the amber dots, and the "Featured now" hub section all read the phase —
and then every page renders identically year-round. `/arbitration` is equally
prominent in December. `/lineup` shows season-long projections in Week 10. Off-phase
content is *muted*, never deferred or reframed.

### F6 — No shared vocabulary layer
PPG vs PPS vs Proj PPG vs Proj Pts; VORP; surplus; raw vs adjusted vs projected mode;
dollar value. `docs/GLOSSARY.md` exists **for developers**. In-product there is
nothing, and the one methodology explainer (`ActiveModelCard`) is **admin-only** — the
users who most need to know how a projection was made are the ones forbidden from
seeing it.

### F7 — No state design system
Empty and error states are hand-rolled per page: `/weekly` has a local `Empty`
component, `/rosters` renders `<h1 className="text-3xl font-bold">No roster data
found.</h1>` — an error styled as a page title. No shared loading skeletons, no
consistent "you don't have access to this" state, no data-freshness stamp.

### F8 — Overlapping surfaces
Three arbitration planner destinations; `/players` efficiency tab overlapping
`/value`; `/rosters` and `/lineup` both reconstructing rosters with different controls.
Separately, `/snake-draft` sits in the nav despite belonging to no journey here (D3).

---

## 5. Improvement plan

Sequenced so each phase unblocks the next. Phases 0–2 are the ones that change how the
site *feels*; 3–5 are where it becomes genuinely good.

### Phase 0 — Fix what's broken (small, do first) — ✅ **SHIPPED** (#711)
Bug-grade, independently shippable, no design work.

| # | Work | Files |
|---|---|---|
| 0.1 | Break the redirect loop: when a session is valid but lacks access, render a real "access pending" page instead of bouncing to `/login` | `web/middleware.ts`, `web/app/login/page.tsx` |
| 0.2 | Add `/depth-charts` to `PROTECTED_ROUTES` (or deliberately make it public and move its hub card out of the gated group) | `web/middleware.ts` |
| 0.3 | Collapse gating to one helper — `requireProjectionsAccess()` — used by middleware and pages alike; delete the four ad-hoc patterns | `web/lib/auth.ts` + callers |
| 0.4 | Point locked hub cards at `/access` rather than bare `/login` | `web/app/page.tsx` |
| 0.5 | Notify admins of new registrations; add a "request access" action | `web/app/api/auth/register/route.ts`, `web/app/admin/` |

**Exit:** a new user can register, understands exactly what they're waiting for, and
never hits a loop. Add a test asserting no protected route redirects an authenticated
session back to itself.

> **Verification note (found while implementing Phase 0).** `verifySession` throws
> inside the **Edge runtime** under `next dev` — `crypto.subtle.verify` rejects the
> `ArrayBuffer` that `base64UrlToBuffer` returns ("3rd argument is not instance of
> ArrayBuffer…"), most likely a cross-realm identity problem in Turbopack's Edge
> sandbox. Middleware therefore treats **every** session as anonymous locally, so
> signed-in routing cannot be exercised end-to-end with `just dev`. Confirmed
> pre-existing on `main` and unrelated to this plan (production is unaffected, or no
> one could open a gated page at all). Local verification of anything auth-gated has
> to go through unit tests plus the Node-runtime page components until it's fixed —
> tracked separately.

### Phase 1 — Make "your team" real — ✅ **SHIPPED**
The unlock. Everything downstream depends on it.

| # | Work |
|---|---|
| 1.1 | Add `team_name` to `users` (nullable, validated against known league teams); migration + admin UI to set it |
| 1.2 | Introduce `getViewerTeam()` — returns the user's team, falling back to `MY_TEAM` only for the operator/unbound case |
| 1.3 | Replace the 12 `MY_TEAM` references with `getViewerTeam()`: `/projected-salary` title and roster filter, surplus highlight rules, lineup default, standings bold row, arbitration exclusion, roster auto-expand |
| 1.4 | Thread the viewer's team through the MCP layer so `get_rosters` / arbitration tools are viewer-relative (**F9/J9**) |
| 1.5 | Keep `config.json:MY_TEAM` as the operator default only, and say so in a comment |

**Exit:** two leaguemates signed in on two laptops see two different "my team." The
existing `arb-logic.test.ts` / `surplus.test.ts` suites need viewer-parameterized
equivalents.

### Phase 2 — Connect the graph
Turn pages into a navigable structure. Mostly link work; high felt impact.

| # | Work |
|---|---|
| 2.1 | **Add `/teams/[name]`** — the missing first-class object. Roster, cap space, record, schedule, surplus summary, arbitration exposure. One page that answers "how is this team doing." |
| 2.2 | Make every team name a link to it — standings, scoreboard, rosters, arb progress, player cards, hover cards |
| 2.3 | Give the player card a "related" rail: his team, his surplus row, his arbitration exposure, his weekly projection, his Ottoneu card |
| 2.4 | Add contextual next-steps to each analysis page (`/value` surplus row → arbitration target; `/projected-salary` cut → cap impact) |
| 2.5 | Give `/scoreboard` and `/lineup` mutual links, and both a link to the viewer's team page |

**Exit:** from any player you can reach his team, and from any team you can reach any
of its players, without touching the nav.

### Phase 3 — Make in-season a first-class journey
The longest phase, currently the thinnest.

| # | Work |
|---|---|
| 3.1 | **`/lineup` becomes week-aware** — a week selector, and `weekly_projections` as the default projection source with the season-long model as the alternate. This is the single biggest functional gap in the app. |
| 3.2 | **"My matchup" view** — your lineup against your opponent's, with the projected margin |
| 3.3 | **Free agents view** — the missing page. Unrostered players ranked by projected value, filterable by position and need, comparable against your current starters |
| 3.4 | Injury / bye / inactive signals on lineup and roster rows |
| 3.5 | A weekly "start/sit" summary on the homepage during `in_season` |

### Phase 4 — Rebuild the IA around tasks
Now that the graph exists, retax the nav.

Proposed top level, phase-ordered rather than source-ordered:

```
My Team  ·  League  ·  Players  ·  Analysis  ·  Tools          [operator: Data]
```

| # | Work |
|---|---|
| 4.1 | Regroup: **My Team** (team page, lineup, keep/cut, my plans) · **League** (scoreboard, standings, rosters, arb progress) · **Players** (directory, projections, weekly, free agents) · **Analysis** (value, VORP, surplus, arbitration) · **Tools** (mock draft) |
| 4.2 | Move `/vegas-lines`, `/depth-charts`, `/projection-accuracy`, `/admin/workflows` into an operator-only **Data** section — they are instruments, not features |
| 4.3 | Stop listing tabs as nav siblings; one entry per destination |
| 4.4 | Fix the collapse asymmetry — the authenticated nav must not be *worse* than the anonymous one at the same width (grouping should shrink it below the `2xl` threshold) |
| 4.5 | **Remove `/snake-draft` from The SOFA's nav and hub** (D3). The route stays live and linkable, but it is a standalone utility, not a league feature — give it its own minimal entry point rather than a slot in a league-scoped menu |

### Phase 5 — Explain the numbers, systematize the states
| # | Work |
|---|---|
| 5.1 | In-product glossary: a shared `<Explain term="VORP">` popover sourced from one definitions module, wired to every metric header |
| 5.2 | Un-gate `ActiveModelCard` for all users with projections access — if you can see the number you should be able to see how it was made |
| 5.3 | Explain the `?mode=` toggle inline (raw / adjusted / projected) |
| 5.4 | Shared `EmptyState`, `ErrorState`, `NoAccessState`, and loading skeletons; delete the hand-rolled ones |
| 5.5 | A data-freshness stamp ("rosters as of …", "projections as of …") on every data page, sourced from the scrape timestamps |
| 5.6 | Make the phase actually drive page content: default `/lineup` to this week in-season, defer arbitration UI out of phase, reframe the homepage lead per phase |

---

## 6. Sequencing

```
Phase 0  ──▶  Phase 1  ──▶  Phase 2  ──▶  Phase 3
(bugs)       (viewer)      (graph)       (in-season)
                              │
                              └──▶  Phase 4  ──▶  Phase 5
                                    (IA)          (polish)
```

Phase 0 is independent and should ship immediately. Phase 1 is the fulcrum — Phases
2–5 all assume a viewer with a team. Phase 3 is the highest user-visible payoff and
should be timed to land before kickoff of the next season; Phase 4 is best done *after*
3 so the nav is retaxed around a surface that's actually complete.

## 7. Decisions

Resolved 2026-09-06. These were the three questions the plan's scope hung on; all
three are now settled, so nothing above is speculative.

| # | Question | Decision | Consequence |
|---|---|---|---|
| **D1** | Are leaguemates (A2) a real audience? | **Yes.** | Phase 1 stands at full scope and is the fulcrum of the plan. `MY_TEAM` must become a per-user attribute (**F3**), and Phase 4's "My Team" grouping is a real surface, not a relabel. The viewer-team change has to reach the MCP layer too (**J9**). |
| **D2** | Should keep/cut decisions persist? | **No — not for now.** | Drop the write path from **J4**. No new table, no new API route. Phase 1 still fixes the real defect there: `/projected-salary` must analyse *the viewer's* roster instead of being hardcoded to The Witchcraft. Revisit only if managers ask for it. |
| **D3** | Is `/snake-draft` in scope? | **No — keep it, but it is not part of The SOFA.** | It is an unrelated general-purpose utility that shares a deployment. Remove it from the nav and homepage hub (4.5); it keeps its route and stays usable by direct link. It is excluded from every journey, from the Phase 4 taxonomy, and from any future league-scoped work. |

### Non-goals

Recorded so they don't get re-proposed:

- Persisted keep/cut decisions (D2).
- Any work that treats `/snake-draft` as a SOFA feature (D3).
- Projection-model or scraper changes — this plan is `web/` only.
