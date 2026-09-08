# Podcast tools

Production tooling for the league's podcast, behind a **third role** that is
independent of everything else on the site. Routes live under `/podcast`; the
first tool is the power-rankings consolidator.

## The `podcaster` role

`users.is_podcaster` (migration 040) is a boolean alongside `is_admin` and
`has_projections_access`, deliberately **not** a rung on a ladder:

- a host needs none of the model's numbers to record a show, so the podcast
  routes do not require projections access;
- most accounts with projections access are not hosts, so the role cannot be
  inferred from that flag either;
- `is_admin` does not imply it. Migration 040 *seeds* it true for admin accounts
  so the operator can open the tools immediately, but the policy in
  `web/lib/access.ts` never infers one role from another. `access.test.ts` pins
  that.

Granting it: **/admin → the Podcaster column → "Host"**. The same admin list
that grants projections access.

### The stale-cookie problem, and how /podcast handles it

The session cookie is a 7-day HMAC snapshot of the account's role flags, because
middleware runs on the Edge and cannot reach the database. So a host granted the
role an hour ago is still carrying `isPodcaster: false` in an otherwise valid
cookie. Three things follow:

1. **The session payload gained a field.** `signSession` writes seven
   colon-delimited fields where it used to write six; `verifySession` accepts
   both shapes and reads a v1 payload as `isPodcaster: false`. Shipping the role
   therefore did not sign every league member out. Anything that is neither
   shape is rejected rather than parsed positionally.
2. **`/podcast` (the hub) is deliberately not gated.** Every gated podcast route
   redirects a non-host there. It reads the role *live* from the database, and
   when the database says host but the cookie says otherwise it re-signs the
   cookie via `POST /api/auth/refresh` and forwards them on (`SessionSync.tsx`).
   This is the same invariant `/access` has for projections access: the page
   that explains a locked door must not be behind that door.
3. **Sub-pages guard themselves too.** `requirePodcaster()` in `web/lib/auth.ts`
   re-reads `is_podcaster` from the database, so a route accidentally dropped
   from `PODCASTER_ROUTES` fails closed, and a revoked role takes effect on the
   next page load rather than in seven days. `PUT /api/podcast/power-rankings`
   does the same check for the same reason.

## Power rankings

Each host ranks all twelve teams ahead of an NFL week; the show reveals the
consolidated order from twelfth up to first, live.

| Route | What it is |
|-------|------------|
| `/podcast` | Hub: this week's ballot status for every host. Ungated (see above). |
| `/podcast/power-rankings?week=N` | Your own ballot for week N. |
| `/podcast/power-rankings/reveal?week=N` | The live countdown. Open this while recording. |
| `PUT /api/podcast/power-rankings` | Save or lock in a ballot. |

**Week N means "pre week N"** — the ranking is a preview, so the default is the
*upcoming* slate from `web/lib/nfl-week.ts`, which flips every Tuesday 00:00 ET.
Earlier weeks stay reachable from the week picker.

### Building a ballot

A fresh ballot opens in **current standings order**, which is the ordering a
host argues *with* rather than a blank list. Reordering is offered twice —
drag-and-drop for a mouse, up/down buttons for a keyboard, a screen reader or a
phone — both driving the same array. Each team takes an optional one-line note
to read out when its slot is revealed.

Edits **autosave as a draft** (debounced ~1.2s); a ballot gets built over a few
days in odd moments and losing one to a closed tab is the failure that would
actually happen. **Locking in** is the only explicit action, because it is the
one with a consequence: `submitted_at` is stamped, and only then does the ballot
become visible to consolidation and therefore to the other host. A submitted
ballot can be reopened and changed.

Drafts may be partial. A **submitted** ballot must be a complete permutation of
the league — checked by `isCompleteBallot` in the route against the live team
list, not by the Zod schema, which cannot know who is in the league.

### How ballots are consolidated

Implemented in `web/lib/power-rankings.ts`; the reasoning is in that file's
header and pinned by `web/__tests__/lib/power-rankings.test.ts`.

- **Mean rank**, ascending. With two voters this orders identically to a Borda
  count, but every disagreement stays legible as a number, so "he had them
  fourth, I had them ninth" is on the card rather than buried in a score.
- **Ties break towards conviction, not consensus** — two voters tie constantly,
  so this is load-bearing. Order: lower mean rank → better *best* rank → better
  worst rank → team name. A team somebody was willing to rank first beats the
  team both hosts shrugged at second; the name is a last resort that exists so
  re-rendering the page mid-episode cannot reshuffle the order.
- **Only submitted ballots count.** Drafts are invisible.
- **A team nobody ranked is dropped**, not floated to the bottom — that means
  the league gained a team after the ballots were locked, and the page says so
  rather than inventing a slot.

Each revealed card carries the record, points for and standings position (the
facts a power ranking argues with), every host's own placement, a `split N`
badge when they were three or more places apart, and a movement chip against
last week's consolidated order.

### The reveal screen

Reveals bottom-up: the first click shows the worst team, the last shows the
best. Revealed cards stack newest-on-top, so the card being talked over is at
eye level and — once the countdown ends — the page reads top to bottom as an
ordinary 1-through-12 ranking, which is the thing worth screenshotting.

Keyboard: **space / → / enter** reveals the next slot, **← / backspace** steps
back, **r** resets. Nobody wants to aim a mouse at a button on air.

Reveal position is local component state and deliberately unsaved: a refresh
mid-episode should start clean rather than restore a stale position. The
"biggest split" callout is held back until the countdown finishes so it cannot
give away a slot that has not been read out.

## Adding another podcast tool

1. Add the route under `/podcast/<tool>` and its API under `/api/podcast/<tool>`.
2. Add both to `PODCASTER_ROUTES` in `web/lib/access.ts` — `/podcast` itself
   must stay out of that list.
3. Call `requirePodcaster("/podcast/<tool>")` at the top of the page.
4. Add a nav entry with `access: "podcaster"` in `web/lib/nav.ts`, and a
   `HUB_META` entry in `web/app/page.tsx` if it should appear on the homepage.
