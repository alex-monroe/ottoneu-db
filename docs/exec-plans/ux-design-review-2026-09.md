# UX Design Review — the overhaul as shipped (2026-09-07)

A design pass over PRs #707–#716, the six phases of
[ux-journeys.md](ux-journeys.md), now that all of them are marked ✅ SHIPPED.

Scope: `web/` only, and the *look and feel of the app as a whole* rather than any
one page. Read [ux-journeys.md](ux-journeys.md) first — this review assumes its
findings (F1–F8) and grades the result against them.

> **Status: remediated in this PR.** The findings below are written in the past
> tense of the audit; §6 is the plan, and §7 records what was actually done
> against it. Steps 1–4 and 6 are complete, step 5 partially (the `Explain`
> defects and the shared `Th` are fixed; the sixteen hand-rolled tables are not
> yet migrated to `DataTable`), step 7 complete.

**Verdict.** The information architecture landed. The visual system did not.

The overhaul fixed what it set out to fix at the level of *structure* — the nav is
task-shaped, "my team" is a real user attribute, the graph is connected, the
season phase drives content. Those are the hard problems and they are genuinely
solved. But five of the six phases added surfaces, and the sixth (Phase 5,
"polish") built a design layer that was then adopted by three files out of
roughly sixty. The app now has more good ideas than it has consistency, and the
holistic impression is of a competent product assembled by six people who never
met.

Two facts capture it:

- Phase 5 shipped `EmptyState` / `ErrorState` / `NoAccessState` / `TableSkeleton`
  under the banner "delete the hand-rolled ones" (5.4). Three files import them.
  `TableSkeleton` has **zero** callers. `/matchup` — shipped in the same
  batch — defines its own local `Empty`. `/projections` still renders
  `<h1 className="text-3xl font-bold">No projection data available.</h1>`, the
  literal anti-pattern F7 was written to kill.
- Phase 5 shipped `DataFreshness` "on every data page" (5.5). It is on **two**,
  and not on `/rosters` — the page whose entire premise is a scraped snapshot,
  and the exact scrape the component's own docstring cites as the motivation.

The rest of this document is the design read, worst-first.

---

## 1. The holistic problem: there is no design layer

Everything below is a symptom of one root cause. `app/globals.css` is still the
unmodified `create-next-app` boilerplate: two variables (`--background`,
`--foreground`) that nothing consumes, and a `body` rule that sets
`font-family: Arial, Helvetica, sans-serif`.

That last line matters. `app/layout.tsx` loads **Geist** and **Geist Mono** from
Google Fonts, wires them to `--font-geist-sans` / `--font-geist-mono`, and maps
them into `@theme inline`. Then `globals.css:25` overrides `body` with Arial. The
app pays for two webfonts on every page load and renders in Helvetica/Arial. The
whole product's typographic voice is an accident.

With no token layer, every value is chosen at the call site. Measured across
`web/app` and `web/components`:

| Role | Distinct values in use |
|---|---|
| Subtle raised surface (`bg-* dark:bg-*` pairs) | **9** — `slate-50/900`, `slate-100/800`, `slate-200/800`, `slate-100/900`, `slate-50/950`, `slate-50/800`, `slate-200/700`, `slate-300/600`, `slate-400/600` |
| Table implementations | `DataTable` (14 files) **+ 16 hand-rolled `<table>`s** |
| Page shell | `min-h-screen bg-white dark:bg-black p-8`, copy-pasted into ~24 files |
| Content measure | `max-w-7xl` ×17, `max-w-6xl` ×7, `max-w-5xl` ×3, `max-w-4xl` ×3 |
| Accent hues | **10** — blue *and* indigo, green *and* emerald, red *and* rose, amber *and* yellow, purple *and* violet |
| Page header treatment | gradient hero card (`/`, `/teams/[name]`) vs bare `<header>` (everything else) |

Five pairs of near-duplicate hues is the tell. Nobody chose "emerald means good"
and then chose green somewhere else on purpose; there was simply no place to look
it up. `docs/FRONTEND.md` is a route and component inventory — it documents *what
exists*, never *what things should look like*. There is no design documentation
in this repo at all.

The `Th` helper is copy-pasted verbatim between `components/StandingsTable.tsx:19`
and `app/teams/[name]/page.tsx:300` — two files from the same PR batch.

### 1a. The app has no elevation

Computed contrast between page background and card background:

- Light: `bg-white` page, `bg-white` cards → **1.00:1**
- Dark: `dark:bg-black` page, `dark:bg-slate-950` cards → **1.04:1**

Every card, panel, table and hero is separated from the page by a 1px
`slate-200/800` border and nothing else. That is why the app reads flat and
wireframe-ish no matter how good the individual page is: there is no figure/ground
relationship anywhere. The conventional fix is one step of separation — a
near-white page (`slate-50`) under white cards in light mode, and `slate-950`
under `slate-900` in dark — which costs one token and changes the entire feel.

`/login` already does this (`bg-slate-50 dark:bg-slate-950`) and is, not
coincidentally, the best-looking screen in the app. It is also the only page that
does.

### 1b. Everything is small

Font-size usage across `web/app` + `web/components`:

```
text-sm    328     text-xs    172     text-[10-13px]  17
text-lg     23     text-xl     32     text-2xl  26    text-3xl  37
text-base    1
```

`text-base` (16px) appears **once** in the entire application. Body copy, card
descriptions, table cells, the explanatory prose that Phase 5 worked so hard to
add — all 14px, with 172 uses at 12px and 17 at hard-coded 10–13px. The result
undercuts the overhaul's own thesis: #716 added genuinely good explanatory
writing ("This is a ceiling, not a prediction — it assumes each manager starts
their best nine") and then set it at 14px in `slate-400`, which is where readers'
eyes are trained to skip. The prose deserves 16px.

### 1c. Amber means four different things

`amber-500` is simultaneously: the season-phase badge (`PhaseBanner`, home hero),
the "featured this part of the season" nav dot (`Navigation.tsx` `FeaturedDot`),
the playoff cut line (`StandingsTable.tsx`), and **stale data — the scrape may be
behind** (`DataFreshness`). The one genuinely urgent signal in the app wears the
same color as its decoration. A reader cannot learn what amber means because it
does not mean anything.

---

## 2. Accessibility: measured failures

These are computed, not estimated (WCAG 2.1 AA needs 4.5:1 for text under
18.66px bold / 24px regular).

### Every position badge fails, two of them severely

`PositionBadge` renders `text-white` bold at 10–12px on hard-coded hex from
`lib/types.ts:324`:

| Pos | Hex | Contrast on white text | |
|---|---|---|---|
| TE | `#F59E0B` | **2.15:1** | ✗ effectively unreadable |
| WR | `#10B981` | **2.54:1** | ✗ effectively unreadable |
| RB | `#3B82F6` | 3.68:1 | ✗ |
| QB | `#EF4444` | 3.76:1 | ✗ |
| K  | `#8B5CF6` | 4.23:1 | ✗ |

These appear in every table, every hover card, every search result, and every
lineup slot — the single most-repeated element in the app. The 600-weight
Tailwind equivalents (`#d97706`, `#059669`, `#2563eb`, `#dc2626`, `#7c3aed`) clear
4.5:1 while keeping the same hue identity. As inline `style` hex they also don't
respond to dark mode at all.

### `text-slate-400` on white is 2.56:1, used 96 times in light mode

The idiom `text-slate-400 dark:text-slate-500` (matchup slot labels, DataFreshness
stamps, footer text, table meta columns) is backwards: it produces **8.19:1 in
dark mode and 2.56:1 in light**. The light theme is the broken one. `slate-500`
(4.76:1) is the correct light-mode floor; the established-good pattern already in
the codebase is `text-slate-500 dark:text-slate-400`.

Worse, `text-slate-400 dark:text-slate-600` — used in `app/matchup/page.tsx` for
"— empty —" and for scores with no weekly data — is **2.56:1 light and 2.77:1
dark**. It fails in both themes. The states that tell a manager "this lineup slot
is empty" are the least visible pixels on the page.

### No skip link, mixed focus idioms

No skip-to-content link exists; every keyboard user tabs through the full nav
(6 dropdowns + search + auth) on every page. Focus styling is split between
`focus:ring-*` (36 uses, fires on mouse click too) and `focus-visible:ring-*`
(8 uses). Pick `focus-visible` and set it once globally.

---

## 3. Perceived performance: navigation has no feedback

There is not a single `loading.tsx`, `error.tsx`, `not-found.tsx`, or `<Suspense>`
boundary anywhere in `web/app`.

Every page is an async server component running two to five Supabase queries with
`revalidate = 3600`. In the App Router, without a `loading.tsx` the navigation
**blocks on the server render**: the user clicks a nav item and the old page sits
there, unchanged, with no spinner, no skeleton, no progress — and then the new
page appears. On a cold cache that is a click that appears to do nothing. This is
the largest gap between how good the app is and how good it feels, and it is
invisible in code review because every page renders correctly once it arrives.

`TableSkeleton` was built for exactly this and wired to nothing.

Three specific holes:

- **No `not-found.tsx`.** `app/teams/[name]/page.tsx:82` calls `notFound()`. A
  stale or mistyped team link therefore lands on Next.js's default 404 — no nav,
  no footer, no branding, no way back. Team pages are the flagship of #713, and
  their failure mode is an unstyled framework page.
- **No route-level `error.tsx`.** One failed Supabase query on any page escalates
  to `global-error.tsx`, which replaces the entire document. A transient read
  error on `/vegas-lines` blows away the whole app shell.
- **`global-error.tsx` is a fourth error treatment**, hand-rolled alongside
  `ErrorState` from the same overhaul, and it hard-codes `h-[calc(100vh-4rem)]`
  against a nav that is `h-14` (3.5rem) plus a phase banner.

---

## 4. Where the new work fights itself

### `/teams/[name]` introduces a second table language

The most prominent page of the overhaul does not use `DataTable`. It hand-rolls
three tables with a local `Th`, and the differences are all visible: header
`bg-slate-50/900` vs DataTable's `bg-slate-100/800`; `text-xs uppercase` headers
vs `text-sm` sentence case; no zebra striping; no sorting; no `Explain`.

That last one bites hardest. `lib/glossary.ts` defines 11 terms. `Explain` only
ever reaches a user through `DataTable` column headers (5 terms) and `ModeToggle`
(1). So `pps`, `projected_points`, `cap_space`, `arbitration`, and
`surplus_after_arb` are written, shipped, and **unreachable** — and
`surplus_after_arb` was clearly written *for* the team page's "Surplus after
raise" column, which can't render it because that table isn't a `DataTable`. Two
halves of Phase 5 shipped in the same week and don't connect.

### `Explain` will be clipped where it is used

`components/Explain.tsx:66` positions the popover `absolute left-0 … w-64`.
`DataTable` wraps its table in `overflow-x-auto` (line 107). Per CSS spec, a
non-`visible` value on one axis computes `visible` to `auto` on the other, so the
popover is clipped on **both** axes by its scroll container. On a right-hand
column, `left-0` also pushes 256px of panel off the right edge. The glossary
Phase 5 is built around is, in its primary placement, cut off.

Two more issues in the same component:

- The trigger is `h-4 w-4` — a **16px** tap target, below WCAG 2.2's 24px minimum
  and well below the 44px touch guideline, sitting inside a sortable header.
- `DataTable`'s `<th>` has an `onKeyDown` sort handler. `Explain`'s button stops
  propagation on `click` but **not** on `keydown`, so a keyboard user pressing
  Enter to read a definition also re-sorts the table under them.

### `TeamName` removes the affordance from the one team you care about

`components/TeamName.tsx:45` renders the viewer's own team as
`font-semibold text-slate-900 dark:text-white` — no link color — while every
other team is `text-blue-600`. It is still a `<Link>`, but it no longer looks like
one, and `hover:underline` doesn't exist on touch. The PR whose stated goal was
"team names were never clickable anywhere" ships with your own team looking
un-clickable. Keep the link color; use a "Your team" chip or a subtle background
for the emphasis, as `StandingsTable` already does with `bg-blue-50/60`.

### The team page's action links leave the team

The header of `/teams/[name]` offers "Lineup planner", "Surplus rankings",
"Arbitration". None of them carry the team. Open a leaguemate's page, click
"Lineup planner", and you land on *your* lineup with no indication anything
changed. `/matchup` gets this right (`/lineup?week=…&team=…`); the team page
should either scope the links or not offer them.

### The homepage says everything twice

`PhaseBanner` renders the phase label, the phase blurb, and the countdown to the
next boundary. The home hero then renders the phase label, the phase blurb, and
the countdown to the next boundary — the same three strings from the same
`PHASE_UI` object, about 120px apart.

Below that, "Featured now" renders 2–3 `HubCard`s, and then the section groups
render **the same cards again** in place. A visitor sees "Your Matchup" twice on
one screen.

And the hub taxonomy has already drifted from the nav it says it mirrors: the
comment at `app/page.tsx:53` says "Mirrors the nav taxonomy in `lib/nav.ts` … Keep
the two in step," but `NAV_GROUPS`' "My Team" is `requiresAuth: true` and includes
a "Your Team" entry, while `HUB_GROUPS`' "My Team" is ungated and doesn't. A
signed-out visitor is shown "Your Matchup" and "Lineup" cards for a team they
don't have. Two hand-maintained copies of one taxonomy is F4 growing back.

### The homepage standings scrolls sideways on desktop

`StandingsTable` sets `min-w-[420px]` inside `overflow-x-auto`. On the homepage it
sits in one column of `lg:grid-cols-3` inside `max-w-6xl` with `p-8`:
`(1152 − 64 − 32) / 3 ≈ 352px`. The standings panel therefore has its own
horizontal scrollbar at every desktop width. The `compact` variant already drops
PA and Streak; it should also drop the min-width.

### `p-8` on phones

24 of ~25 pages use `p-8` flat — 32px of gutter on each side at every viewport.
On a 375px phone that leaves 311px for content, most of which is a
`min-w-[420px]` table in a horizontal scroller. Only `/projections` uses
`p-4 sm:p-8`. This is a one-line fix in a shared shell that doesn't exist yet.

### Matchup comparison breaks on mobile

`app/matchup/page.tsx` puts the two lineups in `md:grid-cols-2`, so below 768px
they stack. Comparing your RB2 to theirs becomes a scroll-and-remember exercise —
which is the entire purpose of the page. A slot-interleaved row layout
(`YOU | slot | THEM`) survives the narrow viewport and is arguably better at every
width, because it puts the per-slot margin where the eye already is. There is
currently no per-slot delta at all; the page gives a total margin and leaves the
reader to derive which slots produced it.

Also: player names in the matchup lineups are plain `<span>`s, not `PlayerName`
links. Every other surface in the app makes a player name clickable.

---

## 5. Smaller things worth a sweep

- `PhaseBanner` is permanent chrome on every route, non-dismissible, duplicating
  the home hero. Consider showing it only when a boundary is near, or folding it
  into the nav bar as a single chip.
- `DataFreshness` puts the exact timestamp in a `title` attribute — invisible to
  touch and to keyboard. Use a visible relative + absolute pairing.
- `DataFreshness` computes "3 hours ago" on a server component with
  `revalidate = 3600`, so the freshness stamp can itself be an hour stale. Given
  the component exists to establish trust, render the ISO timestamp and compute
  the relative form on the client.
- `SiteFooter` uses `mt-16` under pages that are all `min-h-screen`, guaranteeing
  a scroll on every route even when content fits.
- `DataTable`'s row map returns a bare `<>` fragment with keys on the inner
  `<tr>`s — React logs a missing-key warning for every table render.
- `/projected-salary` is the only primary-journey page with a `text-2xl` h1 where
  every sibling uses `text-3xl`.
- `app/projections/page.tsx:90` has a vestigial `{( … )}` wrapper left from
  removing the admin gate.
- `ModeToggle` is a value-mode switch, not a theme switch. The name collides with
  the near-universal shadcn convention and will confuse the next contributor.
- Dark mode is `prefers-color-scheme` only — no user override.

---

## 6. What to do, in order

Sequenced so each step makes the next cheaper. Steps 1–3 are the ones that change
how the app *feels*; everything else is cleanup that a token layer makes trivial.

**1. Build the missing token layer and page shell.** Rewrite `app/globals.css`
with real semantic tokens (`--surface-page`, `--surface-raised`, `--text-primary`,
`--text-muted`, `--accent`, `--positive`, `--negative`, `--warning`) in both
themes. Delete the Arial override so Geist actually renders. Introduce
`components/PageShell.tsx` owning `min-h-screen`, responsive padding
(`p-4 sm:p-6 lg:p-8`), one content measure, and the page-header pattern; replace
the ~24 copy-pasted `<main>` elements with it. Give the page a
`slate-50 / slate-950` ground so cards read as raised. Write the result into
`docs/FRONTEND.md` so there is somewhere to look it up. *This is the whole
review — the rest follows from it.*

**2. Fix the measured accessibility failures.** Move `POSITION_COLORS` to
600-weight values with dark-mode variants; swap `text-slate-400` →
`text-slate-500 dark:text-slate-400` in light-mode positions; kill
`dark:text-slate-600` on body text; add a skip link; standardize on
`focus-visible`.

**3. Give navigation feedback.** Add `loading.tsx` per route segment using the
already-built `TableSkeleton`, a branded `not-found.tsx`, and `error.tsx`
boundaries per segment. This is the cheapest large win in the list.

**4. Finish Phase 5's own checklist.** Migrate the remaining hand-rolled empty /
error / no-access states to `states.tsx` (`/matchup`, `/projections`, `/rosters`,
`global-error.tsx`, `/teams/[name]`) and *delete the local copies*, as 5.4 said.
Put `DataFreshness` on the pages 5.5 named, starting with `/rosters`.

**5. Converge the tables.** Extend `DataTable` with what the hand-rolled ones
needed (right-aligned numeric columns, a compact density, per-cell tone) and
migrate the 16 hand-rolled tables — team page first, which also unlocks the five
orphaned glossary terms. Move `Explain`'s popover out of the scroll container
(portal or `fixed` positioning), grow its target to 24px, and stop its `keydown`
from reaching the sort handler.

**6. De-duplicate the homepage.** Derive `HUB_GROUPS` from `NAV_GROUPS` rather
than maintaining a parallel copy; drop the phase block from the hero *or* the
banner; either drop "Featured now" or exclude featured cards from the sections
below.

**7. The rest of §4 and §5.** Team-scoped links on `/teams/[name]`, `TeamName`
affordance, standings min-width, matchup slot-interleaving with per-slot deltas.

---

## 7. What this PR actually changed

Everything below is in the diff that carries this document.

**Token layer (step 1).** `app/globals.css` now defines a semantic palette —
`--page` / `--raised` / `--sunken`, `--ink` / `--ink-muted` / `--ink-subtle`,
`--accent`, `--positive`, `--negative`, `--warning`, `--phase` — in both themes,
exposed through `@theme inline`. The Arial `body` rule is gone, so Geist renders.
1,088 hard-coded class pairs across 93 files were migrated to those tokens,
collapsing nine surface pairings to three and ten accent hues to five roles.
The page now sits a step behind its cards in both themes, so the app has
elevation. `--warning` and `--phase` are separate hues: amber means stale data
and nothing else. One `:focus-visible` rule replaces the split between 36
`focus:` and 8 `focus-visible:` call sites. The whole system is documented in
[docs/FRONTEND.md](../FRONTEND.md), which previously said nothing about how
anything should look.

**Page shell (step 1).** `components/PageShell.tsx` owns the `<main>`: the page
ground, responsive padding (`px-4 sm:px-6 lg:px-8`, so phones stop getting 32px
desktop gutters), three named content measures, and vertical rhythm. Twenty-one
copy-pasted shells now route through it, and `PageHeader` gives the four drifted
header treatments one implementation.

**Accessibility (step 2).** `POSITION_COLORS` moved to 600/700 weights with a
matching dark set, and `PositionBadge` carries both as CSS custom properties so
a server component can theme without client JS — all five badges now clear AA in
both modes (worst case 5.02:1, was 2.15:1). The three backwards `text-slate-400
dark:text-slate-*` pairs are gone. A skip link was added to the root layout.

**Navigation feedback (step 3).** `app/loading.tsx` (built on the previously
unused `TableSkeleton`), `app/not-found.tsx` and `app/error.tsx` now exist, so a
click has feedback, a stale team link lands on a branded 404, and one failed
query no longer takes the app shell down with it.

**Phase 5's own checklist (step 4).** The hand-rolled states in `/matchup`,
`/projections` and `/rosters` are gone, replaced by `states.tsx` and deleted as
5.4 said. `DataFreshness` went from two pages to seven, and its timestamp is now
a visible `<time>` rather than a `title` attribute only.

**`Explain` and the orphaned glossary (step 5, partial).** The panel portals to
`document.body`, so `overflow-x-auto` can no longer clip it, and it flips back on
screen at the viewport edge. Its target is 24px. Its `keydown` no longer reaches
the header's sort handler — a keyboard user reading a definition used to re-sort
the table, which now has a regression test. `Th` moved to
`components/TableParts.tsx` (it existed twice, verbatim) and takes `explain`, as
does `SummaryCard`; that reaches `surplus_after_arb`, `cap_space` and `ppg` on
the team page, three of the five orphans. **Not done:** the sixteen hand-rolled
tables still are not `DataTable`s.

**Homepage (step 6).** `HUB_GROUPS` is deleted. The hub derives its taxonomy,
ordering and gating from `NAV_GROUPS` via the same exported `canSee` the menu
uses, so the two cannot drift — and signed-out visitors stop being offered "Your
Matchup" for a team they do not have. The hero no longer reprints the phase
banner's three strings, and a card promoted to "Featured now" is skipped in the
group below instead of appearing twice.

**The rest (step 7).** Team-page action links carry the team (`/lineup?team=…`),
and the viewer-scoped ones only appear on your own team. `TeamName` keeps the
link colour on your own team and emphasises with weight. The compact
`StandingsTable` dropped its 420px floor, so the homepage panel stops scrolling
sideways. `/matchup` replaced its two stacking columns with one slot-interleaved
comparison that carries a per-slot delta and survives a phone. `DataTable`'s row
fragments are keyed. The `global-error` magic offset and the vestigial `{( … )}`
on `/projections` are gone.

**Guardrails.** `__tests__/components/design-system.test.ts` fails if a badge
drops below AA, if a page re-implements the shell, or if a sub-AA caption colour
comes back. 715 tests pass; `next build` compiles and typechecks clean.

---

## Postscript: what the overhaul got right

Worth stating plainly, because the list above is one-sided by design.

The information architecture in `lib/nav.ts` is genuinely good — task-shaped,
single-destination, with menu visibility cleanly separated from route enforcement
and the reasoning written down in the file. `lib/access.ts` centralizing the
gating that F2 found scattered across four places is the kind of fix that stops a
category of bug rather than an instance of it. Making "my team" a user attribute
(#712) was correctly identified as the fulcrum and correctly done first. The
in-product glossary, the phase-driven featuring, the data-freshness stamp and the
shared state components are all the *right* ideas, well designed at the component
level.

They are just not yet the app. The gap between "this component exists" and "this
is how the product looks" is the design layer, and it is the one thing the plan
never had a phase for.
