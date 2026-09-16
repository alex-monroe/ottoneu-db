# Podcast tools

Production tooling for the league's podcast, behind a **third role** that is
independent of everything else on the site. Routes live under `/podcast`. Two
tools so far, one pointing each way: the **power-rankings consolidator** looks
forward at the week about to be played, and the **weekly recap** looks back at
the one that just was.

| Route | What it is |
|-------|------------|
| `/podcast` | Hub. Ungated — see below. |
| `/podcast/recap?week=N` | [Weekly recap](#weekly-recap): episode prep for the week that just finished. |
| `/podcast/power-rankings?week=N` | [Your ballot](#power-rankings) for the upcoming week. |
| `/podcast/power-rankings/reveal?week=N` | The live countdown. Open this while recording. |

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
phone — both driving the same array. A row is only draggable while the grip is
held, so a click-drag inside a notes box selects text instead of picking the
team up.

Each row carries three things beyond the team name.

**Two notes, with opposite audiences.** The one-liner is the **on-air note**:
the other host sees it the moment you lock in, and it is read out when the slot
is revealed. Below it, behind the notebook icon (or "Show working notes", which
opens every row at once for scanning while you reorder), are your **working
notes** — the case for moving a team, what you talked yourself out of last week.
Those are private, and privately by *construction* rather than by filtering:
`fetchBallots` does not select `prep_note`, so the `Ballot` objects that reach
consolidation and the reveal screen have no field for it to travel in. The only
read that returns it, `fetchPrepNotes`, is scoped to one `user_id`.
`power-rankings.test.ts` pins both halves. Notes are per (ballot, team) and a
ballot is per week, so a new week starts clean; last week's thinking stays on
last week's ballot via the week picker. Column added in migration 042.

**This week's projection, inline.** Next to the record sits the total the team's
*optimal* lineup projects for the week being ranked — the forward-looking half
of an argument the standings can only make backwards. A 1-4 team projecting 130
is a different team from a 1-4 team projecting 95.

**The lineup behind that number, on hover.** Hovering the team name opens the
optimal nine and the whole bench, each with their opponent and forecast, and a
link through to `/lineup`. It is a hover rather than something always on screen
because the ballot is a list you *reorder*, and twelve nine-man lineups stacked
into it would bury the thing being manipulated.

Both come from `web/lib/team-snapshot.ts`, which scores `optimizeLineup` on the
`weekly` metric — the third party's forecast for that specific week, so a player
on bye is never optimised into a starting slot. If the ranked week has no stored
projections the page says so and leaves both blank, rather than showing a column
of 0.0s that would read as a forecast. The snapshots cost a roster
reconstruction on every load (the page is `revalidate = 0`), which is the one
deliberate expense on it.

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

## Community power rankings

Listeners get a ballot too, and their votes produce a **second, public
ranking**. The two results never mix: the reveal is the hosts' order and nobody
else's; the community ranking is everyone's.

| Route | What it is |
|-------|------------|
| `/power-rankings` | The community ranking. Public once a week is published; hosts can preview an unpublished week. In the League nav group. |
| `/power-rankings/vote` | A listener's ballot for the current week. Signed-in, not a host. |
| `PUT /api/power-rankings/ballot` | Save or lock in a listener ballot. |
| `PUT /api/podcast/power-rankings/publication` | Publish now / hold / back to schedule (hosts only). |

### Keeping listener votes out of the reveal

Listener ballots live in the same two tables as host ballots — they are the same
object, a total order for one week that is a draft until locked — separated by
`power_ranking_ballots.voter_kind` (migration 045), stamped from `is_podcaster`
**when the ballot is saved**. So a host whose role is revoked does not pull a
locked ballot out of an episode that was already recorded.

The separation is enforced by which reads exist, the same way `prep_note` is:

- `fetchBallots(season, week)` returns **host ballots only** unless the caller
  passes `"everyone"`. The reveal, the hub and the host ballot page pass no
  scope, so they cannot count a listener or list one by name.
- The only caller that passes `"everyone"` is `fetchCommunityRankings` in
  `web/lib/community-rankings.ts`. `community-rankings.test.ts` walks `app/`,
  `lib/` and `components/` and fails if anything else does.
- `saveBallot` has no default `voterKind`; each route states its own.
- The hub shows listener *counts* (`countListenerBallots`, a head-only count),
  never listener ballots. The vote page reads the viewer's own ballot through
  `fetchOwnBallot`, scoped to one `user_id`.
- The listener API re-reads `is_podcaster` and refuses hosts: a host saving
  there would convert their ballot to a listener one.

### What the public page shows

The reveal's own `consolidate` — mean rank, ties to conviction — over every
submitted ballot, with **each ballot weighted equally**, host or listener. It is
then reduced to a `CommunityRow` with no per-voter fields: overall mean, the
hosts' mean and the listeners' mean separately, best/worst rank, first-place
votes and movement. No names (listeners never agreed to be shown) and no notes
(host on-air notes should not publish ahead of the episode). A test pins the
exact key set. Movement is shown only against a previous week that is itself
public, or the arrows would give away a held week's order.

### When a week goes public

By default at **Thursday 09:00 America/New_York** of the week being ranked —
the hosts have had Tuesday and Wednesday to record, and Thursday night's kickoff
has not yet made the ranking stale. Computed from the season's Week 1 Tuesday
(`seasonAnchor` in `web/lib/nfl-week.ts`) through `Intl`, so it stays 09:00
local across the end of daylight saving (13:00 UTC in September, 14:00 UTC from
November). With no calendar date it fails closed: private until published.

From the `/podcast` hub a host can override one week:

| Action | Row in `power_ranking_publications` | Effect |
|--------|-------------------------------------|--------|
| (none) | no row | Public from Thursday 09:00 ET |
| Publish now | `published_at = now()` | Public immediately |
| Hold past Thursday | `held = true` | Private until published by hand |
| Back to Thursday schedule | row deleted | Back to the default |

**Publishing closes listener voting** for that week, and voting is only ever
open on the current week (`listenerVotingOpen`), so a ranking people have read
cannot be rewritten underneath them. Hosts can still edit their own ballots
after publication (the reveal needs that), which does move the public ranking.
Unpublishing and holding a public week reopens listener voting if it is still
the current week.

## Weekly recap

`/podcast/recap?week=N` — one finished week, looked at backwards, in the order
the show tends to talk about it. This is the episode-prep page: it is opened
with a microphone already running, so it is a wide page of dense lists rather
than an article.

**Nothing on it is stored.** Every number is derived at read time in
`web/lib/weekly-recap.ts` from rows three other subsystems already own:

| Source | What it contributes |
|--------|---------------------|
| `matchup_lineups` | who each team started and benched, and what they scored |
| `weekly_projections` | each player's forecast, frozen at his own kickoff |
| `league_matchups` | the six results |
| `power_ranking_*` | the hosts' consolidated order for that same week |

That is the same choice the standings make, for the same reason: a stored recap
can only be as fresh as the job that wrote it, and it can disagree with the box
score it was supposed to summarise. You cannot have that happen while two people
are reading it out loud.

### Three kinds of surprise, which are three different claims

The show argues about all three and the page keeps them apart:

1. **Against the projection** (`RecapPlayer.surprise`) — a player against the
   third party's forecast for that game. This is the tightest of the three
   because of the [kickoff freeze](weekly-projections.md#the-kickoff-freeze):
   the number he is measured against is the one that was on the board before he
   played, not a revision published afterwards.
2. **Against the projected total** (`RecapSide.beat`) — a team against the sum
   of its own starters' projections. A team can beat its projection and still
   lose, which is usually the better sentence. An **upset** is the
   lower-projected side winning; with no stored lineup it is `null` rather than
   `false`, since "false" would read on the page as *chalk*.
3. **Against the power ranking** (`TeamWeek.powerSurprise`) — ranked position
   minus scoring position for the week. Positive means the team outscored where
   the hosts had it, negative means the ranking was too kind. This one is about
   the hosts rather than the teams, so each host's own placement rides along on
   the row and the on-air note is on the hover.

### The rules that keep the lists honest

- **A missing projection is not a zero.** `projected` is null for a bye, an
  inactive, or a player the source does not carry. Those players are left out of
  the surprise lists rather than credited with beating a forecast of zero, and
  the page reports how many starters it dropped so the lists do not read as
  complete.
- **Overachievers include the bench; busts do not.** A benched player blowing
  past his forecast is a story about a manager who missed it. The same player
  falling short cost nobody anything and is not an item.
- **No minimum-projection floor.** Ranking on the raw shortfall already keeps a
  low-forecast player off the top: someone forecast 3.2 who scored nothing never
  outranks someone forecast 18.4 who scored four.
- **Top performers are starters only.** The bench has its own list, so a player
  cannot appear in both and the two sections stay separate facts.
- **Teams level on points share a scoring rank** rather than being ordered
  arbitrarily.

### Left on the bench

`benchMisses` re-runs `optimizeLineup` over the points players *actually*
scored, so it is pure hindsight and the page says so — nobody could have set
that lineup. Reusing the optimizer rather than re-deriving the slot maths is the
point: the eligibility family is laminar and the greedy fill is provably optimal
over it, and that proof should live in one place. It is keyed on `ottoneu_id`
rather than our own `player_id`, which can be null for an unmatched player (and
two nulls would collide).

An **empty starting slot** shows up here naturally: a team that started nobody
at kicker gets a "sat on the bench" entry with nothing displaced.

### Which week it opens on

The last week that is *finished*, not the one being played — on the Tuesday you
record, that is the slate that just ended. A week still in progress is reachable
from the picker but never the default, because a half-played week reads as a
league of busts. Weeks with no games at all are not offered.

Ballots are read through `fetchWeekRankings`, which is host-scoped: the recap
does not count listener ballots and cannot name one.

## Adding another podcast tool

1. Add the route under `/podcast/<tool>` and its API under `/api/podcast/<tool>`.
2. Add both to `PODCASTER_ROUTES` in `web/lib/access.ts` — `/podcast` itself
   must stay out of that list.
3. Call `requirePodcaster("/podcast/<tool>")` at the top of the page.
4. Add a nav entry with `access: "podcaster"` in `web/lib/nav.ts`, and a
   `HUB_META` entry in `web/app/page.tsx` if it should appear on the homepage.
5. Add a card for it on the `/podcast` hub, which is where a host starts.

**Adding a segment to the recap** is smaller than adding a tool: write it as a
pure function over the same rows in `web/lib/weekly-recap.ts`, pin it in
`web/__tests__/lib/weekly-recap.test.ts`, hang it off `WeeklyRecap`, and give it
a `<Section>` on the page. The page is explicitly a first pass meant to grow
that way.
